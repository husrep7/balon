package shift

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusOpened  Status = "opened"
	StatusClosing Status = "closing"
	StatusClosed  Status = "closed"
	StatusVoided  Status = "voided"
)

type Session struct {
	ID                       uuid.UUID  `json:"id"`
	TenantID                 uuid.UUID  `json:"tenant_id"`
	OperatorID               uuid.UUID  `json:"operator_id"`
	Status                   Status     `json:"status"`
	OpenedAt                 time.Time  `json:"opened_at"`
	OpeningCashCents         int64      `json:"opening_cash_cents"`
	ClosingStartedAt         *time.Time `json:"closing_started_at,omitempty"`
	ClosedAt                 *time.Time `json:"closed_at,omitempty"`
	ClosingCashCountedCents  *int64     `json:"closing_cash_counted_cents,omitempty"`
	ClosingCashExpectedCents *int64     `json:"closing_cash_expected_cents,omitempty"`
	VarianceCents            *int64     `json:"variance_cents,omitempty"`
	VarianceExplained        string     `json:"variance_explained,omitempty"`
	PredecessorShiftID       *uuid.UUID `json:"predecessor_shift_id,omitempty"`
	Notes                    string     `json:"notes,omitempty"`
}

type OpenInput struct {
	TenantID             uuid.UUID  `json:"-"`
	OperatorID           uuid.UUID  `json:"-"`
	OpeningCashCents     int64      `json:"opening_cash_cents" binding:"min=0"`
	PredecessorShiftID   *uuid.UUID `json:"predecessor_shift_id,omitempty"`
}

type CloseInput struct {
	ShiftID                  uuid.UUID `json:"-"`
	TenantID                 uuid.UUID `json:"-"`
	ClosingCashCountedCents  int64     `json:"closing_cash_counted_cents" binding:"min=0"`
	VarianceExplained        string    `json:"variance_explained,omitempty"`
}

var ErrAnotherShiftOpen = errors.New("tenant already has an open shift")
var ErrShiftNotOpen     = errors.New("shift is not in opened state")
var ErrNotFound         = errors.New("shift not found")
var ErrVarianceUnexplained = errors.New("variance != 0 requires explanation")
