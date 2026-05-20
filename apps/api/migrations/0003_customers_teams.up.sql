CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE customers (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id),
    name        text NOT NULL,
    phone       text,
    email       text,
    tier        text NOT NULL DEFAULT 'regular',
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customers_tenant ON customers(tenant_id);
CREATE INDEX customers_phone ON customers(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX customers_name_trgm ON customers USING gin (lower(name) gin_trgm_ops);

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

CREATE INDEX teams_tenant ON teams(tenant_id);
CREATE INDEX teams_captain ON teams(captain_id) WHERE captain_id IS NOT NULL;

CREATE TABLE team_members (
    team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    customer_id  uuid NOT NULL REFERENCES customers(id),
    role         text NOT NULL DEFAULT 'member' CHECK (role IN ('captain','treasurer','member')),
    joined_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, customer_id)
);
