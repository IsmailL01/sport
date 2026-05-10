// Tab: Лента — реальная имплементация (заменяет FeedScreenStub).
// Phase 8 / M5.
//
// Архитектура:
//   - Reads useFeedStore (modules/feed) + useStoriesStore (modules/stories)
//   - Renders Cursona TopBar + horizontal StoriesRail (StoryRing) + FlatList<RunCard>
//   - Pull-to-refresh + infinite scroll (onEndReached)
//   - Navigate: tap RunCard → PostDetail; tap story → StoryViewer; FAB → CreatePost
//
// Map Post → RunCard:
//   kind=session : full RunCard с metrics (placeholder values до M6 сессий)
//   kind=photo   : RunCard без metrics row (через optional flag)
//   kind=text    : simpler card (всё-таки RunCard но без photo/metrics)
//
// Author info берётся через useUsersStore.getOrFetch (existing cache).
// Cursona-design XP-чип берётся from useXpStore (на текущий момент только
// my own xp; для постов чужих авторов — пока nil; в Phase D extension
// добавим post.xpAwarded чтобы прокидывать XP на момент публикации).

import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Avatar, FAB, Icon, RunCard, StoryRing, TopBar, useTheme, GradeBadge, Card, type RunCardProps } from '../../../design';
import { useAuthStore } from '../../../state/auth';
import { useFeedStore, type Post } from '../../../modules/feed';
import {
  setStoriesSelfUserId,
  useStoriesStore,
  type StoryGroup,
} from '../../../modules/stories';
import { useUsersStore } from '../../../state/social/useUsersStore';
import type { FeedStackParamList } from '../../types';

type FeedNav = NativeStackNavigationProp<FeedStackParamList, 'FeedHome'>;

export function FeedScreen() {
  const t = useTheme();
  const nav = useNavigation<FeedNav>();
  const myUser = useAuthStore((s) => s.user);
  const myUserId = myUser?.id ?? '';

  // Feed
  const posts = useFeedStore((s) => s.posts);
  const loading = useFeedStore((s) => s.loading);
  const loadingMore = useFeedStore((s) => s.loadingMore);
  const refreshFeed = useFeedStore((s) => s.refresh);
  const loadMore = useFeedStore((s) => s.loadMore);
  const hydrateFeed = useFeedStore((s) => s.hydrateFromCache);
  const toggleLike = useFeedStore((s) => s.toggleLike);

  // Stories
  const storyGroups = useStoriesStore((s) => s.groups);
  const refreshStories = useStoriesStore((s) => s.refresh);
  const hydrateStories = useStoriesStore((s) => s.hydrateFromCache);

  useEffect(() => {
    hydrateFeed();
    hydrateStories();
    if (myUserId) setStoriesSelfUserId(myUserId);
    void refreshFeed();
    void refreshStories();
  }, [hydrateFeed, hydrateStories, refreshFeed, refreshStories, myUserId]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar
        brand="cursona"
        trailing={
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable hitSlop={8}>
              <Icon name="search" size={22} color={t.text} />
            </Pressable>
            <Pressable hitSlop={8} style={{ position: 'relative' }}>
              <Icon name="bell" size={22} color={t.text} />
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: t.accent,
                  borderWidth: 2,
                  borderColor: t.bg,
                }}
              />
            </Pressable>
          </View>
        }
      />

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <StoriesRailHeader
            myUserId={myUserId}
            groups={storyGroups}
            onCompose={() => nav.navigate('StoryViewer', { storyId: 'compose' })}
            onOpenGroup={(group, idx) =>
              nav.navigate('StoryViewer', {
                storyId: group.stories[idx]?.id ?? '',
                authorId: group.authorId,
              })
            }
          />
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 12, marginBottom: 16 }}>
            <PostCardAdapter
              post={item}
              myUserId={myUserId}
              onPress={() => nav.navigate('PostDetail', { postId: item.id })}
              onLike={() => {
                void toggleLike(item.id);
              }}
              onComment={() => nav.navigate('PostDetail', { postId: item.id })}
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              void refreshFeed();
              void refreshStories();
            }}
            tintColor={t.text2}
          />
        }
        onEndReached={() => {
          void loadMore();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <FooterSpinner /> : null}
        ListEmptyComponent={
          loading ? null : (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: t.text2, fontSize: 14, fontFamily: t.font }}>
                Пока пусто. Подпишись на бегунов или опубликуй пост.
              </Text>
            </View>
          )
        }
      />

      <FAB
        icon={<Icon name="plus" size={26} color="#FFFFFF" />}
        onPress={() => nav.navigate('CreatePost')}
        style={{ position: 'absolute', right: 16, bottom: 24 }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Stories rail
// ─────────────────────────────────────────────────────────────

function StoriesRailHeader({
  myUserId,
  groups,
  onCompose,
  onOpenGroup,
}: {
  myUserId: string;
  groups: StoryGroup[];
  onCompose: () => void;
  onOpenGroup: (group: StoryGroup, idx: number) => void;
}) {
  // Self group (mine + add button) первым, потом друзья (sorted by unread).
  const self = groups.find((g) => g.authorId === myUserId);
  const others = groups.filter((g) => g.authorId !== myUserId);

  return (
    <View style={{ paddingVertical: 8 }}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(g) => g.authorId}
        data={[
          ...(self ? [self] : [{ authorId: myUserId, stories: [], allViewed: true } as StoryGroup]),
          ...others,
        ]}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}
        renderItem={({ item }) => {
          const isOwn = item.authorId === myUserId;
          const firstStory = item.stories[0];
          return (
            <StoryGroupCell
              authorId={item.authorId}
              firstStorySrc={firstStory ? null /* fetch lazy */ : null}
              isOwn={isOwn}
              hasStories={item.stories.length > 0}
              unread={!item.allViewed}
              onPress={() => {
                if (isOwn && item.stories.length === 0) {
                  onCompose();
                } else {
                  const firstUnseen = item.stories.findIndex((s) => !s.iViewed);
                  onOpenGroup(item, firstUnseen >= 0 ? firstUnseen : 0);
                }
              }}
            />
          );
        }}
      />
    </View>
  );
}

