-- Balon — initial tenant bootstrap
-- Pokreni jednom nakon prve migracije za kreiranje prvog tenanta i admin user-a.
--
-- Uses:
--   psql "$DATABASE_URL" -f scripts/seed.sql
--   ili sa Docker compose:
--   docker-compose -f docker-compose.prod.yml exec postgres \
--       psql -U balon -d balon -f /seed.sql

BEGIN;

-- 1. Tenant
INSERT INTO tenants (slug, name, country, timezone, currency, config)
VALUES (
    'demo',
    'Demo Balon Sarajevo',
    'BA',
    'Europe/Sarajevo',
    'BAM',
    jsonb_build_object(
        'operating_hours', jsonb_build_object('default', jsonb_build_array('08:00','23:00')),
        'closed_dates', jsonb_build_array(),
        'variance_threshold_cents', 1000,
        'default_booking_duration_minutes', 90,
        'cancellation_window_hours', 24,
        'max_recurring_horizon_days', 90
    )
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Admin user (default password: admin123 — PROMIJENI U PRODUKCIJI)
INSERT INTO users (tenant_id, email, name, role, password_hash)
SELECT id, 'admin@demo.local', 'Admin', 'admin',
       '$2a$10$e3WkLqImeB.EmzSgwn3FRecjY9MtNF2w3VdhN/Fcb3W6q.Cbpxlqu'
FROM tenants WHERE slug = 'demo'
ON CONFLICT (tenant_id, email) DO UPDATE SET
  password_hash = '$2a$10$e3WkLqImeB.EmzSgwn3FRecjY9MtNF2w3VdhN/Fcb3W6q.Cbpxlqu';

-- 3. Sample resource (jedan veliki teren sa dva polovinska)
WITH t AS (SELECT id FROM tenants WHERE slug = 'demo'),
veliki AS (
    INSERT INTO resources (tenant_id, kind, name, path)
    SELECT t.id, 'full_pitch', 'Veliki teren', 'veliki'::ltree FROM t
    ON CONFLICT (tenant_id, path) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
)
INSERT INTO resources (tenant_id, parent_id, kind, name, path)
SELECT t.id, v.id, 'half_pitch', 'Mali — lijevi', 'veliki.lijevi'::ltree FROM t, veliki v
ON CONFLICT (tenant_id, path) DO NOTHING;

WITH t AS (SELECT id FROM tenants WHERE slug = 'demo'),
veliki AS (SELECT id FROM resources WHERE tenant_id = (SELECT id FROM t) AND path = 'veliki'::ltree)
INSERT INTO resources (tenant_id, parent_id, kind, name, path)
SELECT t.id, v.id, 'half_pitch', 'Mali — desni', 'veliki.desni'::ltree FROM t, veliki v
ON CONFLICT (tenant_id, path) DO NOTHING;

-- 4. Osnovna pricing rule
INSERT INTO pricing_rules (tenant_id, name, priority, conditions, price_cents, active)
SELECT id, 'Osnovna cijena (cijeli teren)', 100, '{"resource_kind":["full_pitch"]}'::jsonb, 8000, true
FROM tenants WHERE slug = 'demo';

INSERT INTO pricing_rules (tenant_id, name, priority, conditions, price_cents, active)
SELECT id, 'Peak radnim danima 18-23', 50,
       '{"resource_kind":["full_pitch"],"day_of_week":[1,2,3,4,5],"time_range":["18:00","23:00"]}'::jsonb,
       12000, true
FROM tenants WHERE slug = 'demo';

INSERT INTO pricing_rules (tenant_id, name, priority, conditions, price_cents, active)
SELECT id, 'Pola terena osnovna', 100, '{"resource_kind":["half_pitch"]}'::jsonb, 5000, true
FROM tenants WHERE slug = 'demo';

COMMIT;

-- Provjeri rezultat:
SELECT t.slug, u.email, u.role FROM tenants t JOIN users u ON u.tenant_id = t.id WHERE t.slug = 'demo';
SELECT path, name, kind FROM resources WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo') ORDER BY path;
SELECT name, priority, conditions, price_cents FROM pricing_rules WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo') ORDER BY priority;
