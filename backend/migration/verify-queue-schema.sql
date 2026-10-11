BEGIN;
INSERT INTO tickets(id,name,barangay,reason) VALUES (-101,'Schema test','Test','Test');
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM tickets WHERE id=-101 AND status='waiting') THEN RAISE EXCEPTION 'Queue default failed'; END IF;
 BEGIN
  UPDATE tickets SET status='invalid-state' WHERE id=-101;
  RAISE EXCEPTION 'Invalid queue status was accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  CREATE TABLE public.forbidden_schema_fixture(id integer);
  RAISE EXCEPTION 'Runtime role unexpectedly has CREATE';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE tickets SET status='serving' WHERE id=-101;
DELETE FROM tickets WHERE id=-101;
ROLLBACK;
SELECT 'queue fixtures passed';
