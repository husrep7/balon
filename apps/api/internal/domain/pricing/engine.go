package pricing

import (
	"fmt"
	"sort"
	"time"
)

// Engine evaluates pricing rules against a quote request.
// Two-phase: (1) first matching rule by priority gives base price,
// (2) modifiers (membership / tier discount) apply on top.
type Engine struct {
	rules         []Rule
	tenantTZ      *time.Location
	membershipLookup MembershipLookup
}

// MembershipLookup is injected so the engine can ask "does this customer
// have an active package or season ticket with credits left?" without
// taking a DB dependency in the pure domain package.
type MembershipLookup interface {
	ActiveForCustomer(customerID string) (*ActiveMembership, error)
}

type ActiveMembership struct {
	Kind         string // "package", "season", "monthly"
	CreditsLeft  *int
	CoverPrice   bool // true means the booking is fully covered (0 cents charged)
}

func NewEngine(rules []Rule, tz *time.Location, ml MembershipLookup) *Engine {
	sorted := make([]Rule, len(rules))
	copy(sorted, rules)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Priority != sorted[j].Priority {
			return sorted[i].Priority < sorted[j].Priority
		}
		return specificityScore(sorted[i].Conditions) > specificityScore(sorted[j].Conditions)
	})
	return &Engine{rules: sorted, tenantTZ: tz, membershipLookup: ml}
}

func (e *Engine) Quote(req QuoteRequest) (Quote, error) {
	if !req.EndAt.After(req.StartAt) {
		return Quote{}, fmt.Errorf("end_at must be after start_at")
	}

	startLocal := req.StartAt.In(e.tenantTZ)
	durMin := int(req.EndAt.Sub(req.StartAt).Minutes())

	var matched *Rule
	for i := range e.rules {
		r := &e.rules[i]
		if !r.Active {
			continue
		}
		if r.ValidFrom != nil && startLocal.Before(*r.ValidFrom) {
			continue
		}
		if r.ValidTo != nil && startLocal.After(*r.ValidTo) {
			continue
		}
		if r.ResourceID != nil && *r.ResourceID != req.ResourceID {
			continue
		}
		if !matchConditions(r.Conditions, req, startLocal, durMin) {
			continue
		}
		matched = r
		break
	}

	if matched == nil {
		return Quote{}, fmt.Errorf("no pricing rule matched")
	}

	q := Quote{
		BaseCents:       matched.PriceCents,
		FinalCents:      matched.PriceCents,
		AppliedRuleID:   &matched.ID,
		AppliedRuleName: matched.Name,
	}

	if req.CustomerID != nil && e.membershipLookup != nil {
		am, err := e.membershipLookup.ActiveForCustomer(req.CustomerID.String())
		if err == nil && am != nil && am.CoverPrice {
			q.FinalCents = 0
			q.DiscountCents = q.BaseCents
			q.PaymentMethodHint = "membership_credit"
			q.Notes = append(q.Notes, fmt.Sprintf("Pokriveno (%s)", am.Kind))
			return q, nil
		}
	}

	if req.CustomerTier == "vip" {
		disc := q.BaseCents * 15 / 100
		q.DiscountCents = disc
		q.FinalCents -= disc
		q.Notes = append(q.Notes, fmt.Sprintf("VIP -%d KM", disc/100))
	}

	return q, nil
}

func matchConditions(c Conditions, req QuoteRequest, startLocal time.Time, durMin int) bool {
	if len(c.DayOfWeek) > 0 {
		dow := int(startLocal.Weekday())
		if dow == 0 {
			dow = 7 // Sunday -> 7
		}
		if !intIn(dow, c.DayOfWeek) {
			return false
		}
	}
	if c.TimeRange != nil {
		t, err := time.Parse("15:04", c.TimeRange[0])
		if err != nil {
			return false
		}
		from := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(),
			t.Hour(), t.Minute(), 0, 0, startLocal.Location())

		t2, err := time.Parse("15:04", c.TimeRange[1])
		if err != nil {
			return false
		}
		to := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(),
			t2.Hour(), t2.Minute(), 0, 0, startLocal.Location())

		if startLocal.Before(from) || !startLocal.Before(to) {
			return false
		}
	}
	if len(c.CustomerTier) > 0 && req.CustomerTier != "" {
		if !strIn(req.CustomerTier, c.CustomerTier) {
			return false
		}
	}
	if len(c.ResourceKind) > 0 && req.ResourceKind != "" {
		if !strIn(req.ResourceKind, c.ResourceKind) {
			return false
		}
	}
	if c.MinDurationMin != nil && durMin < *c.MinDurationMin {
		return false
	}
	if len(c.Channel) > 0 && req.Channel != "" {
		if !strIn(req.Channel, c.Channel) {
			return false
		}
	}
	return true
}

func specificityScore(c Conditions) int {
	s := 0
	if len(c.DayOfWeek) > 0 {
		s++
	}
	if c.TimeRange != nil {
		s++
	}
	if len(c.CustomerTier) > 0 {
		s++
	}
	if len(c.ResourceKind) > 0 {
		s++
	}
	if len(c.Season) > 0 {
		s++
	}
	if c.MinDurationMin != nil {
		s++
	}
	if len(c.Channel) > 0 {
		s++
	}
	return s
}

func intIn(v int, xs []int) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

func strIn(v string, xs []string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
