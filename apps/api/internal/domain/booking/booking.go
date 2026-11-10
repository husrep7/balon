package booking

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusConfirmed Status = "confirmed"
	StatusCancelled Status = "cancelled"
	StatusNoShow    Status = "no_show"
	StatusCompleted Status = "completed"
)

type Channel string

const (
	ChannelAdmin     Channel = "admin"
	ChannelWalkIn    Channel = "walk_in"
	ChannelPhone     Channel = "admin_phone"
	ChannelPortal    Channel = "portal"
	ChannelRecurring Channel = "recurring"
)

type Booking struct {
	ID                   uuid.UUID  `json:"id"`
	TenantID             uuid.UUID  `json:"tenant_id"`
	ResourceID           uuid.UUID  `json:"resource_id"`
	CustomerID           *uuid.UUID `json:"customer_id,omitempty"`
	TeamID               *uuid.UUID `json:"team_id,omitempty"`
	SeriesID             *uuid.UUID `json:"series_id,omitempty"`
	SeriesOccurrenceDate *time.Time `json:"series_occurrence_date,omitempty"`
	StartAt              time.Time  `json:"start_at"`
	EndAt                time.Time  `json:"end_at"`
	Status               Status     `json:"status"`
	PriceCents           int64      `json:"price_cents"`
	AppliedRuleID        *uuid.UUID `json:"applied_rule_id,omitempty"`
	Channel              Channel    `json:"channel"`
	Notes                string     `json:"notes,omitempty"`
	CreatedBy            *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	CancelledAt          *time.Time `json:"cancelled_at,omitempty"`
	CancellationReason   string     `json:"cancellation_reason,omitempty"`

	// Aggregated payment summary, populated only by list endpoints.
	PaidCents      int64    `json:"paid_cents,omitempty"`
	PaymentMethods []string `json:"payment_methods,omitempty"`

	// Customer preference at booking time
	PaymentPreference string `json:"payment_preference,omitempty"`

	// Customer info — populated by admin list endpoint only
	CustomerName  string `json:"customer_name,omitempty"`
	CustomerEmail string `json:"customer_email,omitempty"`
	CustomerPhone string `json:"customer_phone,omitempty"`
	CustomerTier  string `json:"customer_tier,omitempty"`

	// Team name — set when booking is for a team (Option B, no teams FK)
	TeamName string `json:"team_name,omitempty"`
}

type CreateInput struct {
	PaymentPreference string
	TenantID          uuid.UUID  `json:"-"`
	ResourceID        uuid.UUID  `json:"resource_id" binding:"required"`
	CustomerID        *uuid.UUID `json:"customer_id,omitempty"`
	TeamID            *uuid.UUID `json:"team_id,omitempty"`
	TeamName          string     `json:"team_name,omitempty"`
	StartAt           time.Time  `json:"start_at" binding:"required"`
	EndAt             time.Time  `json:"end_at" binding:"required"`
	PriceCents        *int64     `json:"price_cents,omitempty"`
	Channel           Channel    `json:"channel,omitempty"`
	Notes             string     `json:"notes,omitempty"`
	CreatedBy         *uuid.UUID `json:"-"`
}

func (i CreateInput) Validate() error {
	if !i.EndAt.After(i.StartAt) {
		return errors.New("end_at must be after start_at")
	}
	if i.EndAt.Sub(i.StartAt) > 8*time.Hour {
		return errors.New("booking longer than 8 hours not allowed")
	}
	return nil
}

type RescheduleInput struct {
	BookingID  uuid.UUID  `json:"-"`
	TenantID   uuid.UUID  `json:"-"`
	StartAt    *time.Time `json:"start_at,omitempty"`
	EndAt      *time.Time `json:"end_at,omitempty"`
	ResourceID *uuid.UUID `json:"resource_id,omitempty"`
	CustomerID *uuid.UUID `json:"customer_id,omitempty"`
	PriceCents *int64     `json:"-"`
}

var ErrSlotConflict = errors.New("slot conflict: resource already booked for that time range")
var ErrNotFound = errors.New("booking not found")
var ErrCannotModifyCompleted = errors.New("completed bookings cannot be modified")
var ErrSeriesOccurrenceExists = errors.New("series occurrence already materialized")
