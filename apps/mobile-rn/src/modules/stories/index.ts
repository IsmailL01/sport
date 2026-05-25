// Public surface модуля `stories`. Phase 11 / STORIES-REVIVAL (revived from
// Phase 8/C original; backend `feed` service on port 8085 reused).
//
// Status (2026-05-25 session 2 of social-yolo-pass):
//   - domain types       ✓
//   - sync (storiesApi)  ✓
//   - state (useStoriesStore) ✓
//   - ui (StoryRingAvatar + StoryTrayHeader) ✓
//   - ui (StoryViewerScreen + StoryCreatorScreen) ⏳ session 3
//   - LocalStoryDraft offline-first persistence ⏳ session 3

export type {
  Story,
  StoryId,
  StoryWithStats,
  StoryViewer,
  StoryGroup,
  LocalStoryDraft,
  UserId,
  MediaId,
} from './domain/types';
export {
  STORY_OVERLAY_MAX_LENGTH,
  STORY_DURATION_MS,
  groupStoriesByAuthor,
  isStoryExpired,
} from './domain/types';

export {
  StoryApiError,
  deleteStory,
  fetchMyStories,
  fetchStoriesFeed,
  fetchStoryViewers,
  markStoryViewed,
  publishStory,
} from './sync/storiesApi';

export { useStoriesStore } from './state/useStoriesStore';

export { StoryRingAvatar } from './ui/StoryRingAvatar';
export type { StoryRingAvatarProps } from './ui/StoryRingAvatar';

export { StoryTrayHeader } from './ui/StoryTrayHeader';
export type { StoryTrayHeaderProps } from './ui/StoryTrayHeader';

export { StoryViewerScreen } from './ui/StoryViewerScreen';
export { StoryCreatorScreen } from './ui/StoryCreatorScreen';
