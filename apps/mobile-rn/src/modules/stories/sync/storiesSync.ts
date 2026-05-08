// modules/stories/sync — sync runners.
//
// Pull:
//   runFeedPull()   — GET /stories/feed → upsert в SQLite + state.
//   runMineRefresh() — GET /stories/me   — для своих видеть viewCount.
//
// Push:
//   runDraftsPush() — пройтись по drafts (status=pending|failed), для каждого:
//                     1. uploadImage() (presigned PUT) → mediaId
//                     2. publishStory() → server story_id
//                     3. promoteDraftToStory() в SQLite + удалить локальный draft
//
// Cleanup:
//   pruneExpired(now) — выкидывает из SQLite stories с expires_at < now.

import {
  insertDraft,
  listPendingDrafts,
  promoteDraftToStory,
  pruneExpired,
  removeStory,
  updateDraftStatus,
  upsertFeedStories,
  upsertViewers,
} from '../storage/storiesRepository';
import type { LocalStoryDraft, StoryWithStats } from '../domain/types';
import { uploadImage } from '../../../sync/mediaUpload';
import type { PickedMedia } from '../../../media/MediaAdapter';
import {
  deleteStoryRemote,
  fetchFeed,
  fetchViewers,
  markViewedRemote,
  publishStory,
} from './storiesApi';

/** Pull active stories of self+followees. */
export async function runFeedPull(): Promise<StoryWithStats[]> {
  const stories = await fetchFeed();
  upsertFeedStories(stories);
  pruneExpired(Date.now());
  return stories;
}

/** Mark viewed: server first; on success — обновить кэш (i_viewed=1). */
export async function runMarkViewed(storyId: string): Promise<void> {
  await markViewedRemote(storyId);
}

/** Pull viewers list (owner). */
export async function runFetchViewers(storyId: string): Promise<void> {
  const viewers = await fetchViewers(storyId);
  upsertViewers(storyId, viewers);
}

export async function runDeleteStory(storyId: string): Promise<void> {
  await deleteStoryRemote(storyId);
  removeStory(storyId);
}

/** Создать draft в SQLite — caller получает clientId, который позже promote-нется. */
export function createDraftFromPicked(
  picked: PickedMedia,
  overlayText: string | null,
): LocalStoryDraft {
  const draft: LocalStoryDraft = {
    clientId: cryptoRandomUUID(),
    localUri: picked.uri,
    mime: picked.mime,
    width: picked.width,
    height: picked.height,
    overlayText,
    createdAt: Date.now(),
    status: 'pending',
    mediaId: null,
    storyId: null,
    attempts: 0,
    lastError: null,
  };
  insertDraft(draft);
  return draft;
}

/**
 * Push pending drafts: per draft do upload→publish→promote.
 * Errors per-draft не блокируют остальные.
 */
export async function runDraftsPush(): Promise<{
  ok: number;
  failed: number;
}> {
  const drafts = listPendingDrafts();
  let ok = 0;
  let failed = 0;

  for (const d of drafts) {
    try {
      updateDraftStatus(d.clientId, { status: 'uploading', attempts: d.attempts + 1 });

      // 1) Upload media (если ещё нет mediaId).
      let mediaId = d.mediaId;
      if (!mediaId) {
        const result = await uploadImage({
          uri: d.localUri,
          mime: d.mime,
          width: d.width,
          height: d.height,
          durationS: null,
          bytes: 0, // unknown — server stat-ит
        });
        mediaId = result.mediaId;
        updateDraftStatus(d.clientId, { mediaId });
      }

      // 2) Publish story с этим media.
      const serverStory = await publishStory({
        mediaId,
        overlayText: d.overlayText,
      });

      // 3) Promote locally.
      promoteDraftToStory(d.clientId, {
        ...serverStory,
        viewCount: 0,
        iViewed: false,
      });

      ok += 1;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.warn('[stories] push draft failed', d.clientId, err);
      updateDraftStatus(d.clientId, { status: 'failed', lastError: err });
      failed += 1;
    }
  }

  return { ok, failed };
}

// Локальный UUID без deps — RN не имеет crypto.randomUUID до 0.79.
function cryptoRandomUUID(): string {
  // Простой v4-совместимый генератор; не criptographic-grade.
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      s += '-';
    } else if (i === 14) {
      s += '4';
    } else if (i === 19) {
      s += hex[(Math.random() * 4) | 0 | 8];
    } else {
      s += hex[(Math.random() * 16) | 0];
    }
  }
  return s;
}
