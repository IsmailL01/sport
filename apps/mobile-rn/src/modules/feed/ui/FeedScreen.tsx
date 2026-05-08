// FeedScreen — главный экран ленты Phase D.
// Нейтральный дизайн (без цветовых акцентов).

import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useFeedStore } from '../state/useFeedStore';
import { PostCard } from './PostCard';
import type { Post } from '../domain/types';

type Props = {
  myUserId: string;
  onOpenPost: (post: Post) => void;
  onCompose: () => void;
  onBack?: () => void;
};

export function FeedScreen({ myUserId, onOpenPost, onCompose, onBack }: Props) {
  const posts = useFeedStore((s) => s.posts);
  const loading = useFeedStore((s) => s.loading);
  const loadingMore = useFeedStore((s) => s.loadingMore);
  const refresh = useFeedStore((s) => s.refresh);
  const loadMore = useFeedStore((s) => s.loadMore);
  const hydrate = useFeedStore((s) => s.hydrateFromCache);

  useEffect(() => {
    hydrate();
    void refresh();
  }, [hydrate, refresh]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        ) : <View style={{ width: 32 }} />}
        <Text style={styles.title}>Лента</Text>
        <Pressable onPress={onCompose} hitSlop={10} style={styles.composeBtn}>
          <Text style={styles.composeText}>+</Text>
        </Pressable>
      </View>

      {loading && posts.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : posts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>Лента пуста</Text>
          <Text style={styles.emptySub}>
            Подпишитесь на пользователей, чтобы видеть их посты, или создайте свой
          </Text>
          <Pressable onPress={onCompose} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>Создать пост</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              myUserId={myUserId}
              onPress={() => onOpenPost(item)}
            />
          )}
          onRefresh={refresh}
          refreshing={loading}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ paddingVertical: 16 }} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: '#111827', marginTop: -4 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  composeBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  composeText: { fontSize: 22, color: '#111827', marginTop: -2 },
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  empty: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  emptyBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 6,
  },
  emptyBtnText: { color: '#111827', fontWeight: '600' },
});
