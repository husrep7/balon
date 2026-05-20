CREATE TABLE customer_accounts (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    name          text NOT NULL DEFAULT '',
    phone         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
