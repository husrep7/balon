// Command migrate applies the embedded migrations to DATABASE_URL_UNPOOLED
// (or DATABASE_URL). Used to prepare hosted databases, e.g. Neon on Vercel.
package main

import (
	"os"

	"github.com/rs/zerolog/log"

	"github.com/lupon/balon/apps/api/internal/db"
	"github.com/lupon/balon/apps/api/migrations"
)

func main() {
	dsn := os.Getenv("DATABASE_URL_UNPOOLED")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		log.Fatal().Msg("set DATABASE_URL_UNPOOLED or DATABASE_URL")
	}
	if err := db.MigrateFS(dsn, migrations.FS); err != nil {
		log.Fatal().Err(err).Msg("migrations failed")
	}
	log.Info().Msg("migrations applied")
}
