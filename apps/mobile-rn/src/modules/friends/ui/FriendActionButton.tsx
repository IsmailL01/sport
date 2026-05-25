// FriendActionButton — state-machine button rendered on ForeignProfileScreen.
// Phase 10 / ADR-0011 Amendment 6.
//
// State derived from server-returned Relation.friendStatus:
//   self              → button hidden
//   none              → "Добавить в друзья" (sends request)
//   pending_outgoing  → "Запрос отправлен" (long-press → cancel)
//   pending_incoming  → "Принять" + "Отклонить" pair
//   accepted          → "Друзья" + check icon (long-press → unfriend dialog,
//                        deferred to v1.0.1; for now read-only)
//
// All API calls go through useFriendsStore so the inbox + button state
// stay consistent across the app.

import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Icon, useTheme } from '../../../design';
import type { FriendActionState } from '../domain/types';
import { useFriendsStore } from '../state/useFriendsStore';
import { FriendRequestError } from '../sync/friendsApi';

export type FriendActionButtonProps = {
  /** Target user whose profile is being viewed. */
  targetUserId: string;
  /** Current friend state from server-side Relation.friendStatus. */
  state: FriendActionState;
  /** Pending request ID; required when state is pending_outgoing / pending_incoming. */
  requestId?: string | null;
  /** Called after any successful mutation so parent can refetch Relation. */
  onMutated?: () => void;
};

export function FriendActionButton({
  targetUserId,
  state,
  requestId,
  onMutated,
}: FriendActionButtonProps) {
  const t = useTheme();
  const send = useFriendsStore((s) => s.send);
  const accept = useFriendsStore((s) => s.accept);
  const reject = useFriendsStore((s) => s.reject);
  const cancel = useFriendsStore((s) => s.cancel);
  const mutating = useFriendsStore((s) => s.mutating);

  const [localOverride, setLocalOverride] = useState<FriendActionState | null>(null);
  const effective = localOverride ?? state;

  if (effective === 'self') {
    return null;
  }

  const handleSend = async () => {
    try {
      await send(targetUserId);
      setLocalOverride('pending_outgoing');
      onMutated?.();
    } catch (e) {
      if (e instanceof FriendRequestError && e.code === 'already_friends') {
        setLocalOverride('accepted');
        onMutated?.();
        return;
      }
      Alert.alert(
        'Не удалось отправить заявку',
        e instanceof Error ? e.message : 'Попробуй ещё раз',
      );
    }
  };

  const handleAccept = async () => {
    if (requestId === undefined || requestId === null) return;
    try {
      await accept(requestId);
      setLocalOverride('accepted');
      onMutated?.();
    } catch (e) {
      Alert.alert('Не удалось принять', e instanceof Error ? e.message : '');
    }
  };

  const handleReject = async () => {
    if (requestId === undefined || requestId === null) return;
    try {
      await reject(requestId);
      setLocalOverride('none');
      onMutated?.();
    } catch (e) {
      Alert.alert('Не удалось отклонить', e instanceof Error ? e.message : '');
    }
  };

  const handleCancel = async () => {
    if (requestId === undefined || requestId === null) return;
    Alert.alert(
      'Отменить заявку?',
      'Отозвать запрос в друзья. Можно отправить заново позже.',
      [
        { text: 'Не отменять', style: 'cancel' },
        {
          text: 'Отменить',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancel(requestId);
              setLocalOverride('none');
              onMutated?.();
            } catch (e) {
              Alert.alert(
                'Не удалось отменить',
                e instanceof Error ? e.message : '',
              );
            }
          },
        },
      ],
    );
  };

  // ── Render branches ──

  if (effective === 'none') {
    return (
      <Pressable
        onPress={handleSend}
        disabled={mutating}
        style={({ pressed }) => ({
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 24,
          backgroundColor: t.lime,
          alignItems: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        <Icon name="user" size={18} color="#0A0A0A" />
        <Text
          style={{
            color: '#0A0A0A',
            fontSize: 14 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.font,
            letterSpacing: -0.2,
          }}
        >
          ДОБАВИТЬ В ДРУЗЬЯ
        </Text>
      </Pressable>
    );
  }

  if (effective === 'pending_outgoing') {
    return (
      <Pressable
        onPress={handleCancel}
        disabled={mutating}
        style={({ pressed }) => ({
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 24,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.divider,
          alignItems: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        <Icon name="stopwatch" size={18} color={t.text2} />
        <Text
          style={{
            color: t.text2,
            fontSize: 14 * t.fontScale,
            fontWeight: '700',
            fontFamily: t.font,
            letterSpacing: -0.2,
          }}
        >
          ЗАЯВКА ОТПРАВЛЕНА
        </Text>
      </Pressable>
    );
  }

  if (effective === 'pending_incoming') {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={handleAccept}
          disabled={mutating}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 24,
            backgroundColor: t.lime,
            alignItems: 'center',
            opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              color: '#0A0A0A',
              fontSize: 14 * t.fontScale,
              fontWeight: '800',
              fontFamily: t.font,
              letterSpacing: -0.2,
            }}
          >
            ПРИНЯТЬ
          </Text>
        </Pressable>
        <Pressable
          onPress={handleReject}
          disabled={mutating}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 24,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.divider,
            alignItems: 'center',
            opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              color: t.text2,
              fontSize: 14 * t.fontScale,
              fontWeight: '700',
              fontFamily: t.font,
              letterSpacing: -0.2,
            }}
          >
            ОТКЛОНИТЬ
          </Text>
        </Pressable>
      </View>
    );
  }

  // accepted
  return (
    <View
      style={{
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 24,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.lime,
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
      }}
    >
      <Icon name="check" size={18} color={t.lime} />
      <Text
        style={{
          color: t.lime,
          fontSize: 14 * t.fontScale,
          fontWeight: '800',
          fontFamily: t.font,
          letterSpacing: -0.2,
        }}
      >
        ДРУЗЬЯ
      </Text>
    </View>
  );
}
