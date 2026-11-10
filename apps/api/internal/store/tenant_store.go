package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TenantStore struct {
	db *pgxpool.Pool
}

type Tenant struct {
	ID       uuid.UUID
	Slug     string
	Name     string
	Timezone string
	Currency string
}

func (s *TenantStore) Get(ctx context.Context, id uuid.UUID) (*Tenant, error) {
	var t Tenant
	err := s.db.QueryRow(ctx, `
		SELECT id, slug, name, timezone, currency FROM tenants WHERE id = $1 AND status = 'active'
	`, id).Scan(&t.ID, &t.Slug, &t.Name, &t.Timezone, &t.Currency)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &t, err
}

func (s *TenantStore) GetBySlug(ctx context.Context, slug string) (*Tenant, error) {
	var t Tenant
	err := s.db.QueryRow(ctx, `
		SELECT id, slug, name, timezone, currency FROM tenants WHERE slug = $1 AND status = 'active'
	`, slug).Scan(&t.ID, &t.Slug, &t.Name, &t.Timezone, &t.Currency)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &t, err
}

// LoadTenantTZ returns the tenant's *time.Location. Cached in-memory per
// process (timezones don't change at runtime).
var tzCache = map[uuid.UUID]*time.Location{}

func (s *TenantStore) LoadTZ(ctx context.Context, tenantID uuid.UUID) (*time.Location, error) {
	if tz, ok := tzCache[tenantID]; ok {
		return tz, nil
	}
	var name string
	err := s.db.QueryRow(ctx, `SELECT timezone FROM tenants WHERE id = $1`, tenantID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("tenant %s not found", tenantID)
	}
	if err != nil {
		return nil, err
	}
	tz, err := time.LoadLocation(name)
	if err != nil {
		return nil, fmt.Errorf("invalid timezone %q for tenant %s: %w", name, tenantID, err)
	}
	tzCache[tenantID] = tz
	return tz, nil
}

// Convenience method on Stores aggregator.
func (s *Stores) LoadTenantTZ(ctx context.Context, tenantID uuid.UUID) (*time.Location, error) {
	return s.Tenants.LoadTZ(ctx, tenantID)
}
