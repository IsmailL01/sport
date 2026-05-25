// modules/stories/domain — pure types for Phase 11 / STORIES-REVIVAL.
//
// Story = one 24h ephemeral post by one author.
// StoryWithStats = + viewCount + iViewed (for feed render).
// StoryGroup = grouped per-author for tray UI.
//
// All timestamps in ms epoch UTC (mobile-side convention).
//
// 2026-05-25 (ADR-0011 Amendment 6 / Phase 11): module revived after
// Phase 8/C deprecation. Backend `feed` service on port 8085 still
// runs the contract; mobile rebuilds the UI layer from scratch.

export type StoryId = string;
export type UserId = string;
export type MediaId = string;

/** One story row (server-side stories table, mobile mirror). */
export type Story = {
  id: StoryId;
  authorId: UserId;
  mediaId: MediaId;
  overlayText: string | null;
  /** ms epoch UTC */
  createdAt: number;
  /** ms epoch UTC; serverside default = createdAt + 24h */
  expiresAt: number;
};

/** Story enriched with viewer-related stats for UI rendering. */
export type StoryWithStats = Story & {
  /** Total views (counts every view event, NOT unique viewers). */
  viewCount: number;
  /** True if the current user has viewed this story. */
  iViewed: boolean;
};

/** One viewer row for owner-list "кто посмотрел". */
export type StoryViewer = {
  viewerId: UserId;
  /** ms epoch UTC */
  viewedAt: number;
};

/**
 * Group of stories by the same author. Tray UI renders one avatar per
 * group with a ring whose color depends on `allViewed`:
 *   allViewed === false → unviewed ring (theme.lime)
 *   allViewed === true  → viewed ring (theme.divider — muted)
 */
export type StoryGroup = {
  authorId: UserId;
  stories: StoryWithStats[];
  allViewed: boolean;
};

/**
 * Local draft for offline-first composition. User picks media + writes
 * overlay → stored in SQLite + queued for upload. Survives app restarts.
 */
export type LocalStoryDraft = {
  /** UUID v4 на устройстве; client_id for idempotent POST. */
  clientId: string;
  /** Local file URI in app cache. */
  localUri: string;
  mime: string;
  width: number | null;
  height: number | null;
  overlayText: string | null;
  /** ms epoch — when user tapped "Publish". */
  createdAt: number;
  status: 'pending' | 'uploading' | 'failed' | 'published';
  /** Server-side media_id after init-upload step. */
  mediaId: MediaId | null;
  /** Final story_id after POST /stories. */
  storyId: StoryId | null;
  attempts: number;
  lastError: string | null;
};

export const STORY_OVERLAY_MAX_LENGTH = 200;
export const STORY_DURATION_MS = 24 * 60 * 60 * 1000;

/** Returns true if a story has expired client-side (24h retention). */
export function isStoryExpired(s: Pick<Story, 'expiresAt'>, nowMs: number = Date.now()): boolean {
  return s.expiresAt <= nowMs;
}

/**
 * Group stories by author. Sorted descending by latest createdAt within
 * each group; groups sorted with unviewed-first then by latest activity.
 */
export function groupStoriesByAuthor(stories: StoryWithStats[]): StoryGroup[] {
  const byAuthor = new Map<UserId, StoryWithStats[]>();
  for (const s of stories) {
    const arr = byAuthor.get(s.authorId);
    if (arr === undefined) {
      byAuthor.set(s.authorId, [s]);
    } else {
      arr.push(s);
    }
  }
  const groups: StoryGroup[] = [];
  for (const [authorId, list] of byAuthor) {
    const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt);
    groups.push({
      authorId,
      stories: sorted,
      allViewed: sorted.every((s) => s.iViewed),
    });
  }
  // Unviewed-first (false < true alphabetically — but we want unviewed bucket first).
  groups.sort((a, b) => {
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    const lastA = a.stories[a.stories.length - 1]?.createdAt ?? 0;
    const lastB = b.stories[b.stories.length - 1]?.createdAt ?? 0;
    return lastB - lastA;
  });
  return groups;
}
