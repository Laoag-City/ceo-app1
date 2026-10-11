-- Existing account/station pairs and engineering history are retained.
BEGIN;
LOCK TABLE permit_station_assignments IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE assignment_constraint record;
BEGIN
 FOR assignment_constraint IN
  SELECT c.conname FROM pg_constraint c
  WHERE c.conrelid='permit_station_assignments'::regclass AND c.contype IN ('p','u')
   AND c.conkey IN (
    ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='user_id')]::smallint[],
    ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='station_key')]::smallint[])
 LOOP
  EXECUTE format('ALTER TABLE permit_station_assignments DROP CONSTRAINT %I',assignment_constraint.conname);
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='permit_station_assignments'::regclass AND contype='p') THEN
  ALTER TABLE permit_station_assignments ADD PRIMARY KEY (user_id,station_key);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS station_assignment_station ON permit_station_assignments(station_key);
ALTER TABLE permit_routing_matrix ADD COLUMN IF NOT EXISTS last_updated_by integer;
ALTER TABLE occupancy_routing_matrix ADD COLUMN IF NOT EXISTS last_updated_by integer;
COMMIT;
