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
CREATE INDEX resources_parent ON resources(parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE resource_locks (
    booking_id   uuid NOT NULL,
    resource_id  uuid NOT NULL REFERENCES resources(id),
    tenant_id    uuid NOT NULL REFERENCES tenants(id),
    time_range   tstzrange NOT NULL,
    PRIMARY KEY (booking_id, resource_id),
    EXCLUDE USING gist (
        resource_id WITH =,
        time_range  WITH &&
    )
);

CREATE INDEX resource_locks_booking ON resource_locks(booking_id);
