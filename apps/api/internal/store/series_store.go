package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/domain/booking"
)

type SeriesStore struct {
	db *pgxpool.Pool
}

func (s *SeriesStore) Create(ctx context.Context, in booking.CreateSeriesInput) (*booking.Series, error) {
	row := s.db.QueryRow(ctx, `
		INSERT INTO booking_series
		    (tenant_id, customer_id, team_id, resource_id, rrule, starts_on, ends_on,
		     slot_start_time, slot_duration, default_price_cents)
		VALUES
		    ($1, $2, $3, $4, $5, $6, $7, $8::time, $9 * interval '1 minute', $10)
		RETURNING id, tenant_id, customer_id, team_id, resource_id, rrule, starts_on, ends_on,
		          slot_start_time, EXTRACT(EPOCH FROM slot_duration)::bigint,
		          default_price_cents, materialized_thru, status, created_at
	`, in.TenantID, in.CustomerID, in.TeamID, in.ResourceID, in.RRule,
		in.StartsOn, in.EndsOn, in.SlotStartTime, in.SlotDurationMin, in.DefaultPriceCents)
	return scanSeries(row)
}

func (s *SeriesStore) ListActiveDue(ctx context.Context, now time.Time) ([]booking.Series, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, tenant_id, customer_id, team_id, resource_id, rrule, starts_on, ends_on,
		       slot_start_time, EXTRACT(EPOCH FROM slot_duration)::bigint,
		       default_price_cents, materialized_thru, status, created_at
		FROM booking_series
		WHERE status = 'active' AND materialized_thru < $1
		ORDER BY materialized_thru
	`, now.AddDate(0, 0, 90))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []booking.Series
	for rows.Next() {
		ser, err := scanSeries(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *ser)
	}
	return out, rows.Err()
}

func (s *SeriesStore) UpdateMaterializedThru(ctx context.Context, id uuid.UUID, thru time.Time) error {
	_, err := s.db.Exec(ctx, `
		UPDATE booking_series SET materialized_thru = $2 WHERE id = $1
	`, id, thru)
	return err
}

func (s *SeriesStore) Get(ctx context.Context, tenantID, id uuid.UUID) (*booking.Series, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, customer_id, team_id, resource_id, rrule, starts_on, ends_on,
		       slot_start_time, EXTRACT(EPOCH FROM slot_duration)::bigint,
		       default_price_cents, materialized_thru, status, created_at
		FROM booking_series
		WHERE tenant_id = $1 AND id = $2
	`, tenantID, id)
	return scanSeries(row)
}

func scanSeries(row rowScanner) (*booking.Series, error) {
	var s booking.Series
	var customerID, teamID *uuid.UUID
	var endsOn *time.Time
	var slotStartTime time.Time
	var slotDurationSec int64
	var status string
	err := row.Scan(
		&s.ID, &s.TenantID, &customerID, &teamID, &s.ResourceID, &s.RRule, &s.StartsOn, &endsOn,
		&slotStartTime, &slotDurationSec, &s.DefaultPriceCents, &s.MaterializedThru, &status, &s.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	s.CustomerID = customerID
	s.TeamID = teamID
	s.EndsOn = endsOn
	s.SlotStartTime = slotStartTime.Format("15:04")
	s.SlotDuration = time.Duration(slotDurationSec) * time.Second
	s.Status = booking.SeriesStatus(status)
	return &s, nil
}
