// modules/stories/storage — SQLite-репозиторий для stories Phase C.
//
// Таблицы (см. database.ts v11):
//   stories — кэш активных stories для offline-режима + статус локальных draft'ов.
//   story_views — local cache «кто просмотрел мою story» (owner only).
//
// Единственная точка доступа к stories-таблицам в SQLite. Стор и sync-runner
// идут только через эти функции — никогда напрямую SQL.

import { getDatabase } from '../../../storage/database';
import type {
  LocalStoryDraft,
  StoryViewer,
  StoryWithStats,
} from '../domain/types';

type StoryRow = {
  id: string;
  author_id: string;
  media_id: string;
  overlay_text: string | null;
  created_at: number;
  expires_at: number;
  view_count: number;
  i_viewed: number;
  // Draft fields:
  client_id: string | null;
  local_uri: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  status: string | null;
  attempts: number | null;
  last_error: string | null;
  is_draft: number;
};

function rowToStory(r: StoryRow): StoryWithStats {
  return {
    id: r.id,
    authorId: r.author_id,
    mediaId: r.media_id,
    overlayText: r.overlay_text,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    viewCount: r.view_count,
    iViewed: r.i_viewed === 1,
  };
}

function rowToDraft(r: StoryRow): LocalStoryDraft | null {
  if (r.is_draft !== 1 || r.client_id === null) return null;
  return {
    clientId: r.client_id,
    localUri: r.local_uri ?? '',
    mime: r.mime ?? 'image/jpeg',
    width: r.width,
    height: r.height,
    overlayText: r.overlay_text,
    createdAt: r.created_at,
    status: (r.status as 'pending' | 'uploading' | 'failed') ?? 'pending',
    mediaId: r.media_id || null,
    storyId: r.id.startsWith('draft:') ? null : r.id,
    attempts: r.attempts ?? 0,
    lastError: r.last_error,
  };
}

/** Replace local cache of feed-stories. Called after pull. */
export function upsertFeedStories(stories: StoryWithStats[]): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    for (const s of stories) {
      db.runSync(
        `INSERT INTO stories
           (id, author_id, media_id, overlay_text, created_at, expires_at,
            view_count, i_viewed, is_draft)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           view_count = excluded.view_count,
           i_viewed   = excluded.i_viewed,
           overlay_text = excluded.overlay_text,
           expires_at = excluded.expires_at`,
        [
          s.id,
          s.authorId,
          s.mediaId,
          s.overlayText,
          s.createdAt,
          s.expiresAt,
          s.viewCount,
          s.iViewed ? 1 : 0,
        ],
      );
    }
  });
}

/** Read all non-draft stories that are not expired. */
export function listActiveStories(nowMs: number): StoryWithStats[] {
  const db = getDatabase();
  const rows = db.getAllSync<StoryRow>(
    `SELECT * FROM stories WHERE is_draft = 0 AND expires_at > ? ORDER BY created_at DESC`,
    [nowMs],
  );
  return rows.map(rowToStory);
}

/** Mark `iViewed=1` locally — instant UI feedback while sync runs. */
export function markViewedLocal(storyId: string): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE stories SET i_viewed = 1 WHERE id = ? AND is_draft = 0`,
    [storyId],
  );
}

/** Soft-remove locally (called after server delete, or owner mass-cleanup). */
export function removeStory(storyId: string): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM stories WHERE id = ?`, [storyId]);
  db.runSync(`DELETE FROM story_views WHERE story_id = ?`, [storyId]);
}

/** Drop stories with `expires_at < nowMs`. Cron-like cleanup. */
export function pruneExpired(nowMs: number): number {
  const db = getDatabase();
  const r = db.runSync(
    `DELETE FROM stories WHERE expires_at < ? AND is_draft = 0`,
    [nowMs],
  );
  return r.changes;
}

// === Drafts (local-only до push) ===

