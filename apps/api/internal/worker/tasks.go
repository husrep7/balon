package worker

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/rs/zerolog/log"
)

const (
	TaskMaterializeAll = "series:materialize_all"
	TaskMaterializeOne = "series:materialize_one"
)

type MaterializeOnePayload struct {
	SeriesID uuid.UUID `json:"series_id"`
	TenantID uuid.UUID `json:"tenant_id"`
}

// NewMaterializeAllTask enqueues a sweep of all due series. Triggered daily
// by the scheduler.
func NewMaterializeAllTask() *asynq.Task {
	return asynq.NewTask(TaskMaterializeAll, nil)
}

// NewMaterializeOneTask enqueues materialization for a specific series.
// Triggered ad-hoc from the API when a new series is created.
func NewMaterializeOneTask(seriesID, tenantID uuid.UUID) (*asynq.Task, error) {
	payload, err := json.Marshal(MaterializeOnePayload{SeriesID: seriesID, TenantID: tenantID})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TaskMaterializeOne, payload), nil
}

// RegisterHandlers attaches all worker task handlers to the asynq mux.
func RegisterHandlers(mux *asynq.ServeMux, m *Materializer) {
	mux.HandleFunc(TaskMaterializeAll, func(ctx context.Context, _ *asynq.Task) error {
		log.Info().Msg("task: materialize_all started")
		results, err := m.MaterializeAll(ctx)
		if err != nil {
			return err
		}
		var totalCreated, totalConflicts int
		for _, r := range results {
			totalCreated += r.Created
			totalConflicts += r.Conflicts
		}
		log.Info().
			Int("series", len(results)).
			Int("bookings_created", totalCreated).
			Int("conflicts", totalConflicts).
			Msg("task: materialize_all done")
		return nil
	})

	mux.HandleFunc(TaskMaterializeOne, func(ctx context.Context, t *asynq.Task) error {
		var p MaterializeOnePayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return asynq.SkipRetry
		}
		series, err := m.Stores.Series.Get(ctx, p.TenantID, p.SeriesID)
		if err != nil {
			return err
		}
		if series == nil {
			log.Warn().Str("series_id", p.SeriesID.String()).Msg("series not found, skipping")
			return asynq.SkipRetry
		}
		_, err = m.MaterializeOne(ctx, *series)
		return err
	})
}
