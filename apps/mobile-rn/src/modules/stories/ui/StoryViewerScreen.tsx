// StoryViewerScreen — full-screen viewer for one author's stories.
// Phase 11 / STORIES-REVIVAL session 3.
//
// UX (Telegram/Instagram parity):
//   - Full-screen black background
//   - Progress bars across top (one per story in group)
//   - Tap left half → previous story; right half → next
//   - Long-press (any half) → pause progress; release → resume
//   - Swipe down → dismiss (closes screen)
//   - Auto-advance after STORY_DISPLAY_MS (~5s) per story
//   - markViewed fired on first display of each story
//   - Final story reached + auto-advance → goBack (returns to caller)
//
// Media: backend stories return mediaId. For closed-beta we resolve via
// existing media adapter pattern (sync/mediaUpload.fetchMediaURL) — same
// path used by ChatScreen for image messages. Caches presigned URL per
// story for screen lifetime; not refetched until remount.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { fetchMediaURL } from '../../../sync/mediaUpload';
import { useTheme } from '../../../design';
import type { RootStackParamList } from '../../../navigation/types';
import { useStoriesStore } from '../state/useStoriesStore';
import { useUsersStore } from '../../../state/social/useUsersStore';
import { Avatar } from '../../../design';
import { formatChatTime } from '../../../util/timeFormat';

const STORY_DISPLAY_MS = 5_000;
const PROGRESS_BAR_HEIGHT = 2;
const SWIPE_DOWN_DISMISS_THRESHOLD = 80;

type Nav = NativeStackNavigationProp<RootStackParamList, 'StoryViewer'>;
type R = RouteProp<RootStackParamList, 'StoryViewer'>;

export function StoryViewerScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  const authorId = route.params.authorId;
  const startIndex = route.params.startIndex ?? 0;

  const group = useStoriesStore((s) => s.groupForAuthor(authorId));
  const markViewed = useStoriesStore((s) => s.markViewed);
  const peer = useUsersStore((s) => s.byId[authorId]);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);

  const [activeIdx, setActiveIdx] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const lastMarkedRef = useRef<string | null>(null);

  // Fetch peer profile if missing.
  useEffect(() => {
    if (peer === undefined) void getOrFetch(authorId);
  }, [authorId, peer, getOrFetch]);

  const currentStory = group !== null ? group.stories[activeIdx] : null;

  // Resolve media URL for current story.
  useEffect(() => {
    if (currentStory === null || currentStory === undefined) return;
    setMediaUrl(null);
    setMediaError(null);
    let cancelled = false;
    void (async () => {
      try {
        const url = await fetchMediaURL(currentStory.mediaId);
        if (!cancelled) setMediaUrl(url);
      } catch (e) {
        if (!cancelled) {
          setMediaError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStory?.id, currentStory?.mediaId]);

  // Mark viewed on first display of each story (idempotent server-side).
  useEffect(() => {
    if (currentStory === null || currentStory === undefined) return;
    if (lastMarkedRef.current === currentStory.id) return;
    lastMarkedRef.current = currentStory.id;
    void markViewed(currentStory.id);
  }, [currentStory?.id, markViewed]);

  const advance = useCallback(() => {
    if (group === null || group === undefined) return;
    if (activeIdx + 1 >= group.stories.length) {
      nav.goBack();
      return;
    }
    setActiveIdx((i) => i + 1);
    progress.setValue(0);
  }, [group, activeIdx, nav, progress]);

  const goBackOneStory = useCallback(() => {
    setActiveIdx((i) => Math.max(0, i - 1));
    progress.setValue(0);
  }, [progress]);

  // Drive auto-advance animation. Restarts whenever activeIdx changes or
  // paused flips false→true; pauses animation when paused becomes true.
  useEffect(() => {
    if (currentStory === null || currentStory === undefined) return;
    if (mediaUrl === null) return; // wait for media load before timer starts
    if (paused) {
      animationRef.current?.stop();
      return;
    }
    // Resume from current progress value.
    const remaining = STORY_DISPLAY_MS * (1 - ((progress as any)._value ?? 0));
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });
    animationRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) advance();
    });
    return () => {
      anim.stop();
    };
  }, [activeIdx, paused, mediaUrl, advance, progress, currentStory?.id]);

  // Swipe-down to dismiss.
  const swipeY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) swipeY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > SWIPE_DOWN_DISMISS_THRESHOLD) {
          nav.goBack();
        } else {
          Animated.spring(swipeY, { toValue: 0, useNativeDriver: false }).start();
        }
      },
    }),
  ).current;

  const handleTap = (e: GestureResponderEvent) => {
    const { locationX } = e.nativeEvent;
    // Half-screen split:
    //   left third → previous
    //   middle+right → next
    if (locationX < 100) {
      goBackOneStory();
    } else {
      advance();
    }
  };

  if (group === null || group.stories.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.errorText}>Истории недоступны</Text>
        <Pressable onPress={() => nav.goBack()} style={styles.closeBtn}>
          <Text style={{ color: '#fff', fontSize: 28 }}>×</Text>
        </Pressable>
      </View>
    );
  }

  const title = peer?.displayName ?? peer?.username ?? 'Пользователь';
  const isMediaReady = mediaUrl !== null && mediaError === null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: '#000', transform: [{ translateY: swipeY }] },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Media */}
      <Pressable
        onPress={handleTap}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        delayLongPress={200}
        style={StyleSheet.absoluteFillObject}
      >
        {isMediaReady ? (
          <Image
            source={{ uri: mediaUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
          />
        ) : mediaError !== null ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Не удалось загрузить</Text>
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" />
          </View>
        )}

        {/* Overlay text */}
        {currentStory?.overlayText !== null && currentStory?.overlayText !== undefined ? (
          <View style={styles.overlayTextWrap}>
            <Text style={styles.overlayText}>{currentStory.overlayText}</Text>
          </View>
        ) : null}
      </Pressable>

      {/* Top: progress bars + author header */}
      <View style={styles.topBar}>
        <View style={styles.progressRow}>
          {group.stories.map((s, idx) => {
            const isCurrent = idx === activeIdx;
            const isPast = idx < activeIdx;
            return (
              <View key={s.id} style={styles.progressTrack}>
                <Animated.View
                  style={{
                    height: PROGRESS_BAR_HEIGHT,
                    backgroundColor: '#fff',
                    width: isPast
                      ? '100%'
                      : isCurrent
                        ? progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          })
                        : '0%',
                  }}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.headerRow}>
          <Avatar src={peer?.avatarUrl ?? null} name={title} size={32} />
          <Text style={styles.headerName}>{title}</Text>
          <Text style={styles.headerTime}>
            {currentStory !== null ? formatChatTime(currentStory.createdAt) : ''}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => nav.goBack()} hitSlop={12}>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '300' }}>×</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 16,
    padding: 8,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 8,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
  },
  progressTrack: {
    flex: 1,
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: PROGRESS_BAR_HEIGHT,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 8,
  },
  headerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  headerTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  overlayTextWrap: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 12,
  },
  overlayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
