// Full-screen viewer для одной группы stories (один автор, несколько штук подряд).
// Phase 8 / C — нейтральный дизайн.
//
// Жесты:
//   - tap на левой половине экрана: previous story (внутри группы)
//   - tap на правой половине: next story (внутри группы)
//   - swipe-down или нажатие × сверху: close
//   - long-press: pause auto-advance
//
// Auto-advance: 5 секунд на image. Прогресс-бары сверху отражают current.
// Mark viewed: при показе каждой story → store.markViewed(id).
//
// Без зависимостей от reanimated/gesture-handler — простой Animated API.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { fetchMediaURL } from '../../../sync/mediaUpload';
import { useUsersStore } from '../../../state/social/useUsersStore';
import { useStoriesStore } from '../state/useStoriesStore';
import type { StoryGroup, StoryViewer, StoryWithStats } from '../domain/types';

const STORY_DURATION_MS = 5000;

type Props = {
  visible: boolean;
  group: StoryGroup;
  startIndex: number;
  myUserId: string;
  onClose: () => void;
  onRequestNextGroup?: () => void;
  onRequestPrevGroup?: () => void;
};

export function StoriesViewer({
  visible, group, startIndex, myUserId, onClose,
  onRequestNextGroup, onRequestPrevGroup,
}: Props) {
  const [idx, setIdx] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const story = group.stories[idx] ?? null;

  const markViewed = useStoriesStore((s) => s.markViewed);

  // Reset на смену group / startIndex.
  useEffect(() => {
    if (visible) setIdx(startIndex);
  }, [visible, startIndex, group.authorId]);

  // Auto-advance + mark viewed.
  useEffect(() => {
    if (!visible || !story) return;
    if (!story.iViewed) {
      void markViewed(story.id);
    }
    progress.setValue(0);
    if (paused) return;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      next();
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, paused, visible, story?.id]);

  const next = useCallback(() => {
    if (idx < group.stories.length - 1) {
      setIdx(idx + 1);
    } else if (onRequestNextGroup) {
      onRequestNextGroup();
    } else {
      onClose();
    }
  }, [idx, group.stories.length, onRequestNextGroup, onClose]);

  const prev = useCallback(() => {
    if (idx > 0) {
      setIdx(idx - 1);
    } else if (onRequestPrevGroup) {
      onRequestPrevGroup();
    }
  }, [idx, onRequestPrevGroup]);

  if (!visible || !story) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <ProgressBars total={group.stories.length} activeIdx={idx} progress={progress} />
        <Header
          authorId={story.authorId}
          createdAt={story.createdAt}
          isMine={story.authorId === myUserId}
          onClose={onClose}
        />
        <ViewerImage story={story} />
        {story.overlayText !== null && story.overlayText.length > 0 ? (
          <View style={styles.overlayWrap}>
            <Text style={styles.overlayText}>{story.overlayText}</Text>
          </View>
        ) : null}
        {/* Tap zones (поверх image, под header). */}
        <View style={styles.tapZones} pointerEvents="box-none">
          <Pressable
            style={styles.tapHalf}
            onPress={prev}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
          <Pressable
            style={styles.tapHalf}
            onPress={next}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
        </View>
        {story.authorId === myUserId ? (
          <OwnerFooter story={story} />
        ) : null}
      </View>
    </Modal>
  );
}

