# Deployment

## Produkcija — Vercel (trenutno aktivno)

Tri Vercel projekta (tim `abdullahhusrep-7436`), sva tri u regiji `fra1`:

| Projekat | Root dir | URL | Šta je |
|---|---|---|---|
| `balon-api` | `apps/api` | https://balon-api.vercel.app | Go API kao serverless funkcija (`api/index.go` → `pkg/serverless`) |
| `balon-admin` | `apps/admin` | https://balon-admin.vercel.app | Admin SPA |
| `balon-booking` | `apps/booking` | https://balon-booking.vercel.app | Booking SPA za kupce |

- **Baza:** Neon Postgres (`balon-db`, Frankfurt), povezana preko Vercel Marketplace-a. `DATABASE_URL` (pooled) koristi API, `DATABASE_URL_UNPOOLED` koriste migracije.
- **Migracije:** ugrađene u binarni fajl (`migrations/embed.go`). Uz `AUTO_MIGRATE=true` primjenjuju se pri hladnom startu funkcije. Ručno: `DATABASE_URL_UNPOOLED=... go run ./cmd/migrate`.
- **Serije (recurring):** umjesto asynq workera, Vercel Cron svaki dan u 01:00 UTC zove `/api/cron/materialize` (zaštićeno sa `CRON_SECRET`). Redis nije potreban.
- **Frontend → API:** `vercel.json` u admin/booking proxira `/api/*` na `balon-api.vercel.app`, pa je sve same-origin (bez CORS-a). `VITE_API_URL` ostaje prazan.
- **Env varijable (balon-api, Production):** `ENVIRONMENT=production` (obavezno, inače API prihvata `X-Tenant-ID` header kao auth), `JWT_SECRET`, `CRON_SECRET`, `APP_URL`, `GOOGLE_CLIENT_ID/SECRET`, `SMTP_*`, te Neon varijable.
- **Google prijava:** u Google Cloud Console dodaj redirect URI `https://balon-booking.vercel.app/api/auth/google/callback`.

Ručni deploy (iz root-a svakog projekta): `vercel deploy --prod`.

> **Napomena za Go funkciju:** Vercel kompajlira `api/index.go` izvan stabla modula, pa taj fajl smije uvoziti samo ne-`internal` pakete. Sva logika je u `pkg/serverless`.

---

## Alternativa — vlastiti VPS (Docker Compose)

Vodič za production deploy Balon API-ja. Pretpostavlja Linux VPS sa Docker i Docker Compose v2 instaliranim.

## Brzi put — single-VM deploy sa Docker Compose

Pretpostavka: Ubuntu/Debian VPS, root SSH access, domena pripremljena ako želiš TLS.

### 1. Preduslovi na serveru

```bash
# Docker engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# (re-login da bi grupa propala)

# Provjeri
docker --version
docker compose version
```

### 2. Lokalna priprema (na razvojnoj mašini)

```bash
# Klonir repo, ili extract iz dostavljenog arhiva
cd balon/

# Generiši go.sum (jedanput, prije prvog build-a)
cd apps/api && go mod tidy && cd ../..

# Test da build prolazi
cd apps/api && go test ./... && cd ../..
```

### 3. Konfiguriši env za production

```bash
cp .env.production.example .env

# Edituj .env i postavi:
# - POSTGRES_PASSWORD (strong random, e.g. openssl rand -hex 32)
# - VERSION (npr. v0.1.0)
# - API_PORT (default 8080)
```

### 4. Prenos i pokretanje

```bash
# Sa razvojne mašine, prenesi sve na server:
rsync -avz --exclude='.git' --exclude='bin' --exclude='.env' \
    ./ user@server:/opt/balon/

# SSH na server
ssh user@server
cd /opt/balon
cp .env.production.example .env
# (popunjavanje .env)

# Build + start
docker compose -f docker-compose.prod.yml up -d --build

# Provjeri da je sve healthy
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

### 5. Bootstrap prvog tenanta

```bash
# Pokreni seed
docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U balon -d balon < scripts/seed.sql

# Uzmi tenant_id za testove
docker compose -f docker-compose.prod.yml exec postgres \
    psql -U balon -d balon -c "SELECT id, slug FROM tenants;"
```

### 6. Test da radi

```bash
# Health check
curl http://server-ip:8080/healthz
# {"ok":true}

# Lista resursa
TENANT_ID=<uuid-iz-prethodnog-koraka>
curl http://server-ip:8080/api/v1/resources \
    -H "X-Tenant-ID: $TENANT_ID"
```

## Keycloak — production auth

Phase 1 koristi header-based dev auth. Prije nego što ovo ide na javnu mrežu, **obavezno** prebaciti na Keycloak JWT.

### 1. Pokreni Keycloak

Već je definisan u `docker-compose.prod.yml`. Pri prvom startu učita `infra/keycloak/realm-balon.json`:

```bash
docker compose -f docker-compose.prod.yml up -d keycloak
# Sačekaj 30-60s; "Imported realm balon" u logovima
docker compose -f docker-compose.prod.yml logs keycloak | grep -i "imported"
```

Admin konzola: `http://server:8081/admin` (admin / `$KEYCLOAK_ADMIN_PASSWORD` iz `.env`).

### 2. Postavi `tenant_id` na test user-u

Test user `admin@demo.local` iz realm import-a ima placeholder `tenant_id`. Treba ga zamijeniti stvarnim UUID-jem iz baze. Detaljne komande u `infra/keycloak/README.md`. Skraćeno:

