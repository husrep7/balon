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

CREATE INDEX users_tenant ON users(tenant_id);
