// Public surface модуля `stories`. Внешний код (UI, App.tsx) импортирует только отсюда.
//
// Pattern: каждый модуль (`modules/<name>/`) экспортирует ровно те API,
// которые нужны другим модулям/UI; всё остальное — internal.
//
// См. план Phase 8 / C — модульная архитектура mobile-side.

export type {
  LocalStoryDraft,
  Story,
  StoryGroup,
  StoryViewer,
  StoryWithStats,
} from './domain/types';

export {
  STORY_DURATION_MS,
  STORY_OVERLAY_MAX_LENGTH,
} from './domain/types';

export { useStoriesStore, setStoriesSelfUserId } from './state/useStoriesStore';

// UI components (re-exported для navigation/тестов).
export { StoriesRail } from './ui/StoriesRail';
export { StoriesViewer } from './ui/StoriesViewer';
export { StoryComposerScreen } from './ui/StoryComposerScreen';
