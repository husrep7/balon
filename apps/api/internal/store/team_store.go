package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/domain/customer"
)

type TeamStore struct {
	db *pgxpool.Pool
}

func (s *TeamStore) Create(ctx context.Context, in customer.CreateTeamInput) (*customer.Team, error) {
	row := s.db.QueryRow(ctx, `
		INSERT INTO teams (tenant_id, name, captain_id, default_payer_id, primary_phone, notes)
		VALUES ($1, $2, $3, $4, NULLIF($5,''), NULLIF($6,''))
		RETURNING id, tenant_id, name, captain_id, default_payer_id, COALESCE(primary_phone,''), COALESCE(notes,''), created_at
	`, in.TenantID, in.Name, in.CaptainID, in.DefaultPayerID, in.PrimaryPhone, in.Notes)

	var t customer.Team
	err := row.Scan(&t.ID, &t.TenantID, &t.Name, &t.CaptainID, &t.DefaultPayerID, &t.PrimaryPhone, &t.Notes, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *TeamStore) AddMember(ctx context.Context, teamID, customerID uuid.UUID, role string) error {
	if role == "" {
		role = "member"
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO team_members (team_id, customer_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (team_id, customer_id) DO UPDATE SET role = EXCLUDED.role
	`, teamID, customerID, role)
	return err
}

func (s *TeamStore) Get(ctx context.Context, tenantID, id uuid.UUID) (*customer.Team, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, name, captain_id, default_payer_id, COALESCE(primary_phone,''), COALESCE(notes,''), created_at
		FROM teams WHERE tenant_id = $1 AND id = $2
	`, tenantID, id)
	var t customer.Team
	err := row.Scan(&t.ID, &t.TenantID, &t.Name, &t.CaptainID, &t.DefaultPayerID, &t.PrimaryPhone, &t.Notes, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
