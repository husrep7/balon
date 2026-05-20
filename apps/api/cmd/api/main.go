package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/lupon/balon/apps/api/internal/auth"
	"github.com/lupon/balon/apps/api/internal/config"
	"github.com/lupon/balon/apps/api/internal/db"
	"github.com/lupon/balon/apps/api/internal/email"
	httpapi "github.com/lupon/balon/apps/api/internal/http"
	"github.com/lupon/balon/apps/api/internal/store"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()

	if cfg.AutoMigrate {
		if err := db.Migrate(cfg.DatabaseURL, cfg.MigrationsPath); err != nil {
			log.Fatal().Err(err).Msg("migrations failed")
		}
		log.Info().Msg("migrations applied")
	}

	var verifier auth.Verifier
	var signer *auth.LocalSigner

	if cfg.AuthEnabled() {
		v, err := auth.NewKeycloakVerifier(ctx, cfg.KeycloakJWKSURL, cfg.KeycloakIssuer)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to init keycloak verifier")
		}
		verifier = v
		log.Info().Str("issuer", cfg.KeycloakIssuer).Msg("keycloak auth enabled")
	} else if cfg.LocalAuthEnabled() {
		signer = auth.NewLocalSigner(cfg.JWTSecret)
		verifier = signer
		log.Info().Msg("local JWT auth enabled")
	} else {
		log.Warn().Msg("keycloak NOT configured — running in dev mode with X-Tenant-ID header auth")
	}

	mailer := email.New(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPFrom)
	if cfg.SMTPHost == "" {
		log.Info().Msg("SMTP not configured — emails will be printed to stdout (dev mode)")
	} else {
		log.Info().Str("host", cfg.SMTPHost).Msg("SMTP email enabled")
	}

	stores := store.New(pool)
	apiBaseURL := "http://localhost:8080"
	if cfg.AppURL != "http://localhost:5174" {
		apiBaseURL = cfg.AppURL
	}

	var corsOrigins []string
	if cfg.CORSOrigins != "" {
		for _, o := range strings.Split(cfg.CORSOrigins, ",") {
			if s := strings.TrimSpace(o); s != "" {
				corsOrigins = append(corsOrigins, s)
			}
		}
	}

	router := httpapi.NewRouter(httpapi.RouterDeps{
		Stores:             stores,
		Verifier:           verifier,
		Signer:             signer,
		Mailer:             mailer,
		GoogleClientID:     cfg.GoogleClientID,
		GoogleClientSecret: cfg.GoogleClientSecret,
		APIBaseURL:         apiBaseURL,
		AppURL:             cfg.AppURL,
		DevAllowHeaders:    cfg.DevAllowHeaders,
		CORSOrigins:        corsOrigins,
	})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info().Str("addr", cfg.HTTPAddr).Msg("http server listening")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("http server failed")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("graceful shutdown failed")
	}
	log.Info().Msg("bye")
}