export function insertDraft(d: LocalStoryDraft): void {
  const db = getDatabase();
  // id для draft = "draft:<clientId>"; станет server uuid после push.
  const draftId = `draft:${d.clientId}`;
  db.runSync(
    `INSERT INTO stories
       (id, author_id, media_id, overlay_text, created_at, expires_at,
        view_count, i_viewed, is_draft,
        client_id, local_uri, mime, width, height, status, attempts, last_error)
     VALUES (?, '', ?, ?, ?, ?, 0, 1, 1,
             ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      draftId,
      d.mediaId ?? '',
      d.overlayText,
      d.createdAt,
      d.createdAt + 24 * 60 * 60 * 1000,
      d.clientId,
      d.localUri,
      d.mime,
      d.width,
      d.height,
      d.status,
      d.attempts,
      d.lastError,
    ],
  );
}

export function listPendingDrafts(): LocalStoryDraft[] {
  const db = getDatabase();
  const rows = db.getAllSync<StoryRow>(
    `SELECT * FROM stories WHERE is_draft = 1 AND status IN ('pending','failed')
     ORDER BY created_at ASC`,
  );
  return rows.map(rowToDraft).filter((d): d is LocalStoryDraft => d !== null);
}

export function updateDraftStatus(
  clientId: string,
  patch: Partial<{
    status: LocalStoryDraft['status'];
    mediaId: string | null;
    attempts: number;
    lastError: string | null;
  }>,
): void {
  const db = getDatabase();
  const fields: string[] = [];
  const vals: (string | number | null)[] = [];
  if (patch.status !== undefined) {
    fields.push('status = ?');
    vals.push(patch.status);
  }
  if (patch.mediaId !== undefined) {
    fields.push('media_id = ?');
    vals.push(patch.mediaId ?? '');
  }
  if (patch.attempts !== undefined) {
    fields.push('attempts = ?');
    vals.push(patch.attempts);
  }
  if (patch.lastError !== undefined) {
    fields.push('last_error = ?');
    vals.push(patch.lastError);
  }
  if (fields.length === 0) return;
  vals.push(clientId);
  db.runSync(
    `UPDATE stories SET ${fields.join(', ')} WHERE client_id = ? AND is_draft = 1`,
    vals,
  );
}

/** Promote a draft to a real (server-acknowledged) story row. */
export function promoteDraftToStory(
  clientId: string,
  serverStory: StoryWithStats,
): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM stories WHERE client_id = ? AND is_draft = 1`, [
      clientId,
    ]);
    db.runSync(
      `INSERT INTO stories
         (id, author_id, media_id, overlay_text, created_at, expires_at,
          view_count, i_viewed, is_draft)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         view_count = excluded.view_count`,
      [
        serverStory.id,
        serverStory.authorId,
        serverStory.mediaId,
        serverStory.overlayText,
        serverStory.createdAt,
        serverStory.expiresAt,
        serverStory.viewCount,
        serverStory.iViewed ? 1 : 0,
      ],
    );
  });
}

// === Viewers cache (owner only) ===

export function upsertViewers(
  storyId: string,
  viewers: StoryViewer[],
): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM story_views WHERE story_id = ?`, [storyId]);
    for (const v of viewers) {
      db.runSync(
        `INSERT INTO story_views (story_id, viewer_id, viewed_at) VALUES (?, ?, ?)`,
        [storyId, v.viewerId, v.viewedAt],
      );
    }
  });
}

export function listViewers(storyId: string): StoryViewer[] {
  const db = getDatabase();
  const rows = db.getAllSync<{ viewer_id: string; viewed_at: number }>(
    `SELECT viewer_id, viewed_at FROM story_views
     WHERE story_id = ? ORDER BY viewed_at DESC`,
    [storyId],
  );
  return rows.map((r) => ({ viewerId: r.viewer_id, viewedAt: r.viewed_at }));
}

/** Полный wipe (на logout). */
export function clearAll(): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM stories`);
    db.runSync(`DELETE FROM story_views`);
  });
}
