CREATE TYPE booking_status AS ENUM ('confirmed','cancelled','no_show','completed');

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
    status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
    created_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_customer_or_team_series
        CHECK ((customer_id IS NOT NULL) OR (team_id IS NOT NULL))
);

CREATE INDEX booking_series_tenant_active
    ON booking_series(tenant_id)
    WHERE status = 'active';

CREATE INDEX booking_series_materialized_thru
    ON booking_series(materialized_thru)
    WHERE status = 'active';

CREATE TABLE bookings (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id),
    resource_id             uuid NOT NULL REFERENCES resources(id),
    customer_id             uuid REFERENCES customers(id),
    team_id                 uuid REFERENCES teams(id),
    series_id               uuid REFERENCES booking_series(id),
    series_occurrence_date  date,
    time_range              tstzrange NOT NULL,
    status                  booking_status NOT NULL DEFAULT 'confirmed',
    price_cents             bigint NOT NULL,
    applied_rule_id         uuid REFERENCES pricing_rules(id),
    channel                 text NOT NULL DEFAULT 'admin',
    notes                   text,
    created_by              uuid REFERENCES users(id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    cancelled_at            timestamptz,
    cancellation_reason     text,
    CONSTRAINT chk_customer_or_team_booking
        CHECK ((customer_id IS NOT NULL) OR (team_id IS NOT NULL))
);

CREATE UNIQUE INDEX bookings_series_occurrence
    ON bookings (series_id, series_occurrence_date)
    WHERE series_id IS NOT NULL;

CREATE INDEX bookings_tenant_time ON bookings (tenant_id, time_range);
CREATE INDEX bookings_resource_time ON bookings USING gist (resource_id, time_range);
CREATE INDEX bookings_customer ON bookings(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX bookings_team ON bookings(team_id) WHERE team_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_populate_resource_locks() RETURNS trigger AS $$
DECLARE
    booked_path ltree;
BEGIN
    IF NEW.status IN ('cancelled','no_show') THEN
        RETURN NEW;
    END IF;

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

CREATE OR REPLACE FUNCTION fn_handle_booking_status_change() RETURNS trigger AS $$
BEGIN
    IF NEW.status IN ('cancelled','no_show') AND OLD.status NOT IN ('cancelled','no_show') THEN
        DELETE FROM resource_locks WHERE booking_id = NEW.id;
    ELSIF NEW.status = 'confirmed' AND OLD.status IN ('cancelled','no_show') THEN
        DECLARE booked_path ltree;
        BEGIN
            SELECT path INTO booked_path FROM resources WHERE id = NEW.resource_id;
            INSERT INTO resource_locks (booking_id, resource_id, tenant_id, time_range)
            SELECT NEW.id, r.id, NEW.tenant_id, NEW.time_range
            FROM resources r
            WHERE r.tenant_id = NEW.tenant_id
              AND (r.path @> booked_path OR r.path <@ booked_path);
        END;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_status_change
    AFTER UPDATE OF status ON bookings
    FOR EACH ROW EXECUTE FUNCTION fn_handle_booking_status_change();

CREATE OR REPLACE FUNCTION fn_handle_booking_reschedule() RETURNS trigger AS $$
DECLARE
    booked_path ltree;
BEGIN
    IF NEW.time_range != OLD.time_range OR NEW.resource_id != OLD.resource_id THEN
        DELETE FROM resource_locks WHERE booking_id = NEW.id;
        IF NEW.status NOT IN ('cancelled','no_show') THEN
            SELECT path INTO booked_path FROM resources WHERE id = NEW.resource_id;
            INSERT INTO resource_locks (booking_id, resource_id, tenant_id, time_range)
            SELECT NEW.id, r.id, NEW.tenant_id, NEW.time_range
            FROM resources r
            WHERE r.tenant_id = NEW.tenant_id
              AND (r.path @> booked_path OR r.path <@ booked_path);
        END IF;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_reschedule
    AFTER UPDATE OF time_range, resource_id ON bookings
    FOR EACH ROW EXECUTE FUNCTION fn_handle_booking_reschedule();
