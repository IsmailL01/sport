// PostCard — карточка поста в FeedScreen / PostDetailScreen.
// Нейтральный дизайн. Phase E: long-press → ActionSheet с «Пожаловаться».

import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Post } from '../domain/types';
import { useFeedStore } from '../state/useFeedStore';
import { useUsersStore } from '../../../state/social/useUsersStore';
import { fetchMediaURL } from '../../../sync/mediaUpload';
import { ReportSheet } from '../../moderation';

type Props = {
  post: Post;
  myUserId: string;
  onPress?: () => void;
  /** Если true — текст body не урезается (для PostDetailScreen). */
  expanded?: boolean;
};

export function PostCard({ post, myUserId, onPress, expanded }: Props) {
  const author = useUsersStore((s) => s.byId[post.authorId]);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const deletePost = useFeedStore((s) => s.deletePost);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (author === undefined && post.authorId) {
      getOrFetch(post.authorId);
    }
  }, [post.authorId, author, getOrFetch]);

  useEffect(() => {
    let cancelled = false;
    if (post.mediaId) {
      fetchMediaURL(post.mediaId).then((u) => {
        if (!cancelled) setMediaUrl(u);
      });
    }
    return () => { cancelled = true; };
  }, [post.mediaId]);

  const isMine = post.authorId === myUserId;
  const authorName =
    author?.displayName ?? author?.username ?? post.authorId.slice(0, 6);

  const onLongPressMenu = () => {
    if (isMine) {
      Alert.alert('Действия', undefined, [
        { text: 'Удалить', style: 'destructive', onPress: () => { void deletePost(post.id); } },
        { text: 'Отмена', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Действия', undefined, [
        {
          text: 'Пожаловаться',
          style: 'destructive',
          onPress: () => setReportOpen(true),
        },
        { text: 'Отмена', style: 'cancel' },
      ]);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPressMenu}
      disabled={!onPress}
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{authorName[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.authorName} numberOfLines={1}>{authorName}</Text>
          <Text style={styles.timeAgo}>{formatAgo(Date.now() - post.createdAt)}</Text>
        </View>
        {isMine && (
          <Pressable
            hitSlop={10}
            onPress={() => {
              void deletePost(post.id);
            }}
            style={styles.deleteBtn}
          >
            <Text style={styles.deleteText}>×</Text>
          </Pressable>
        )}
      </View>

      {post.kind === 'photo' && mediaUrl ? (
        <Image source={{ uri: mediaUrl }} style={styles.image} resizeMode="cover" />
      ) : null}
      {post.kind === 'photo' && !mediaUrl ? (
        <View style={[styles.image, styles.imageLoading]}>
          <Text style={styles.imageLoadingText}>Загрузка…</Text>
        </View>
      ) : null}

      {post.kind === 'session' ? (
        <View style={styles.sessionTile}>
          <Text style={styles.sessionLabel}>🏃 Пробежка</Text>
          <Text style={styles.sessionRef} numberOfLines={1}>
            #{post.sessionRef?.slice(0, 8)}…
          </Text>
        </View>
      ) : null}

      {post.body !== null && post.body.length > 0 ? (
        <Text
          style={styles.body}
          numberOfLines={expanded ? undefined : 6}
        >
          {post.body}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            void toggleLike(post.id);
          }}
          style={styles.actionBtn}
          hitSlop={10}
        >
          <Text style={[styles.actionText, post.iLiked && styles.actionTextActive]}>
            {post.iLiked ? '♥' : '♡'} {post.likeCount}
          </Text>
        </Pressable>
        <Pressable
          onPress={onPress}
          style={styles.actionBtn}
          hitSlop={10}
        >
          <Text style={styles.actionText}>💬 {post.commentCount}</Text>
        </Pressable>
      </View>

      <ReportSheet
        visible={reportOpen}
        targetKind="post"
        targetId={post.id}
        targetLabel={post.body?.slice(0, 80) ?? `пост от ${authorName}`}
        onClose={() => setReportOpen(false)}
      />
    </Pressable>
  );
}

function formatAgo(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} д`;
  return new Date(Date.now() - ms).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#374151', fontWeight: '700' },
  headerText: { flex: 1 },
  authorName: { color: '#111827', fontSize: 14, fontWeight: '600' },
  timeAgo: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  deleteBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  deleteText: { fontSize: 22, color: '#9CA3AF', marginTop: -4 },
  image: {
    width: '100%', aspectRatio: 1,
    marginTop: 8, marginBottom: 4,
    backgroundColor: '#F3F4F6',
  },
  imageLoading: { alignItems: 'center', justifyContent: 'center' },
  imageLoadingText: { color: '#9CA3AF', fontSize: 12 },
  sessionTile: {
    marginTop: 8, marginHorizontal: 16,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  sessionLabel: { fontSize: 13, color: '#111827', fontWeight: '600' },
  sessionRef: { fontSize: 12, color: '#6B7280', flex: 1 },
  body: {
    color: '#111827', fontSize: 14, lineHeight: 20,
    paddingHorizontal: 16, paddingTop: 8,
  },
  actions: {
    flexDirection: 'row', gap: 16,
    paddingHorizontal: 16, paddingTop: 10,
  },
  actionBtn: { paddingVertical: 4 },
  actionText: { color: '#6B7280', fontSize: 14 },
  actionTextActive: { color: '#111827', fontWeight: '600' },
});
