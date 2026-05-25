// modules/friends/state — minimal in-memory cache + actions.
// Phase 10 / ADR-0011 Amendment 6.
//
// No SQLite persistence (yet) — list endpoints are cheap (<200 rows for
// closed-beta scale of 5-10 testers). Refresh on app-foreground + after each
// mutation. v1.0.1 candidate: SQLite cache when tester count grows.

import { create } from 'zustand';

import type { FriendRequest } from '../domain/types';
import {
  acceptFriendRequest as apiAccept,
  cancelFriendRequest as apiCancel,
  FriendRequestError,
  listFriends as apiListFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  rejectFriendRequest as apiReject,
  sendFriendRequest as apiSend,
} from '../sync/friendsApi';

type FriendsState = {
  /** Accepted friend userIDs. Refreshed via refresh(). */
  friendIds: string[];
  /** Pending requests where I'm receiver. */
  incoming: FriendRequest[];
  /** Pending requests where I'm sender. */
  outgoing: FriendRequest[];
  /** True while any list refresh is in flight. */
  loading: boolean;
  /** True while a mutation (send/accept/reject/cancel) is in flight. */
  mutating: boolean;
  /** Last error surfaced from API; cleared on next successful call. */
  lastError: string | null;

  // ── Actions ──

  /** Pull all three lists in parallel. Safe to call from anywhere. */
  refresh: () => Promise<void>;

  /**
   * Send a friend request to receiverId. Optimistic UI: caller can use
   * returned FriendRequest immediately to flip button state.
   *
   * Throws FriendRequestError on:
   *   - already_friends (409)
   *   - self_target (400)
   *   - rate_limited (429)
   *   - other server errors
   */
  send: (receiverId: string) => Promise<FriendRequest>;

  /** Accept a pending incoming request (receiver-only). */
  accept: (requestId: string) => Promise<void>;

  /** Reject a pending incoming request (receiver-only). */
  reject: (requestId: string) => Promise<void>;

  /** Cancel a pending outgoing request (sender-only). */
  cancel: (requestId: string) => Promise<void>;

  /** Clear all state — call on logout. */
  clearAll: () => void;
};

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friendIds: [],
  incoming: [],
  outgoing: [],
  loading: false,
  mutating: false,
  lastError: null,

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [friendIds, incoming, outgoing] = await Promise.all([
        apiListFriends(),
        listIncomingFriendRequests(),
        listOutgoingFriendRequests(),
      ]);
      set({ friendIds, incoming, outgoing, loading: false, lastError: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loading: false, lastError: msg });
      console.warn('[friends] refresh failed', msg);
    }
  },

  send: async (receiverId) => {
    set({ mutating: true });
    try {
      const fr = await apiSend(receiverId);
      // Optimistic update: append to outgoing list if pending.
      set((s) => {
        const exists = s.outgoing.some((o) => o.id === fr.id);
        const outgoing = exists ? s.outgoing : [fr, ...s.outgoing];
        return { outgoing, mutating: false, lastError: null };
      });
      return fr;
    } catch (e) {
      const msg = e instanceof FriendRequestError ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  accept: async (requestId) => {
    set({ mutating: true });
    try {
      await apiAccept(requestId);
      // Optimistic: remove from incoming + caller refreshes friendIds.
      set((s) => ({
        incoming: s.incoming.filter((r) => r.id !== requestId),
        mutating: false,
        lastError: null,
      }));
      // Background refresh to pull updated friendIds without blocking UI.
      void get().refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  reject: async (requestId) => {
    set({ mutating: true });
    try {
      await apiReject(requestId);
      set((s) => ({
        incoming: s.incoming.filter((r) => r.id !== requestId),
        mutating: false,
        lastError: null,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  cancel: async (requestId) => {
    set({ mutating: true });
    try {
      await apiCancel(requestId);
      set((s) => ({
        outgoing: s.outgoing.filter((r) => r.id !== requestId),
        mutating: false,
        lastError: null,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  clearAll: () => {
    set({
      friendIds: [],
      incoming: [],
      outgoing: [],
      loading: false,
      mutating: false,
      lastError: null,
    });
  },
}));
