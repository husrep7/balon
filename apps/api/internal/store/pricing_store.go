package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/domain/pricing"
)

type PricingStore struct {
	db *pgxpool.Pool
}

func (s *PricingStore) ActiveRules(ctx context.Context, tenantID uuid.UUID) ([]pricing.Rule, error) {
	return s.queryRules(ctx, tenantID, true)
}

// AllRules returns both active and inactive rules — used by the admin editor.
func (s *PricingStore) AllRules(ctx context.Context, tenantID uuid.UUID) ([]pricing.Rule, error) {
	return s.queryRules(ctx, tenantID, false)
}

func (s *PricingStore) queryRules(ctx context.Context, tenantID uuid.UUID, activeOnly bool) ([]pricing.Rule, error) {
	q := `
		SELECT id, tenant_id, resource_id, name, priority, conditions, price_cents,
		       valid_from, valid_to, active, created_at
		FROM pricing_rules
		WHERE tenant_id = $1`
	if activeOnly {
		q += ` AND active`
	}
	q += ` ORDER BY priority, created_at`

	rows, err := s.db.Query(ctx, q, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []pricing.Rule
	for rows.Next() {
		var r pricing.Rule
		var conds []byte
		var resourceID *uuid.UUID
		err := rows.Scan(&r.ID, &r.TenantID, &resourceID, &r.Name, &r.Priority,
			&conds, &r.PriceCents, &r.ValidFrom, &r.ValidTo, &r.Active, &r.CreatedAt)
		if err != nil {
			return nil, err
		}
		r.ResourceID = resourceID
		if len(conds) > 0 {
			_ = json.Unmarshal(conds, &r.Conditions)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *PricingStore) CreateRule(ctx context.Context, r pricing.Rule) (*pricing.Rule, error) {
	conds, _ := json.Marshal(r.Conditions)
	row := s.db.QueryRow(ctx, `
		INSERT INTO pricing_rules (tenant_id, resource_id, name, priority, conditions, price_cents, valid_from, valid_to, active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at
	`, r.TenantID, r.ResourceID, r.Name, r.Priority, conds, r.PriceCents, r.ValidFrom, r.ValidTo, r.Active)
	if err := row.Scan(&r.ID, &r.CreatedAt); err != nil {
		return nil, err
	}
	return &r, nil
}

var ErrPricingRuleNotFound = errors.New("pricing rule not found")

// UpdateRule patches the mutable fields of a rule. Pointer fields are nil-skip.
func (s *PricingStore) UpdateRule(ctx context.Context, tenantID, id uuid.UUID, patch pricing.RuleUpdate) (*pricing.Rule, error) {
	sets := []string{}
	args := []any{tenantID, id}
	idx := 3
	if patch.Name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", idx))
		args = append(args, *patch.Name)
		idx++
	}
	if patch.Priority != nil {
		sets = append(sets, fmt.Sprintf("priority = $%d", idx))
		args = append(args, *patch.Priority)
		idx++
	}
	if patch.PriceCents != nil {
		sets = append(sets, fmt.Sprintf("price_cents = $%d", idx))
		args = append(args, *patch.PriceCents)
		idx++
	}
	if patch.Active != nil {
		sets = append(sets, fmt.Sprintf("active = $%d", idx))
		args = append(args, *patch.Active)
		idx++
	}
	if patch.Conditions != nil {
		conds, _ := json.Marshal(*patch.Conditions)
		sets = append(sets, fmt.Sprintf("conditions = $%d", idx))
		args = append(args, conds)
		idx++
	}
	if len(sets) == 0 {
		return s.GetRule(ctx, tenantID, id)
	}

	q := "UPDATE pricing_rules SET "
	for i, s := range sets {
		if i > 0 {
			q += ", "
		}
		q += s
	}
	q += " WHERE tenant_id = $1 AND id = $2 RETURNING id"

	var returnedID uuid.UUID
	if err := s.db.QueryRow(ctx, q, args...).Scan(&returnedID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPricingRuleNotFound
		}
		return nil, err
	}
	return s.GetRule(ctx, tenantID, id)
}

func (s *PricingStore) GetRule(ctx context.Context, tenantID, id uuid.UUID) (*pricing.Rule, error) {
	var r pricing.Rule
	var conds []byte
	var resourceID *uuid.UUID
	err := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, resource_id, name, priority, conditions, price_cents,
		       valid_from, valid_to, active, created_at
		FROM pricing_rules WHERE tenant_id = $1 AND id = $2
	`, tenantID, id).Scan(&r.ID, &r.TenantID, &resourceID, &r.Name, &r.Priority,
		&conds, &r.PriceCents, &r.ValidFrom, &r.ValidTo, &r.Active, &r.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrPricingRuleNotFound
	}
	if err != nil {
		return nil, err
	}
	r.ResourceID = resourceID
	if len(conds) > 0 {
		_ = json.Unmarshal(conds, &r.Conditions)
	}
	return &r, nil
}

// DeleteRule sets active=false (soft delete). Hard delete is avoided because
// existing bookings reference applied_rule_id.
func (s *PricingStore) DeleteRule(ctx context.Context, tenantID, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE pricing_rules SET active = false WHERE tenant_id = $1 AND id = $2
	`, tenantID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPricingRuleNotFound
	}
	return nil
}
