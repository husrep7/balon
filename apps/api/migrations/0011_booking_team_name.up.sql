ALTER TABLE bookings ADD COLUMN IF NOT EXISTS team_name VARCHAR(100);

-- Replace the customer/team check constraint to also allow plain team_name
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'bookings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%customer_id IS NOT NULL%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE bookings DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE bookings ADD CONSTRAINT bookings_customer_or_team
  CHECK (customer_id IS NOT NULL OR team_id IS NOT NULL OR team_name IS NOT NULL);
