// Тонкий обёрток над feed-сервисом backend (Phase D).
//
// Server endpoints:
//   POST   /posts                        — create
//   GET    /posts/{id}
//   DELETE /posts/{id}
//   POST   /posts/{id}/likes / DELETE
//   POST   /posts/{id}/comments
//   GET    /posts/{id}/comments?cursor=
//   DELETE /posts/{postId}/comments/{commentId}
//   GET    /feed/home?cursor=

import { apiClient, parseRateLimit } from '../../../auth/apiClient';
import type { Comment, Post, PostKind } from '../domain/types';

/** RateLimitedError — отдельный тип, чтобы UI мог показать Retry-After. */
export class RateLimitedError extends Error {
  retryAfterS: number;
  constructor(retryAfterS: number) {
    super(`rate limited; retry in ${retryAfterS}s`);
    this.name = 'RateLimitedError';
    this.retryAfterS = retryAfterS;
  }
}

type ServerPostDTO = {
  id: string;
  authorId: string;
  kind: 'text' | 'photo' | 'session';
  body?: string | null;
  mediaId?: string | null;
  sessionRef?: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: number;
  editedAt?: number | null;
  iLiked: boolean;
};

type ServerFeedPageDTO = {
  items: ServerPostDTO[];
  nextCursor: string;
};

type ServerCommentDTO = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: number;
};

type ServerCommentsPageDTO = {
  items: ServerCommentDTO[];
  nextCursor: string;
};

function dtoToPost(d: ServerPostDTO): Post {
  return {
    id: d.id,
    authorId: d.authorId,
    kind: d.kind,
    body: d.body ?? null,
    mediaId: d.mediaId ?? null,
    sessionRef: d.sessionRef ?? null,
    likeCount: d.likeCount,
    commentCount: d.commentCount,
    iLiked: d.iLiked,
    createdAt: d.createdAt,
    editedAt: d.editedAt ?? null,
  };
}

function dtoToComment(d: ServerCommentDTO): Comment {
  return {
    id: d.id, postId: d.postId, authorId: d.authorId,
    body: d.body, createdAt: d.createdAt,
  };
}

async function expectJSON<T>(resp: Response, label: string): Promise<T> {
  if (!resp.ok) {
    const rl = parseRateLimit(resp);
    if (rl !== null) throw new RateLimitedError(rl.retryAfterS);
    const text = await resp.text().catch(() => '<unreadable>');
    throw new Error(`${label} failed: ${resp.status} ${text}`);
  }
  return (await resp.json()) as T;
}

export async function createPost(input: {
  kind: PostKind;
  body: string | null;
  mediaId: string | null;
  sessionRef: string | null;
}): Promise<Post> {
  const resp = await apiClient.api('/posts', {
    method: 'POST',
    body: JSON.stringify({
      kind: input.kind,
      body: input.body,
      mediaId: input.mediaId,
      sessionRef: input.sessionRef,
    }),
  });
  const dto = await expectJSON<ServerPostDTO>(resp, 'createPost');
  return dtoToPost(dto);
}

export async function fetchHomeFeed(cursor: string | null = null, limit = 50): Promise<{
  items: Post[]; nextCursor: string | null;
}> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  const resp = await apiClient.api(`/feed/home?${params.toString()}`);
  const page = await expectJSON<ServerFeedPageDTO>(resp, 'fetchHomeFeed');
  return {
    items: page.items.map(dtoToPost),
    nextCursor: page.nextCursor || null,
  };
}

export async function fetchPost(id: string): Promise<Post> {
  const resp = await apiClient.api(`/posts/${id}`);
  return dtoToPost(await expectJSON<ServerPostDTO>(resp, 'fetchPost'));
}

export async function deletePostRemote(id: string): Promise<void> {
  const resp = await apiClient.api(`/posts/${id}`, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`deletePost failed: ${resp.status}`);
  }
}

export async function likeRemote(postId: string): Promise<void> {
  const resp = await apiClient.api(`/posts/${postId}/likes`, {
    method: 'POST', body: JSON.stringify({}),
  });
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`like failed: ${resp.status}`);
  }
}

export async function unlikeRemote(postId: string): Promise<void> {
  const resp = await apiClient.api(`/posts/${postId}/likes`, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`unlike failed: ${resp.status}`);
  }
}

export async function commentRemote(postId: string, body: string): Promise<Comment> {
  const resp = await apiClient.api(`/posts/${postId}/comments`, {
    method: 'POST', body: JSON.stringify({ body }),
  });
  return dtoToComment(await expectJSON<ServerCommentDTO>(resp, 'commentRemote'));
}

export async function fetchComments(postId: string, cursor: string | null = null, limit = 50): Promise<{
  items: Comment[]; nextCursor: string | null;
}> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  const resp = await apiClient.api(`/posts/${postId}/comments?${params.toString()}`);
  const page = await expectJSON<ServerCommentsPageDTO>(resp, 'fetchComments');
  return {
    items: page.items.map(dtoToComment),
    nextCursor: page.nextCursor || null,
  };
}

export async function deleteCommentRemote(postId: string, commentId: string): Promise<void> {
  const resp = await apiClient.api(`/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
  });
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`deleteComment failed: ${resp.status}`);
  }
}
