// Post detail screen. Phase M5: показывает body + comments inline.
// Reuse existing modules/feed/ui/PostDetailScreen (Phase D) под навигационным wrapper'ом
// для совместимости с RootNavigator.

import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CompositeNavigationProp } from '@react-navigation/native';

import { ScreenErrorBoundary, useTheme } from '../../../design';
import { PostDetailScreen as PostDetailLegacy, useFeedStore } from '../../../modules/feed';
import { useAuthStore } from '../../../state/auth';
import type { FeedStackParamList, RootStackParamList } from '../../types';

type DetailNav = CompositeNavigationProp<
  NativeStackNavigationProp<FeedStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function PostDetailScreen() {
  const t = useTheme();
  const nav = useNavigation<DetailNav>();
  const route = useRoute<RouteProp<FeedStackParamList, 'PostDetail'>>();
  const postId = route.params.postId;
  const myUserId = useAuthStore((s) => s.user?.id ?? '');

  const post = useFeedStore((s) => s.posts.find((p) => p.id === postId));
  const loadComments = useFeedStore((s) => s.loadComments);

  useEffect(() => {
    if (postId) void loadComments(postId);
  }, [postId, loadComments]);

  if (!post) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.text2} />
        <Text style={{ color: t.text3, marginTop: 12, fontFamily: t.font }}>Загрузка…</Text>
      </View>
    );
  }
  return (
    <ScreenErrorBoundary
      fallbackTitle="Не удалось открыть пост"
      onBack={() => nav.goBack()}
    >
      <PostDetailLegacy
        post={post}
        myUserId={myUserId}
        onBack={() => nav.goBack()}
        onAuthorPress={(authorId) => nav.navigate('ForeignProfile', { userId: authorId })}
      />
    </ScreenErrorBoundary>
  );
}
