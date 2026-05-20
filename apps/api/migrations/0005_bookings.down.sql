DROP TRIGGER IF EXISTS trg_booking_reschedule ON bookings;
DROP TRIGGER IF EXISTS trg_booking_status_change ON bookings;
DROP TRIGGER IF EXISTS trg_booking_locks ON bookings;
DROP FUNCTION IF EXISTS fn_handle_booking_reschedule();
DROP FUNCTION IF EXISTS fn_handle_booking_status_change();
DROP FUNCTION IF EXISTS fn_populate_resource_locks();
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS booking_series;
DROP TYPE IF EXISTS booking_status;
