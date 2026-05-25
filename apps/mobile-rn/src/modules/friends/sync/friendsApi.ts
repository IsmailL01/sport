// modules/friends/sync — wraps backend social-graph friend-request endpoints.
// Phase 10 / ADR-0011 Amendment 6.
//
// Endpoints (all auth-required):
//   POST   /friend-requests/{userId}
//   GET    /friend-requests/incoming
//   GET    /friend-requests/outgoing
//   POST   /friend-requests/{id}/accept
//   POST   /friend-requests/{id}/reject
//   DELETE /friend-requests/{id}
//   GET    /friends
//   GET    /friends/check/{userId}

import { apiClient } from '../../../auth/apiClient';
import type { FriendRequest, FriendRequestStatus } from '../domain/types';

type ServerFriendRequestDTO = {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: string; // RFC3339
  respondedAt?: string | null;
};

function dtoToFriendRequest(d: ServerFriendRequestDTO): FriendRequest {
  return {
    id: d.id,
    senderId: d.senderId,
    receiverId: d.receiverId,
    status: d.status,
    createdAt: Date.parse(d.createdAt),
    respondedAt:
      d.respondedAt !== null && d.respondedAt !== undefined
        ? Date.parse(d.respondedAt)
        : null,
  };
}

export type ApiErrorCode =
  | 'already_friends'
  | 'friend_request_exists'
  | 'not_pending'
  | 'not_owner'
  | 'self_target'
  | 'requires_friendship'
  | 'rate_limited'
  | 'unauthorized'
  | 'unknown';

export class FriendRequestError extends Error {
  code: ApiErrorCode;
  status: number;
  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message);
    this.name = 'FriendRequestError';
    this.code = code;
    this.status = status;
  }
}

async function parseErrorBody(
  resp: Response,
): Promise<{ code: ApiErrorCode; message: string }> {
  try {
    const body = (await resp.json()) as { error?: string; message?: string };
    const code = (body.error ?? 'unknown') as ApiErrorCode;
    return { code, message: body.message ?? `HTTP ${resp.status}` };
  } catch {
    return { code: 'unknown', message: `HTTP ${resp.status}` };
  }
}

async function unwrap<T>(
  promise: Promise<Response>,
  parseBody: (b: unknown) => T,
): Promise<T> {
  const resp = await promise;
  if (!resp.ok) {
    const { code, message } = await parseErrorBody(resp);
    throw new FriendRequestError(code, resp.status, message);
  }
  const body = (await resp.json()) as unknown;
  return parseBody(body);
}

/** POST /friend-requests/{userId} — send request to userId. */
export async function sendFriendRequest(receiverId: string): Promise<FriendRequest> {
  return unwrap(
    apiClient.identity(`/friend-requests/${encodeURIComponent(receiverId)}`, {
      method: 'POST',
    }),
    (b) => dtoToFriendRequest(b as ServerFriendRequestDTO),
  );
}

/** GET /friend-requests/incoming — pending requests where I'm the receiver. */
export async function listIncomingFriendRequests(): Promise<FriendRequest[]> {
  return unwrap(
    apiClient.identity('/friend-requests/incoming', { method: 'GET' }),
    (b) => {
      const items = (b as { items: ServerFriendRequestDTO[] }).items ?? [];
      return items.map(dtoToFriendRequest);
    },
  );
}

/** GET /friend-requests/outgoing — pending requests where I'm the sender. */
export async function listOutgoingFriendRequests(): Promise<FriendRequest[]> {
  return unwrap(
    apiClient.identity('/friend-requests/outgoing', { method: 'GET' }),
    (b) => {
      const items = (b as { items: ServerFriendRequestDTO[] }).items ?? [];
      return items.map(dtoToFriendRequest);
    },
  );
}

/** POST /friend-requests/{id}/accept — receiver accepts pending request. */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  const resp = await apiClient.identity(
    `/friend-requests/${encodeURIComponent(requestId)}/accept`,
    { method: 'POST' },
  );
  if (!resp.ok) {
    const { code, message } = await parseErrorBody(resp);
    throw new FriendRequestError(code, resp.status, message);
  }
}

/** POST /friend-requests/{id}/reject — receiver rejects pending request. */
export async function rejectFriendRequest(requestId: string): Promise<void> {
  const resp = await apiClient.identity(
    `/friend-requests/${encodeURIComponent(requestId)}/reject`,
    { method: 'POST' },
  );
  if (!resp.ok) {
    const { code, message } = await parseErrorBody(resp);
    throw new FriendRequestError(code, resp.status, message);
  }
}

/** DELETE /friend-requests/{id} — sender cancels own pending request. */
export async function cancelFriendRequest(requestId: string): Promise<void> {
  const resp = await apiClient.identity(
    `/friend-requests/${encodeURIComponent(requestId)}`,
    { method: 'DELETE' },
  );
  if (!resp.ok) {
    const { code, message } = await parseErrorBody(resp);
    throw new FriendRequestError(code, resp.status, message);
  }
}

/** GET /friends — list of friend userIDs (accepted friendships). */
export async function listFriends(): Promise<string[]> {
  return unwrap(
    apiClient.identity('/friends', { method: 'GET' }),
    (b) => (b as { friendIds?: string[] }).friendIds ?? [],
  );
}

/** GET /friends/check/{userId} — server-side friendship check. */
export async function checkAreFriends(userId: string): Promise<boolean> {
  return unwrap(
    apiClient.identity(
      `/friends/check/${encodeURIComponent(userId)}`,
      { method: 'GET' },
    ),
    (b) => Boolean((b as { areFriends?: boolean }).areFriends),
  );
}