```bash
# Tenant UUID iz baze
TENANT_ID=$(docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U balon -d balon -tA -c "SELECT id FROM tenants WHERE slug='demo';")

# Login kao Keycloak admin, set user attribute (vidi infra/keycloak/README.md za pun script)
```

### 3. Aktiviraj JWT u API-ju

U `.env`:

```bash
KEYCLOAK_ISSUER=http://keycloak:8080/realms/balon
KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/balon/protocol/openid-connect/certs
DEV_ALLOW_HEADERS=false   # OBAVEZNO false prije produkcije
```

Restart API:

```bash
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml logs api | grep keycloak
# Tražiš: "keycloak auth enabled"
```

### 4. Konfiguriši frontend

U `apps/admin/.env`:

```bash
VITE_KEYCLOAK_URL=https://auth.tvojdomen.ba
VITE_KEYCLOAK_REALM=balon
VITE_KEYCLOAK_CLIENT=balon-admin
```

Rebuild admin: `cd apps/admin && npm run build`.

## TLS sa Caddy (opcionalno ali preporučeno)

```bash
# 1. Uperi DNS A record na server IP: balon.tvojdomen.ba

# 2. Kopiraj Caddyfile
cp Caddyfile.example Caddyfile
# Edit domain i email

# 3. Uncomment caddy servis u docker-compose.prod.yml

# 4. Restart
docker compose -f docker-compose.prod.yml up -d caddy

# Caddy auto-pribavlja Let's Encrypt cert pri prvom request-u
```

## Update / redeploy

```bash
# Na razvojnoj mašini
git pull   # ili novi rsync prenos

# Na serveru
cd /opt/balon
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migracije se trigger-uju automatski ako je `AUTO_MIGRATE=true`. Za multi-replica setup (vidi dolje), postavi `AUTO_MIGRATE=false` i pokreni migracije ručno:

```bash
docker compose -f docker-compose.prod.yml run --rm api \
    sh -c "wget -qO- 'http://...' || true"
# Ili koristi migrate CLI direktno protiv DB-a
```

## Backup

PostgreSQL daily backup:

```bash
# Cron entry (crontab -e):
0 3 * * * docker compose -f /opt/balon/docker-compose.prod.yml exec -T postgres \
    pg_dump -U balon -Fc balon > /var/backups/balon-$(date +\%Y\%m\%d).dump

# Retention: zadrži zadnjih 14 dana
find /var/backups/ -name 'balon-*.dump' -mtime +14 -delete
```

Restore:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_restore -U balon -d balon --clean < /var/backups/balon-20260601.dump
```

## Monitoring & logs

Logs se pišu kao structured JSON na stdout. Aggregation opcije:

- **Local**: `docker compose logs -f api | jq` za live praćenje
- **Loki + Grafana**: docker-compose dodatak (može se docnest u Phase 2 deploy-u)
- **Cloud**: forward `docker-driver` logs ka Datadog / Better Stack

Health endpoint: `GET /healthz` → `{"ok":true}` (HTTP 200). Uptime monitor (UptimeRobot, Hetzner status) treba pingati ovaj.

## Scaling considerations

**Multi-replica API**: Stateless (sav state u Postgres/Redis), tako da je horizontal scaling trivijalan. Ako pokrećeš > 1 instancu:

1. Postavi `AUTO_MIGRATE=false`, pokreni migracije kao zaseban step prije deploy-a
2. Stavi load balancer ispred (Caddy/Traefik podržava round-robin po default-u)
3. Sticky sessions nisu potrebne — JWT auth je stateless

**Postgres**: Default config za < 100 concurrent users. Za više, podigni `max_connections`, koristi pgBouncer ispred ako > 5 replica.

**Redis**: Potreban za asynq worker (Phase 1 dovršiti). Single-node OK do milion-tasks/dan.

## Security checklist prije live launch-a

- [ ] `POSTGRES_PASSWORD` je strong random (32+ chars), čuva se u secret manager-u
- [ ] PostgreSQL port 5432 nije exposed na javnost (`expose:` ne `ports:`)
- [ ] TLS pred API-jem (Caddy ili cloud LB)
- [ ] X-Tenant-ID header autentikacija je zamijenjena Keycloak JWT middleware (PRIJE produkcije!)
- [ ] Firewall: samo 22 (SSH), 80, 443 otvoreni
- [ ] SSH samo key-based, root login disabled
- [ ] Automatic security updates uključeni (`unattended-upgrades`)
- [ ] Database backup configured i tested (restore test najmanje jednom!)
- [ ] Disk usage alerting (Postgres data volume)
- [ ] Audit log za sensitive operations (Phase 1 TODO)

## Troubleshooting

**Problem**: API ne može connectu na Postgres.
**Provjeri**: `docker compose logs postgres` — možda nije ready još.

**Problem**: Migracije failuju sa "extension btree_gist not found".
**Provjeri**: Da li slika `postgres:16` ima extension. Sve standard Postgres slike imaju, ali ako koristiš stripped variant, treba ti `postgres:16-bookworm` ili custom slika sa `apt-get install postgresql-contrib-16`.

**Problem**: "X-Tenant-ID header required" pri svakom request-u.
**Razlog**: Phase 1 koristi header-based tenant ekstrakciju. Phase 2 prelazi na JWT iz Keycloak-a. Za sad, klijent mora slati header.

**Problem**: `EXCLUDE constraint` greška pri insert-u.
**Provjeri**: Da li je migracija 0002 uspješno pokrenuta (`SELECT * FROM resource_locks LIMIT 1;`). EXCLUDE zahtjeva `btree_gist` extension.
