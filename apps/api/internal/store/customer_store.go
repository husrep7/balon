package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/domain/customer"
)

type CustomerStore struct {
	db *pgxpool.Pool
}

func (s *CustomerStore) Create(ctx context.Context, in customer.CreateInput) (*customer.Customer, error) {
	tier := in.Tier
	if tier == "" {
		tier = customer.TierRegular
	}
	row := s.db.QueryRow(ctx, `
		INSERT INTO customers (tenant_id, name, phone, email, tier, notes)
		VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), $5, NULLIF($6,''))
		RETURNING id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(notes,''), created_at
	`, in.TenantID, in.Name, in.Phone, in.Email, string(tier), in.Notes)

	var c customer.Customer
	var tierStr string
	err := row.Scan(&c.ID, &c.TenantID, &c.Name, &c.Phone, &c.Email, &tierStr, &c.Notes, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	c.Tier = customer.Tier(tierStr)
	return &c, nil
}

func (s *CustomerStore) Search(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]customer.Customer, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(notes,''), created_at
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
		var c customer.Customer
		var tierStr string
		if err := rows.Scan(&c.ID, &c.TenantID, &c.Name, &c.Phone, &c.Email, &tierStr, &c.Notes, &c.CreatedAt); err != nil {
			return nil, err
		}
		c.Tier = customer.Tier(tierStr)
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *CustomerStore) FindByEmail(ctx context.Context, tenantID uuid.UUID, email string) (*customer.Customer, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(notes,''), created_at
		FROM customers WHERE tenant_id = $1 AND lower(email) = lower($2)
	`, tenantID, email)
	var c customer.Customer
	var tierStr string
	err := row.Scan(&c.ID, &c.TenantID, &c.Name, &c.Phone, &c.Email, &tierStr, &c.Notes, &c.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	c.Tier = customer.Tier(tierStr)
	return &c, nil
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

func (s *CustomerStore) Get(ctx context.Context, tenantID, id uuid.UUID) (*customer.Customer, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, name, COALESCE(phone,''), COALESCE(email,''), tier, COALESCE(notes,''), created_at
		FROM customers WHERE tenant_id = $1 AND id = $2
	`, tenantID, id)
	var c customer.Customer
	var tierStr string
	err := row.Scan(&c.ID, &c.TenantID, &c.Name, &c.Phone, &c.Email, &tierStr, &c.Notes, &c.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	c.Tier = customer.Tier(tierStr)
	return &c, nil
}
