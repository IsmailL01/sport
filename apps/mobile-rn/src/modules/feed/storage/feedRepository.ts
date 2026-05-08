// modules/feed/storage — SQLite-репозиторий для feed Phase D.

import { getDatabase } from '../../../storage/database';
import type {
  Comment,
  LocalPostDraft,
  Post,
} from '../domain/types';

type PostRow = {
  id: string;
  author_id: string;
  kind: string;
  body: string | null;
  media_id: string | null;
  media_local_uri: string | null;
  media_mime: string | null;
  media_width: number | null;
  media_height: number | null;
  session_ref: string | null;
  like_count: number;
  comment_count: number;
  i_liked: number;
  created_at: number;
  edited_at: number | null;
  is_draft: number;
  client_id: string | null;
  status: string | null;
  attempts: number | null;
  last_error: string | null;
};

function rowToPost(r: PostRow): Post {
  return {
    id: r.id,
    authorId: r.author_id,
    kind: r.kind as Post['kind'],
    body: r.body,
    mediaId: r.media_id,
    sessionRef: r.session_ref,
    likeCount: r.like_count,
    commentCount: r.comment_count,
    iLiked: r.i_liked === 1,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  };
}

function rowToDraft(r: PostRow): LocalPostDraft | null {
  if (r.is_draft !== 1 || r.client_id === null) return null;
  return {
    clientId: r.client_id,
    authorId: r.author_id,
    kind: r.kind as LocalPostDraft['kind'],
    body: r.body,
    mediaLocalUri: r.media_local_uri,
    mediaMime: r.media_mime,
    mediaWidth: r.media_width,
    mediaHeight: r.media_height,
    mediaId: r.media_id,
    sessionRef: r.session_ref,
    createdAt: r.created_at,
    status: (r.status as LocalPostDraft['status']) ?? 'pending',
    attempts: r.attempts ?? 0,
    lastError: r.last_error,
  };
}

/** Replace cache after successful pull — drafts остаются нетронутыми. */
export function upsertPosts(posts: Post[]): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    for (const p of posts) {
      db.runSync(
        `INSERT INTO feed_posts
           (id, author_id, kind, body, media_id, session_ref,
            like_count, comment_count, i_liked,
            created_at, edited_at, is_draft)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           body = excluded.body,
           like_count = excluded.like_count,
           comment_count = excluded.comment_count,
           i_liked = excluded.i_liked,
           edited_at = excluded.edited_at`,
        [
          p.id, p.authorId, p.kind, p.body, p.mediaId, p.sessionRef,
          p.likeCount, p.commentCount, p.iLiked ? 1 : 0,
          p.createdAt, p.editedAt,
        ],
      );
    }
  });
}

export function listPosts(limit = 200): Post[] {
  const db = getDatabase();
  const rows = db.getAllSync<PostRow>(
    `SELECT * FROM feed_posts WHERE is_draft = 0 ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(rowToPost);
}

export function getPost(id: string): Post | null {
  const db = getDatabase();
  const r = db.getFirstSync<PostRow>(
    `SELECT * FROM feed_posts WHERE id = ? AND is_draft = 0`,
    [id],
  );
  return r ? rowToPost(r) : null;
}

export function removePost(id: string): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM feed_posts WHERE id = ?`, [id]);
  db.runSync(`DELETE FROM feed_comments WHERE post_id = ?`, [id]);
}

export function setLikeLocal(id: string, iLiked: boolean): void {
  const db = getDatabase();
  // Bump count optimistic'ом — server перезатрёт на pull.
  if (iLiked) {
    db.runSync(
      `UPDATE feed_posts
       SET i_liked = 1, like_count = like_count + 1
       WHERE id = ? AND is_draft = 0 AND i_liked = 0`,
      [id],
    );
  } else {
    db.runSync(
      `UPDATE feed_posts
       SET i_liked = 0, like_count = MAX(0, like_count - 1)
       WHERE id = ? AND is_draft = 0 AND i_liked = 1`,
      [id],
    );
  }
}

// === Drafts ===

export function insertDraft(d: LocalPostDraft): void {
  const db = getDatabase();
  const draftId = `draft:${d.clientId}`;
  db.runSync(
    `INSERT INTO feed_posts
       (id, author_id, kind, body, media_id, media_local_uri, media_mime,
        media_width, media_height, session_ref,
        like_count, comment_count, i_liked,
        created_at, edited_at, is_draft, client_id, status, attempts, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, 1, ?, ?, ?, ?)`,
    [
      draftId, d.authorId, d.kind, d.body, d.mediaId, d.mediaLocalUri, d.mediaMime,
      d.mediaWidth, d.mediaHeight, d.sessionRef,
      d.createdAt,
      d.clientId, d.status, d.attempts, d.lastError,
    ],
  );
}

export function listPendingDrafts(): LocalPostDraft[] {
  const db = getDatabase();
  const rows = db.getAllSync<PostRow>(
    `SELECT * FROM feed_posts WHERE is_draft = 1 AND status IN ('pending','failed')
     ORDER BY created_at ASC`,
  );
  return rows.map(rowToDraft).filter((d): d is LocalPostDraft => d !== null);
}

export function updateDraftStatus(
  clientId: string,
  patch: Partial<{
    status: LocalPostDraft['status'];
    mediaId: string | null;
    attempts: number;
    lastError: string | null;
  }>,
): void {
  const db = getDatabase();
  const fields: string[] = [];
  const vals: (string | number | null)[] = [];
  if (patch.status !== undefined) { fields.push('status = ?'); vals.push(patch.status); }
  if (patch.mediaId !== undefined) { fields.push('media_id = ?'); vals.push(patch.mediaId); }
  if (patch.attempts !== undefined) { fields.push('attempts = ?'); vals.push(patch.attempts); }
  if (patch.lastError !== undefined) { fields.push('last_error = ?'); vals.push(patch.lastError); }
  if (fields.length === 0) return;
  vals.push(clientId);
  db.runSync(
    `UPDATE feed_posts SET ${fields.join(', ')} WHERE client_id = ? AND is_draft = 1`,
    vals,
  );
}

export function promoteDraftToPost(clientId: string, server: Post): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM feed_posts WHERE client_id = ? AND is_draft = 1`, [clientId]);
    upsertPosts([server]);
  });
}

// === Comments ===

export function upsertComments(postId: string, items: Comment[]): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    for (const c of items) {
      db.runSync(
        `INSERT INTO feed_comments (id, post_id, author_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET body = excluded.body`,
        [c.id, c.postId, c.authorId, c.body, c.createdAt],
      );
    }
    // Удалить локально удалённые серверные комменты — для простоты не делаем
    // здесь автоматически; вызовы DELETE приходят отдельно.
    void postId;
  });
}

export function listComments(postId: string, limit = 100): Comment[] {
  const db = getDatabase();
  const rows = db.getAllSync<{
    id: string; post_id: string; author_id: string; body: string; created_at: number;
  }>(
    `SELECT * FROM feed_comments WHERE post_id = ? ORDER BY created_at DESC LIMIT ?`,
    [postId, limit],
  );
  return rows.map((r) => ({
    id: r.id, postId: r.post_id, authorId: r.author_id, body: r.body,
    createdAt: r.created_at,
  }));
}

export function removeComment(id: string): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM feed_comments WHERE id = ?`, [id]);
}

export function clearAll(): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM feed_posts`);
    db.runSync(`DELETE FROM feed_comments`);
  });
}
