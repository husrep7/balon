package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/db"
	"github.com/lupon/balon/apps/api/internal/domain/shift"
)

type ShiftStore struct {
	db *pgxpool.Pool
}

func (s *ShiftStore) Open(ctx context.Context, in shift.OpenInput) (*shift.Session, error) {
	row := s.db.QueryRow(ctx, `
		INSERT INTO shift_sessions (tenant_id, operator_id, opening_cash_cents, predecessor_shift_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, tenant_id, operator_id, status, opened_at, opening_cash_cents,
		          closing_started_at, closed_at, closing_cash_counted_cents,
		          closing_cash_expected_cents, variance_cents, COALESCE(variance_explained, ''),
		          predecessor_shift_id, COALESCE(notes, '')
	`, in.TenantID, in.OperatorID, in.OpeningCashCents, in.PredecessorShiftID)

	sess, err := scanShift(row)
	if err != nil {
		if db.IsUniqueViolation(err) {
			return nil, shift.ErrAnotherShiftOpen
		}
		return nil, err
	}
	return sess, nil
}

func (s *ShiftStore) List(ctx context.Context, tenantID uuid.UUID, limit int) ([]shift.Session, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, tenant_id, operator_id, status, opened_at, opening_cash_cents,
		       closing_started_at, closed_at, closing_cash_counted_cents,
		       closing_cash_expected_cents, variance_cents, COALESCE(variance_explained, ''),
		       predecessor_shift_id, COALESCE(notes, '')
		FROM shift_sessions WHERE tenant_id = $1
		ORDER BY opened_at DESC LIMIT $2
	`, tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []shift.Session
	for rows.Next() {
		sess, err := scanShift(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sess)
	}
	return out, rows.Err()
}

func (s *ShiftStore) GetOpen(ctx context.Context, tenantID uuid.UUID) (*shift.Session, error) {
	row := s.db.QueryRow(ctx, `
		SELECT ss.id, ss.tenant_id, ss.operator_id, ss.status, ss.opened_at, ss.opening_cash_cents,
		       ss.closing_started_at, ss.closed_at, ss.closing_cash_counted_cents,
		       ss.closing_cash_expected_cents, ss.variance_cents, COALESCE(ss.variance_explained, ''),
		       ss.predecessor_shift_id, COALESCE(ss.notes, ''),
		       COALESCE(p.cash_total, 0)
		FROM shift_sessions ss
		LEFT JOIN (
		    SELECT shift_session_id, SUM(amount_cents) AS cash_total
		    FROM payments
		    WHERE voided_at IS NULL
		    GROUP BY shift_session_id
		) p ON p.shift_session_id = ss.id
		WHERE ss.tenant_id = $1 AND ss.status = 'opened'
	`, tenantID)
	sess, err := scanShiftWithTotal(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return sess, err
}

// Close computes expected cash and updates the shift atomically.
// expected = opening + sum(cash payments not voided) + sum(cash_movements)
func (s *ShiftStore) Close(ctx context.Context, in shift.CloseInput) (*shift.Session, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var opening, paymentsSum, movementsSum int64
	var status string
	err = tx.QueryRow(ctx, `
		SELECT opening_cash_cents, status FROM shift_sessions
		WHERE id = $1 AND tenant_id = $2 FOR UPDATE
	`, in.ShiftID, in.TenantID).Scan(&opening, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shift.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if status != string(shift.StatusOpened) {
		return nil, shift.ErrShiftNotOpen
	}

	err = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_cents),0) FROM payments
		WHERE shift_session_id = $1 AND method = 'cash' AND voided_at IS NULL
	`, in.ShiftID).Scan(&paymentsSum)
	if err != nil {
		return nil, err
	}

	err = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_cents),0) FROM cash_movements
		WHERE shift_session_id = $1
	`, in.ShiftID).Scan(&movementsSum)
	if err != nil {
		return nil, err
	}

	expected := opening + paymentsSum + movementsSum
	variance := in.ClosingCashCountedCents - expected

	if variance != 0 && in.VarianceExplained == "" {
		return nil, shift.ErrVarianceUnexplained
	}

	row := tx.QueryRow(ctx, `
		UPDATE shift_sessions
		SET status = 'closed',
		    closing_started_at = COALESCE(closing_started_at, now()),
		    closed_at = now(),
		    closing_cash_counted_cents = $3,
		    closing_cash_expected_cents = $4,
		    variance_explained = NULLIF($5, '')
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, tenant_id, operator_id, status, opened_at, opening_cash_cents,
		          closing_started_at, closed_at, closing_cash_counted_cents,
		          closing_cash_expected_cents, variance_cents, COALESCE(variance_explained, ''),
		          predecessor_shift_id, COALESCE(notes, '')
	`, in.ShiftID, in.TenantID, in.ClosingCashCountedCents, expected, in.VarianceExplained)

	sess, err := scanShift(row)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return sess, nil
}

func scanShiftWithTotal(row rowScanner) (*shift.Session, error) {
	var s shift.Session
	var statusStr string
	var variance *int64
	err := row.Scan(
		&s.ID, &s.TenantID, &s.OperatorID, &statusStr, &s.OpenedAt, &s.OpeningCashCents,
		&s.ClosingStartedAt, &s.ClosedAt, &s.ClosingCashCountedCents,
		&s.ClosingCashExpectedCents, &variance, &s.VarianceExplained,
		&s.PredecessorShiftID, &s.Notes,
		&s.CashCollectedCents,
	)
	if err != nil {
		return nil, err
	}
	s.Status = shift.Status(statusStr)
	s.VarianceCents = variance
	return &s, nil
}

func scanShift(row rowScanner) (*shift.Session, error) {
	var s shift.Session
	var statusStr string
	var variance *int64
	err := row.Scan(
		&s.ID, &s.TenantID, &s.OperatorID, &statusStr, &s.OpenedAt, &s.OpeningCashCents,
		&s.ClosingStartedAt, &s.ClosedAt, &s.ClosingCashCountedCents,
		&s.ClosingCashExpectedCents, &variance, &s.VarianceExplained,
		&s.PredecessorShiftID, &s.Notes,
	)
	if err != nil {
		return nil, err
	}
	s.Status = shift.Status(statusStr)
	s.VarianceCents = variance
	return &s, nil
}
