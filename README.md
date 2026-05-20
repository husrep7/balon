# Balon

Multi-tenant SaaS za upravljanje terminima i operacijama u sportskim objektima (fudbalski baloni i slični facility-ji).

## Šta sadrži repo

| Path | Sadržaj |
|------|---------|
| `apps/api/` | Go backend (REST API, PostgreSQL, locking, pricing engine, JWT auth) |
| `apps/admin/` | React admin SPA (operator UI, kalendar, naplata, smjene) |
| `infra/keycloak/` | Keycloak realm config za production auth |
| `SPEC.md` | Kompletna tehnička specifikacija |
| `DEPLOYMENT.md` | Production deploy guide (VPS + Docker + Keycloak + TLS) |

## Status

Phase 1 backend is feature-complete; frontend in progress:

- ✅ DB schema + migracije (resources, bookings, pricing, shifts, payments, teams)
- ✅ Atomski resource locking sa `EXCLUDE` constraint-om i ltree hijerarhijom
- ✅ Domain models + type-safe stores + REST API
- ✅ Pricing engine sa testovima
- ✅ Keycloak JWT auth (sa dev fallback na X-Tenant-ID header)
- ✅ Recurring series materialization worker (asynq, daily 02:00, idempotent)
- ✅ React admin skeleton (kalendar week view, customers list, shift bar)
- ✅ Booking create modal sa live pricing quote i conflict handling
- ⏳ Drag-to-reschedule sa conflict feedback — TODO
- ⏳ Shift open/close numeric pad flow — TODO
- ⏳ Pricing rules editor (form-based) — TODO
- ⏳ Membership lookup adapter (wire u pricing engine) — TODO

## Tech stack

**Backend**: Go 1.22 · Gin · pgx/v5 · golang-migrate · zerolog · rrule-go · golang-jwt/v5 · MicahParks/keyfunc/v3
**Frontend**: React 18 · TypeScript · Vite · Tailwind v3 · TanStack Router · TanStack Query · keycloak-js
**Infra**: PostgreSQL 16 (btree_gist, ltree, pg_trgm) · Redis 7 · Keycloak 25

## Local development

Preduslovi: Go 1.22+, Node 20+, Docker, `migrate` CLI.

```bash
# 1. Pokreni Postgres + Redis
make up

# 2. Migracije
make migrate

# 3. Backend (dev mode — header-based auth)
make dev    # API na :8080

# 4. Seed prvi tenant + sample resource + pricing rules
make seed

# 5. U novom terminal-u: frontend
cd apps/admin
npm install
cp .env.example .env

# Uzmi UUID-ove iz baze za .env:
psql "postgres://balon:balon@localhost:5432/balon?sslmode=disable" \
    -c "SELECT 'VITE_DEV_TENANT_ID=' || id FROM tenants WHERE slug='demo';"
psql "postgres://balon:balon@localhost:5432/balon?sslmode=disable" \
    -c "SELECT 'VITE_DEV_USER_ID=' || id FROM users WHERE email='admin@demo.local';"

npm run dev   # http://localhost:5173
```

## Production deploy

Vidi [DEPLOYMENT.md](./DEPLOYMENT.md). Kratko:

```bash
cp .env.production.example .env
# (popunjavanje POSTGRES_PASSWORD, KEYCLOAK_ADMIN_PASSWORD)
make docker-up
make prod-seed
# Postavi tenant_id atribut na Keycloak user-u, vidi infra/keycloak/README.md
```

Stack: Postgres + Redis + Keycloak + API (sve u jednom docker-compose-u). Caddy za TLS reverse proxy opcionalno.

## Repo layout

```
balon/
├── SPEC.md                          tehnička specifikacija
├── DEPLOYMENT.md                    production deploy guide
├── Makefile                         dev + prod targets
├── docker-compose.yml               dev infra (postgres + redis)
├── docker-compose.prod.yml          full prod stack
├── Dockerfile                       multi-stage build za API
├── Caddyfile.example                reverse proxy template
├── go.work                          Go workspace
├── apps/
│   ├── api/                         Go backend
│   │   ├── cmd/
│   │   │   ├── api/main.go          HTTP API entry
│   │   │   └── worker/main.go       asynq worker (materialization, jobs)
│   │   ├── internal/
│   │   │   ├── auth/                Keycloak JWT verifier
│   │   │   ├── config/, db/         infra
│   │   │   ├── domain/              pure domain types
│   │   │   ├── store/               pgx repositories
│   │   │   ├── http/                gin handlers + middleware
│   │   │   └── worker/              materializer + task definitions
│   │   └── migrations/              numerirane SQL migracije
│   └── admin/                       React SPA
│       ├── src/
│       │   ├── lib/                 api, auth, time, types
│       │   ├── hooks/               TanStack Query
│       │   ├── components/          AppShell, Calendar, ui primitives
│       │   └── pages/               Dashboard, Customers, ...
│       └── public/
├── infra/keycloak/                  realm config + setup guide
└── scripts/seed.sql                 bootstrap demo tenant
```

## Sljedeći koraci

1. **Series materialization worker** (asynq) — kompletira Phase 1 backend logic
2. **Booking create modal** sa pricing quote preview u frontend-u
3. **Membership lookup adapter** — wire `customer_memberships` u pricing engine
4. **Idempotency-Key middleware** za POST/PATCH endpointe
5. **Audit log** — bookings status change, payments, shift close

## Licenca

Proprietary. © Lupon Ventures.
