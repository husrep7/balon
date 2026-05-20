# Balon — Tehnička specifikacija v0.1

SaaS platforma za upravljanje terminima, resursima, članstvima i naplatom u sportskim objektima (primarni use case: fudbalski baloni, ali generalizovano za sve facility booking scenarije sa hijerarhijskim resursima).

## 1. Obim i strateški kontekst

**Model**: Multi-tenant SaaS. Prihod = mjesečna pretplata po tenantu. Bez Merchant-of-Record komponente, bez online plaćanja u Phase 1-2.

**Naplata krajnjih korisnika**: isključivo na licu mjesta (cash ili card preko standalone bank terminal-a). Fiskalizacija je per-tenant konfiguracija (Tring / Galeb / HCP / off), plugin slot u arhitekturi.

**Kanali**: web (admin + customer PWA), telefonski booking putem admin unosa. Bez native mobile apps u Phase 1.

**Faze**:

| Faza | Trajanje | Sadržaj |
|------|----------|---------|
| 1 — Core operations | 4-5 sed | Resource model (bez multi-tenant hierarchy), customer DB, single booking, admin kalendar, cash/card recording, shift session, osnovni pricing |
| 2 — Recurring & memberships | 4-5 sed | Booking series sa RRULE, multi-resource hierarchy (big/half pitch), members & paketi, cancellation policy enforcement, izvještaji |
| 3 — Operacije & integracije | 3-4 sed | Fiskalni vendor integracija, WhatsApp bot, equipment rental, bank statement reconciliation |

## 2. Tech stack

| Sloj | Izbor | Razlog |
|------|-------|--------|
| Backend | Go 1.22+ | Idiomatic za domain logic gdje preciznost matters, već u upotrebi u portfoliju |
| HTTP | Gin | Već u upotrebi (Rego.ba), poznat ekipi |
| DB | PostgreSQL 16+ | `tstzrange`, `btree_gist`, `ltree`, RLS — sve ključno |
| Migracije | golang-migrate | Stabilan, samostalan binary |
| Queries | pgx/v5 + sqlc (gdje vrijedi) | Direktni pgx za jednostavne query-je, sqlc za type-safe za hot path |
| Background jobs | asynq (Redis-based) | Materijalizacija serija, reporting, notifikacije |
| Frontend admin | React + Vite + TanStack Router + Tailwind | Brzo, predvidivo |
| Frontend customer | Ista stack, drugi entry | PWA build |
| Auth | Keycloak (self-hosted) | Multi-tenant role-based, ne zavisi od vendor lock-ina |
| Logging | zerolog | Strukturirano JSON, standardno |
| Config | env + envconfig | 12-factor |

## 3. Multi-tenancy model

Svi domain entiteti nose `tenant_id`. Pristup se enforce-uje na dva nivoa:

1. **App-level**: middleware ekstraktuje tenant iz JWT/session, ubacuje u request context. Svaki repository poziv koristi `WithTenant(ctx)` i SQL query-ji su parametrizovani.
2. **DB-level (Phase 2+)**: PostgreSQL Row-Level Security policies kao defense-in-depth. Connection pool postavlja `SET LOCAL app.current_tenant_id = $1` u transakciji.

Tenant izolacija po podrazumijevanim limitima (rate-limit, max resursa, max shift sessions) konfigurišu se u `tenants.config` JSONB polju.

## 4. Domain model

```
TENANTS
  ├── USERS              (operateri/admin po tenantu)
  ├── RESOURCES          (tereni, hijerarhijski)
  ├── CUSTOMERS          (krajnji kupci)
  │     └── TEAMS        (stalne ekipe, opcionalno)
  ├── PRICING_RULES      (rule engine za cijene)
  ├── MEMBERSHIPS        (tipovi paketa/sezona)
  │     └── CUSTOMER_MEMBERSHIPS
  ├── BOOKING_SERIES     (recurring template)
  │     └── BOOKINGS     (materijalizovane instance)
  │             └── PAYMENTS
  └── SHIFT_SESSIONS
        ├── PAYMENTS
        └── CASH_MOVEMENTS
```

