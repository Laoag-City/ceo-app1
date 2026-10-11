-- Add playlist ordering without removing existing media records.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('queue_system_migration','queue_system_test') THEN
  RAISE EXCEPTION 'Unexpected queue migration database';
 END IF;
END $$;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS sort_order integer;
UPDATE public.videos SET sort_order=id WHERE sort_order IS NULL;
ALTER TABLE public.videos ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.videos ALTER COLUMN sort_order SET NOT NULL;
CREATE INDEX IF NOT EXISTS videos_playlist_order_idx ON public.videos(sort_order,id);
COMMIT;
