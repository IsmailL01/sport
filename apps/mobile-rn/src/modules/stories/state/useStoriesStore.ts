// modules/stories/state — Zustand store для stories Phase C.
//
// Источник истины:
//   - Server (через storiesApi)
//   - SQLite (storiesRepository) — offline-кэш + drafts
//   - В памяти — derived data: feedGroups, viewers map.
//
// Lifecycle:
//   refresh() — pull /stories/feed → upsert SQLite → group by author.
//   compose(picked, overlay) — INSERT draft, кикает push.
//   markViewed(id) — local mark + server mark (best effort).
//   loadViewers(id) — для owner: pull список просмотревших.
//   deleteOwn(id) — DELETE на сервере + remove locally.

import { create } from 'zustand';

import type {
  LocalStoryDraft,
  Story,
  StoryGroup,
  StoryViewer,
  StoryWithStats,
} from '../domain/types';
import {
  listActiveStories,
  listViewers,
  markViewedLocal,
  removeStory,
  upsertFeedStories,
} from '../storage/storiesRepository';
import {
  createDraftFromPicked,
  runDeleteStory,
  runDraftsPush,
  runFeedPull,
  runFetchViewers,
  runMarkViewed,
} from '../sync/storiesSync';
import type { PickedMedia } from '../../../media/MediaAdapter';

type StoriesState = {
  /** Все активные stories (мои + подписок). */
  stories: StoryWithStats[];
  /** Группировка по автору в порядке last-published-first. */
  groups: StoryGroup[];
  /** Загрузка фида в процессе. */
  loading: boolean;
  /** Ошибка последней загрузки (для показа баннера). */
  error: string | null;
  /** Cached viewers per story. */
  viewersByStory: Record<string, StoryViewer[]>;
  /** Push-задача в процессе (для индикатора в композере). */
  publishing: boolean;

  refresh: () => Promise<void>;
  compose: (
    picked: PickedMedia,
    overlay: string | null,
    selfUserId: string,
  ) => Promise<LocalStoryDraft>;
  markViewed: (storyId: string) => Promise<void>;
  loadViewers: (storyId: string) => Promise<void>;
  deleteOwn: (storyId: string) => Promise<void>;
  /** Перечитать локальный кэш (после migration / cold start). */
  hydrateFromCache: () => void;
  /**
   * Realtime: применить новую story от подписки без full /stories/feed pull.
   * payload — то что прилетело по WS (см. RealtimeAdapter.ts feed.story.published).
   */
  applyIncomingStory: (payload: {
    storyId: string;
    authorId: string;
    mediaId: string;
    createdAt: string | number;
    expiresAt: string | number;
  }) => void;
  /** Явный wipe state на logout. */
  clearAll: () => void;
};

function groupByAuthor(
  stories: StoryWithStats[],
  selfUserId: string | null,
): StoryGroup[] {
  // self first (если есть), затем followees по самому свежему.
  const byAuthor = new Map<string, StoryWithStats[]>();
  for (const s of stories) {
    const arr = byAuthor.get(s.authorId) ?? [];
    arr.push(s);
    byAuthor.set(s.authorId, arr);
  }
  const groups: StoryGroup[] = [];
  for (const [authorId, arr] of byAuthor) {
    arr.sort((a, b) => a.createdAt - b.createdAt);
    groups.push({
      authorId,
      stories: arr,
      allViewed: arr.every((s) => s.iViewed),
    });
  }
  groups.sort((a, b) => {
    if (selfUserId) {
      if (a.authorId === selfUserId) return -1;
      if (b.authorId === selfUserId) return 1;
    }
    // unviewed first, затем по времени самой свежей story.
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    const aMax = a.stories[a.stories.length - 1].createdAt;
    const bMax = b.stories[b.stories.length - 1].createdAt;
    return bMax - aMax;
  });
  return groups;
}

let _selfUserId: string | null = null;
export function setStoriesSelfUserId(uid: string | null): void {
  _selfUserId = uid;
}

