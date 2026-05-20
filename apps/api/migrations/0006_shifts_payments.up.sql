CREATE TYPE shift_status AS ENUM ('opened','closing','closed','voided');
CREATE TYPE payment_method AS ENUM ('cash','card_pos','membership_credit','voucher','transfer');

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
    ON shift_sessions (tenant_id)
    WHERE status = 'opened';

CREATE INDEX shift_sessions_tenant_opened
    ON shift_sessions(tenant_id, opened_at DESC);

CREATE TABLE payments (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    booking_id          uuid REFERENCES bookings(id),
    shift_session_id    uuid NOT NULL REFERENCES shift_sessions(id),
    amount_cents        bigint NOT NULL CHECK (amount_cents > 0),
    method              payment_method NOT NULL,
    card_terminal_ref   text,
    fiscal_receipt_no   text,
    collected_by        uuid REFERENCES users(id),
    collected_at        timestamptz NOT NULL DEFAULT now(),
    voided_at           timestamptz,
    void_reason         text,
    CONSTRAINT chk_voided CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE INDEX payments_booking ON payments(booking_id) WHERE voided_at IS NULL;
CREATE INDEX payments_shift ON payments(shift_session_id) WHERE voided_at IS NULL;
CREATE INDEX payments_tenant_date ON payments(tenant_id, collected_at DESC) WHERE voided_at IS NULL;

CREATE TABLE cash_movements (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id),
    shift_session_id  uuid NOT NULL REFERENCES shift_sessions(id),
    amount_cents      bigint NOT NULL,
    reason            text NOT NULL,
    recorded_by       uuid REFERENCES users(id),
    recorded_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cash_movements_shift ON cash_movements(shift_session_id);
