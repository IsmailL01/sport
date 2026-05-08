// modules/stories/domain — чистые типы Phase C.
//
// Story = одна 24h-история одного автора.
// StoryWithStats = + viewCount + iViewed (мне-ли я её просмотрел) для feed-render.
// StoryViewer = строка "кто посмотрел" в owner-списке.
// LocalStoryDraft = ещё не отправленная на сервер композиция (offline-friendly).
//
// Все timestamp в **миллисекундах epoch UTC**, как везде в Phase A/B mobile-side.

export type StoryId = string;
export type UserId = string;
export type MediaId = string;

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

export type StoryWithStats = Story & {
  viewCount: number;
  /** Видел ли я (текущий пользователь) эту историю. */
  iViewed: boolean;
};

export type StoryViewer = {
  viewerId: UserId;
  /** ms epoch UTC */
  viewedAt: number;
};

/**
 * Группа stories одного автора в feed (UI группирует подряд).
 * Server возвращает плоский список; группировка делается в state-слое.
 */
export type StoryGroup = {
  authorId: UserId;
  stories: StoryWithStats[];
  /** Все ли просмотрены (для двух-цветного кружка в StoriesRail). */
  allViewed: boolean;
};

/** Локальный draft: ещё не запостили на сервер (offline). */
export type LocalStoryDraft = {
  /** UUID v4 на устройстве; client_id для idempotent POST. */
  clientId: string;
  /** local file URI (в кэше app). */
  localUri: string;
  mime: string;
  width: number | null;
  height: number | null;
  overlayText: string | null;
  /** ms epoch — когда юзер нажал «Опубликовать». */
  createdAt: number;
  /** Статус загрузки. */
  status: 'pending' | 'uploading' | 'failed';
  /** Server-side media_id после init-upload. */
  mediaId: MediaId | null;
  /** Финальный story_id после POST /stories. */
  storyId: StoryId | null;
  attempts: number;
  lastError: string | null;
};

export const STORY_OVERLAY_MAX_LENGTH = 200;
export const STORY_DURATION_MS = 24 * 60 * 60 * 1000;
