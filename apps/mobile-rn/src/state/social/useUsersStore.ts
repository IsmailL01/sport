// Кэш профилей других пользователей.
// Phase 8 / A5.

import { create } from 'zustand';

import { apiClient } from '../../auth/apiClient';
import type { SocialUser, UserId } from '../../domain/social';
import { getUser, upsertUser } from '../../storage/socialRepository';

type UsersStore = {
  byId: Record<UserId, SocialUser>;

  /** Получить из памяти, fallback на SQLite, затем fetch /profiles/{id}. */
  getOrFetch: (userId: UserId) => Promise<SocialUser | null>;

  search: (query: string) => Promise<SocialUser[]>;

  follow: (userId: UserId) => Promise<void>;
  unfollow: (userId: UserId) => Promise<void>;
};

type ServerProfile = {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  avatarMediaId?: string | null;
  privacy?: string;
  globalRole?: string;
  followersCount?: number;
  followingCount?: number;
};

function fromServer(p: ServerProfile): SocialUser {
  return {
    id: p.userId,
    displayName: p.displayName ?? null,
    username: p.username ?? null,
    avatarUrl: null,
    bio: p.bio ?? null,
    isBlocked: false,
    followersCount: p.followersCount ?? 0,
    followingCount: p.followingCount ?? 0,
    globalRole: p.globalRole,
  };
}

export const useUsersStore = create<UsersStore>((set, get) => ({
  byId: {},

  getOrFetch: async (userId) => {
    const memory = get().byId[userId];
    if (memory !== undefined) return memory;
    const cached = getUser(userId);
    if (cached !== null) {
      set((s) => ({ byId: { ...s.byId, [userId]: cached } }));
      return cached;
    }
    if (!apiClient.isAuthenticated()) return null;
    try {
      const resp = await apiClient.api(`/profiles/${userId}`);
      if (!resp.ok) return null;
      const p = (await resp.json()) as ServerProfile;
      const u = fromServer(p);
      upsertUser(u);
      set((s) => ({ byId: { ...s.byId, [userId]: u } }));
      return u;
    } catch (e) {
      console.warn('[users] getOrFetch failed', e);
      return null;
    }
  },

  search: async (query) => {
    if (query.trim().length < 2 || !apiClient.isAuthenticated()) return [];
    try {
      const resp = await apiClient.api(`/search/users?q=${encodeURIComponent(query)}`);
      if (!resp.ok) return [];
      const arr = (await resp.json()) as ServerProfile[];
      const users = arr.map(fromServer);
      // Cache в SQLite + memory.
      for (const u of users) upsertUser(u);
      set((s) => {
        const next = { ...s.byId };
        for (const u of users) next[u.id] = u;
        return { byId: next };
      });
      return users;
    } catch (e) {
      console.warn('[users] search failed', e);
      return [];
    }
  },

  follow: async (userId) => {
    if (!apiClient.isAuthenticated()) return;
    await apiClient.api(`/follows/${userId}`, { method: 'POST' });
  },

  unfollow: async (userId) => {
    if (!apiClient.isAuthenticated()) return;
    await apiClient.api(`/follows/${userId}`, { method: 'DELETE' });
  },
}));
