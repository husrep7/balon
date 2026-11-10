package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/db"
	"github.com/lupon/balon/apps/api/internal/domain/customer"
)

type CustomerStore struct {
	db *pgxpool.Pool
}

type scanner interface {
	Scan(dest ...any) error
}

func scanCustomer(row scanner) (*customer.Customer, error) {
	var c customer.Customer
	var tierStr string
	err := row.Scan(
		&c.ID, &c.TenantID, &c.Name,
		&c.Phone, &c.Email, &tierStr,
		&c.TeamName, &c.Notes, &c.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	c.Tier = customer.Tier(tierStr)
	return &c, nil
}

func (s *CustomerStore) Create(ctx context.Context, in customer.CreateInput) (*customer.Customer, error) {
	tier := in.Tier
	if tier == "" {
		tier = customer.TierRegular
	}
	row := s.db.QueryRow(ctx, `
		INSERT INTO customers (tenant_id, name, phone, email, tier, team_name, notes)
		VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), $5, NULLIF($6,''), NULLIF($7,''))
		RETURNING id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(team_name,''), COALESCE(notes,''), created_at
	`, in.TenantID, in.Name, in.Phone, in.Email, string(tier), in.TeamName, in.Notes)
	return scanCustomer(row)
}

func (s *CustomerStore) Search(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]customer.Customer, error) {
	if limit <= 0 || limit > 200 {
		limit = 20
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(team_name,''), COALESCE(notes,''), created_at
		FROM customers
		WHERE tenant_id = $1
		  AND (lower(name) LIKE '%' || lower($2) || '%' OR phone LIKE '%' || $2 || '%')
		ORDER BY name
		LIMIT $3
	`, tenantID, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []customer.Customer
	for rows.Next() {
		c, err := scanCustomer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (s *CustomerStore) FindByEmail(ctx context.Context, tenantID uuid.UUID, email string) (*customer.Customer, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(team_name,''), COALESCE(notes,''), created_at
		FROM customers WHERE tenant_id = $1 AND lower(email) = lower($2)
	`, tenantID, email)
	c, err := scanCustomer(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return c, nil
}

func (s *CustomerStore) FindOrCreateByEmail(ctx context.Context, tenantID uuid.UUID, email, name string) (*customer.Customer, error) {
	c, err := s.FindByEmail(ctx, tenantID, email)
	if err != nil {
		return nil, err
	}
	if c != nil {
		return c, nil
	}
	return s.Create(ctx, customer.CreateInput{
		TenantID: tenantID,
		Name:     name,
		Email:    email,
		Tier:     customer.TierRegular,
	})
}

// UpdatePhone sets the phone number on an existing customer, only if it is currently empty.
func (s *CustomerStore) UpdatePhone(ctx context.Context, tenantID, id uuid.UUID, phone string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE customers SET phone = $1 WHERE tenant_id = $2 AND id = $3 AND (phone IS NULL OR phone = '')
	`, phone, tenantID, id)
	return err
}

func (s *CustomerStore) Delete(ctx context.Context, tenantID, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM customers WHERE tenant_id = $1 AND id = $2`, tenantID, id)
	if err != nil {
		if db.IsForeignKeyViolation(err) {
			return customer.ErrHasBookings
		}
		return err
	}
	if tag.RowsAffected() == 0 {
		return customer.ErrNotFound
	}
	return nil
}

// ForceDelete nullifies customer_id on all bookings (preserving booking history under the
// customer's name), then deletes the customer.
func (s *CustomerStore) ForceDelete(ctx context.Context, tenantID, id uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Preserve booking identity by copying the customer name into team_name where it isn't
	// already set, then null out the FK so the constraint remains satisfied.
	_, err = tx.Exec(ctx, `
		UPDATE bookings
		SET customer_id = NULL,
		    team_name   = COALESCE(NULLIF(team_name,''), (SELECT name FROM customers WHERE id = $2))
		WHERE tenant_id = $1 AND customer_id = $2
	`, tenantID, id)
	if err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `DELETE FROM customers WHERE tenant_id = $1 AND id = $2`, tenantID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return customer.ErrNotFound
	}
	return tx.Commit(ctx)
}

func (s *CustomerStore) Update(ctx context.Context, in customer.UpdateInput) (*customer.Customer, error) {
	tier := in.Tier
	if tier == "" {
		tier = customer.TierRegular
	}
	row := s.db.QueryRow(ctx, `
		UPDATE customers
		SET name = $3, phone = NULLIF($4,''), email = NULLIF($5,''), tier = $6, team_name = NULLIF($7,'')
		WHERE tenant_id = $1 AND id = $2
		RETURNING id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(team_name,''), COALESCE(notes,''), created_at
	`, in.TenantID, in.ID, in.Name, in.Phone, in.Email, string(tier), in.TeamName)
	c, err := scanCustomer(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return c, nil
}

func (s *CustomerStore) Get(ctx context.Context, tenantID, id uuid.UUID) (*customer.Customer, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(team_name,''), COALESCE(notes,''), created_at
		FROM customers WHERE tenant_id = $1 AND id = $2
	`, tenantID, id)
	c, err := scanCustomer(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return c, nil
}
