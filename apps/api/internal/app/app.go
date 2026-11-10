// Package app wires config, database, auth and the HTTP router together so
// the long-running server (cmd/api) and the Vercel serverless entrypoint
// (api/index.go) build the exact same application.
package app

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/lupon/balon/apps/api/internal/auth"
	"github.com/lupon/balon/apps/api/internal/config"
	"github.com/lupon/balon/apps/api/internal/email"
	httpapi "github.com/lupon/balon/apps/api/internal/http"
	"github.com/lupon/balon/apps/api/internal/store"
)

// App is a fully wired application.
type App struct {
	Config  *config.Config
	Pool    *pgxpool.Pool
	Stores  *store.Stores
	Handler http.Handler
}

// Build wires the HTTP handler on top of an already-connected pool.
func Build(ctx context.Context, cfg *config.Config, pool *pgxpool.Pool) (*App, error) {
	var verifier auth.Verifier
	var signer *auth.LocalSigner

	if cfg.AuthEnabled() {
		v, err := auth.NewKeycloakVerifier(ctx, cfg.KeycloakJWKSURL, cfg.KeycloakIssuer)
		if err != nil {
			return nil, fmt.Errorf("init keycloak verifier: %w", err)
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

	return &App{Config: cfg, Pool: pool, Stores: stores, Handler: router}, nil
}
