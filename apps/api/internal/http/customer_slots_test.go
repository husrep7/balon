package http

import (
	"testing"
	"time"
)

func TestValidateCustomerSlot(t *testing.T) {
	now := time.Date(2026, 11, 11, 18, 10, 0, 0, time.UTC)
	cases := []struct {
		name    string
		start   time.Time
		minutes int
		ok      bool
	}{
		{"future single slot", now.Add(time.Hour), 75, true},
		{"future two slots", now.Add(time.Hour), 150, true},
		{"slot in progress", now.Add(-10 * time.Minute), 75, false},
		{"slot starting exactly now", now, 75, false},
		{"past slot", now.Add(-24 * time.Hour), 75, false},
		{"three slots", now.Add(time.Hour), 225, false},
		{"odd duration", now.Add(time.Hour), 90, false},
	}
	for _, c := range cases {
		msg := validateCustomerSlot(c.start, c.start.Add(time.Duration(c.minutes)*time.Minute), now)
		if (msg == "") != c.ok {
			t.Errorf("%s: got %q, want ok=%v", c.name, msg, c.ok)
		}
	}
}

func TestConsecutivePrice(t *testing.T) {
	single := consecutivePrice([]int64{11000}, nil, 10)
	if single.Final != 11000 || single.Regular != 11000 {
		t.Fatalf("single slot: %+v", single)
	}

	// 80 + 110 = 190 KM, minus 10% = 171 KM
	two := consecutivePrice([]int64{8000, 11000}, nil, 10)
	if two.Regular != 19000 || two.Final != 17100 {
		t.Fatalf("two slots: %+v", two)
	}

	// 110 + 110 = 220 KM, minus 10% = 198 KM
	evening := consecutivePrice([]int64{11000, 11000}, nil, 10)
	if evening.Final != 19800 {
		t.Fatalf("two evening slots: %+v", evening)
	}

	// A cheaper package rule wins; a pricier one is ignored.
	cheap := int64(18000)
	if p := consecutivePrice([]int64{11000, 11000}, &cheap, 10); p.Final != 18000 {
		t.Fatalf("package price: %+v", p)
	}
	pricey := int64(21000)
	if p := consecutivePrice([]int64{11000, 11000}, &pricey, 10); p.Final != 19800 {
		t.Fatalf("package price above discount: %+v", p)
	}
}
