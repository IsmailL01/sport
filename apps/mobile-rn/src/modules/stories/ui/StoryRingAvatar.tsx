// StoryRingAvatar — Avatar wrapper with a colored ring when peer has unviewed
// stories. Phase 11 / STORIES-REVIVAL.
//
// Reuses existing Avatar primitive (deterministic gradient fallback from
// chat-polish-pass works the same). Ring color logic:
//   unviewed → theme.lime (bright, attention)
//   viewed   → theme.divider (muted, "seen" affordance)
//   no active stories → no ring (passthrough)

import { Pressable } from 'react-native';

import { Avatar, type AvatarProps, useTheme } from '../../../design';
import { useStoriesStore } from '../state/useStoriesStore';

export type StoryRingAvatarProps = Omit<AvatarProps, 'ring'> & {
  /** UserID whose story-status determines the ring. */
  userId: string;
  /** Tap handler — typically opens StoryViewerScreen. */
  onPress?: () => void;
};

export function StoryRingAvatar({ userId, onPress, ...avatarProps }: StoryRingAvatarProps) {
  const t = useTheme();
  const group = useStoriesStore((s) => s.groupForAuthor(userId));
  let ring: string | null = null;
  if (group !== null && group.stories.length > 0) {
    ring = group.allViewed ? t.divider : t.lime;
  }
  const avatar = <Avatar {...avatarProps} ring={ring} />;
  if (onPress === undefined) return avatar;
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      {avatar}
    </Pressable>
  );
}
