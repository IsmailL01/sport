// modules/friends/domain — Phase 10 / ADR-0011 Amendment 6 types.
//
// Mirror of backend social-graph friend_requests schema (migration 0022).
// Source-of-truth contracts:
//   - sender_id, receiver_id are UUID strings (server-side users.id)
//   - status enum matches PG CHECK constraint: pending|accepted|rejected|cancelled
//   - createdAt / respondedAt are ms epoch UTC (client-normalized from RFC3339)

export type FriendRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

/**
 * Friend-request entity. One row per (sender, receiver) pair in backend;
 * mobile cache mirrors this 1:1 keyed by `id`.
 */
export type FriendRequest = {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  /** ms epoch UTC */
  createdAt: number;
  /** ms epoch UTC, null while still pending */
  respondedAt: number | null;
};

/**
 * Friend-status enum used by GetRelation response and exposed to UI for the
 * action-button state machine on ForeignProfileScreen.
 *
 * UI rendering:
 *   self              → no button (own profile)
 *   none              → "Добавить в друзья" (send request)
 *   pending_outgoing  → "Запрос отправлен" + cancel option
 *   pending_incoming  → "Принять" / "Отклонить" pair
 *   accepted          → "Друзья" + DM button enabled
 */
export type FriendActionState =
  | 'self'
  | 'none'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'accepted';

/** Server-side error code surfaced when a DM-create call fails on friendship gate. */
export const REQUIRES_FRIENDSHIP_ERROR_CODE = 'requires_friendship';