Resource hijerarhija je samo-referencirajuća (`parent_id`) sa `ltree path` kolonom za brzo querying potomaka/predaka.

## 5. SQL schema

Sve migracije se nalaze u `apps/api/migrations/`. Konsolidovani prikaz:

### 5.1 Init (extensions + tenants)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "ltree";

CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  country     char(2) NOT NULL DEFAULT 'BA',
  timezone    text NOT NULL DEFAULT 'Europe/Sarajevo',
  currency    char(3) NOT NULL DEFAULT 'BAM',
  config      jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  email       text NOT NULL,
  name        text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin','operator','viewer')),
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
```

### 5.2 Resources i hijerarhijski locking

```sql
CREATE TYPE resource_kind AS ENUM ('full_pitch','half_pitch','court','other');

CREATE TABLE resources (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  parent_id   uuid REFERENCES resources(id),
  kind        resource_kind NOT NULL,
  name        text NOT NULL,
  path        ltree NOT NULL,
  bookable    bool NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, path)
);

CREATE INDEX resources_path_gist ON resources USING gist(path);
CREATE INDEX resources_tenant ON resources(tenant_id) WHERE bookable;

CREATE TABLE resource_locks (
  booking_id   uuid NOT NULL,
  resource_id  uuid NOT NULL REFERENCES resources(id),
  tenant_id    uuid NOT NULL,
  time_range   tstzrange NOT NULL,
  PRIMARY KEY (booking_id, resource_id),
  EXCLUDE USING gist (
    resource_id WITH =,
    time_range  WITH &&
  )
);
```

### 5.3 Customers i timovi

```sql
CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  name          text NOT NULL,
  phone         text,
  email         text,
  tier          text NOT NULL DEFAULT 'regular',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customers_phone ON customers(tenant_id, phone) WHERE phone IS NOT NULL;

CREATE TABLE teams (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  name              text NOT NULL,
  captain_id        uuid REFERENCES customers(id),
  default_payer_id  uuid REFERENCES customers(id),
  primary_phone     text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES customers(id),
  role         text NOT NULL DEFAULT 'member',
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, customer_id)
);
```

### 5.4 Bookings i recurring series

```sql
CREATE TYPE booking_status AS ENUM
  ('confirmed','cancelled','no_show','completed');

CREATE TABLE booking_series (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  customer_id          uuid REFERENCES customers(id),
  team_id              uuid REFERENCES teams(id),
  resource_id          uuid NOT NULL REFERENCES resources(id),
  rrule                text NOT NULL,
  starts_on            date NOT NULL,
  ends_on              date,
  slot_start_time      time NOT NULL,
  slot_duration        interval NOT NULL,
  default_price_cents  bigint NOT NULL,
  materialized_thru    date NOT NULL DEFAULT current_date,
  status               text NOT NULL DEFAULT 'active',
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_customer_or_team_series
    CHECK ((customer_id IS NOT NULL) OR (team_id IS NOT NULL))
);

CREATE TABLE bookings (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id),
  resource_id              uuid NOT NULL REFERENCES resources(id),
  customer_id              uuid REFERENCES customers(id),
  team_id                  uuid REFERENCES teams(id),
  series_id                uuid REFERENCES booking_series(id),
  series_occurrence_date   date,
  time_range               tstzrange NOT NULL,
  status                   booking_status NOT NULL DEFAULT 'confirmed',
  price_cents              bigint NOT NULL,
  applied_rule_id          uuid,
  channel                  text NOT NULL DEFAULT 'admin',
  notes                    text,
  created_by               uuid REFERENCES users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  cancelled_at             timestamptz,
  cancellation_reason      text,
  CONSTRAINT chk_customer_or_team_booking
    CHECK ((customer_id IS NOT NULL) OR (team_id IS NOT NULL))
);

