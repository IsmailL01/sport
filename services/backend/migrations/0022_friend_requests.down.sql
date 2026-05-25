-- Rollback for Phase 10 FRIEND-REQUEST-FLOW (ADR-0011 Amendment 6).
-- Removes are_friends() function and friend_requests table.
-- Existing follows / user_blocks unaffected (different tables).

DROP FUNCTION IF EXISTS are_friends(UUID, UUID);

DROP INDEX IF EXISTS idx_friend_requests_accepted_reverse;
DROP INDEX IF EXISTS idx_friend_requests_accepted;
DROP INDEX IF EXISTS idx_friend_requests_sender_pending;
DROP INDEX IF EXISTS idx_friend_requests_receiver_pending;

DROP TABLE IF EXISTS friend_requests;