export const useStoriesStore = create<StoriesState>((set, get) => ({
  stories: [],
  groups: [],
  loading: false,
  error: null,
  viewersByStory: {},
  publishing: false,

  hydrateFromCache: () => {
    const list = listActiveStories(Date.now());
    set({
      stories: list,
      groups: groupByAuthor(list, _selfUserId),
    });
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const fresh = await runFeedPull();
      set({
        stories: fresh,
        groups: groupByAuthor(fresh, _selfUserId),
        loading: false,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.warn('[stories] refresh failed', err);
      // Fallback на кэш — UX не блокируем.
      const cached = listActiveStories(Date.now());
      set({
        stories: cached,
        groups: groupByAuthor(cached, _selfUserId),
        loading: false,
        error: err,
      });
    }
  },

  compose: async (picked, overlay, selfUserId) => {
    set({ publishing: true });
    const draft = createDraftFromPicked(picked, overlay);
    // оптимистично включить draft в групу self.
    const provisional: StoryWithStats = {
      id: `draft:${draft.clientId}`,
      authorId: selfUserId,
      mediaId: '',
      overlayText: overlay,
      createdAt: draft.createdAt,
      expiresAt: draft.createdAt + 24 * 60 * 60 * 1000,
      viewCount: 0,
      iViewed: true,
    };
    const next = [provisional, ...get().stories];
    set({
      stories: next,
      groups: groupByAuthor(next, _selfUserId ?? selfUserId),
    });

    // Запуск push в фоне; результат подхватится через refresh.
    void runDraftsPush()
      .then(() => get().refresh())
      .finally(() => set({ publishing: false }));

    return draft;
  },

  markViewed: async (storyId) => {
    // Local update сначала — instant UX.
    markViewedLocal(storyId);
    const cur = get().stories.map((s) =>
      s.id === storyId ? { ...s, iViewed: true } : s,
    );
    set({ stories: cur, groups: groupByAuthor(cur, _selfUserId) });
    try {
      await runMarkViewed(storyId);
    } catch (e) {
      console.warn('[stories] markViewed remote failed', e);
    }
  },

  loadViewers: async (storyId) => {
    try {
      await runFetchViewers(storyId);
    } catch (e) {
      console.warn('[stories] loadViewers failed', e);
    }
    const fromCache = listViewers(storyId);
    set({
      viewersByStory: { ...get().viewersByStory, [storyId]: fromCache },
    });
  },

  applyIncomingStory: (payload) => {
    const id = payload.storyId;
    // Если уже знаем эту story (например только что refresh-нулись) — игнор.
    if (get().stories.some((s) => s.id === id)) return;
    const createdAt = typeof payload.createdAt === 'string'
      ? Date.parse(payload.createdAt) : Number(payload.createdAt);
    const expiresAt = typeof payload.expiresAt === 'string'
      ? Date.parse(payload.expiresAt) : Number(payload.expiresAt);
    const story: StoryWithStats = {
      id,
      authorId: payload.authorId,
      mediaId: payload.mediaId,
      overlayText: null,
      createdAt,
      expiresAt,
      viewCount: 0,
      iViewed: false,
    };
    const next = [story, ...get().stories];
    // Persist в SQLite — на след. cold start будет в кэше.
    upsertFeedStories([story]);
    set({
      stories: next,
      groups: groupByAuthor(next, _selfUserId),
    });
  },

  deleteOwn: async (storyId) => {
    // Optimistic remove.
    const filtered = get().stories.filter((s) => s.id !== storyId);
    set({
      stories: filtered,
      groups: groupByAuthor(filtered, _selfUserId),
    });
    try {
      await runDeleteStory(storyId);
    } catch (e) {
      console.warn('[stories] delete failed; will reappear on next refresh', e);
      // restore cache state (refresh подтянет если на сервере живо).
      void get().refresh();
    } finally {
      removeStory(storyId);
    }
  },

  clearAll: () => {
    set({
      stories: [],
      groups: [],
      loading: false,
      error: null,
      viewersByStory: {},
      publishing: false,
    });
  },
}));

export type { Story, StoryGroup, StoryWithStats, StoryViewer };
