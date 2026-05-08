// modules/feed/sync — sync runners для Phase D.
//
// Pull:
//   runHomePull(cursor)  — GET /feed/home → upsertPosts.
//   runCommentsPull(id)  — GET /posts/{id}/comments.
//
// Push:
//   runDraftsPush() — для каждого draft kind=photo: upload media, затем POST.
//                     Для text / session: сразу POST.

import { uploadImage } from '../../../sync/mediaUpload';
import {
  insertDraft,
  listPendingDrafts,
  promoteDraftToPost,
  removeComment,
  removePost,
  setLikeLocal,
  updateDraftStatus,
  upsertComments,
  upsertPosts,
} from '../storage/feedRepository';
import type { LocalPostDraft, Post, PostKind } from '../domain/types';
import {
  commentRemote,
  createPost,
  deleteCommentRemote,
  deletePostRemote,
  fetchComments,
  fetchHomeFeed,
  likeRemote,
  unlikeRemote,
} from './feedApi';

export async function runHomePull(cursor: string | null = null): Promise<{
  items: Post[]; nextCursor: string | null;
}> {
  const page = await fetchHomeFeed(cursor);
  upsertPosts(page.items);
  return page;
}

export async function runCommentsPull(postId: string, cursor: string | null = null): Promise<{
  items: { id: string; postId: string; authorId: string; body: string; createdAt: number }[];
  nextCursor: string | null;
}> {
  const page = await fetchComments(postId, cursor);
  upsertComments(postId, page.items);
  return page;
}

export async function runLike(postId: string, prevILiked: boolean): Promise<void> {
  // Optimistic local toggle.
  setLikeLocal(postId, !prevILiked);
  try {
    if (prevILiked) {
      await unlikeRemote(postId);
    } else {
      await likeRemote(postId);
    }
  } catch (e) {
    // Rollback on failure.
    setLikeLocal(postId, prevILiked);
    throw e;
  }
}

export async function runComment(postId: string, body: string): Promise<void> {
  const c = await commentRemote(postId, body);
  upsertComments(postId, [c]);
}

export async function runDeleteComment(postId: string, commentId: string): Promise<void> {
  await deleteCommentRemote(postId, commentId);
  removeComment(commentId);
}

export async function runDeletePost(postId: string): Promise<void> {
  await deletePostRemote(postId);
  removePost(postId);
}

// === Compose / drafts ===

export function createTextDraft(authorId: string, body: string): LocalPostDraft {
  const draft: LocalPostDraft = {
    clientId: cryptoRandomUUID(),
    authorId,
    kind: 'text',
    body,
    mediaLocalUri: null,
    mediaMime: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaId: null,
    sessionRef: null,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
    lastError: null,
  };
  insertDraft(draft);
  return draft;
}

export function createPhotoDraft(authorId: string, params: {
  caption: string | null;
  localUri: string;
  mime: string;
  width: number | null;
  height: number | null;
}): LocalPostDraft {
  const draft: LocalPostDraft = {
    clientId: cryptoRandomUUID(),
    authorId,
    kind: 'photo',
    body: params.caption,
    mediaLocalUri: params.localUri,
    mediaMime: params.mime,
    mediaWidth: params.width,
    mediaHeight: params.height,
    mediaId: null,
    sessionRef: null,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
    lastError: null,
  };
  insertDraft(draft);
  return draft;
}

export function createSessionDraft(authorId: string, sessionRef: string, caption: string | null): LocalPostDraft {
  const draft: LocalPostDraft = {
    clientId: cryptoRandomUUID(),
    authorId,
    kind: 'session',
    body: caption,
    mediaLocalUri: null,
    mediaMime: null,
    mediaWidth: null,
    mediaHeight: null,
    mediaId: null,
    sessionRef,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
    lastError: null,
  };
  insertDraft(draft);
  return draft;
}

/** Push pending drafts: per draft do upload (если photo) → POST /posts → promote. */
export async function runDraftsPush(): Promise<{ ok: number; failed: number }> {
  const drafts = listPendingDrafts();
  let ok = 0;
  let failed = 0;

  for (const d of drafts) {
    try {
      updateDraftStatus(d.clientId, { status: 'uploading', attempts: d.attempts + 1 });

      // Upload media если photo и ещё не загружено.
      let mediaId = d.mediaId;
      if (d.kind === 'photo' && !mediaId && d.mediaLocalUri && d.mediaMime) {
        const result = await uploadImage({
          uri: d.mediaLocalUri,
          mime: d.mediaMime,
          width: d.mediaWidth,
          height: d.mediaHeight,
          durationS: null,
          bytes: 0,
        });
        mediaId = result.mediaId;
        updateDraftStatus(d.clientId, { mediaId });
      }

      const server = await createPost({
        kind: d.kind as PostKind,
        body: d.body,
        mediaId,
        sessionRef: d.sessionRef,
      });
      promoteDraftToPost(d.clientId, server);
      ok += 1;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.warn('[feed] push draft failed', d.clientId, err);
      updateDraftStatus(d.clientId, { status: 'failed', lastError: err });
      failed += 1;
    }
  }
  return { ok, failed };
}

function cryptoRandomUUID(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hex[(Math.random() * 4) | 0 | 8];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}
