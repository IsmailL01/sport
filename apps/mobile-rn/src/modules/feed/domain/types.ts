// modules/feed/domain — чистые типы Phase D.

export type PostId = string;
export type CommentId = string;
export type UserId = string;
export type MediaId = string;

export type PostKind = 'text' | 'photo' | 'session';

export type Post = {
  id: PostId;
  authorId: UserId;
  kind: PostKind;
  /** body для text-постов либо caption для photo/session. */
  body: string | null;
  /** Только для kind='photo'. */
  mediaId: MediaId | null;
  /** Только для kind='session' — server session id из activity-sync. */
  sessionRef: string | null;
  likeCount: number;
  commentCount: number;
  /** ms epoch UTC */
  createdAt: number;
  /** ms epoch UTC; null если не редактировали. */
  editedAt: number | null;
  /** Видимое только мне состояние: лайкнул ли я. */
  iLiked: boolean;
};

export type Comment = {
  id: CommentId;
  postId: PostId;
  authorId: UserId;
  body: string;
  createdAt: number;
};

/** Локальный draft поста — пока не отправлен на сервер. */
export type LocalPostDraft = {
  clientId: string;
  authorId: UserId;
  kind: PostKind;
  body: string | null;
  /** Local file URI до upload. */
  mediaLocalUri: string | null;
  /** mime ассоциированной media (когда mediaLocalUri выбран). */
  mediaMime: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  /** Server media_id после upload. */
  mediaId: MediaId | null;
  sessionRef: string | null;
  createdAt: number;
  status: 'pending' | 'uploading' | 'failed';
  attempts: number;
  lastError: string | null;
};

export const POST_BODY_MAX_LENGTH = 4000;
export const COMMENT_BODY_MAX_LENGTH = 2000;
