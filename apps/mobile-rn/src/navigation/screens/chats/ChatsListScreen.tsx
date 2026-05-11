// Tab: Чаты / list — Phase 8 / M9.
//
// Cursona-styled список чатов. Stores те же, что в legacy ui/social.
// Stories rail вынесена в FeedScreen (M5) — не дублируем здесь.

import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Avatar, Icon, useTheme } from '../../../design';
import { lastMessagePreview, type Chat } from '../../../domain/social';
import { useChatsStore } from '../../../state/social/useChatsStore';
import { useUsersStore } from '../../../state/social/useUsersStore';
import type { ChatsStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatsList'>;

export function ChatsListScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const chats = useChatsStore((s) => s.chats);
  const loading = useChatsStore((s) => s.loading);
  const refresh = useChatsStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 30 * t.fontScale,
            fontWeight: '800',
            letterSpacing: -1,
            color: t.text,
            fontFamily: t.font,
          }}
        >
          Чаты
        </Text>
        <Pressable
          onPress={() => nav.navigate('CreateChat')}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: t.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="plus" size={18} color={t.text} />
        </Pressable>
      </View>

      {loading && chats.length === 0 ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={t.text2} />
        </View>
      ) : chats.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
          <Icon name="chat" size={48} color={t.text3} />
          <Text
            style={{
              marginTop: 12,
              color: t.text2,
              fontSize: 15 * t.fontScale,
              fontFamily: t.font,
              textAlign: 'center',
            }}
          >
            Пока нет чатов
          </Text>
          <Text
            style={{
              marginTop: 6,
              color: t.text3,
              fontSize: 13 * t.fontScale,
              fontFamily: t.font,
              textAlign: 'center',
            }}
          >
            Нажми «+» сверху, чтобы найти пользователя и написать
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ChatRow
              chat={item}
              onPress={() => nav.navigate('Chat', { chatId: item.id })}
              t={t}
            />
          )}
          onRefresh={refresh}
          refreshing={loading}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.divider, marginLeft: 60 }} />}
        />
      )}
    </View>
  );
}

function ChatRow({
  chat,
  onPress,
  t,
}: {
  chat: Chat;
  onPress: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  const peer = useUsersStore((s) =>
    chat.peerUserId !== null ? s.byId[chat.peerUserId] : undefined,
  );
  const getOrFetch = useUsersStore((s) => s.getOrFetch);

  useEffect(() => {
    if (chat.peerUserId !== null && peer === undefined) {
      void getOrFetch(chat.peerUserId);
    }
  }, [chat.peerUserId, peer, getOrFetch]);

  const title =
    chat.title ??
    peer?.displayName ??
    peer?.username ??
    (chat.type === 'group' ? 'Группа' : '...');
  const preview = lastMessagePreview(chat.lastMessage) || '—';
  const time = chat.lastMessage !== null ? formatTime(chat.lastMessage.ts) : '';

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: pressed ? 0.6 : 1,
          }}
        >
          <Avatar
            size={48}
            src={peer?.avatarUrl ?? null}
            name={title}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text
                numberOfLines={1}
                style={{
                  color: t.text,
                  fontSize: 15 * t.fontScale,
                  fontWeight: '700',
                  fontFamily: t.font,
                  flex: 1,
                }}
              >
                {title}
              </Text>
              {time !== '' ? (
                <Text style={{ color: t.text3, fontSize: 11 * t.fontScale, marginLeft: 8, fontFamily: t.font }}>
                  {time}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, gap: 8 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: t.text2,
                  fontSize: 13 * t.fontScale,
                  flex: 1,
                  fontFamily: t.font,
                }}
              >
                {preview}
              </Text>
              {chat.unreadCount > 0 ? (
                <View
                  style={{
                    minWidth: 20,
                    height: 20,
                    paddingHorizontal: 6,
                    borderRadius: 10,
                    backgroundColor: t.lime,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#000', fontSize: 11, fontWeight: '800' }}>
                    {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      )}
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
