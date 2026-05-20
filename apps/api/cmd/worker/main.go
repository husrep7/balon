package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/lupon/balon/apps/api/internal/config"
	"github.com/lupon/balon/apps/api/internal/db"
	"github.com/lupon/balon/apps/api/internal/store"
	"github.com/lupon/balon/apps/api/internal/worker"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("load config")
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("connect db")
	}
	defer pool.Close()

	stores := store.New(pool)

	materializer := &worker.Materializer{
		Stores:      stores,
		HorizonDays: cfg.MaterializeHorizonDays,
	}

	redisOpt := asynq.RedisClientOpt{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	}

	// === Server (handles enqueued tasks) ===
	srv := asynq.NewServer(redisOpt, asynq.Config{
		Concurrency: 5,
		Queues: map[string]int{
			"critical": 6,
			"default":  3,
			"low":      1,
		},
		Logger: &asynqZerologAdapter{},
	})

	mux := asynq.NewServeMux()
	worker.RegisterHandlers(mux, materializer)

	// === Scheduler (enqueues periodic tasks) ===
	scheduler := asynq.NewScheduler(redisOpt, &asynq.SchedulerOpts{
		Logger: &asynqZerologAdapter{},
	})

	entryID, err := scheduler.Register(cfg.MaterializeCron, worker.NewMaterializeAllTask(),
		asynq.Queue("default"),
		asynq.Timeout(10*time.Minute),
	)
	if err != nil {
		log.Fatal().Err(err).Msg("register periodic task")
	}
	log.Info().Str("cron", cfg.MaterializeCron).Str("entry", entryID).Msg("scheduled materialize_all")

	// Run both concurrently
	errCh := make(chan error, 2)

	go func() {
		log.Info().Msg("scheduler starting")
		if err := scheduler.Run(); err != nil {
			errCh <- err
		}
	}()

	go func() {
		log.Info().Msg("server starting")
		if err := srv.Run(mux); err != nil {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		log.Info().Msg("shutdown signal received")
	case err := <-errCh:
		log.Error().Err(err).Msg("worker failed")
	}

	scheduler.Shutdown()
	srv.Shutdown()
	log.Info().Msg("bye")
}

// Adapter making zerolog satisfy asynq's Logger interface.
type asynqZerologAdapter struct{}

func (asynqZerologAdapter) Debug(args ...interface{}) { log.Debug().Msg(sprintArgs(args)) }
func (asynqZerologAdapter) Info(args ...interface{})  { log.Info().Msg(sprintArgs(args)) }
func (asynqZerologAdapter) Warn(args ...interface{})  { log.Warn().Msg(sprintArgs(args)) }
func (asynqZerologAdapter) Error(args ...interface{}) { log.Error().Msg(sprintArgs(args)) }
func (asynqZerologAdapter) Fatal(args ...interface{}) { log.Fatal().Msg(sprintArgs(args)) }

func sprintArgs(args []interface{}) string {
	if len(args) == 0 {
		return ""
	}
	if s, ok := args[0].(string); ok && len(args) == 1 {
		return s
	}
	return ""
}
