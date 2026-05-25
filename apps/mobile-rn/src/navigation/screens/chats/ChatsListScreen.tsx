// Tab: Чаты / list — Telegram-style.
//
// Layout:
//   - Header «Чаты» + «+» (create-chat shortcut)
//   - Sticky search input (поиск по имени / @username)
//   - При пустом query: список чатов
//   - При query >= 2 символов: фильтрованные чаты (top) + найденные люди
//     через social-graph trigram search; tap на человека → createOrFindDM.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Avatar, ChatRowSkeleton, Icon, useTheme } from '../../../design';
import { sendFriendRequest } from '../../../modules/friends';
import { ChatsFriendshipError } from '../../../state/social/useChatsStore';
import { formatChatTime } from '../../../util/timeFormat';
import { lastMessagePreview, type Chat, type SocialUser } from '../../../domain/social';
import { useChatsStore } from '../../../state/social/useChatsStore';
import { useUsersStore } from '../../../state/social/useUsersStore';
import { normalizePhoneE164, useSettingsStore } from '../../../state/settings';
import type { ChatsStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatsList'>;

export function ChatsListScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const chats = useChatsStore((s) => s.chats);
  const loading = useChatsStore((s) => s.loading);
  const refresh = useChatsStore((s) => s.refresh);
  const createOrFindDM = useChatsStore((s) => s.createOrFindDM);
  const searchUsers = useUsersStore((s) => s.search);
  const byId = useUsersStore((s) => s.byId);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);

  const myPhone = useSettingsStore((s) => s.phoneE164);

  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<SocialUser[]>([]);
  const [searching, setSearching] = useState(false);

  const queryIsPhone = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '') return false;
    return /^[+\d][\d\s()-]{4,}$/.test(trimmed);
  }, [query]);
  const queryMatchesMyPhone = useMemo(() => {
    if (!queryIsPhone || myPhone === null) return false;
    return normalizePhoneE164(query) === myPhone;
  }, [queryIsPhone, query, myPhone]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pre-fetch peer profiles for chats so client-side filter can match by name.
  useEffect(() => {
    chats.forEach((c) => {
      if (c.peerUserId !== null && byId[c.peerUserId] === undefined) {
        void getOrFetch(c.peerUserId);
      }
    });
  }, [chats, byId, getOrFetch]);

  // Debounced server-side people search.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const list = await searchUsers(trimmed);
        if (!cancelled) setPeople(list);
      } catch (e) {
        if (!cancelled) console.warn('[ChatsList] search failed', e);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, searchUsers]);

  // Client-side filter chats by chat.title / peer displayName / peer username.
  const filteredChats = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === '') return chats;
    const stripped = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    return chats.filter((c) => {
      const peer = c.peerUserId !== null ? byId[c.peerUserId] : undefined;
      const title = (c.title ?? '').toLowerCase();
      const display = (peer?.displayName ?? '').toLowerCase();
      const username = (peer?.username ?? '').toLowerCase();
      return (
        title.includes(stripped) ||
        display.includes(stripped) ||
        username.includes(stripped)
      );
    });
  }, [query, chats, byId]);

  // People who are NOT already in a DM — surface as "Start a chat".
  const existingPeerIds = useMemo(
    () => new Set(chats.map((c) => c.peerUserId).filter((id): id is string => id !== null)),
    [chats],
  );
  const newPeople = useMemo(
    () => people.filter((u) => !existingPeerIds.has(u.id)),
    [people, existingPeerIds],
  );

  const handleOpenPerson = async (peerId: string) => {
    try {
      const chat = await createOrFindDM(peerId);
      if (chat === null) {
        Alert.alert('Не получилось открыть чат', 'Сервер вернул ошибку.');
        return;
      }
      setQuery('');
      nav.navigate('Chat', { chatId: chat.id });
    } catch (e) {
      // Phase 10 / ADR-0011 Amendment 6 — DM gated on accepted friendship.
      // Offer to send the friend request inline so the user can resume after
      // acceptance without leaving this screen.
      if (e instanceof ChatsFriendshipError) {
        Alert.alert(
          'Сначала заявку в друзья',
          'Чтобы написать этому человеку, отправь ему заявку в друзья. После принятия чат станет доступен.',
          [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Отправить заявку',
              onPress: async () => {
                try {
                  await sendFriendRequest(peerId);
                  Alert.alert(
                    'Заявка отправлена',
                    'Чат откроется когда заявку примут.',
                  );
                } catch (err) {
                  Alert.alert(
                    'Не удалось отправить заявку',
                    err instanceof Error ? err.message : 'Попробуй ещё раз',
                  );
                }
              },
            },
          ],
        );
        return;
      }
      Alert.alert('Ошибка', String(e));
    }
  };

  const showingSearch = query.trim().length >= 2;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 10,
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

      {/* Search */}
      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 8,
          backgroundColor: t.surface,
          borderRadius: t.r.md,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Icon name="search" size={18} color={t.text3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Имя, @username или номер"
          placeholderTextColor={t.text3}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            fontSize: 15 * t.fontScale,
            color: t.text,
            fontFamily: t.font,
            padding: 0,
          }}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="close" size={18} color={t.text3} />
          </Pressable>
        ) : null}
      </View>

      {/* Body */}
      {loading && chats.length === 0 && !showingSearch ? (
        <View style={{ paddingHorizontal: 20 }}>
          <ChatRowSkeleton />
          <View style={{ height: 1, backgroundColor: t.divider, marginLeft: 60 }} />
          <ChatRowSkeleton />
          <View style={{ height: 1, backgroundColor: t.divider, marginLeft: 60 }} />
          <ChatRowSkeleton />
          <View style={{ height: 1, backgroundColor: t.divider, marginLeft: 60 }} />
          <ChatRowSkeleton />
        </View>
      ) : !showingSearch && chats.length === 0 ? (
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
            Введи имя или @username в поиске сверху — мы откроем новый чат.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ChatRow
              chat={item}
              onPress={() => nav.navigate('Chat', { chatId: item.id })}
              t={t}
            />
          )}
          onRefresh={!showingSearch ? refresh : undefined}
          refreshing={!showingSearch ? loading : false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.divider, marginLeft: 60 }} />}
          ListHeaderComponent={
            showingSearch && filteredChats.length > 0 ? (
              <SectionLabel text="В твоих чатах" t={t} />
            ) : null
          }
          ListEmptyComponent={
            showingSearch ? null : (
              <View />
            )
          }
          ListFooterComponent={
            showingSearch ? (
              <SearchPeopleSection
                searching={searching}
                people={newPeople}
                onPick={handleOpenPerson}
                queryIsPhone={queryIsPhone}
                queryMatchesMyPhone={queryMatchesMyPhone}
                t={t}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

function SectionLabel({ text, t }: { text: string; t: ReturnType<typeof useTheme> }) {
  return (
    <Text
      style={{
        color: t.text3,
        fontSize: 11 * t.fontScale,
        fontFamily: t.font,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        paddingVertical: 10,
      }}
    >
      {text}
    </Text>
  );
}

function SearchPeopleSection({
  searching,
  people,
  onPick,
  queryIsPhone,
  queryMatchesMyPhone,
  t,
}: {
  searching: boolean;
  people: SocialUser[];
  onPick: (peerId: string) => void;
  queryIsPhone: boolean;
  queryMatchesMyPhone: boolean;
  t: ReturnType<typeof useTheme>;
}) {
  if (searching && people.length === 0) {
    return (
      <View style={{ paddingTop: 20, alignItems: 'center' }}>
        <ActivityIndicator color={t.text2} />
      </View>
    );
  }
  if (queryIsPhone && people.length === 0) {
    return (
      <View style={{ paddingTop: 24, alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font, textAlign: 'center' }}>
          {queryMatchesMyPhone
            ? 'Это твой номер — других пользователей по телефону пока не ищем.'
            : 'Поиск по номеру телефона появится позже. Пока — @username или имя.'}
        </Text>
      </View>
    );
  }
  if (people.length === 0) {
    return (
      <View style={{ paddingTop: 24, alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ color: t.text3, fontSize: 13 * t.fontScale, fontFamily: t.font, textAlign: 'center' }}>
          Никого больше не нашли.
        </Text>
      </View>
    );
  }
  return (
    <View>
      <SectionLabel text="Глобальный поиск" t={t} />
      {people.map((u, idx) => (
        <PersonRow
          key={u.id}
          user={u}
          onPress={() => onPick(u.id)}
          divider={idx < people.length - 1}
          t={t}
        />
      ))}
    </View>
  );
}

function PersonRow({
  user,
  onPress,
  divider,
  t,
}: {
  user: SocialUser;
  onPress: () => void;
  divider: boolean;
  t: ReturnType<typeof useTheme>;
}) {
  const title = user.displayName ?? user.username ?? user.id.slice(0, 8);
  return (
    <View>
      <Pressable onPress={onPress} hitSlop={4}>
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
            <Avatar size={48} src={user.avatarUrl ?? null} name={title} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: t.text,
                  fontSize: 15 * t.fontScale,
                  fontWeight: '700',
                  fontFamily: t.font,
                }}
              >
                {title}
              </Text>
              {user.username ? (
                <Text
                  numberOfLines={1}
                  style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 2, fontFamily: t.font }}
                >
                  @{user.username}
                </Text>
              ) : null}
            </View>
            <Icon name="chevron" size={18} color={t.text3} />
          </View>
        )}
      </Pressable>
      {divider ? <View style={{ height: 1, backgroundColor: t.divider, marginLeft: 60 }} /> : null}
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
  const time = chat.lastMessage !== null ? formatChatTime(chat.lastMessage.ts) : '';

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

