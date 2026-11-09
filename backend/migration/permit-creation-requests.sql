-- Retry bookkeeping only. Existing permits, lots and routing rows stay intact.
CREATE TABLE IF NOT EXISTS permit_creation_requests (
    actor_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id char(36) NOT NULL,
    kind varchar(16) NOT NULL CHECK (kind IN ('permits','occupancy')),
    content_hash char(64) NOT NULL,
    project_id integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_id,request_id)
);
