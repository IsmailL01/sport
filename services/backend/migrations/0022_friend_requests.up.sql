-- Phase 10 / FRIEND-REQUEST-FLOW (ADR-0011 Amendment 6, 2026-05-25).
--
-- Symmetric friend-request gate on DMs. User A sends request → User B
-- accepts → DM channel opens (canDm bidirectional). Either user can reject
-- or cancel a pending request.
--
-- Friendship is derived: there exists a friend_requests row with status
-- 'accepted' between two users (in either sender→receiver direction). The
-- are_friends(u1, u2) function below provides the canonical check used
-- by the messaging service before allowing DM send.

CREATE TABLE IF NOT EXISTS friend_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT NOT NULL
                    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at  TIMESTAMPTZ,
    CONSTRAINT friend_requests_no_self CHECK (sender_id <> receiver_id),
    CONSTRAINT friend_requests_unique_pair UNIQUE (sender_id, receiver_id)
);

-- Partial indexes for the two hot read paths: incoming-pending and
-- outgoing-pending lookups. Both default to receiver_id / sender_id with a
-- status='pending' filter so the index is much smaller than the full table.
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_pending
    ON friend_requests (receiver_id, created_at DESC)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_pending
    ON friend_requests (sender_id, created_at DESC)
    WHERE status = 'pending';

-- Index for the are_friends() lookup (status='accepted' bidirectional check).
-- We don't WHERE-filter this one because both sides of the pair lookup need it.
CREATE INDEX IF NOT EXISTS idx_friend_requests_accepted
    ON friend_requests (sender_id, receiver_id)
    WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_friend_requests_accepted_reverse
    ON friend_requests (receiver_id, sender_id)
    WHERE status = 'accepted';

-- Canonical friendship check. STABLE so PG can cache result within a
-- single query (used in JOIN-like predicates in messaging service).
CREATE OR REPLACE FUNCTION are_friends(u1 UUID, u2 UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM friend_requests
        WHERE status = 'accepted'
          AND (
            (sender_id = u1 AND receiver_id = u2) OR
            (sender_id = u2 AND receiver_id = u1)
          )
    );
$$ LANGUAGE SQL STABLE;

COMMENT ON TABLE friend_requests IS
  'Symmetric friend-request flow (ADR-0011 Amendment 6, Phase 10). Friendship = accepted row in either direction. DMs gated on are_friends() check by messaging service.';

COMMENT ON FUNCTION are_friends(UUID, UUID) IS
  'Returns true if u1 and u2 have an accepted friend-request between them (either direction). Used by messaging service DM-gate.';
