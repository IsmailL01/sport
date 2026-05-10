// CreatePost — wraps legacy modules/feed PostComposerScreen в navigation.
// Phase 8 / M5.

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { PostComposerScreen } from '../../../modules/feed';
import { useAuthStore } from '../../../state/auth';
import type { FeedStackParamList } from '../../types';

export function CreatePostScreen() {
  const nav = useNavigation<NativeStackNavigationProp<FeedStackParamList>>();
  const myUserId = useAuthStore((s) => s.user?.id ?? '');
  return (
    <PostComposerScreen
      visible
      myUserId={myUserId}
      onClose={() => nav.goBack()}
      onPosted={() => nav.goBack()}
    />
  );
}
