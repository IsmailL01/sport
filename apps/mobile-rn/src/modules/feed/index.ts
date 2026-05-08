// Public surface модуля `feed`. Внешний код импортирует только отсюда.

export type {
  Comment,
  LocalPostDraft,
  Post,
  PostId,
  CommentId,
  PostKind,
} from './domain/types';

export {
  POST_BODY_MAX_LENGTH,
  COMMENT_BODY_MAX_LENGTH,
} from './domain/types';

export { useFeedStore } from './state/useFeedStore';

export { FeedModal } from './ui/FeedModal';
export { FeedScreen } from './ui/FeedScreen';
export { PostCard } from './ui/PostCard';
export { PostDetailScreen } from './ui/PostDetailScreen';
export { PostComposerScreen } from './ui/PostComposerScreen';

// Compose entry-points (для use-cases вне модуля, напр. auto-share после triggerSync).
export {
  createSessionDraft,
  runDraftsPush,
} from './sync/feedSync';
