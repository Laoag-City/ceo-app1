-- Explicit fixture IDs avoid advancing identity sequences; all changes roll back.
BEGIN;
INSERT INTO users(id,username,password) VALUES (-101,'Schema_Check','not-a-login-hash');
DO $$ BEGIN
 BEGIN
  INSERT INTO users(id,username,password) VALUES (-102,'SCHEMA_CHECK','not-a-login-hash');
  RAISE EXCEPTION 'Case-insensitive uniqueness was not enforced';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  CREATE TABLE public.forbidden_schema_fixture(id integer);
  RAISE EXCEPTION 'Runtime role unexpectedly has CREATE';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO permits(id,project_title,location,owner_name,designer_name,permit_date)
VALUES (-101,'Schema test','Test','Test','Test','2026-09-30');
INSERT INTO permit_lots(id,permit_id,lot_number) VALUES (-101,-101,'Test');
DELETE FROM permits WHERE id=-101;
DO $$ BEGIN
 IF EXISTS(SELECT FROM permit_lots WHERE id=-101) THEN RAISE EXCEPTION 'Cascade failed'; END IF;
 BEGIN
  INSERT INTO permit_lots(id,permit_id,lot_number) VALUES (-102,-999,'Test');
  RAISE EXCEPTION 'Orphan was accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
INSERT INTO occupancy_permits(id,bp_reference_no,project_title,location,owner_name,date_applied)
VALUES (-101,'TEST','Test','Test','Test','2026-09-30');
INSERT INTO occupancy_checklists(id,occupancy_id,checklist_state,updated_at)
VALUES (-101,-101,'{}','2000-01-01T00:00:00Z');
DO $$ BEGIN
 BEGIN
  UPDATE occupancy_checklists SET checklist_state='invalid json' WHERE id=-101;
  RAISE EXCEPTION 'Invalid JSON was accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE occupancy_checklists SET checklist_state='{"checked":true}' WHERE id=-101;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM occupancy_checklists WHERE id=-101 AND updated_at>'2000-01-02T00:00:00Z') THEN RAISE EXCEPTION 'Timestamp trigger failed'; END IF;
END $$;
ROLLBACK;
SELECT 'permit fixtures passed';
