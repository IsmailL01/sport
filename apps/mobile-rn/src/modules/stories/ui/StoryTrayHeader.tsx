// StoryTrayHeader — horizontal scroll of avatars with story ring.
// Phase 11 / STORIES-REVIVAL.
//
// Rendered as ListHeaderComponent of ChatsListScreen (matches original
// Phase 8/C placement). One avatar per author group; tap → opens
// StoryViewerScreen (UI deferred to session 3; this scaffold reports tap
// via onPickAuthor callback for now).
//
// Empty-state behavior: when groups list is empty AND not loading, the
// header renders null (zero vertical bytes). Once we have a "my story"
// button (add-your-own), this'll show even when empty — deferred.

import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '../../../design';
import { useUsersStore } from '../../../state/social/useUsersStore';
import { useStoriesStore } from '../state/useStoriesStore';
import { StoryRingAvatar } from './StoryRingAvatar';

export type StoryTrayHeaderProps = {
  /** Called on tap of an author avatar; consumer navigates to viewer. */
  onPickAuthor?: (authorId: string) => void;
};

export function StoryTrayHeader({ onPickAuthor }: StoryTrayHeaderProps) {
  const t = useTheme();
  const groups = useStoriesStore((s) => s.groups);
  const refresh = useStoriesStore((s) => s.refresh);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  const usersById = useUsersStore((s) => s.byId);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    groups.forEach((g) => {
      if (usersById[g.authorId] === undefined) {
        void getOrFetch(g.authorId);
      }
    });
  }, [groups, usersById, getOrFetch]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: t.divider,
        marginBottom: 8,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      >
        {groups.map((g) => {
          const peer = usersById[g.authorId];
          const name = peer?.displayName ?? peer?.username ?? '...';
          return (
            <View key={g.authorId} style={{ alignItems: 'center', width: 64 }}>
              <StoryRingAvatar
                userId={g.authorId}
                size={56}
                src={peer?.avatarUrl ?? null}
                name={name}
                onPress={() => onPickAuthor?.(g.authorId)}
              />
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 6,
                  color: t.text2,
                  fontSize: 11 * t.fontScale,
                  fontFamily: t.font,
                  maxWidth: 60,
                  textAlign: 'center',
                }}
              >
                {name}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
