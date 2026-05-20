package config

import (
	"github.com/kelseyhightower/envconfig"
)

type Config struct {
	HTTPAddr       string `envconfig:"HTTP_ADDR" default:":8080"`
	DatabaseURL    string `envconfig:"DATABASE_URL" required:"true"`
	MigrationsPath string `envconfig:"MIGRATIONS_PATH" default:"file://./apps/api/migrations"`
	AutoMigrate    bool   `envconfig:"AUTO_MIGRATE" default:"true"`
	Environment    string `envconfig:"ENVIRONMENT" default:"development"`

	// Redis (used by worker queue)
	RedisAddr     string `envconfig:"REDIS_ADDR" default:"localhost:6379"`
	RedisPassword string `envconfig:"REDIS_PASSWORD"`
	RedisDB       int    `envconfig:"REDIS_DB" default:"0"`

	// Keycloak (production auth)
	KeycloakIssuer  string `envconfig:"KEYCLOAK_ISSUER"`
	KeycloakJWKSURL string `envconfig:"KEYCLOAK_JWKS_URL"`

	// Local JWT auth — used when Keycloak is not configured
	JWTSecret string `envconfig:"JWT_SECRET" default:"dev-secret-change-in-production"`

	// Google OAuth
	GoogleClientID     string `envconfig:"GOOGLE_CLIENT_ID"`
	GoogleClientSecret string `envconfig:"GOOGLE_CLIENT_SECRET"`
	AppURL             string `envconfig:"APP_URL" default:"http://localhost:5174"`

	// Email (SMTP) — optional; if empty, emails are logged to stdout
	SMTPHost     string `envconfig:"SMTP_HOST"`
	SMTPPort     string `envconfig:"SMTP_PORT" default:"587"`
	SMTPUser     string `envconfig:"SMTP_USER"`
	SMTPPassword string `envconfig:"SMTP_PASSWORD"`
	SMTPFrom     string `envconfig:"SMTP_FROM" default:"noreply@balon.ba"`

	DevAllowHeaders bool   `envconfig:"DEV_ALLOW_HEADERS" default:"false"`
	CORSOrigins     string `envconfig:"CORS_ORIGINS"` // comma-separated allowed origins; empty = same-origin only

	// Worker config
	MaterializeHorizonDays int    `envconfig:"MATERIALIZE_HORIZON_DAYS" default:"90"`
	MaterializeCron        string `envconfig:"MATERIALIZE_CRON" default:"0 2 * * *"`
}

func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, err
	}
	if cfg.KeycloakIssuer == "" && cfg.Environment == "development" {
		cfg.DevAllowHeaders = true
	}
	return &cfg, nil
}

func (c *Config) AuthEnabled() bool {
	return c.KeycloakIssuer != "" && c.KeycloakJWKSURL != ""
}

func (c *Config) LocalAuthEnabled() bool {
	return !c.AuthEnabled() && c.JWTSecret != ""
}