function StoryGroupCell({
  authorId,
  isOwn,
  hasStories,
  unread,
  onPress,
}: {
  authorId: string;
  firstStorySrc: string | null;
  isOwn: boolean;
  hasStories: boolean;
  unread: boolean;
  onPress: () => void;
}) {
  const user = useUsersStore((s) => s.byId[authorId]);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  useEffect(() => {
    if (!isOwn && user === undefined && authorId) {
      void getOrFetch(authorId);
    }
  }, [authorId, user, getOrFetch, isOwn]);

  const name = isOwn ? 'Ты' : user?.displayName ?? user?.username ?? '…';
  // Pravatar fallback (consistent с useUsersStore).
  const src = `https://i.pravatar.cc/100?img=${(Math.abs(hashCode(authorId)) % 70) + 1}`;
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <StoryRing
        src={src}
        name={name}
        unread={unread && hasStories}
        isOwn={isOwn && !hasStories}
        grade={user?.globalRole === 'admin' ? 'S' : undefined}
      />
    </Pressable>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

// ─────────────────────────────────────────────────────────────
// Post → RunCard adapter
// ─────────────────────────────────────────────────────────────

function PostCardAdapter({
  post,
  myUserId,
  onPress,
  onLike,
  onComment,
}: {
  post: Post;
  myUserId: string;
  onPress: () => void;
  onLike: () => void;
  onComment: () => void;
}) {
  const t = useTheme();
  const author = useUsersStore((s) => s.byId[post.authorId]);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);

  useEffect(() => {
    if (author === undefined && post.authorId && post.authorId !== myUserId) {
      void getOrFetch(post.authorId);
    }
  }, [author, getOrFetch, post.authorId, myUserId]);

  const props = useMemo<RunCardProps | null>(() => {
    if (post.kind === 'text') return null; // отдельный рендер ниже
    return {
      author: {
        name: author?.displayName ?? author?.username ?? 'Бегун',
        avatar: undefined, // fallback к pravatar в Avatar
        grade: author?.globalRole === 'admin' ? 'S' : undefined,
      },
      when: formatWhen(post.createdAt),
      location: undefined,
      photo: post.kind === 'photo' ? guessPhotoUrl(post.mediaId) : undefined,
      dist: '16,00', // placeholder до M6 session-fetch
      time: '01:18',
      pace: '04:55',
      xp: 17,
      device: undefined,
      weather: undefined,
      mood: undefined,
      hashtag: extractHashtag(post.body),
      caption: stripHashtag(post.body),
      likes: post.likeCount,
      comments: post.commentCount,
      liked: post.iLiked,
      onPress,
      onLike,
      onComment,
    };
  }, [post, author, onPress, onLike, onComment]);

  if (post.kind === 'text') {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Avatar src={null} size={40} name={author?.displayName ?? post.authorId} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 15, fontWeight: '600', fontFamily: t.font }} numberOfLines={1}>
              {author?.displayName ?? author?.username ?? 'Бегун'}
            </Text>
            <Text style={{ color: t.text3, fontSize: 12, marginTop: 2, fontFamily: t.font }}>
              {formatWhen(post.createdAt)}
            </Text>
          </View>
          {author?.globalRole === 'admin' && <GradeBadge grade="S" size={20} />}
        </View>
        <Pressable onPress={onPress}>
          <Text style={{ color: t.text, fontSize: 15, lineHeight: 22, fontFamily: t.font }}>
            {post.body}
          </Text>
        </Pressable>
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 18 }}>
          <Pressable onPress={onLike} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={post.iLiked ? 'heartFill' : 'heart'} size={18} color={post.iLiked ? t.accent : t.text2} />
            <Text style={{ color: t.text2, fontSize: 13, fontFamily: t.font }}>{post.likeCount}</Text>
          </Pressable>
          <Pressable onPress={onComment} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="comment" size={18} color={t.text2} />
            <Text style={{ color: t.text2, fontSize: 13, fontFamily: t.font }}>{post.commentCount}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }
  if (props === null) return null;
  return <RunCard {...props} />;
}

function FooterSpinner() {
  const t = useTheme();
  return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <Text style={{ color: t.text3, fontSize: 12, fontFamily: t.font }}>Загрузка…</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatWhen(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;
  const d = new Date(ms);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function extractHashtag(body: string | null): string | undefined {
  if (!body) return undefined;
  const m = body.match(/(^|\s)(#\w+)/);
  return m?.[2];
}

function stripHashtag(body: string | null): string | undefined {
  if (!body) return undefined;
  return body.replace(/(^|\s)#\w+/g, '').trim() || undefined;
}

function guessPhotoUrl(_mediaId: string | null): string | undefined {
  // M6+: fetch presigned URL via fetchMediaURL. Placeholder для визуала пока.
  return 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800';
}
