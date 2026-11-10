// Package serverless adapts the Balon API to a serverless runtime (Vercel).
//
// vercel.json rewrites every path to api/index.go, which calls Handler; gin then routes on the
// original request path, exactly as the long-running server does. The app is
// built once per instance and reused across invocations.
package serverless

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/lupon/balon/apps/api/internal/app"
	"github.com/lupon/balon/apps/api/internal/config"
	"github.com/lupon/balon/apps/api/internal/db"
	"github.com/lupon/balon/apps/api/internal/worker"
	"github.com/lupon/balon/apps/api/migrations"
)

var (
	once     sync.Once
	instance *app.App
	initErr  error
)

func build() {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	cfg, err := config.Load()
	if err != nil {
		initErr = err
		return
	}
	if cfg.AutoMigrate {
		if err := db.MigrateFS(cfg.MigrationDatabaseURL(), migrations.FS); err != nil {
			initErr = err
			return
		}
	}
	pool, err := db.ConnectWithLimits(ctx, cfg.DatabaseURL, 5, 0)
	if err != nil {
		initErr = err
		return
	}
	instance, initErr = app.Build(ctx, cfg, pool)
}

// Handler serves every API request.
func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(build)
	if initErr != nil {
		log.Error().Err(initErr).Msg("api init failed")
		http.Error(w, `{"error":"service unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	if r.URL.Path == "/api/cron/materialize" {
		materialize(w, r)
		return
	}
	instance.Handler.ServeHTTP(w, r)
}

// materialize replaces the asynq scheduler on Vercel: Vercel Cron calls it
// daily and it expands recurring series into bookings (idempotent).
func materialize(w http.ResponseWriter, r *http.Request) {
	secret := instance.Config.CronSecret
	got := r.Header.Get("Authorization")
	if secret == "" || subtle.ConstantTimeCompare([]byte(got), []byte("Bearer "+secret)) != 1 {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	m := &worker.Materializer{Stores: instance.Stores, HorizonDays: instance.Config.MaterializeHorizonDays}
	results, err := m.MaterializeAll(r.Context())
	if err != nil {
		log.Error().Err(err).Msg("materialize_all failed")
		http.Error(w, `{"error":"materialize failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true,"series":` + strconv.Itoa(len(results)) + `}`))
}
