// modules/clubs/state — Zustand store for local-first clubs.
//
// Mirrors useFriendsStore shape; difference is the data source is SQLite
// (synchronous I/O) rather than backend, so actions are synchronous
// underneath but exposed as async for future drop-in backend sync.

import { create } from 'zustand';

import type {
  ClubAvatarColor,
  ClubDetail,
  ClubSummary,
  CreateClubInput,
  UpdateClubInput,
} from '../domain/types';
import { CLUB_AVATAR_COLORS } from '../domain/types';
import {
  ClubError,
  validateClubDescription,
  validateClubName,
} from '../domain/errors';
import {
  addMember as repoAddMember,
  clearAllClubs as repoClearAll,
  createClub as repoCreate,
  deleteClub as repoDelete,
  getClubDetail as repoGetDetail,
  listClubsForUser as repoList,
  removeMember as repoRemoveMember,
  updateClub as repoUpdate,
} from '../../../storage/clubsRepository';

type ClubsStore = {
  /** Cached list of clubs the current user belongs to. */
  clubs: ClubSummary[];
  /** Cached details keyed by clubId — populated on demand by selectClub. */
  detailsById: Record<string, ClubDetail | undefined>;
  /** True while a refresh is in flight. */
  loading: boolean;
  /** True while a mutation (create/update/delete/member-op) is in flight. */
  mutating: boolean;
  /** Last error surfaced to UI; cleared on next successful call. */
  lastError: string | null;

  // ── Actions ──

  /** Re-read clubs from SQLite. Call on screen mount + after mutations. */
  refresh: (userId: string) => Promise<void>;

  /** Load + cache club detail. Returns null if not found / viewer not a member. */
  selectClub: (userId: string, clubId: string) => Promise<ClubDetail | null>;

  /** Create a club. Returns id on success. Throws ClubError on validation failure. */
  create: (input: CreateClubInput) => Promise<string>;

  /** Update club name/description/avatar. Owner-only. */
  update: (viewerUserId: string, input: UpdateClubInput) => Promise<void>;

  /** Delete a club. Owner-only. */
  remove: (viewerUserId: string, clubId: string) => Promise<void>;

  /** Add a member to a club. Owner-only. */
  addMember: (viewerUserId: string, clubId: string, memberId: string) => Promise<void>;

  /**
   * Remove a member or leave a club. Caller may be either the owner (kicking)
   * or the user themselves (leaving). Owner cannot leave — use `remove()`.
   */
  removeMember: (
    viewerUserId: string,
    clubId: string,
    targetUserId: string,
  ) => Promise<void>;

  /** Pick a deterministic default avatar color for a new club. */
  pickDefaultAvatarColor: (clubsCount: number) => ClubAvatarColor;

  /** Clear all in-memory state and wipe SQLite tables. Called on logout. */
  clearAll: () => void;
};

export const useClubsStore = create<ClubsStore>((set, get) => ({
  clubs: [],
  detailsById: {},
  loading: false,
  mutating: false,
  lastError: null,

  refresh: async (userId) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const clubs = repoList(userId);
      set({ clubs, loading: false, lastError: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loading: false, lastError: msg });
      console.warn('[clubs] refresh failed', msg);
    }
  },

  selectClub: async (userId, clubId) => {
    try {
      const detail = repoGetDetail(userId, clubId);
      set((s) => ({
        detailsById: { ...s.detailsById, [clubId]: detail ?? undefined },
        lastError: null,
      }));
      return detail;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ lastError: msg });
      return null;
    }
  },

  create: async (input) => {
    const nameErr = validateClubName(input.name);
    if (nameErr !== null) {
      set({ lastError: nameErr.message });
      throw nameErr;
    }
    const descErr = validateClubDescription(input.description);
    if (descErr !== null) {
      set({ lastError: descErr.message });
      throw descErr;
    }
    set({ mutating: true });
    try {
      const club = repoCreate(input);
      set({ mutating: false, lastError: null });
      await get().refresh(input.ownerId);
      return club.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  update: async (viewerUserId, input) => {
    const nameErr = validateClubName(input.name);
    if (nameErr !== null) {
      set({ lastError: nameErr.message });
      throw nameErr;
    }
    const descErr = validateClubDescription(input.description);
    if (descErr !== null) {
      set({ lastError: descErr.message });
      throw descErr;
    }
    set({ mutating: true });
    try {
      repoUpdate(viewerUserId, input);
      set({ mutating: false, lastError: null });
      await get().refresh(viewerUserId);
      await get().selectClub(viewerUserId, input.id);
    } catch (e) {
      const msg = e instanceof ClubError ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  remove: async (viewerUserId, clubId) => {
    set({ mutating: true });
    try {
      repoDelete(viewerUserId, clubId);
      set((s) => {
        const detailsById = { ...s.detailsById };
        delete detailsById[clubId];
        return { detailsById, mutating: false, lastError: null };
      });
      await get().refresh(viewerUserId);
    } catch (e) {
      const msg = e instanceof ClubError ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  addMember: async (viewerUserId, clubId, memberId) => {
    set({ mutating: true });
    try {
      repoAddMember(viewerUserId, clubId, memberId);
      set({ mutating: false, lastError: null });
      await get().refresh(viewerUserId);
      await get().selectClub(viewerUserId, clubId);
    } catch (e) {
      const msg = e instanceof ClubError ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  removeMember: async (viewerUserId, clubId, targetUserId) => {
    set({ mutating: true });
    try {
      repoRemoveMember(viewerUserId, clubId, targetUserId);
      set({ mutating: false, lastError: null });
      // If the viewer left the club, drop the detail; otherwise refresh it.
      if (viewerUserId === targetUserId) {
        set((s) => {
          const detailsById = { ...s.detailsById };
          delete detailsById[clubId];
          return { detailsById };
        });
        await get().refresh(viewerUserId);
      } else {
        await get().refresh(viewerUserId);
        await get().selectClub(viewerUserId, clubId);
      }
    } catch (e) {
      const msg = e instanceof ClubError ? e.message : String(e);
      set({ mutating: false, lastError: msg });
      throw e;
    }
  },

  pickDefaultAvatarColor: (clubsCount) =>
    CLUB_AVATAR_COLORS[clubsCount % CLUB_AVATAR_COLORS.length],

  clearAll: () => {
    try {
      repoClearAll();
    } catch (e) {
      console.warn('[clubs] clearAll repo wipe failed', e);
    }
    set({
      clubs: [],
      detailsById: {},
      loading: false,
      mutating: false,
      lastError: null,
    });
  },
}));
