-- Apply as the database owner. Existing data and identifiers are retained.
BEGIN;
ALTER TABLE public.permits
    ADD COLUMN IF NOT EXISTS phone_number varchar(50),
    ADD COLUMN IF NOT EXISTS email varchar(255);
ALTER TABLE public.occupancy_permits
    ADD COLUMN IF NOT EXISTS phone_number varchar(50),
    ADD COLUMN IF NOT EXISTS email varchar(255);
COMMIT;
