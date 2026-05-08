// modules/stories/sync — тонкий обёрток над feed-сервисом backend.
// Все вызовы идут через apiClient (auto-refresh + Authorization headers).
//
// Server endpoints (см. services/backend/feed/internal/handler/http.go):
//   POST   /stories                 — publish (mediaId + overlay)
//   GET    /stories/feed            — мои + подписок
//   GET    /stories/me              — мои
//   POST   /stories/{id}/views      — mark viewed (no-op для owner)
//   GET    /stories/{id}/views      — owner-only viewer list
//   DELETE /stories/{id}            — owner-only soft delete

import { apiClient } from '../../../auth/apiClient';
import type { Story, StoryViewer, StoryWithStats } from '../domain/types';

type ServerStoryDTO = {
  id: string;
  authorId: string;
  mediaId: string;
  overlayText?: string | null;
  createdAt: number; // ms
  expiresAt: number; // ms
  viewCount: number;
  iViewed: boolean;
};

type ServerViewerDTO = {
  viewerId: string;
  viewedAt: number;
};

function dtoToStory(d: ServerStoryDTO): StoryWithStats {
  return {
    id: d.id,
    authorId: d.authorId,
    mediaId: d.mediaId,
    overlayText: d.overlayText ?? null,
    createdAt: d.createdAt,
    expiresAt: d.expiresAt,
    viewCount: d.viewCount,
    iViewed: d.iViewed,
  };
}

async function expectJSON<T>(resp: Response, label: string): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text().catch(() => '<unreadable>');
    throw new Error(`${label} failed: ${resp.status} ${text}`);
  }
  return (await resp.json()) as T;
}

export async function publishStory(input: {
  mediaId: string;
  overlayText: string | null;
}): Promise<Story> {
  const resp = await apiClient.api('/stories', {
    method: 'POST',
    body: JSON.stringify({
      mediaId: input.mediaId,
      overlayText: input.overlayText,
    }),
  });
  const dto = await expectJSON<ServerStoryDTO>(resp, 'publishStory');
  return dtoToStory(dto);
}

export async function fetchFeed(): Promise<StoryWithStats[]> {
  const resp = await apiClient.api('/stories/feed');
  const arr = await expectJSON<ServerStoryDTO[]>(resp, 'fetchFeed');
  return arr.map(dtoToStory);
}

export async function fetchMyStories(): Promise<StoryWithStats[]> {
  const resp = await apiClient.api('/stories/me');
  const arr = await expectJSON<ServerStoryDTO[]>(resp, 'fetchMyStories');
  return arr.map(dtoToStory);
}

export async function markViewedRemote(storyId: string): Promise<void> {
  const resp = await apiClient.api(`/stories/${storyId}/views`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!resp.ok && resp.status !== 204) {
    const text = await resp.text().catch(() => '');
    throw new Error(`markViewed failed: ${resp.status} ${text}`);
  }
}

export async function fetchViewers(storyId: string, limit = 100): Promise<StoryViewer[]> {
  const resp = await apiClient.api(
    `/stories/${storyId}/views?limit=${limit}`,
  );
  const arr = await expectJSON<ServerViewerDTO[]>(resp, 'fetchViewers');
  return arr.map((v) => ({ viewerId: v.viewerId, viewedAt: v.viewedAt }));
}

export async function deleteStoryRemote(storyId: string): Promise<void> {
  const resp = await apiClient.api(`/stories/${storyId}`, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 204) {
    const text = await resp.text().catch(() => '');
    throw new Error(`delete failed: ${resp.status} ${text}`);
  }
}
