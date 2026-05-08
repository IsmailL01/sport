// Список чатов + рейл историй сверху.
// Phase 8 / A5 + Phase 8 / C (StoriesRail).

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native';

import type { Chat } from '../../domain/social';
import { lastMessagePreview } from '../../domain/social';
import { useChatsStore } from '../../state/social/useChatsStore';
import { useUsersStore } from '../../state/social/useUsersStore';
import {
  StoriesRail, StoriesViewer, StoryComposerScreen,
} from '../../modules/stories';
import type { StoryGroup } from '../../modules/stories';

type Props = {
  myUserId: string;
  onOpenChat: (chat: Chat) => void;
  onNewChat: () => void;
};

type ViewerState =
  | { kind: 'closed' }
  | { kind: 'open'; group: StoryGroup; idx: number; groupOrder: number };

export function ChatsListScreen({ myUserId, onOpenChat, onNewChat }: Props) {
  const chats = useChatsStore((s) => s.chats);
  const loading = useChatsStore((s) => s.loading);
  const refresh = useChatsStore((s) => s.refresh);

  const [viewer, setViewer] = useState<ViewerState>({ kind: 'closed' });
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleOpenGroup = (group: StoryGroup, startIdx: number) => {
    // Найти position group в actual store list (для swipe-to-next-author).
    setViewer({ kind: 'open', group, idx: startIdx, groupOrder: 0 });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Чаты</Text>
        <Pressable style={styles.newBtn} onPress={onNewChat}>
          <Text style={styles.newBtnText}>+ Новый</Text>
        </Pressable>
      </View>

      <StoriesRail
        myUserId={myUserId}
        onCompose={() => setComposerOpen(true)}
        onOpenGroup={handleOpenGroup}
      />

      {loading && chats.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : chats.length === 0 ? (
        <Text style={styles.empty}>Пока нет чатов. Найди пользователя через «+ Новый».</Text>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ChatRow chat={item} onPress={() => onOpenChat(item)} />
          )}
          contentContainerStyle={styles.list}
          onRefresh={refresh}
          refreshing={loading}
        />
      )}

      {viewer.kind === 'open' ? (
        <StoriesViewer
          visible
          group={viewer.group}
          startIndex={viewer.idx}
          myUserId={myUserId}
          onClose={() => setViewer({ kind: 'closed' })}
        />
      ) : null}

      <StoryComposerScreen
        visible={composerOpen}
        myUserId={myUserId}
        onClose={() => setComposerOpen(false)}
        onPosted={() => setComposerOpen(false)}
      />
    </View>
  );
}

function ChatRow({ chat, onPress }: { chat: Chat; onPress: () => void }) {
  const peer = useUsersStore((s) => (chat.peerUserId !== null ? s.byId[chat.peerUserId] : undefined));
  const getOrFetch = useUsersStore((s) => s.getOrFetch);

  useEffect(() => {
    if (chat.peerUserId !== null && peer === undefined) {
      getOrFetch(chat.peerUserId);
    }
  }, [chat.peerUserId, peer, getOrFetch]);

  const title = chat.title
    ?? peer?.displayName
    ?? peer?.username
    ?? '...';
  const preview = lastMessagePreview(chat.lastMessage);
  const time = chat.lastMessage !== null ? formatTime(chat.lastMessage.ts) : '';

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(title.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowMain}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {time !== '' && <Text style={styles.rowTime}>{time}</Text>}
        </View>
        <View style={styles.rowBottomLine}>
          <Text style={styles.rowPreview} numberOfLines={1}>{preview || '—'}</Text>
          {chat.unreadCount > 0 && (
            <View style={styles.unread}>
              <Text style={styles.unreadText}>{chat.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  newBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 6,
  },
  newBtnText: { color: '#111827', fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 48, paddingHorizontal: 32 },
  list: { paddingVertical: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, color: '#6B7280', fontWeight: '700' },
  rowMain: { flex: 1, minWidth: 0 },
  rowTopLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  rowTime: { fontSize: 11, color: '#9CA3AF', marginLeft: 8 },
  rowBottomLine: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 2, gap: 8,
  },
  rowPreview: { color: '#6B7280', fontSize: 13, flex: 1 },
  unread: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#6366F1',
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});
