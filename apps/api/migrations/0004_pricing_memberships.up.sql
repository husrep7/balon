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

CREATE TABLE memberships (
    id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id),
    name         text NOT NULL,
    kind         text NOT NULL CHECK (kind IN ('package','season','monthly')),
    price_cents  bigint NOT NULL,
    credits      int,
    validity     interval NOT NULL,
    benefits     jsonb NOT NULL DEFAULT '{}',
    active       bool NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX memberships_tenant ON memberships(tenant_id) WHERE active;

CREATE TABLE customer_memberships (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id),
    customer_id     uuid NOT NULL REFERENCES customers(id),
    membership_id   uuid NOT NULL REFERENCES memberships(id),
    starts_on       date NOT NULL,
    ends_on         date NOT NULL,
    credits_left    int,
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_memberships_customer ON customer_memberships(customer_id) WHERE status = 'active';
CREATE INDEX customer_memberships_ends_on ON customer_memberships(ends_on) WHERE status = 'active';
