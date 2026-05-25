// modules/stories/state — Phase 11 STORIES-REVIVAL.
//
// Minimal in-memory cache (no SQLite persistence in session 2 — added in
// session 3 when LocalStoryDraft offline-first flow lands).
//
// Two stores intentionally split:
//   useStoriesStore       — feed + my stories + view mutations
//   useStoryDraftsStore   — local composition drafts (deferred to session 3
//                            with creator UI)

import { create } from 'zustand';

import { groupStoriesByAuthor, type StoryGroup, type StoryWithStats } from '../domain/types';
import {
  fetchStoriesFeed,
  fetchMyStories,
  markStoryViewed,
} from '../sync/storiesApi';

type StoriesState = {
  /** Combined: my stories prepended to followee feed, sorted by group. */
  groups: StoryGroup[];
  /** Raw list for direct lookups (e.g. by-storyId). */
  stories: StoryWithStats[];
  loading: boolean;
  lastError: string | null;
  lastRefreshedAt: number | null;

  // ── Actions ──

  refresh: () => Promise<void>;
  /**
   * Mark viewed locally + push to backend. Idempotent — safe to call
   * multiple times. Caller (StoryViewerScreen) invokes this on swipe-to-next.
   */
  markViewed: (storyId: string) => Promise<void>;
  /** Lookup group by author. Returns null if author has no active stories. */
  groupForAuthor: (authorId: string) => StoryGroup | null;
  /** Clear on logout. */
  clearAll: () => void;
};

export const useStoriesStore = create<StoriesState>((set, get) => ({
  groups: [],
  stories: [],
  loading: false,
  lastError: null,
  lastRefreshedAt: null,

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [feed, mine] = await Promise.all([
        fetchStoriesFeed(),
        fetchMyStories(),
      ]);
      // De-duplicate by id (mine may overlap if user follows themselves —
      // shouldn't, but defensive).
      const byId = new Map<string, StoryWithStats>();
      for (const s of [...mine, ...feed]) {
        byId.set(s.id, s);
      }
      const stories = Array.from(byId.values());
      const groups = groupStoriesByAuthor(stories);
      set({
        stories,
        groups,
        loading: false,
        lastError: null,
        lastRefreshedAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ loading: false, lastError: msg });
      console.warn('[stories] refresh failed', msg);
    }
  },

  markViewed: async (storyId) => {
    // Optimistic: flip iViewed locally + recompute group `allViewed`.
    set((s) => {
      const stories = s.stories.map((st) =>
        st.id === storyId
          ? { ...st, iViewed: true, viewCount: st.viewCount + (st.iViewed ? 0 : 1) }
          : st,
      );
      const groups = groupStoriesByAuthor(stories);
      return { stories, groups };
    });
    try {
      await markStoryViewed(storyId);
    } catch (e) {
      // Non-fatal — local state stays optimistically updated. Server will
      // catch up on next refresh().
      console.warn('[stories] markViewed failed', e);
    }
  },

  groupForAuthor: (authorId) => {
    const groups = get().groups;
    return groups.find((g) => g.authorId === authorId) ?? null;
  },

  clearAll: () => {
    set({
      groups: [],
      stories: [],
      loading: false,
      lastError: null,
      lastRefreshedAt: null,
    });
  },
}));
