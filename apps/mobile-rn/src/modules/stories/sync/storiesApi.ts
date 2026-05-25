// modules/stories/sync — wraps backend feed service (Phase 11 / STORIES-REVIVAL).
//
// Backend endpoints (preserved from Phase 8/C original; backend feed service
// on port 8085 still active per ADR-0011 STATE):
//   POST   /stories                — publish (body: clientId, mediaId, overlayText)
//   GET    /stories/me             — my own stories (active + recently expired)
//   GET    /stories/feed           — feed of stories from followees+me
//   GET    /stories/{id}/views     — viewers list (owner-only)
//   POST   /stories/{id}/view      — mark viewed (idempotent per viewer)
//   DELETE /stories/{id}           — delete own story
//
// Story freshness: backend filters expired rows automatically (24h retention
// via cleanup-cron). Client may still receive recently-expired rows mid-cron;
// use isStoryExpired() to filter client-side.

import { apiClient } from '../../../auth/apiClient';
import type {
  Story,
  StoryId,
  StoryViewer,
  StoryWithStats,
} from '../domain/types';

type ServerStoryDTO = {
  id: string;
  authorId: string;
  mediaId: string;
  overlayText?: string | null;
  /** RFC3339 or ms epoch — backend used ms in Phase 8/C; we re-parse defensively. */
  createdAt: number | string;
  expiresAt: number | string;
  viewCount?: number;
  iViewed?: boolean;
};

type ServerStoryViewerDTO = {
  viewerId: string;
  viewedAt: number | string;
};

function parseEpochOrIso(v: number | string): number {
  if (typeof v === 'number') return v;
  return Date.parse(v);
}

function dtoToStory(d: ServerStoryDTO): StoryWithStats {
  return {
    id: d.id,
    authorId: d.authorId,
    mediaId: d.mediaId,
    overlayText: d.overlayText ?? null,
    createdAt: parseEpochOrIso(d.createdAt),
    expiresAt: parseEpochOrIso(d.expiresAt),
    viewCount: d.viewCount ?? 0,
    iViewed: d.iViewed ?? false,
  };
}

export class StoryApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'StoryApiError';
    this.status = status;
  }
}

async function unwrapList<T>(
  resp: Response,
  parseItem: (d: unknown) => T,
): Promise<T[]> {
  if (!resp.ok) {
    throw new StoryApiError(resp.status, `HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as { items?: unknown[] };
  return (body.items ?? []).map(parseItem);
}

/** GET /stories/feed — followees + my own active stories. */
export async function fetchStoriesFeed(): Promise<StoryWithStats[]> {
  const resp = await apiClient.api('/stories/feed', { method: 'GET' });
  return unwrapList(resp, (d) => dtoToStory(d as ServerStoryDTO));
}

/** GET /stories/me — my own active + recently-expired (owner viewer). */
export async function fetchMyStories(): Promise<StoryWithStats[]> {
  const resp = await apiClient.api('/stories/me', { method: 'GET' });
  return unwrapList(resp, (d) => dtoToStory(d as ServerStoryDTO));
}

/** GET /stories/{id}/views — owner-only viewers list. */
export async function fetchStoryViewers(storyId: StoryId): Promise<StoryViewer[]> {
  const resp = await apiClient.api(
    `/stories/${encodeURIComponent(storyId)}/views`,
    { method: 'GET' },
  );
  return unwrapList(resp, (d) => {
    const dto = d as ServerStoryViewerDTO;
    return { viewerId: dto.viewerId, viewedAt: parseEpochOrIso(dto.viewedAt) };
  });
}

/** POST /stories/{id}/view — mark story as viewed (idempotent). */
export async function markStoryViewed(storyId: StoryId): Promise<void> {
  const resp = await apiClient.api(
    `/stories/${encodeURIComponent(storyId)}/view`,
    { method: 'POST' },
  );
  if (!resp.ok && resp.status !== 409 /* already-viewed idempotent */) {
    throw new StoryApiError(resp.status, `mark viewed failed`);
  }
}

/** POST /stories — publish new story (mediaId obtained from MediaAdapter upload). */
export async function publishStory(input: {
  clientId: string;
  mediaId: string;
  overlayText: string | null;
}): Promise<Story> {
  const resp = await apiClient.api('/stories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!resp.ok) {
    throw new StoryApiError(resp.status, `publish failed: HTTP ${resp.status}`);
  }
  const dto = (await resp.json()) as ServerStoryDTO;
  return dtoToStory(dto);
}

/** DELETE /stories/{id} — delete own story. */
export async function deleteStory(storyId: StoryId): Promise<void> {
  const resp = await apiClient.api(
    `/stories/${encodeURIComponent(storyId)}`,
    { method: 'DELETE' },
  );
  if (!resp.ok && resp.status !== 404) {
    throw new StoryApiError(resp.status, `delete failed`);
  }
}
