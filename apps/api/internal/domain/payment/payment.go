package payment

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

type Method string

const (
	MethodCash             Method = "cash"
	MethodCardPOS          Method = "card_pos"
	MethodMembershipCredit Method = "membership_credit"
	MethodVoucher          Method = "voucher"
	MethodTransfer         Method = "transfer"
)

type Payment struct {
	ID                uuid.UUID  `json:"id"`
	TenantID          uuid.UUID  `json:"tenant_id"`
	BookingID         *uuid.UUID `json:"booking_id,omitempty"`
	ShiftSessionID    uuid.UUID  `json:"shift_session_id"`
	AmountCents       int64      `json:"amount_cents"`
	Method            Method     `json:"method"`
	CardTerminalRef   string     `json:"card_terminal_ref,omitempty"`
	FiscalReceiptNo   string     `json:"fiscal_receipt_no,omitempty"`
	CollectedBy       *uuid.UUID `json:"collected_by,omitempty"`
	CollectedAt       time.Time  `json:"collected_at"`
	VoidedAt          *time.Time `json:"voided_at,omitempty"`
	VoidReason        string     `json:"void_reason,omitempty"`
}

type RecordInput struct {
	TenantID         uuid.UUID  `json:"-"`
	BookingID        *uuid.UUID `json:"booking_id,omitempty"`
	ShiftSessionID   uuid.UUID  `json:"shift_session_id" binding:"required"`
	AmountCents      int64      `json:"amount_cents" binding:"required,gt=0"`
	Method           Method     `json:"method" binding:"required"`
	CardTerminalRef  string     `json:"card_terminal_ref,omitempty"`
	FiscalReceiptNo  string     `json:"fiscal_receipt_no,omitempty"`
	CollectedBy      *uuid.UUID `json:"-"`
}

func (i RecordInput) Validate() error {
	if i.Method == MethodCardPOS && i.CardTerminalRef == "" {
		return errors.New("card_pos payment requires card_terminal_ref")
	}
	return nil
}

type CashMovement struct {
	ID              uuid.UUID `json:"id"`
	TenantID        uuid.UUID `json:"tenant_id"`
	ShiftSessionID  uuid.UUID `json:"shift_session_id"`
	AmountCents     int64     `json:"amount_cents"` // + deposit, - payout
	Reason          string    `json:"reason"`
	RecordedBy      *uuid.UUID `json:"recorded_by,omitempty"`
	RecordedAt      time.Time `json:"recorded_at"`
}

type CashMovementInput struct {
	TenantID        uuid.UUID `json:"-"`
	ShiftSessionID  uuid.UUID `json:"shift_session_id" binding:"required"`
	AmountCents     int64     `json:"amount_cents" binding:"required"`
	Reason          string    `json:"reason" binding:"required"`
	RecordedBy      *uuid.UUID `json:"-"`
}

var ErrShiftNotActive = errors.New("can only record payments on opened or closing shifts")
