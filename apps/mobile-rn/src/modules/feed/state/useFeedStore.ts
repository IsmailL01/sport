// modules/feed/state — zustand store для ленты Phase D.
//
// Структура:
//   posts        — массив отображаемых постов (DESC по createdAt).
//   nextCursor   — для infinite scroll.
//   loading      — pull-to-refresh / first load.
//   loadingMore  — appending older.
//   commentsByPost — по PostId → Comment[] (для PostDetailScreen).

import { create } from 'zustand';

import type { Comment, LocalPostDraft, Post } from '../domain/types';
import {
  listComments as listCommentsLocal,
  listPosts as listPostsLocal,
  removePost,
  setLikeLocal,
} from '../storage/feedRepository';
import {
  createPhotoDraft,
  createSessionDraft,
  createTextDraft,
  runComment,
  runCommentsPull,
  runDeleteComment,
  runDeletePost,
  runDraftsPush,
  runHomePull,
  runLike,
} from '../sync/feedSync';

type FeedState = {
  posts: Post[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  publishing: boolean;
  error: string | null;
  commentsByPost: Record<string, Comment[]>;

  hydrateFromCache: () => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;

  composeText: (authorId: string, body: string) => Promise<LocalPostDraft>;
  composePhoto: (
    authorId: string,
    params: {
      caption: string | null;
      localUri: string;
      mime: string;
      width: number | null;
      height: number | null;
    },
  ) => Promise<LocalPostDraft>;
  composeSession: (
    authorId: string,
    sessionRef: string,
    caption: string | null,
  ) => Promise<LocalPostDraft>;

  toggleLike: (postId: string) => Promise<void>;
  comment: (postId: string, body: string) => Promise<void>;
  deleteComment: (postId: string, commentId: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  loadComments: (postId: string) => Promise<void>;

  /** Realtime: кто-то лайкнул мой пост. Bump like_count, не трогая iLiked. */
  applyLikeIncoming: (postId: string, _likerId: string) => void;
  /** Realtime: кто-то закомментил мой пост. Bump comment_count. */
  applyCommentIncoming: (postId: string) => void;

  clearAll: () => void;
};

export const useFeedStore = create<FeedState>((set, get) => ({
  posts: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  publishing: false,
  error: null,
  commentsByPost: {},

  hydrateFromCache: () => {
    set({ posts: listPostsLocal() });
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const page = await runHomePull(null);
      set({
        posts: page.items,
        nextCursor: page.nextCursor,
        loading: false,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.warn('[feed] refresh failed', err);
      // Fallback на кэш.
      set({
        posts: listPostsLocal(),
        loading: false,
        error: err,
      });
    }
  },

  loadMore: async () => {
    const { nextCursor, loadingMore, posts } = get();
    if (!nextCursor || loadingMore) return;
    set({ loadingMore: true });
    try {
      const page = await runHomePull(nextCursor);
      // Append с дедупом по id.
      const ids = new Set(posts.map((p) => p.id));
      const append = page.items.filter((p) => !ids.has(p.id));
      set({
        posts: [...posts, ...append],
        nextCursor: page.nextCursor,
        loadingMore: false,
      });
    } catch (e) {
      console.warn('[feed] loadMore failed', e);
      set({ loadingMore: false });
    }
  },

  composeText: async (authorId, body) => {
    set({ publishing: true });
    const draft = createTextDraft(authorId, body);
    void runDraftsPush()
      .then(() => get().refresh())
      .finally(() => set({ publishing: false }));
    return draft;
  },

  composePhoto: async (authorId, params) => {
    set({ publishing: true });
    const draft = createPhotoDraft(authorId, params);
    void runDraftsPush()
      .then(() => get().refresh())
      .finally(() => set({ publishing: false }));
    return draft;
  },

  composeSession: async (authorId, sessionRef, caption) => {
    set({ publishing: true });
    const draft = createSessionDraft(authorId, sessionRef, caption);
    void runDraftsPush()
      .then(() => get().refresh())
      .finally(() => set({ publishing: false }));
    return draft;
  },

  toggleLike: async (postId) => {
    const post = get().posts.find((p) => p.id === postId);
    if (!post) return;
    const prev = post.iLiked;
    // Optimistic update locally.
    setLikeLocal(postId, !prev);
    set({
      posts: get().posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              iLiked: !prev,
              likeCount: Math.max(0, p.likeCount + (prev ? -1 : 1)),
            }
          : p,
      ),
    });
    try {
      await runLike(postId, prev);
    } catch (e) {
      console.warn('[feed] like remote failed', e);
      // Rollback already done by runLike on error.
      set({
        posts: get().posts.map((p) =>
          p.id === postId
            ? { ...p, iLiked: prev, likeCount: Math.max(0, p.likeCount + (prev ? 1 : -1)) }
            : p,
        ),
      });
    }
  },

  comment: async (postId, body) => {
    await runComment(postId, body);
    const cached = listCommentsLocal(postId);
    set({
      commentsByPost: { ...get().commentsByPost, [postId]: cached },
      posts: get().posts.map((p) =>
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
      ),
    });
  },

  deleteComment: async (postId, commentId) => {
    await runDeleteComment(postId, commentId);
    const cached = listCommentsLocal(postId);
    set({
      commentsByPost: { ...get().commentsByPost, [postId]: cached },
      posts: get().posts.map((p) =>
        p.id === postId
          ? { ...p, commentCount: Math.max(0, p.commentCount - 1) }
          : p,
      ),
    });
  },

  deletePost: async (postId) => {
    // Optimistic remove.
    const filtered = get().posts.filter((p) => p.id !== postId);
    set({ posts: filtered });
    try {
      await runDeletePost(postId);
    } catch (e) {
      console.warn('[feed] delete failed; will reappear on next refresh', e);
      void get().refresh();
    } finally {
      removePost(postId);
    }
  },

  loadComments: async (postId) => {
    try {
      await runCommentsPull(postId);
    } catch (e) {
      console.warn('[feed] loadComments failed', e);
    }
    const cached = listCommentsLocal(postId);
    set({
      commentsByPost: { ...get().commentsByPost, [postId]: cached },
    });
  },

  applyLikeIncoming: (postId, _likerId) => {
    // Bump like_count в кэше; iLiked не трогаем — это про меня, а incoming от
    // другого пользователя.
    set({
      posts: get().posts.map((p) =>
        p.id === postId ? { ...p, likeCount: p.likeCount + 1 } : p,
      ),
    });
  },

  applyCommentIncoming: (postId) => {
    set({
      posts: get().posts.map((p) =>
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
      ),
    });
  },

  clearAll: () => {
    set({
      posts: [],
      nextCursor: null,
      loading: false,
      loadingMore: false,
      publishing: false,
      error: null,
      commentsByPost: {},
    });
  },
}));

export type { Post, Comment };
