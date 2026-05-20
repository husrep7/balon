package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/db"
	"github.com/lupon/balon/apps/api/internal/domain/booking"
)

type BookingStore struct {
	db *pgxpool.Pool
}

// Create inserts a booking. The DB trigger populates resource_locks atomically.
// If the time range conflicts with an existing lock (incl. parent/child), the
// trigger's INSERT into resource_locks raises an exclusion_violation (23P01)
// which we translate to ErrSlotConflict.
func (s *BookingStore) Create(ctx context.Context, in booking.CreateInput) (*booking.Booking, error) {
	timeRange := fmt.Sprintf("[%s,%s)",
		in.StartAt.UTC().Format(time.RFC3339Nano),
		in.EndAt.UTC().Format(time.RFC3339Nano),
	)
	channel := in.Channel
	if channel == "" {
		channel = booking.ChannelAdmin
	}
	priceCents := int64(0)
	if in.PriceCents != nil {
		priceCents = *in.PriceCents
	}

	row := s.db.QueryRow(ctx, `
		INSERT INTO bookings
		    (tenant_id, resource_id, customer_id, team_id, time_range, price_cents, channel, notes, created_by, payment_preference)
		VALUES
		    ($1, $2, $3, $4, $5::tstzrange, $6, $7, $8, $9, NULLIF($10,''))
		RETURNING id, tenant_id, resource_id, customer_id, team_id, series_id, series_occurrence_date,
		          lower(time_range), upper(time_range), status, price_cents, applied_rule_id,
		          channel, notes, created_by, created_at, cancelled_at, cancellation_reason,
		          COALESCE(payment_preference,'')
	`,
		in.TenantID, in.ResourceID, in.CustomerID, in.TeamID, timeRange,
		priceCents, string(channel), in.Notes, in.CreatedBy, in.PaymentPreference,
	)

	b, err := scanBooking(row)
	if err != nil {
		if db.IsExclusionViolation(err) {
			return nil, booking.ErrSlotConflict
		}
		return nil, err
	}
	return b, nil
}

func (s *BookingStore) Get(ctx context.Context, tenantID, id uuid.UUID) (*booking.Booking, error) {
	row := s.db.QueryRow(ctx, `
		SELECT id, tenant_id, resource_id, customer_id, team_id, series_id, series_occurrence_date,
		       lower(time_range), upper(time_range), status, price_cents, applied_rule_id,
		       channel, notes, created_by, created_at, cancelled_at, cancellation_reason
		FROM bookings WHERE tenant_id = $1 AND id = $2
	`, tenantID, id)
	b, err := scanBooking(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, booking.ErrNotFound
	}
	return b, err
}

