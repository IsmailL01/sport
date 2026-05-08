// Horizontal-scroll кружков «истории» поверх ленты / списка чатов.
// Phase 8 / C — нейтральный дизайн (бордеры, без цветовых акцентов).
//
// UX:
//   - первый кружок = «+» (моя), tap → открыть Composer.
//   - дальше: avatar followee + рамка (просмотрено = серая, нет = яркая чёрная).
//   - tap на followee → StoriesViewer, начиная с первой непросмотренной.

import { useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useUsersStore } from '../../../state/social/useUsersStore';
import { useStoriesStore, setStoriesSelfUserId } from '../state/useStoriesStore';
import type { StoryGroup } from '../domain/types';

type Props = {
  myUserId: string;
  onCompose: () => void;
  onOpenGroup: (group: StoryGroup, startIndex: number) => void;
};

export function StoriesRail({ myUserId, onCompose, onOpenGroup }: Props) {
  const groups = useStoriesStore((s) => s.groups);
  const refresh = useStoriesStore((s) => s.refresh);
  const hydrate = useStoriesStore((s) => s.hydrateFromCache);

  useEffect(() => {
    setStoriesSelfUserId(myUserId);
    hydrate();
    void refresh();
  }, [myUserId, hydrate, refresh]);

  // self group выделяется отдельно (если есть свои активные).
  const selfGroup = groups.find((g) => g.authorId === myUserId);
  const others = groups.filter((g) => g.authorId !== myUserId);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {/* Add-story / self */}
      <SelfCircle
        hasStories={Boolean(selfGroup)}
        allViewed={selfGroup?.allViewed ?? true}
        onCompose={onCompose}
        onView={() => selfGroup && onOpenGroup(selfGroup, 0)}
      />
      {/* Followees */}
      {others.map((g) => (
        <PeerCircle
          key={g.authorId}
          group={g}
          onPress={() => {
            const firstUnseen = g.stories.findIndex((s) => !s.iViewed);
            onOpenGroup(g, firstUnseen >= 0 ? firstUnseen : 0);
          }}
        />
      ))}
    </ScrollView>
  );
}

function SelfCircle({
  hasStories, allViewed, onCompose, onView,
}: {
  hasStories: boolean; allViewed: boolean;
  onCompose: () => void; onView: () => void;
}) {
  return (
    <View style={styles.item}>
      <Pressable
        onPress={hasStories ? onView : onCompose}
        onLongPress={onCompose}
        style={[
          styles.ring,
          hasStories
            ? allViewed ? styles.ringViewed : styles.ringFresh
            : styles.ringEmpty,
        ]}
      >
        <View style={styles.avatar}>
          {hasStories ? (
            <Text style={styles.initial}>я</Text>
          ) : (
            <Text style={styles.plus}>+</Text>
          )}
        </View>
      </Pressable>
      <Text style={styles.name} numberOfLines={1}>
        {hasStories ? 'Моя' : 'Создать'}
      </Text>
    </View>
  );
}

function PeerCircle({
  group, onPress,
}: {
  group: StoryGroup; onPress: () => void;
}) {
  const user = useUsersStore((s) => s.byId[group.authorId]);
  const initial = (user?.displayName ?? user?.username ?? '?')[0]?.toUpperCase();

  return (
    <View style={styles.item}>
      <Pressable
        onPress={onPress}
        style={[styles.ring, group.allViewed ? styles.ringViewed : styles.ringFresh]}
      >
        <View style={styles.avatar}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      </Pressable>
      <Text style={styles.name} numberOfLines={1}>
        {user?.displayName ?? user?.username ?? '…'}
      </Text>
    </View>
  );
}

const RING = 64;
const AVATAR = 56;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    width: RING + 8,
    alignItems: 'center',
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  ringFresh: { borderColor: '#111827' },
  ringViewed: { borderColor: '#D1D5DB' },
  ringEmpty: { borderColor: '#E5E7EB', borderStyle: 'dashed' },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 22,
    fontWeight: '600',
    color: '#374151',
  },
  plus: {
    fontSize: 26,
    color: '#6B7280',
    marginTop: -2,
  },
  name: {
    marginTop: 4,
    fontSize: 11,
    color: '#374151',
    maxWidth: RING + 8,
  },
});