CREATE UNIQUE INDEX bookings_series_occurrence
  ON bookings (series_id, series_occurrence_date)
  WHERE series_id IS NOT NULL;

CREATE INDEX bookings_tenant_time ON bookings (tenant_id, time_range);
CREATE INDEX bookings_resource_time ON bookings USING gist (resource_id, time_range);

CREATE OR REPLACE FUNCTION fn_populate_resource_locks() RETURNS trigger AS $$
DECLARE
  booked_path ltree;
BEGIN
  IF NEW.status IN ('cancelled','no_show') THEN RETURN NEW; END IF;

  SELECT path INTO booked_path FROM resources WHERE id = NEW.resource_id;

  INSERT INTO resource_locks (booking_id, resource_id, tenant_id, time_range)
  SELECT NEW.id, r.id, NEW.tenant_id, NEW.time_range
  FROM resources r
  WHERE r.tenant_id = NEW.tenant_id
    AND (r.path @> booked_path OR r.path <@ booked_path);

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_locks
AFTER INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION fn_populate_resource_locks();

CREATE OR REPLACE FUNCTION fn_clear_resource_locks() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('cancelled','no_show') AND OLD.status NOT IN ('cancelled','no_show') THEN
    DELETE FROM resource_locks WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_status_change
AFTER UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION fn_clear_resource_locks();
```

### 5.5 Pricing rules

```sql
CREATE TABLE pricing_rules (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  resource_id  uuid REFERENCES resources(id),
  name         text NOT NULL,
  priority     int NOT NULL DEFAULT 100,
  conditions   jsonb NOT NULL,
  price_cents  bigint NOT NULL,
  valid_from   date,
  valid_to     date,
  active       bool NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pricing_rules_active
  ON pricing_rules (tenant_id, priority)
  WHERE active;
```

Conditions JSONB shape (svi ključevi opcionalni, missing = wildcard):

```jsonc
{
  "day_of_week": [1,2,3,4,5],
  "time_range": ["18:00","23:00"],
  "customer_tier": ["regular","vip"],
  "resource_kind": ["full_pitch"],
  "min_duration_minutes": 60,
  "channel": ["walk_in","admin"]
}
```

### 5.6 Memberships

```sql
CREATE TABLE memberships (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('package','season','monthly')),
  price_cents  bigint NOT NULL,
  credits      int,
  validity     interval NOT NULL,
  benefits     jsonb NOT NULL DEFAULT '{}',
  active       bool NOT NULL DEFAULT true
);

