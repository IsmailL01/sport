// FriendRequestsInboxScreen — list of incoming + outgoing pending requests.
// Phase 10 / ADR-0011 Amendment 6.
//
// Accessible via Me-tab → "Заявки в друзья". Pull-to-refresh + accept/reject/
// cancel actions inline. Empty states for both sections.

import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Avatar, Icon, useTheme } from '../../../design';
import { useUsersStore } from '../../../state/social/useUsersStore';
import { formatChatTime } from '../../../util/timeFormat';
import type { FriendRequest } from '../domain/types';
import { useFriendsStore } from '../state/useFriendsStore';

export function FriendRequestsInboxScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const incoming = useFriendsStore((s) => s.incoming);
  const outgoing = useFriendsStore((s) => s.outgoing);
  const loading = useFriendsStore((s) => s.loading);
  const refresh = useFriendsStore((s) => s.refresh);
  const accept = useFriendsStore((s) => s.accept);
  const reject = useFriendsStore((s) => s.reject);
  const cancel = useFriendsStore((s) => s.cancel);
  const mutating = useFriendsStore((s) => s.mutating);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);
  const usersById = useUsersStore((s) => s.byId);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pre-fetch peer profiles for both lists.
  useEffect(() => {
    incoming.forEach((r) => {
      if (usersById[r.senderId] === undefined) void getOrFetch(r.senderId);
    });
    outgoing.forEach((r) => {
      if (usersById[r.receiverId] === undefined) void getOrFetch(r.receiverId);
    });
  }, [incoming, outgoing, usersById, getOrFetch]);

  type Row =
    | { kind: 'section'; title: string; count: number }
    | { kind: 'incoming'; req: FriendRequest }
    | { kind: 'outgoing'; req: FriendRequest }
    | { kind: 'empty'; text: string };

  const rows: Row[] = [
    { kind: 'section', title: 'ВХОДЯЩИЕ', count: incoming.length },
    ...(incoming.length === 0 && !loading
      ? [{ kind: 'empty', text: 'Нет входящих заявок' } as Row]
      : incoming.map((req) => ({ kind: 'incoming', req } as Row))),
    { kind: 'section', title: 'ИСХОДЯЩИЕ', count: outgoing.length },
    ...(outgoing.length === 0 && !loading
      ? [{ kind: 'empty', text: 'Нет исходящих заявок' } as Row]
      : outgoing.map((req) => ({ kind: 'outgoing', req } as Row))),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View
        style={{
          paddingTop: 56,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Icon name="back" size={28} color={t.text} />
        </Pressable>
        <Text
          style={{
            color: t.text,
            fontSize: 22 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            letterSpacing: -0.5,
          }}
        >
          Заявки в друзья
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row, idx) => {
          if (row.kind === 'section') return `section-${row.title}-${idx}`;
          if (row.kind === 'empty') return `empty-${idx}`;
          return `${row.kind}-${row.req.id}`;
        }}
        refreshing={loading}
        onRefresh={() => void refresh()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return (
              <View
                style={{
                  paddingTop: 16,
                  paddingBottom: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    color: t.text3,
                    fontSize: 11 * t.fontScale,
                    fontWeight: '700',
                    fontFamily: t.font,
                    letterSpacing: 0.6,
                  }}
                >
                  {item.title}
                </Text>
                {item.count > 0 ? (
                  <View
                    style={{
                      minWidth: 18,
                      paddingHorizontal: 6,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: t.lime,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: '#0A0A0A',
                        fontSize: 11,
                        fontWeight: '800',
                      }}
                    >
                      {item.count}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }
          if (item.kind === 'empty') {
            return (
              <View style={{ paddingVertical: 16, paddingHorizontal: 12 }}>
                <Text
                  style={{
                    color: t.text3,
                    fontSize: 13 * t.fontScale,
                    fontFamily: t.font,
                  }}
                >
                  {item.text}
                </Text>
              </View>
            );
          }
          if (item.kind === 'incoming') {
            const peer = usersById[item.req.senderId];
            const title =
              peer?.displayName ?? peer?.username ?? `Пользователь`;
            return (
              <View
                style={{
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Avatar size={48} src={peer?.avatarUrl ?? null} name={title} />
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
                  <Text
                    style={{
                      color: t.text3,
                      fontSize: 12 * t.fontScale,
                      fontFamily: t.font,
                      marginTop: 2,
                    }}
                  >
                    {formatChatTime(item.req.createdAt)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void accept(item.req.id)}
                  disabled={mutating}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 18,
                    backgroundColor: t.lime,
                    opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: '#0A0A0A',
                      fontSize: 12 * t.fontScale,
                      fontWeight: '800',
                      fontFamily: t.font,
                    }}
                  >
                    ПРИНЯТЬ
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void reject(item.req.id)}
                  disabled={mutating}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    padding: 6,
                    opacity: mutating ? 0.6 : pressed ? 0.5 : 1,
                  })}
                >
                  <Icon name="close" size={20} color={t.text3} />
                </Pressable>
              </View>
            );
          }
          // outgoing
          const peer = usersById[item.req.receiverId];
          const title =
            peer?.displayName ?? peer?.username ?? `Пользователь`;
          return (
            <View
              style={{
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Avatar size={48} src={peer?.avatarUrl ?? null} name={title} />
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
                <Text
                  style={{
                    color: t.text3,
                    fontSize: 12 * t.fontScale,
                    fontFamily: t.font,
                    marginTop: 2,
                  }}
                >
                  Ждёт ответа · {formatChatTime(item.req.createdAt)}
                </Text>
              </View>
              <Pressable
                onPress={() => void cancel(item.req.id)}
                disabled={mutating}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 18,
                  backgroundColor: t.surface,
                  borderWidth: 1,
                  borderColor: t.divider,
                  opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    color: t.text2,
                    fontSize: 12 * t.fontScale,
                    fontWeight: '700',
                    fontFamily: t.font,
                  }}
                >
                  ОТМЕНИТЬ
                </Text>
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          loading && incoming.length === 0 && outgoing.length === 0 ? (
            <View style={{ paddingTop: 40, alignItems: 'center' }}>
              <ActivityIndicator color={t.text2} />
            </View>
          ) : null
        }
      />
    </View>
  );
}
