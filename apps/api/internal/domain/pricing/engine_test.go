package pricing

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func mustTZ(t *testing.T, name string) *time.Location {
	t.Helper()
	tz, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("load tz: %v", err)
	}
	return tz
}

func mkRule(name string, priority int, price int64, conds Conditions) Rule {
	return Rule{
		ID:         uuid.New(),
		Name:       name,
		Priority:   priority,
		Conditions: conds,
		PriceCents: price,
		Active:     true,
	}
}

func TestEngine_NoRuleMatches(t *testing.T) {
	tz := mustTZ(t, "Europe/Sarajevo")
	e := NewEngine(nil, tz, nil)
	_, err := e.Quote(QuoteRequest{
		ResourceID: uuid.New(),
		StartAt:    time.Date(2026, 11, 13, 19, 0, 0, 0, tz),
		EndAt:      time.Date(2026, 11, 13, 20, 30, 0, 0, tz),
	})
	if err == nil {
		t.Fatal("expected error when no rule matches")
	}
}

func TestEngine_PriorityWins(t *testing.T) {
	tz := mustTZ(t, "Europe/Sarajevo")
	rules := []Rule{
		mkRule("base", 100, 8000, Conditions{}),
		mkRule("peak-evening", 50, 12000, Conditions{
			DayOfWeek: []int{1, 2, 3, 4, 5},
			TimeRange: &[2]string{"18:00", "23:00"},
		}),
	}
	e := NewEngine(rules, tz, nil)

	tuesEvening := time.Date(2026, 11, 17, 19, 0, 0, 0, tz)
	q, err := e.Quote(QuoteRequest{
		ResourceID: uuid.New(),
		StartAt:    tuesEvening,
		EndAt:      tuesEvening.Add(90 * time.Minute),
	})
	if err != nil {
		t.Fatalf("quote: %v", err)
	}
	if q.FinalCents != 12000 {
		t.Fatalf("expected 12000 (peak), got %d", q.FinalCents)
	}
}

func TestEngine_FallbackToBase(t *testing.T) {
	tz := mustTZ(t, "Europe/Sarajevo")
	rules := []Rule{
		mkRule("base", 100, 8000, Conditions{}),
		mkRule("peak-evening", 50, 12000, Conditions{
			DayOfWeek: []int{1, 2, 3, 4, 5},
			TimeRange: &[2]string{"18:00", "23:00"},
		}),
	}
	e := NewEngine(rules, tz, nil)

	tuesMorning := time.Date(2026, 11, 17, 10, 0, 0, 0, tz)
	q, err := e.Quote(QuoteRequest{
		ResourceID: uuid.New(),
		StartAt:    tuesMorning,
		EndAt:      tuesMorning.Add(60 * time.Minute),
	})
	if err != nil {
		t.Fatalf("quote: %v", err)
	}
	if q.FinalCents != 8000 {
		t.Fatalf("expected 8000 (base off-peak), got %d", q.FinalCents)
	}
}

func TestEngine_VIPDiscount(t *testing.T) {
	tz := mustTZ(t, "Europe/Sarajevo")
	rules := []Rule{mkRule("base", 100, 10000, Conditions{})}
	e := NewEngine(rules, tz, nil)

	q, err := e.Quote(QuoteRequest{
		ResourceID:   uuid.New(),
		StartAt:      time.Date(2026, 11, 17, 19, 0, 0, 0, tz),
		EndAt:        time.Date(2026, 11, 17, 20, 30, 0, 0, tz),
		CustomerTier: "vip",
	})
	if err != nil {
		t.Fatalf("quote: %v", err)
	}
	if q.DiscountCents != 1500 {
		t.Fatalf("expected 1500 discount, got %d", q.DiscountCents)
	}
	if q.FinalCents != 8500 {
		t.Fatalf("expected 8500 final, got %d", q.FinalCents)
	}
}

type mockMembership struct{ cover bool }

func (m mockMembership) ActiveForCustomer(_ string) (*ActiveMembership, error) {
	if !m.cover {
		return nil, nil
	}
	return &ActiveMembership{Kind: "season", CoverPrice: true}, nil
}

func TestEngine_SeasonTicketCoversAll(t *testing.T) {
	tz := mustTZ(t, "Europe/Sarajevo")
	rules := []Rule{mkRule("base", 100, 10000, Conditions{})}
	e := NewEngine(rules, tz, mockMembership{cover: true})

	cid := uuid.New()
	q, err := e.Quote(QuoteRequest{
		ResourceID:   uuid.New(),
		StartAt:      time.Date(2026, 11, 17, 19, 0, 0, 0, tz),
		EndAt:        time.Date(2026, 11, 17, 20, 30, 0, 0, tz),
		CustomerID:   &cid,
		CustomerTier: "vip", // VIP discount should be skipped when fully covered
	})
	if err != nil {
		t.Fatalf("quote: %v", err)
	}
	if q.FinalCents != 0 {
		t.Fatalf("expected 0 (season cover), got %d", q.FinalCents)
	}
	if q.PaymentMethodHint != "membership_credit" {
		t.Fatalf("expected membership_credit hint, got %q", q.PaymentMethodHint)
	}
}

func TestEngine_MinDurationCondition(t *testing.T) {
	tz := mustTZ(t, "Europe/Sarajevo")
	minDur := 60
	rules := []Rule{
		mkRule("base", 100, 8000, Conditions{}),
		mkRule("long-only", 50, 14000, Conditions{MinDurationMin: &minDur}),
	}
	e := NewEngine(rules, tz, nil)

	start := time.Date(2026, 11, 17, 10, 0, 0, 0, tz)

	short, _ := e.Quote(QuoteRequest{ResourceID: uuid.New(), StartAt: start, EndAt: start.Add(30 * time.Minute)})
	if short.FinalCents != 8000 {
		t.Fatalf("short booking should hit base, got %d", short.FinalCents)
	}

	long, _ := e.Quote(QuoteRequest{ResourceID: uuid.New(), StartAt: start, EndAt: start.Add(90 * time.Minute)})
	if long.FinalCents != 14000 {
		t.Fatalf("long booking should hit long-only, got %d", long.FinalCents)
	}
}
