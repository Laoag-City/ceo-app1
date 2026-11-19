-- Service-only tickets omit personal details. Archived visits remain readable.
BEGIN;
ALTER TABLE public.tickets ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN barangay DROP NOT NULL;
ALTER TABLE public.queue_client_history_archive ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.queue_client_history_archive ALTER COLUMN barangay DROP NOT NULL;
COMMIT;