CREATE TABLE customer_memberships (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     uuid NOT NULL REFERENCES customers(id),
  membership_id   uuid NOT NULL REFERENCES memberships(id),
  starts_on       date NOT NULL,
  ends_on         date NOT NULL,
  credits_left    int,
  status          text NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### 5.7 Shift sessions i payments

```sql
CREATE TYPE shift_status AS ENUM ('opened','closing','closed','voided');
CREATE TYPE payment_method AS ENUM
  ('cash','card_pos','membership_credit','voucher','transfer');

CREATE TABLE shift_sessions (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id),
  operator_id                 uuid NOT NULL REFERENCES users(id),
  status                      shift_status NOT NULL DEFAULT 'opened',
  opened_at                   timestamptz NOT NULL DEFAULT now(),
  opening_cash_cents          bigint NOT NULL,
  closing_started_at          timestamptz,
  closed_at                   timestamptz,
  closing_cash_counted_cents  bigint,
  closing_cash_expected_cents bigint,
  variance_cents              bigint GENERATED ALWAYS AS
    (closing_cash_counted_cents - closing_cash_expected_cents) STORED,
  variance_explained          text,
  predecessor_shift_id        uuid REFERENCES shift_sessions(id),
  notes                       text
);

CREATE UNIQUE INDEX shift_one_open
  ON shift_sessions (tenant_id) WHERE status = 'opened';

CREATE TABLE payments (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  booking_id          uuid REFERENCES bookings(id),
  shift_session_id    uuid NOT NULL REFERENCES shift_sessions(id),
  amount_cents        bigint NOT NULL,
  method              payment_method NOT NULL,
  card_terminal_ref   text,
  fiscal_receipt_no   text,
  collected_by        uuid REFERENCES users(id),
  collected_at        timestamptz NOT NULL DEFAULT now(),
  voided_at           timestamptz,
  void_reason         text,
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE TABLE cash_movements (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  shift_session_id  uuid NOT NULL REFERENCES shift_sessions(id),
  amount_cents      bigint NOT NULL,
  reason            text NOT NULL,
  recorded_by       uuid REFERENCES users(id),
  recorded_at       timestamptz NOT NULL DEFAULT now()
);
```

## 6. Resource locking — semantika

Booking resursa R u vremenu T zaključa `{R + svi preci R + svi potomci R}` u istom vremenskom intervalu. Implementacija je trigger-driven (vidi 5.4) sa `EXCLUDE` constraint-om koji enforce-uje invarijantu na DB nivou.

**Posljedice**:
- Pokušaj duplog booking-a baca `23P01` (exclusion_violation). App hvata grešku i vraća 409.
- Race conditions su nemoguće — constraint je atomic.
- Otkaz instance briše locks → slot se odmah oslobađa.

**Edge case**: ako tenant kasnije doda novi half-pitch pod postojeći full-pitch, postojeći locks za full-pitch booking-e treba backfill-ovati za novi child. Migration helper script u Phase 2.

## 7. Recurring booking materialization

Serije se ne reprezentuju kao virtual događaji — materijalizuju se u stvarne `bookings` redove (sa `series_id` referencom). Background job (asynq) radi daily:

```
for each active booking_series s:
    horizon = today + 90 days
    if s.materialized_thru >= horizon: continue
    occurrences = rrule.Between(s.materialized_thru, horizon)
    for each occ:
        if exists(bookings WHERE series_id=s.id AND series_occurrence_date=occ): continue
        try INSERT into bookings (...)
        if exclusion_violation: log_conflict(s.id, occ); continue
    s.materialized_thru = horizon
```

### Edge cases
- **Holiday handling**: tenant config sadrži `closed_dates` listu. RRULE expansion filtrira ove datume prije insert-a.
- **Promjena serije**: ne migriraj postojeće materijalizovane instance. Završi staru seriju, otvori novu od pivot datuma.
- **DST**: serija čuva lokalno `slot_start_time` (TIME bez TZ); pri materijalizaciji konvertira u UTC koristeći tenant TZ.
- **Konflikt**: materijalizacija ne smije rušiti job. Konflikti se loguju (notifikacija tenant admin-u) i instance se *ne* kreira.
- **Membership credits**: ako serija ima vezan customer membership, credits se dekrementiraju pri materijalizaciji a ne pri konzumaciji.

## 8. Pricing engine

Dvofazna evaluacija:

1. **Base price**: iteriraj aktivne rules po `priority ASC`. Za svaku, evaluiraj conditions protiv `(resource, time, customer)`. Prva matching rule daje base price i `applied_rule_id`.
2. **Modifiers**: nakon base price-a, primijeni:
    - Active season ticket sa credits → final = 0, method = `membership_credit`
    - VIP tier → -15%
    - Package member sa credits → final = 0, dekrementira credits

Modifiers se ne kombinuju — primjenjuje se prvi koji match-uje hijerarhiju (sezona > paket > VIP).

**Caching**: per-worker memory, refresh 60s ili na admin-trigger invalidate. Tipično 5-15 rules po tenantu.

**Tenant admin UI**: form-based ("dan", "vrijeme od-do", "za koga"), generiše JSONB. Nikad raw JSON editing.

## 9. Shift session lifecycle

```
[opened] --(start close)--> [closing] --(record count)--> [closed]
                                                              |
[opened] --(admin override)--> [voided] <--(admin override)---+
```

**Invariants**:
- Samo jedan `opened` shift per tenant (enforced unique index).
- Sve nove payment rows MORAJU referencirati `opened` ili `closing` shift istog tenanta.
- Payments na `closed` shift = greška.

**Variance handling**:
- Pri close-u: `expected = opening + Σ(cash payments not voided) + Σ(cash_movements)`.
- `variance = counted - expected` (generated kolona).
- Ako `|variance| > 0`, operator MORA unijeti `variance_explained`.
- Ako `|variance| > tenant.config.variance_threshold`, supervisor approval (separate role).
- Pattern detection (negative variance > 3 puta u 30 dana po istom operatoru) → flag na admin dashboard-u.

**Handover** (smjena se mijenja sredinom dana):
- Operator A: pokrene close, brojač pokazuje X, ne potpisuje variance, klikne "Handover".
- Operator B: opens new shift sa `opening_cash_cents = X` i `predecessor_shift_id = A.id`.
- Prvobitni shift A se completes automatically (variance = 0, explained = "handover to B").

## 10. Team semantics

Tim je opcionalna apstrakcija. Booking referencira ili `customer_id` (individualac) ili `team_id` (ekipa) — constraint enforce-uje da jedno mora biti prisutno.

**Billing patterns**:
- Default payer = `teams.default_payer_id` (često = captain)
- Per-booking override: `payments.collected_from_customer_id` (TODO column)
- Split payment: više payments redova vezanih za isti booking, svaki sa svojim amount

**Notifications routing**:
- Booking events (confirm, reminder, cancel) idu na `teams.primary_phone`
- Opt-in broadcast svim članovima samo ako tim eksplicitno enable-uje

## 11. Calendar UX

Operater se primarno koristi week view-om sa hour rows i day columns. Resource tabs gore prebacuju između full pitch i half pitches.

**Boja-status mapping**:
- Zeleno (teal 50) — plaćeno
- Žuto (amber 50) — neplaćeno
- Crveno (red 50) — no-show (sa strikethrough)
- Sivo — otkazano (u trash filteru)
- VIP badge — secondary indicator
- Refresh ikona — član serije

**Interakcije**:
- Click empty slot → quick-create modal (customer search, duration default 90min, live price preview)
- Drag-to-create preko više slot-ova → custom duration
- Click booking → side detail panel sa actions (naplati, pomjeri, otkaži)
- Drag postojeći booking → reschedule. Hover slotovi se zelene/crvene (preview EXCLUDE constraint check).
- Right-click → context menu (split full→half, mark no-show, send SMS, add payment)

**Persistent shift bar** dolje: status otvorene smjene, brzi "Zatvori smjenu" action.

## 12. REST API (Phase 1)

Konvencije:
- Sve pod `/api/v1`
- Auth: Bearer token (Keycloak JWT). Tenant ekstraktovan iz claim-a.
- Idempotency: POST/PUT/PATCH koji mijenjaju state moraju primiti `Idempotency-Key` header.
- Validation errors: 422 sa `{field, code, message}` array
- Conflict errors (EXCLUDE violation): 409 sa `{conflicting_resource_id, conflicting_booking_id}`

**Endpoints**:

```
GET    /api/v1/resources
POST   /api/v1/resources
GET    /api/v1/resources/{id}
PATCH  /api/v1/resources/{id}

GET    /api/v1/customers?q=...
POST   /api/v1/customers
GET    /api/v1/customers/{id}
PATCH  /api/v1/customers/{id}

POST   /api/v1/teams
GET    /api/v1/teams/{id}
POST   /api/v1/teams/{id}/members

GET    /api/v1/bookings?from=...&to=...&resource_id=...
POST   /api/v1/bookings
GET    /api/v1/bookings/{id}
PATCH  /api/v1/bookings/{id}           # reschedule, status change
DELETE /api/v1/bookings/{id}            # cancel

POST   /api/v1/pricing/quote            # (resource, time, customer) → price
GET    /api/v1/pricing/rules
POST   /api/v1/pricing/rules

POST   /api/v1/shifts                   # open new shift
POST   /api/v1/shifts/{id}/close        # close (count + variance)
POST   /api/v1/shifts/{id}/handover     # handover to next operator
POST   /api/v1/shifts/{id}/payments     # record payment
POST   /api/v1/shifts/{id}/movements    # cash deposit/payout

GET    /api/v1/calendar?from=...&to=...&resource_id=...   # optimized for UI
```

## 13. Background jobs

| Job | Frekvencija | Cilj |
|-----|-------------|------|
| `materialize_series` | daily 02:00 | Stvori bookings za sve aktivne serije unutar rolling 90 dana |
| `daily_summary` | daily 06:00 | Generiše dnevne metrike po tenantu (revenue, occupancy, variance) |
| `reminder_send` | hourly | SMS/Viber reminder T-24h za sutrašnje booking-e |
| `membership_expiry` | daily | Označi expired memberships |
| `cash_reconcile_alert` | daily | Alert na tenant adminu ako neuobičajen variance pattern |

asynq queue konfiguracija sa odvojenim queue per priority (default / critical / scheduled).

## 14. Configuration model

`tenants.config` JSONB:

```jsonc
{
  "fiscal": {
    "vendor": "tring",
    "endpoint": "http://192.168.1.50:8080",
    "device_id": "..."
  },
  "operating_hours": {
    "default": ["08:00", "23:00"],
    "monday":  ["16:00", "23:00"]
  },
  "closed_dates": ["2026-01-01", "2026-05-01"],
  "variance_threshold_cents": 1000,
  "currency": "BAM",
  "notification_channels": ["sms", "viber"],
  "default_booking_duration_minutes": 90,
  "cancellation_window_hours": 24,
  "max_recurring_horizon_days": 90
}
```

## 15. Otvorena pitanja

Stvari koje treba zatvoriti prije Phase 1 ship-a:

1. **Notification gateway** — SMS provider izbor (Infobip, BH Telecom API, Telekom Srpske)
2. **Auth** — Keycloak self-host vs Auth0 (cost vs control)
3. **Fiskalni vendor prioritet** za Phase 3 (Tring je vjerovatno default zbog dominacije)
4. **Currency** — da li u Phase 1 podržavamo EUR za diaspora kupce, ili samo BAM
5. **Customer self-service portal** — jesu li u Phase 1 i customer mogu rezervisati sami, ili samo admin unosi
6. **Audit log** — koji entiteti su audit-required po default-u (sigurno: payments, shift_sessions, bookings status change)
7. **Resource backfill** — kada tenant doda novi child resource pod existing parent, šta s lock-ovima parent booking-a

## 16. Repository layout

```
balon/
├── SPEC.md                          # ovaj dokument
├── README.md                        # getting started
├── Makefile                         # standardni targets
├── docker-compose.yml               # postgres, redis local
├── .env.example
├── go.work
└── apps/
    ├── api/                         # Go backend
    │   ├── go.mod
    │   ├── cmd/api/main.go          # entry point
    │   ├── internal/
    │   │   ├── config/              # env loading
    │   │   ├── db/                  # pgx setup, migrate runner
    │   │   ├── domain/              # core types (bez DB dependencies)
    │   │   │   ├── resource/
    │   │   │   ├── booking/
    │   │   │   ├── customer/
    │   │   │   ├── pricing/
    │   │   │   ├── shift/
    │   │   │   └── payment/
    │   │   ├── store/               # repository implementations
    │   │   └── http/                # gin handlers + middleware
    │   └── migrations/              # numbered .up.sql / .down.sql
    └── admin/                       # React frontend (Phase 2 sketch)
```
