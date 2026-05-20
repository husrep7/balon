package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/lupon/balon/apps/api/internal/domain/payment"
	"github.com/lupon/balon/apps/api/internal/domain/shift"
)

type PaymentStore struct {
	db *pgxpool.Pool
}

// Record inserts a payment. Validates that the referenced shift is in
// opened or closing state (no payments on closed/voided shifts).
func (s *PaymentStore) Record(ctx context.Context, in payment.RecordInput) (*payment.Payment, error) {
	if err := in.Validate(); err != nil {
		return nil, err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var shiftStatus string
	err = tx.QueryRow(ctx, `
		SELECT status FROM shift_sessions
		WHERE id = $1 AND tenant_id = $2 FOR UPDATE
	`, in.ShiftSessionID, in.TenantID).Scan(&shiftStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shift.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if shiftStatus != string(shift.StatusOpened) && shiftStatus != string(shift.StatusClosing) {
		return nil, payment.ErrShiftNotActive
	}

	row := tx.QueryRow(ctx, `
		INSERT INTO payments
		    (tenant_id, booking_id, shift_session_id, amount_cents, method, card_terminal_ref, fiscal_receipt_no, collected_by)
		VALUES
		    ($1, $2, $3, $4, $5, NULLIF($6,''), NULLIF($7,''), $8)
		RETURNING id, tenant_id, booking_id, shift_session_id, amount_cents, method,
		          COALESCE(card_terminal_ref,''), COALESCE(fiscal_receipt_no,''),
		          collected_by, collected_at, voided_at, COALESCE(void_reason,'')
	`,
		in.TenantID, in.BookingID, in.ShiftSessionID, in.AmountCents, string(in.Method),
		in.CardTerminalRef, in.FiscalReceiptNo, in.CollectedBy,
	)

	p, err := scanPayment(row)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *PaymentStore) ListForBooking(ctx context.Context, tenantID, bookingID uuid.UUID) ([]payment.Payment, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, tenant_id, booking_id, shift_session_id, amount_cents, method,
		       COALESCE(card_terminal_ref,''), COALESCE(fiscal_receipt_no,''),
		       collected_by, collected_at, voided_at, COALESCE(void_reason,'')
		FROM payments
		WHERE tenant_id = $1 AND booking_id = $2
		ORDER BY collected_at
	`, tenantID, bookingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []payment.Payment
	for rows.Next() {
		p, err := scanPayment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (s *PaymentStore) Void(ctx context.Context, tenantID, id uuid.UUID, reason string) error {
	if reason == "" {
		return fmt.Errorf("void reason is required")
	}
	tag, err := s.db.Exec(ctx, `
		UPDATE payments SET voided_at = now(), void_reason = $3
		WHERE tenant_id = $1 AND id = $2 AND voided_at IS NULL
	`, tenantID, id, reason)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("payment not found or already voided")
	}
	return nil
}

func (s *PaymentStore) RecordCashMovement(ctx context.Context, in payment.CashMovementInput) (*payment.CashMovement, error) {
	var shiftStatus string
	err := s.db.QueryRow(ctx, `
		SELECT status FROM shift_sessions WHERE id = $1 AND tenant_id = $2
	`, in.ShiftSessionID, in.TenantID).Scan(&shiftStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shift.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if shiftStatus != string(shift.StatusOpened) && shiftStatus != string(shift.StatusClosing) {
		return nil, payment.ErrShiftNotActive
	}

	row := s.db.QueryRow(ctx, `
		INSERT INTO cash_movements (tenant_id, shift_session_id, amount_cents, reason, recorded_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, tenant_id, shift_session_id, amount_cents, reason, recorded_by, recorded_at
	`, in.TenantID, in.ShiftSessionID, in.AmountCents, in.Reason, in.RecordedBy)

	var m payment.CashMovement
	err = row.Scan(&m.ID, &m.TenantID, &m.ShiftSessionID, &m.AmountCents, &m.Reason, &m.RecordedBy, &m.RecordedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func scanPayment(row rowScanner) (*payment.Payment, error) {
	var p payment.Payment
	var bookingID *uuid.UUID
	var methodStr string
	err := row.Scan(
		&p.ID, &p.TenantID, &bookingID, &p.ShiftSessionID, &p.AmountCents, &methodStr,
		&p.CardTerminalRef, &p.FiscalReceiptNo, &p.CollectedBy, &p.CollectedAt,
		&p.VoidedAt, &p.VoidReason,
	)
	if err != nil {
		return nil, err
	}
	p.BookingID = bookingID
	p.Method = payment.Method(methodStr)
	return &p, nil
}
