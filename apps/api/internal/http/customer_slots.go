package http

import (
	"context"
	"time"

	"github.com/google/uuid"

	domainPricing "github.com/lupon/balon/apps/api/internal/domain/pricing"
)

// Online (customer) bookings are sold in fixed slots. A customer may book one
// slot or several back-to-back slots in a single booking; consecutive slots
// are cheaper than booking them separately.
const (
	slotMinutes            = 75
	maxConsecutiveSlots    = 2
	consecutiveDiscountPct = 10
)

// validateCustomerSlot returns a user-facing error message, or "" when the
// requested window can be booked online.
func validateCustomerSlot(startAt, endAt, now time.Time) string {
	if !startAt.After(now) {
		return "Termin je već počeo ili je prošao. Odaberi neki od narednih termina."
	}
	dur := int(endAt.Sub(startAt).Minutes())
	if dur <= 0 || dur%slotMinutes != 0 || dur/slotMinutes > maxConsecutiveSlots {
		return "Možeš rezervisati jedan ili dva uzastopna termina."
	}
	return ""
}

// priceBreakdown is what the customer pays (Final) and what the same time
// would cost as separate single slots (Regular). They differ only for
// multi-slot bookings.
type priceBreakdown struct {
	Final   int64
	Regular int64
}

// consecutivePrice combines per-slot prices into one booking price.
// packageCents is an explicit price from a rule that targets the whole
// duration (min_duration_minutes above one slot); it wins when it is lower.
func consecutivePrice(perSlot []int64, packageCents *int64, discountPct int) priceBreakdown {
	var regular int64
	for _, p := range perSlot {
		regular += p
	}
	if len(perSlot) <= 1 {
		return priceBreakdown{Final: regular, Regular: regular}
	}
	final := regular * int64(100-discountPct) / 100
	final = final / 100 * 100 // round down to whole KM
	if packageCents != nil && *packageCents > 0 && *packageCents < final {
		final = *packageCents
	}
	return priceBreakdown{Final: final, Regular: regular}
}

// customerPrice prices an online booking: each slot through the pricing
// engine, then the consecutive-slot discount on top.
func customerPrice(ctx context.Context, h *handlers, tenantID, resourceID uuid.UUID, startAt, endAt time.Time) *priceBreakdown {
	rules, err := h.stores.Pricing.ActiveRules(ctx, tenantID)
	if err != nil || len(rules) == 0 {
		return nil
	}
	kind := ""
	if res, _ := h.stores.Resources.Get(ctx, tenantID, resourceID); res != nil {
		kind = string(res.Kind)
	}
	tz, err := time.LoadLocation("Europe/Sarajevo")
	if err != nil {
		tz = time.UTC
	}
	engine := domainPricing.NewEngine(rules, tz, nil)
	quote := func(s, e time.Time) (domainPricing.Quote, error) {
		return engine.Quote(domainPricing.QuoteRequest{
			TenantID:     tenantID,
			ResourceID:   resourceID,
			ResourceKind: kind,
			StartAt:      s,
			EndAt:        e,
		})
	}

	dur := int(endAt.Sub(startAt).Minutes())
	n := dur / slotMinutes
	if n <= 1 || dur%slotMinutes != 0 {
		q, err := quote(startAt, endAt)
		if err != nil {
			return nil
		}
		return &priceBreakdown{Final: q.FinalCents, Regular: q.FinalCents}
	}

	perSlot := make([]int64, 0, n)
	for i := 0; i < n; i++ {
		s := startAt.Add(time.Duration(i*slotMinutes) * time.Minute)
		q, err := quote(s, s.Add(slotMinutes*time.Minute))
		if err != nil {
			return nil
		}
		perSlot = append(perSlot, q.FinalCents)
	}

	// A rule written for the whole duration (e.g. "2 termina = 200 KM")
	// counts as a package price.
	var pkg *int64
	if q, err := quote(startAt, endAt); err == nil && q.AppliedRuleID != nil {
		for _, r := range rules {
			if r.ID == *q.AppliedRuleID && r.Conditions.MinDurationMin != nil && *r.Conditions.MinDurationMin > slotMinutes {
				v := q.FinalCents
				pkg = &v
			}
		}
	}

	b := consecutivePrice(perSlot, pkg, consecutiveDiscountPct)
	return &b
}
