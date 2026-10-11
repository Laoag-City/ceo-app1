-- Run as the database owner. This adds notification bookkeeping only.
CREATE TABLE IF NOT EXISTS public.permit_session_replacements (
 token_hash char(64) PRIMARY KEY,
 expires_at timestamp(3) without time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS permit_session_replacements_expiry ON public.permit_session_replacements(expires_at);