// ListInWindow returns bookings whose time_range intersects [from,to) for the
// given resource (and optionally its descendants via the resource_locks table).
// includeChildren=true is appropriate for the calendar view of the parent resource.
func (s *BookingStore) ListInWindow(
	ctx context.Context,
	tenantID, resourceID uuid.UUID,
	from, to time.Time,
	includeChildren bool,
) ([]booking.Booking, error) {
	rng := fmt.Sprintf("[%s,%s)",
		from.UTC().Format(time.RFC3339Nano),
		to.UTC().Format(time.RFC3339Nano),
	)

	// LEFT JOIN aggregated payment summary (paid_cents, distinct methods) so the
	// calendar can render paid/method indicators in one round-trip.
	const paymentsJoin = `
		LEFT JOIN (
			SELECT booking_id,
			       SUM(amount_cents) AS paid_cents,
			       ARRAY_AGG(DISTINCT method::text) AS methods
			FROM payments
			WHERE voided_at IS NULL AND booking_id IS NOT NULL
			GROUP BY booking_id
		) pp ON pp.booking_id = b.id`

	var rows pgx.Rows
	var err error
	if includeChildren {
		rows, err = s.db.Query(ctx, `
			SELECT DISTINCT b.id, b.tenant_id, b.resource_id, b.customer_id, b.team_id, b.series_id,
			                b.series_occurrence_date, lower(b.time_range), upper(b.time_range),
			                b.status, b.price_cents, b.applied_rule_id, b.channel, b.notes,
			                b.created_by, b.created_at, b.cancelled_at, b.cancellation_reason,
			                COALESCE(pp.paid_cents, 0), COALESCE(pp.methods, '{}')
			FROM bookings b
			JOIN resource_locks l ON l.booking_id = b.id
			`+paymentsJoin+`
			WHERE b.tenant_id = $1
			  AND l.resource_id = $2
			  AND l.time_range && $3::tstzrange
			  AND b.status NOT IN ('cancelled','no_show')
			ORDER BY lower(b.time_range)
		`, tenantID, resourceID, rng)
	} else {
		rows, err = s.db.Query(ctx, `
			SELECT b.id, b.tenant_id, b.resource_id, b.customer_id, b.team_id, b.series_id, b.series_occurrence_date,
			       lower(b.time_range), upper(b.time_range), b.status, b.price_cents, b.applied_rule_id,
			       b.channel, b.notes, b.created_by, b.created_at, b.cancelled_at, b.cancellation_reason,
			       COALESCE(pp.paid_cents, 0), COALESCE(pp.methods, '{}')
			FROM bookings b
			`+paymentsJoin+`
			WHERE b.tenant_id = $1 AND b.resource_id = $2 AND b.time_range && $3::tstzrange
			  AND b.status NOT IN ('cancelled','no_show')
			ORDER BY lower(b.time_range)
		`, tenantID, resourceID, rng)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []booking.Booking
	for rows.Next() {
		b, err := scanBookingWithPayments(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

func (s *BookingStore) Cancel(ctx context.Context, tenantID, id uuid.UUID, reason string) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE bookings
		SET status = 'cancelled',
		    cancelled_at = now(),
		    cancellation_reason = $3
		WHERE tenant_id = $1 AND id = $2 AND status = 'confirmed'
	`, tenantID, id, reason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return booking.ErrNotFound
	}
	return nil
}

func (s *BookingStore) MarkNoShow(ctx context.Context, tenantID, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE bookings SET status = 'no_show'
		WHERE tenant_id = $1 AND id = $2 AND status = 'confirmed'
	`, tenantID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return booking.ErrNotFound
	}
	return nil
}

func (s *BookingStore) Reschedule(ctx context.Context, in booking.RescheduleInput) (*booking.Booking, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var (
		curStart, curEnd time.Time
		curResource      uuid.UUID
		status           string
	)
	err = tx.QueryRow(ctx, `
		SELECT lower(time_range), upper(time_range), resource_id, status
		FROM bookings WHERE tenant_id = $1 AND id = $2 FOR UPDATE
	`, in.TenantID, in.BookingID).Scan(&curStart, &curEnd, &curResource, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, booking.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if status == "completed" {
		return nil, booking.ErrCannotModifyCompleted
	}

	newStart := curStart
	newEnd := curEnd
	newResource := curResource
	if in.StartAt != nil {
		newStart = *in.StartAt
	}
	if in.EndAt != nil {
		newEnd = *in.EndAt
	}
	if in.ResourceID != nil {
		newResource = *in.ResourceID
	}

	rng := fmt.Sprintf("[%s,%s)",
		newStart.UTC().Format(time.RFC3339Nano),
		newEnd.UTC().Format(time.RFC3339Nano),
	)

	var row pgx.Row
	if in.PriceCents != nil {
		row = tx.QueryRow(ctx, `
			UPDATE bookings
			SET time_range = $3::tstzrange, resource_id = $4, price_cents = $5
			WHERE tenant_id = $1 AND id = $2
			RETURNING id, tenant_id, resource_id, customer_id, team_id, series_id, series_occurrence_date,
			          lower(time_range), upper(time_range), status, price_cents, applied_rule_id,
			          channel, notes, created_by, created_at, cancelled_at, cancellation_reason
		`, in.TenantID, in.BookingID, rng, newResource, *in.PriceCents)
	} else {
		row = tx.QueryRow(ctx, `
			UPDATE bookings
			SET time_range = $3::tstzrange, resource_id = $4
			WHERE tenant_id = $1 AND id = $2
			RETURNING id, tenant_id, resource_id, customer_id, team_id, series_id, series_occurrence_date,
			          lower(time_range), upper(time_range), status, price_cents, applied_rule_id,
			          channel, notes, created_by, created_at, cancelled_at, cancellation_reason
		`, in.TenantID, in.BookingID, rng, newResource)
	}

	b, err := scanBooking(row)
	if err != nil {
		if db.IsExclusionViolation(err) {
			return nil, booking.ErrSlotConflict
		}
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return b, nil
}

// CreateFromSeries inserts a booking that originated from a recurring series.
// Returns ErrSeriesOccurrenceExists (skip silently) when the same
// (series_id, occurrence_date) was already materialized — this makes the
// worker idempotent across retries and crashes. Returns ErrSlotConflict if
// the resource lock is blocked by another booking at that time.
func (s *BookingStore) CreateFromSeries(
	ctx context.Context,
	tenantID, seriesID, resourceID uuid.UUID,
	customerID, teamID *uuid.UUID,
	occurrenceDate, start, end time.Time,
	priceCents int64,
) (*booking.Booking, error) {
	timeRange := fmt.Sprintf("[%s,%s)",
		start.UTC().Format(time.RFC3339Nano),
		end.UTC().Format(time.RFC3339Nano),
	)

	row := s.db.QueryRow(ctx, `
		INSERT INTO bookings
		    (tenant_id, resource_id, customer_id, team_id, series_id, series_occurrence_date,
		     time_range, price_cents, channel)
		VALUES
		    ($1, $2, $3, $4, $5, $6::date, $7::tstzrange, $8, 'recurring')
		RETURNING id, tenant_id, resource_id, customer_id, team_id, series_id, series_occurrence_date,
		          lower(time_range), upper(time_range), status, price_cents, applied_rule_id,
		          channel, notes, created_by, created_at, cancelled_at, cancellation_reason
	`,
		tenantID, resourceID, customerID, teamID, seriesID,
		occurrenceDate.Format("2006-01-02"), timeRange, priceCents,
	)

	b, err := scanBooking(row)
	if err != nil {
		if db.IsUniqueViolation(err) {
			return nil, booking.ErrSeriesOccurrenceExists
		}
		if db.IsExclusionViolation(err) {
			return nil, booking.ErrSlotConflict
		}
		return nil, err
	}
	return b, nil
}

// ListAll returns bookings for a tenant across all resources, newest first.
// from/to are optional zero values mean no filter.
func (s *BookingStore) ListAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time, statuses []string) ([]booking.Booking, error) {
	conditions := "WHERE b.tenant_id = $1"
	args := []interface{}{tenantID}
	n := 2

	if !from.IsZero() {
		conditions += fmt.Sprintf(" AND upper(b.time_range) > $%d", n)
		args = append(args, from.UTC())
		n++
	}
	if !to.IsZero() {
		conditions += fmt.Sprintf(" AND lower(b.time_range) < $%d", n)
		args = append(args, to.UTC())
		n++
	}
	if len(statuses) > 0 {
		conditions += fmt.Sprintf(" AND b.status = ANY($%d)", n)
		args = append(args, statuses)
		n++
	}

	rows, err := s.db.Query(ctx, `
		SELECT b.id, b.tenant_id, b.resource_id, b.customer_id, b.team_id, b.series_id,
		       b.series_occurrence_date, lower(b.time_range), upper(b.time_range),
		       b.status, b.price_cents, b.applied_rule_id, b.channel, b.notes,
		       b.created_by, b.created_at, b.cancelled_at, b.cancellation_reason,
		       COALESCE(pp.paid_cents,0), COALESCE(pp.methods,'{}'),
		       COALESCE(b.payment_preference,''),
		       COALESCE(cu.name,''), COALESCE(cu.email,''), COALESCE(cu.phone,'')
		FROM bookings b
		LEFT JOIN (
			SELECT booking_id, SUM(amount_cents) AS paid_cents, ARRAY_AGG(DISTINCT method::text) AS methods
			FROM payments WHERE voided_at IS NULL AND booking_id IS NOT NULL
			GROUP BY booking_id
		) pp ON pp.booking_id = b.id
		LEFT JOIN customers cu ON cu.id = b.customer_id
		`+conditions+`
		ORDER BY lower(b.time_range) DESC
		LIMIT 500
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []booking.Booking
	for rows.Next() {
		b, err := scanBookingAdmin(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

// ListByCustomer returns all non-cancelled bookings for a customer, newest first.
func (s *BookingStore) ListByCustomer(ctx context.Context, tenantID, customerID uuid.UUID) ([]booking.Booking, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, tenant_id, resource_id, customer_id, team_id, series_id, series_occurrence_date,
		       lower(time_range), upper(time_range), status, price_cents, applied_rule_id,
		       channel, notes, created_by, created_at, cancelled_at, cancellation_reason
		FROM bookings
		WHERE tenant_id = $1 AND customer_id = $2
		ORDER BY lower(time_range) DESC
		LIMIT 50
	`, tenantID, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []booking.Booking
	for rows.Next() {
		b, err := scanBooking(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

// CancelForCustomer cancels a booking only if it belongs to the given customer.
func (s *BookingStore) CancelForCustomer(ctx context.Context, tenantID, bookingID, customerID uuid.UUID, reason string) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE bookings
		SET status = 'cancelled',
		    cancelled_at = now(),
		    cancellation_reason = $4
		WHERE tenant_id = $1 AND id = $2 AND customer_id = $3 AND status = 'confirmed'
	`, tenantID, bookingID, customerID, reason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return booking.ErrNotFound
	}
	return nil
}

// scanBookingAdmin scans the extended admin list query (payments + payment_preference + customer info).
func scanBookingAdmin(row rowScanner) (*booking.Booking, error) {
	var b booking.Booking
	var customerID, teamID, seriesID, appliedRuleID, createdBy *uuid.UUID
	var seriesOccurrence *time.Time
	var cancelledAt *time.Time
	var notes, cancellationReason *string
	var channel, status string
	var paidCents int64
	var methods []string
	err := row.Scan(
		&b.ID, &b.TenantID, &b.ResourceID, &customerID, &teamID, &seriesID, &seriesOccurrence,
		&b.StartAt, &b.EndAt, &status, &b.PriceCents, &appliedRuleID,
		&channel, &notes, &createdBy, &b.CreatedAt, &cancelledAt, &cancellationReason,
		&paidCents, &methods,
		&b.PaymentPreference,
		&b.CustomerName, &b.CustomerEmail, &b.CustomerPhone,
	)
	if err != nil {
		return nil, err
	}
	b.CustomerID = customerID
	b.TeamID = teamID
	b.SeriesID = seriesID
	b.SeriesOccurrenceDate = seriesOccurrence
	b.Status = booking.Status(status)
	b.AppliedRuleID = appliedRuleID
	b.Channel = booking.Channel(channel)
	if notes != nil {
		b.Notes = *notes
	}
	b.CreatedBy = createdBy
	b.CancelledAt = cancelledAt
	if cancellationReason != nil {
		b.CancellationReason = *cancellationReason
	}
	b.PaidCents = paidCents
	b.PaymentMethods = methods
	return &b, nil
}

// scanBookingWithPayments adds two trailing columns: paid_cents (int64) and
// payment_methods (text[]).
func scanBookingWithPayments(row rowScanner) (*booking.Booking, error) {
	var b booking.Booking
	var customerID, teamID, seriesID, appliedRuleID, createdBy *uuid.UUID
	var seriesOccurrence *time.Time
	var cancelledAt *time.Time
	var notes, cancellationReason *string
	var channel, status string
	var paidCents int64
	var methods []string
	err := row.Scan(
		&b.ID, &b.TenantID, &b.ResourceID, &customerID, &teamID, &seriesID, &seriesOccurrence,
		&b.StartAt, &b.EndAt, &status, &b.PriceCents, &appliedRuleID,
		&channel, &notes, &createdBy, &b.CreatedAt, &cancelledAt, &cancellationReason,
		&paidCents, &methods,
	)
	if err != nil {
		return nil, err
	}
	b.CustomerID = customerID
	b.TeamID = teamID
	b.SeriesID = seriesID
	b.SeriesOccurrenceDate = seriesOccurrence
	b.Status = booking.Status(status)
	b.AppliedRuleID = appliedRuleID
	b.Channel = booking.Channel(channel)
	if notes != nil {
		b.Notes = *notes
	}
	b.CreatedBy = createdBy
	b.CancelledAt = cancelledAt
	if cancellationReason != nil {
		b.CancellationReason = *cancellationReason
	}
	b.PaidCents = paidCents
	b.PaymentMethods = methods
	return &b, nil
}

func scanBooking(row rowScanner) (*booking.Booking, error) {
	var b booking.Booking
	var customerID, teamID, seriesID, appliedRuleID, createdBy *uuid.UUID
	var seriesOccurrence *time.Time
	var cancelledAt *time.Time
	var notes, cancellationReason *string
	var channel, status string
	err := row.Scan(
		&b.ID, &b.TenantID, &b.ResourceID, &customerID, &teamID, &seriesID, &seriesOccurrence,
		&b.StartAt, &b.EndAt, &status, &b.PriceCents, &appliedRuleID,
		&channel, &notes, &createdBy, &b.CreatedAt, &cancelledAt, &cancellationReason,
		&b.PaymentPreference,
	)
	if err != nil {
		return nil, err
	}
	b.CustomerID = customerID
	b.TeamID = teamID
	b.SeriesID = seriesID
	b.SeriesOccurrenceDate = seriesOccurrence
	b.Status = booking.Status(status)
	b.AppliedRuleID = appliedRuleID
	b.Channel = booking.Channel(channel)
	if notes != nil {
		b.Notes = *notes
	}
	b.CreatedBy = createdBy
	b.CancelledAt = cancelledAt
	if cancellationReason != nil {
		b.CancellationReason = *cancellationReason
	}
	return &b, nil
}
