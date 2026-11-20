-- Fires on every path that moves the counters (order, cancel, pay, sweeper, webhook refund, naive or atomic).
-- pg_notify is delivered only on commit, and identical payloads in one transaction are folded into one.
CREATE FUNCTION notify_quota_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('quota_changed', NEW.event_id::text);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ticket_types_quota_changed
AFTER UPDATE OF sold, reserved ON ticket_types
FOR EACH ROW EXECUTE FUNCTION notify_quota_changed();
