ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_customer_or_team;
ALTER TABLE bookings ADD CONSTRAINT bookings_customer_or_team_orig
  CHECK (customer_id IS NOT NULL OR team_id IS NOT NULL);
ALTER TABLE bookings DROP COLUMN IF EXISTS team_name;
