package booking

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/teambition/rrule-go"
)

type SeriesStatus string

const (
	SeriesStatusActive SeriesStatus = "active"
	SeriesStatusPaused SeriesStatus = "paused"
	SeriesStatusEnded  SeriesStatus = "ended"
)

type Series struct {
	ID                 uuid.UUID     `json:"id"`
	TenantID           uuid.UUID     `json:"tenant_id"`
	CustomerID         *uuid.UUID    `json:"customer_id,omitempty"`
	TeamID             *uuid.UUID    `json:"team_id,omitempty"`
	ResourceID         uuid.UUID     `json:"resource_id"`
	RRule              string        `json:"rrule"`
	StartsOn           time.Time     `json:"starts_on"`
	EndsOn             *time.Time    `json:"ends_on,omitempty"`
	SlotStartTime      string        `json:"slot_start_time"` // "HH:MM"
	SlotDuration       time.Duration `json:"slot_duration"`
	DefaultPriceCents  int64         `json:"default_price_cents"`
	MaterializedThru   time.Time     `json:"materialized_thru"`
	Status             SeriesStatus  `json:"status"`
	CreatedAt          time.Time     `json:"created_at"`
}

type CreateSeriesInput struct {
	TenantID          uuid.UUID  `json:"-"`
	CustomerID        *uuid.UUID `json:"customer_id,omitempty"`
	TeamID            *uuid.UUID `json:"team_id,omitempty"`
	ResourceID        uuid.UUID  `json:"resource_id" binding:"required"`
	RRule             string     `json:"rrule" binding:"required"`
	StartsOn          time.Time  `json:"starts_on" binding:"required"`
	EndsOn            *time.Time `json:"ends_on,omitempty"`
	SlotStartTime     string     `json:"slot_start_time" binding:"required"`
	SlotDurationMin   int        `json:"slot_duration_minutes" binding:"required"`
	DefaultPriceCents int64      `json:"default_price_cents" binding:"required"`
}

func (i CreateSeriesInput) Validate() error {
	if i.CustomerID == nil && i.TeamID == nil {
		return errors.New("either customer_id or team_id is required")
	}
	if _, err := rrule.StrToRRule(i.RRule); err != nil {
		return errors.New("invalid rrule: " + err.Error())
	}
	if _, err := time.Parse("15:04", i.SlotStartTime); err != nil {
		return errors.New("slot_start_time must be HH:MM")
	}
	if i.SlotDurationMin < 30 || i.SlotDurationMin > 480 {
		return errors.New("slot duration must be 30-480 minutes")
	}
	return nil
}

type Occurrence struct {
	Date    time.Time
	StartAt time.Time
	EndAt   time.Time
}

// ExpandOccurrences computes occurrences in [from, to) using the series's
// timezone-local slot_start_time semantics. The tz must be the tenant's
// IANA timezone (e.g. "Europe/Sarajevo").
func (s Series) ExpandOccurrences(from, to time.Time, tz *time.Location) ([]Occurrence, error) {
	r, err := rrule.StrToRRule(s.RRule)
	if err != nil {
		return nil, err
	}

	slotStart, err := time.Parse("15:04", s.SlotStartTime)
	if err != nil {
		return nil, err
	}

	r.DTStart(time.Date(
		s.StartsOn.Year(), s.StartsOn.Month(), s.StartsOn.Day(),
		slotStart.Hour(), slotStart.Minute(), 0, 0,
		tz,
	))

	dates := r.Between(from, to, true)
	out := make([]Occurrence, 0, len(dates))
	for _, d := range dates {
		if s.EndsOn != nil && d.After(*s.EndsOn) {
			break
		}
		startLocal := time.Date(d.Year(), d.Month(), d.Day(), slotStart.Hour(), slotStart.Minute(), 0, 0, tz)
		out = append(out, Occurrence{
			Date:    time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, tz),
			StartAt: startLocal,
			EndAt:   startLocal.Add(s.SlotDuration),
		})
	}
	return out, nil
}
