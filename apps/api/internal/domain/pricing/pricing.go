package pricing

import (
	"time"

	"github.com/google/uuid"
)

type Rule struct {
	ID          uuid.UUID  `json:"id"`
	TenantID    uuid.UUID  `json:"tenant_id"`
	ResourceID  *uuid.UUID `json:"resource_id,omitempty"`
	Name        string     `json:"name"`
	Priority    int        `json:"priority"`
	Conditions  Conditions `json:"conditions"`
	PriceCents  int64      `json:"price_cents"`
	ValidFrom   *time.Time `json:"valid_from,omitempty"`
	ValidTo     *time.Time `json:"valid_to,omitempty"`
	Active      bool       `json:"active"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Conditions is the structured JSONB shape. All fields optional;
// missing means wildcard, present means AND-combine constraint.
type Conditions struct {
	DayOfWeek         []int     `json:"day_of_week,omitempty"`         // 1=Mon ... 7=Sun
	TimeRange         *[2]string `json:"time_range,omitempty"`         // ["HH:MM", "HH:MM"]
	CustomerTier      []string  `json:"customer_tier,omitempty"`
	ResourceKind      []string  `json:"resource_kind,omitempty"`
	Season            []string  `json:"season,omitempty"`
	MinDurationMin    *int      `json:"min_duration_minutes,omitempty"`
	Channel           []string  `json:"channel,omitempty"`
}

type QuoteRequest struct {
	TenantID     uuid.UUID `json:"-"`
	ResourceID   uuid.UUID `json:"resource_id" binding:"required"`
	ResourceKind string    `json:"-"`
	StartAt      time.Time `json:"start_at" binding:"required"`
	EndAt        time.Time `json:"end_at" binding:"required"`
	CustomerID   *uuid.UUID `json:"customer_id,omitempty"`
	CustomerTier string     `json:"-"`
	Channel      string     `json:"channel,omitempty"`
}

// RuleUpdate is a PATCH payload — every nil field is skipped.
type RuleUpdate struct {
	Name       *string     `json:"name,omitempty"`
	Priority   *int        `json:"priority,omitempty"`
	PriceCents *int64      `json:"price_cents,omitempty"`
	Active     *bool       `json:"active,omitempty"`
	Conditions *Conditions `json:"conditions,omitempty"`
}

type Quote struct {
	BaseCents          int64      `json:"base_cents"`
	DiscountCents      int64      `json:"discount_cents"`
	FinalCents         int64      `json:"final_cents"`
	AppliedRuleID      *uuid.UUID `json:"applied_rule_id,omitempty"`
	AppliedRuleName    string     `json:"applied_rule_name,omitempty"`
	PaymentMethodHint  string     `json:"payment_method_hint,omitempty"` // e.g. "membership_credit" when sezona
	Notes              []string   `json:"notes,omitempty"`
}
