// Skeleton — minimal shimmer placeholder for first-load states.
// Reused across ChatsListScreen (row skeletons) + ChatScreen (bubble
// skeletons) + future surfaces (Journal/Profile).
//
// Design tenets:
//   - Pure RN Animated (no extra deps; bundle stays lean)
//   - Native driver where possible (useNativeDriver: true on opacity loop)
//   - Honors theme.surface2 for shimmer base; theme.divider for highlight
//   - `style` prop accepts any ViewStyle, so callers control size/shape

import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type SkeletonProps = {
  /** Width/height/borderRadius/margin etc. all flow through style. */
  style?: StyleProp<ViewStyle>;
  /** Optional explicit shape — `circle` sets borderRadius from min(width,height). */
  shape?: 'rect' | 'circle';
  /** Shimmer speed in ms (one full opacity cycle). Default 1200. */
  durationMs?: number;
};

export function Skeleton({ style, shape = 'rect', durationMs = 1200 }: SkeletonProps) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: durationMs / 2,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: durationMs / 2,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity, durationMs]);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: t.surface2,
          borderRadius: shape === 'circle' ? 9999 : 8,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * ChatRowSkeleton — one row mimicking a ChatsListScreen row. 4-6 of these
 * render on first load before chats fetch resolves.
 */
export function ChatRowSkeleton() {
  return (
    <Animated.View
      style={{
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Skeleton shape="circle" style={{ width: 48, height: 48 }} />
      <Animated.View style={{ flex: 1, gap: 6 }}>
        <Skeleton style={{ width: '50%', height: 14 }} />
        <Skeleton style={{ width: '80%', height: 12 }} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * MessageBubbleSkeleton — one chat bubble. Alternates left/right via prop.
 */
export function MessageBubbleSkeleton({ side = 'left' }: { side?: 'left' | 'right' }) {
  const isRight = side === 'right';
  return (
    <Animated.View
      style={{
        flexDirection: 'row',
        justifyContent: isRight ? 'flex-end' : 'flex-start',
        marginVertical: 4,
        marginHorizontal: 12,
      }}
    >
      <Skeleton
        style={{
          width: isRight ? '55%' : '70%',
          height: 36,
          borderRadius: 18,
        }}
      />
    </Animated.View>
  );
}
