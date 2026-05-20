// Package worker contains asynq task handlers and the background work logic
// for recurring booking materialization, daily reports, and reminders.
package worker

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/lupon/balon/apps/api/internal/domain/booking"
	"github.com/lupon/balon/apps/api/internal/store"
)

// Materializer expands booking_series records into actual bookings within a
// rolling horizon. Idempotent: re-running the same series produces no
// duplicates due to the unique (series_id, occurrence_date) index.
type Materializer struct {
	Stores      *store.Stores
	HorizonDays int
}

type Result struct {
	SeriesID         uuid.UUID
	Created          int
	AlreadyExisted   int
	Conflicts        int
	NewMaterializedThru time.Time
}

// MaterializeAll iterates all active series whose materialized_thru is behind
// the horizon and materializes them. Returns per-series results. Errors on
// individual series are logged but do not fail the whole batch.
func (m *Materializer) MaterializeAll(ctx context.Context) ([]Result, error) {
	now := time.Now()
	seriesList, err := m.Stores.Series.ListActiveDue(ctx, now)
	if err != nil {
		return nil, err
	}
	log.Info().Int("count", len(seriesList)).Msg("materialize: found series due")

	results := make([]Result, 0, len(seriesList))
	for _, s := range seriesList {
		r, err := m.MaterializeOne(ctx, s)
		if err != nil {
			log.Error().Err(err).Str("series_id", s.ID.String()).Msg("materialize series failed")
			continue
		}
		results = append(results, r)
	}
	return results, nil
}

// MaterializeOne expands a single series. Loads tenant timezone from the
// tenants table, expands rrule occurrences from materialized_thru to
// today+horizon, attempts to insert each booking. Stops processing on real
// DB errors but tolerates conflicts and idempotent skips.
func (m *Materializer) MaterializeOne(ctx context.Context, s booking.Series) (Result, error) {
	res := Result{SeriesID: s.ID}

	tz, err := m.Stores.LoadTenantTZ(ctx, s.TenantID)
	if err != nil {
		return res, err
	}

	horizon := time.Now().AddDate(0, 0, m.HorizonDays)
	from := s.MaterializedThru
	if from.Before(s.StartsOn) {
		from = s.StartsOn
	}

	occurrences, err := s.ExpandOccurrences(from, horizon, tz)
	if err != nil {
		return res, err
	}

	for _, occ := range occurrences {
		_, err := m.Stores.Bookings.CreateFromSeries(
			ctx,
			s.TenantID, s.ID, s.ResourceID,
			s.CustomerID, s.TeamID,
			occ.Date, occ.StartAt, occ.EndAt,
			s.DefaultPriceCents,
		)
		switch {
		case err == nil:
			res.Created++
		case errors.Is(err, booking.ErrSeriesOccurrenceExists):
			res.AlreadyExisted++
		case errors.Is(err, booking.ErrSlotConflict):
			res.Conflicts++
			log.Warn().
				Str("series_id", s.ID.String()).
				Str("date", occ.Date.Format("2006-01-02")).
				Msg("series materialization: resource conflict, skipping occurrence")
		default:
			return res, err
		}
	}

	res.NewMaterializedThru = horizon
	if err := m.Stores.Series.UpdateMaterializedThru(ctx, s.ID, horizon); err != nil {
		return res, err
	}

	log.Info().
		Str("series_id", s.ID.String()).
		Int("created", res.Created).
		Int("existed", res.AlreadyExisted).
		Int("conflicts", res.Conflicts).
		Time("through", horizon).
		Msg("materialize: series complete")

	return res, nil
}
