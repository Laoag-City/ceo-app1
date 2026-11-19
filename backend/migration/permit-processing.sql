-- Legacy permits remain unclassified until an office policy assigns a category.
BEGIN;
ALTER TABLE public.permits
    ADD COLUMN IF NOT EXISTS processing_time varchar(20)
        CHECK (processing_time IN ('simple','complex','highly_technical')),
    ADD COLUMN IF NOT EXISTS processing_started_on date;
ALTER TABLE public.occupancy_permits
    ADD COLUMN IF NOT EXISTS processing_time varchar(20)
        CHECK (processing_time IN ('simple','complex','highly_technical')),
    ADD COLUMN IF NOT EXISTS processing_started_on date;
COMMIT;
