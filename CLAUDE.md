# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Balon is a multi-tenant SaaS for booking and operations at sports facilities (football "baloni"). See `SPEC.md` for the authoritative technical specification — it documents schema decisions, lifecycle invariants, edge cases, and rationale that are not re-derived here.

## Repo layout

Two apps in a Go workspace + npm project:

- `apps/api/` — Go 1.22 backend. Two binaries: `cmd/api` (HTTP) and `cmd/worker` (asynq). `go.work` only includes this module.
- `apps/admin/` — React 18 + Vite + TS admin SPA.
- `apps/api/migrations/` — numbered `*.up.sql` / `*.down.sql` applied via `golang-migrate`.
- `infra/keycloak/` — realm config used in production auth.
- `scripts/seed.sql`, `scripts/kc-bootstrap.sh` — bootstrap demo tenant; assign `tenant_id` attr to a Keycloak user.

## Common commands

All make targets run from repo root. The defaults assume the dev Postgres started by `make up`.

```bash
make up                # postgres + redis via docker-compose (dev infra)
make migrate           # apply migrations (requires `migrate` CLI in PATH)
make dev               # run API on :8080 — sets DEV_ALLOW_HEADERS via ENVIRONMENT=development
make worker-dev        # run asynq server + scheduler against local Redis
make worker-trigger    # manually enqueue series:materialize_all (requires `asynq` CLI)
make test              # cd apps/api && go test ./...
make seed              # psql ... -f scripts/seed.sql  (demo tenant + sample data)
make tidy              # go mod tidy in apps/api (creates go.sum on first run)

make admin-install     # cd apps/admin && npm install
make admin-dev         # vite dev server on :5173 (proxies /api/* → :8080)
make admin-build       # tsc -b && vite build
```

Run a single Go test:

```bash
cd apps/api && go test ./internal/domain/pricing -run TestEngineQuote -v
```

Frontend "lint" is type-check only: `cd apps/admin && npm run lint` (runs `tsc --noEmit`).

CLI installs needed once:

```bash
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
go install github.com/hibiken/asynq/tools/asynq@latest
```

Production deploy uses `docker-compose.prod.yml` — see `DEPLOYMENT.md` and `make docker-up`/`prod-deploy`/`prod-seed`/`kc-bootstrap`.

## Architecture

### Multi-tenancy

Every domain row carries `tenant_id`. The pattern, end to end:

1. `internal/http/middleware.go::authMiddleware` extracts tenant from JWT (Keycloak `tenant_id` claim) or, in dev, from the `X-Tenant-ID` header.
2. Handlers pull it via `tenantOf(c)` and pass it explicitly into store calls — store methods always take `tenantID uuid.UUID` as the first arg and every SQL query filters on it. There is no implicit context-scoped tenant; pass it explicitly.

Row-level security is **not** enabled yet (Phase 2 in SPEC §3). Trust the app-level filter — but if you add a new query or store, the `tenant_id = $1` predicate is mandatory.

### Auth dual mode

`internal/config/config.go::Load` flips `DevAllowHeaders` to true when `ENVIRONMENT=development` and `KEYCLOAK_ISSUER` is empty. With it set, the middleware accepts `X-Tenant-ID` / `X-User-ID` headers as auth (used by `make dev` and the Vite dev server). In production, Keycloak JWT is required (`auth/keycloak.go` uses `MicahParks/keyfunc/v3` for JWKS). The frontend mirrors this — `apps/admin/src/lib/auth.ts` falls back to `VITE_DEV_TENANT_ID` env vars when keycloak-js isn't configured.

### Resource locking — the critical invariant

Bookings of resource R lock **R + all ancestors + all descendants** in ltree (`full_pitch` blocks its `half_pitch` children and vice versa). This is implemented in **SQL, not Go**:

- `resource_locks` has `EXCLUDE USING gist (resource_id WITH =, time_range WITH &&)` (migration `0005_bookings.up.sql`).
- Trigger `fn_populate_resource_locks` inserts locks for every ancestor/descendant via `r.path @> booked_path OR r.path <@ booked_path` on each booking insert.
- A second trigger clears locks when status flips to `cancelled` / `no_show`.

When a conflicting insert hits the `EXCLUDE`, Postgres raises `23P01`. The booking store translates this to `booking.ErrSlotConflict`; HTTP handlers map it to **409 Conflict**. Never duplicate the lock logic in app code — extend the SQL trigger if hierarchy semantics change.

### Recurring booking series

Series are not virtual — they're materialized into real `bookings` rows. The worker (`cmd/worker`, scheduled cron in `MATERIALIZE_CRON`, default `0 2 * * *`):

1. `Materializer.MaterializeAll` lists series whose `materialized_thru < horizon` (today + `MATERIALIZE_HORIZON_DAYS`, default 90).
2. For each, `ExpandOccurrences` runs the RRULE in **tenant local timezone** (handles DST — see `domain/booking/series.go`), then attempts inserts.
3. Idempotent via the partial unique index `bookings_series_occurrence` on `(series_id, series_occurrence_date)`. Re-running is safe.
4. Conflicts are logged and skipped, never fail the batch. Real DB errors abort the single series but the loop continues for others.

When you create a series via `POST /series`, the handler also enqueues `series:materialize_one` for immediate expansion (see `worker/tasks.go`).

### Pricing engine

`internal/domain/pricing/engine.go` is pure domain — no DB import, fully unit-tested (`engine_test.go`). Two phases:

1. **Base price**: rules sorted by `priority ASC`, tiebreak by `specificityScore` (more conditions → more specific wins). First match wins.
2. **Modifiers**: membership coverage first (sets `final = 0`, hint `membership_credit`); else VIP tier −15%. Modifiers don't stack; first match wins.

The engine takes a `MembershipLookup` interface so the domain stays DB-free. The wiring of a real membership store into this lookup is still **TODO** (README "Sljedeći koraci" §3) — currently no implementation is registered, so membership coverage is effectively dead code in production paths.

### Layering — domain / store / http

- `internal/domain/<entity>/` — pure types, validation, and (for `pricing` / `booking/series`) pure business logic. No `pgx`, no `gin`.
- `internal/store/` — pgx-based repositories, one per aggregate, all wired together in `store.New()` which returns the `Stores` struct. Handlers always reach DB via this struct.
- `internal/http/` — gin handlers in `handlers.go`, middleware in `middleware.go`, routes in `router.go`. The router file is the most reliable map of the public API surface.

Worker handlers (`internal/worker/`) take `*store.Stores` directly — they bypass HTTP, so any new background work follows the same domain→store pattern without re-introducing HTTP concerns.

### Money and time

- All prices are `bigint` cents (`*_cents` suffix). Never use floats.
- `tstzrange` is the canonical booking time representation in DB. Domain code uses `time.Time` pairs (`StartAt`, `EndAt`); store layer marshals to/from `tstzrange`.
- RRULE expansion uses tenant TZ loaded from `tenants.timezone` (default `Europe/Sarajevo`). `closed_dates` from `tenants.config` JSONB filter occurrences.

## Conventions

- API surface is the source of truth for what's wired. When adding endpoints, register in `router.go` and the matching handler in `handlers.go`.
- Migrations are numbered and paired (`NNNN_name.up.sql` + `NNNN_name.down.sql`). Always write the down. `AUTO_MIGRATE=true` (default in dev) runs them at API startup.
- New conflict-style DB constraints should map cleanly to a sentinel error in the domain package and a 409 in the handler — match the `ErrSlotConflict` pattern.
- The frontend's `src/lib/types.ts` mirrors Go domain types by hand. When you change a domain struct's JSON shape, update the TS type or the admin UI will silently drift.
