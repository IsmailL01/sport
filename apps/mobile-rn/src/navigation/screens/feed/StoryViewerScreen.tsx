// StoryViewer screen — wraps legacy modules/stories StoriesViewer
// под навигационным wrapper'ом. Phase 8 / M5.
//
// `storyId='compose'` — особый case (открыт composer). Иначе ищем group
// по authorId и автоматически открываем с правильного индекса.

import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { StoriesViewer, StoryComposerScreen, useStoriesStore } from '../../../modules/stories';
import { useAuthStore } from '../../../state/auth';
import type { FeedStackParamList } from '../../types';

export function StoryViewerScreen() {
  const nav = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();
  const route = useRoute<RouteProp<FeedStackParamList, 'StoryViewer'>>();
  const { storyId, authorId } = route.params;
  const myUserId = useAuthStore((s) => s.user?.id ?? '');
  const groups = useStoriesStore((s) => s.groups);

  // Compose entrypoint: открываем StoryComposerScreen.
  if (storyId === 'compose') {
    return (
      <StoryComposerScreen
        visible
        myUserId={myUserId}
        onClose={() => nav.goBack()}
        onPosted={() => nav.goBack()}
      />
    );
  }

  const group = authorId
    ? groups.find((g) => g.authorId === authorId)
    : groups.find((g) => g.stories.some((s) => s.id === storyId));

  if (!group) {
    nav.goBack();
    return null;
  }

  const startIdx = Math.max(0, group.stories.findIndex((s) => s.id === storyId));
  return (
    <StoriesViewer
      visible
      group={group}
      startIndex={startIdx}
      myUserId={myUserId}
      onClose={() => nav.goBack()}
    />
  );
}