function ProgressBars({
  total, activeIdx, progress,
}: { total: number; activeIdx: number; progress: Animated.Value }) {
  return (
    <View style={styles.barsRow}>
      {Array.from({ length: total }).map((_, i) => {
        const fill = i < activeIdx ? 1 : i === activeIdx ? null : 0;
        return (
          <View key={i} style={styles.barTrack}>
            {fill === null ? (
              <Animated.View
                style={[
                  styles.barFill,
                  {
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            ) : (
              <View style={[styles.barFill, { width: `${fill * 100}%` }]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function Header({
  authorId, createdAt, isMine, onClose,
}: {
  authorId: string; createdAt: number; isMine: boolean; onClose: () => void;
}) {
  const user = useUsersStore((s) => s.byId[authorId]);
  const name = isMine ? 'Я' : user?.displayName ?? user?.username ?? '…';
  const ago = formatAgo(Date.now() - createdAt);

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerInitial}>{name[0]?.toUpperCase()}</Text>
        </View>
        <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
        <Text style={styles.headerAgo}>{ago}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
  );
}

function ViewerImage({ story }: { story: StoryWithStats }) {
  const { width, height } = useWindowDimensions();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (story.id.startsWith('draft:')) {
      // TODO: показывать local URI из draft. В MVP — просто placeholder.
      return;
    }
    fetchMediaURL(story.mediaId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => { cancelled = true; };
  }, [story.mediaId, story.id]);

  if (!url) {
    return (
      <View style={[styles.image, { width, height }]}>
        <Text style={styles.loading}>Загрузка…</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={[styles.image, { width, height }]}
      resizeMode="contain"
    />
  );
}

function OwnerFooter({ story }: { story: StoryWithStats }) {
  const [open, setOpen] = useState(false);
  const viewers = useStoriesStore((s) => s.viewersByStory[story.id] ?? []);
  const loadViewers = useStoriesStore((s) => s.loadViewers);
  const deleteOwn = useStoriesStore((s) => s.deleteOwn);

  return (
    <View style={styles.ownerFooter}>
      <Pressable
        onPress={() => {
          setOpen(true);
          void loadViewers(story.id);
        }}
        style={styles.viewersBtn}
      >
        <Text style={styles.viewersText}>👁 {story.viewCount}</Text>
      </Pressable>
      <Pressable
        onPress={() => deleteOwn(story.id)}
        style={styles.deleteBtn}
      >
        <Text style={styles.deleteText}>Удалить</Text>
      </Pressable>
      {open ? (
        <View style={styles.viewersSheet}>
          <Text style={styles.sheetTitle}>Кто посмотрел</Text>
          {viewers.length === 0 ? (
            <Text style={styles.sheetEmpty}>Пока никто</Text>
          ) : (
            viewers.map((v) => (
              <ViewerRow key={v.viewerId} v={v} />
            ))
          )}
          <Pressable onPress={() => setOpen(false)} style={styles.sheetClose}>
            <Text style={styles.sheetCloseText}>Закрыть</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ViewerRow({ v }: { v: StoryViewer }) {
  const user = useUsersStore((s) => s.byId[v.viewerId]);
  return (
    <View style={styles.viewerRow}>
      <View style={styles.viewerAvatar}>
        <Text style={styles.viewerInitial}>
          {(user?.displayName ?? user?.username ?? '?')[0]?.toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.viewerName}>
          {user?.displayName ?? user?.username ?? v.viewerId.slice(0, 6)}
        </Text>
        <Text style={styles.viewerTime}>{formatAgo(Date.now() - v.viewedAt)}</Text>
      </View>
    </View>
  );
}

function formatAgo(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.floor(h / 24);
  return `${d} д`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  image: { position: 'absolute', top: 0, left: 0 },
  barsRow: {
    position: 'absolute', top: 36, left: 8, right: 8, zIndex: 3,
    flexDirection: 'row', gap: 4,
  },
  barTrack: {
    flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1.5,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: '#FFFFFF' },
  header: {
    position: 'absolute', top: 50, left: 12, right: 12, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  headerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerInitial: { color: '#FFFFFF', fontWeight: '600' },
  headerName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', maxWidth: 160 },
  headerAgo: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  closeBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 30, marginTop: -4 },
  overlayWrap: {
    position: 'absolute', bottom: 100, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 8, zIndex: 2,
  },
  overlayText: { color: '#FFFFFF', fontSize: 16 },
  tapZones: {
    position: 'absolute', top: 80, left: 0, right: 0, bottom: 80,
    flexDirection: 'row', zIndex: 1,
  },
  tapHalf: { flex: 1 },
  loading: { color: '#FFFFFF', textAlign: 'center', marginTop: 200 },
  ownerFooter: {
    position: 'absolute', bottom: 24, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', zIndex: 4,
  },
  viewersBtn: { padding: 12 },
  viewersText: { color: '#FFFFFF', fontSize: 16 },
  deleteBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 6,
  },
  deleteText: { color: '#FFFFFF', fontSize: 14 },
  viewersSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', padding: 16, maxHeight: '60%',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#111827' },
  sheetEmpty: { color: '#6B7280', textAlign: 'center', padding: 20 },
  viewerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  viewerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  viewerInitial: { color: '#374151', fontWeight: '600' },
  viewerName: { color: '#111827', fontSize: 14 },
  viewerTime: { color: '#6B7280', fontSize: 12 },
  sheetClose: {
    marginTop: 12, padding: 10, borderRadius: 6,
    backgroundColor: '#F3F4F6', alignItems: 'center',
  },
  sheetCloseText: { color: '#111827', fontWeight: '600' },
});
