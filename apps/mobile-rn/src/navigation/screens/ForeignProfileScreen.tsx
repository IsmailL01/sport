// Foreign Profile — модальный экран профиля чужого пользователя.
// Phase 8 / M9.7.
//
// Открывается через nav.navigate('ForeignProfile', { userId }).
// Делает:
//   - GET /profiles/{userId} → name, avatar, grade, XP, verified, counters
//   - GET /relations/{userId} → isFollowing / isFollower / isBlocked / canDm
//   - Кнопка «Подписаться/Отписаться» (POST/DELETE /follows/{userId})
//   - Кнопка «Написать» (createOrFindDM → Chat)
//   - Back closes modal

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiClient } from '../../auth/apiClient';
import { Avatar, Button, Card, GradeBadge, Icon, useTheme } from '../../design';
import { useAuthStore } from '../../state/auth';
import { useChatsStore } from '../../state/social/useChatsStore';
import {
  getRelation,
  isFresh,
  patchIsFollowing,
  upsertRelation,
} from '../../storage/relationsRepository';
import type { RootStackParamList } from '../types';

type ForeignProfileNav = NativeStackNavigationProp<RootStackParamList, 'ForeignProfile'>;
type ForeignProfileRoute = RouteProp<RootStackParamList, 'ForeignProfile'>;

type ProfileDTO = {
  userId: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarMediaId: string | null;
  xpTotal: number;
  grade: string;
  verified: boolean;
  followersCount: number;
  followingCount: number;
};

type RelationDTO = {
  isFollowing: boolean;
  isFollower: boolean;
  isBlocked: boolean;
  isBlockedBy: boolean;
  canDm: boolean;
};

export function ForeignProfileScreen() {
  const t = useTheme();
  const nav = useNavigation<ForeignProfileNav>();
  const route = useRoute<ForeignProfileRoute>();
  const userId = route.params?.userId ?? '';
  const me = useAuthStore((s) => s.user);
  const createOrFindDM = useChatsStore((s) => s.createOrFindDM);

  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [rel, setRel] = useState<RelationDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [opening, setOpening] = useState(false);

  const isMe = me?.id === userId;
  const myId = me?.id ?? null;

  // M9.8: instant render из SQLite cache, потом fresh fetch в фоне.
  useEffect(() => {
    if (isMe || myId === null) return;
    const cached = getRelation(myId, userId);
    if (cached !== null) {
      setRel({
        isFollowing: cached.isFollowing,
        isFollower: cached.isFollower,
        isBlocked: cached.isBlocked,
        isBlockedBy: cached.isBlockedBy,
        canDm: cached.canDm,
      });
      // Fresh row → можно даже не показывать загрузку.
      if (isFresh(cached)) {
        setLoading(false);
      }
    }
  }, [userId, isMe, myId]);

  const load = useCallback(async () => {
    try {
      const [pResp, rResp] = await Promise.all([
        apiClient.api(`/profiles/${userId}`),
        isMe ? Promise.resolve(null) : apiClient.api(`/relations/${userId}`),
      ]);
      if (pResp.ok) {
        setProfile((await pResp.json()) as ProfileDTO);
      }
      if (rResp !== null && rResp.ok) {
        const fresh = (await rResp.json()) as RelationDTO;
        setRel(fresh);
        if (myId !== null) {
          upsertRelation(myId, userId, fresh);
        }
      }
    } catch (e) {
      console.warn('[ForeignProfile] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [userId, isMe, myId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggleFollow = async () => {
    if (rel === null || toggling || myId === null) return;
    setToggling(true);
    const prev = rel.isFollowing;
    // Optimistic memory + persistent cache.
    setRel({ ...rel, isFollowing: !prev });
    setProfile((p) =>
      p === null ? p : { ...p, followersCount: p.followersCount + (prev ? -1 : 1) },
    );
    patchIsFollowing(myId, userId, !prev);
    try {
      const resp = await apiClient.api(`/follows/${userId}`, {
        method: prev ? 'DELETE' : 'POST',
      });
      if (!resp.ok && resp.status !== 204) {
        // Rollback in-memory + cache.
        setRel({ ...rel, isFollowing: prev });
        setProfile((p) =>
          p === null ? p : { ...p, followersCount: p.followersCount + (prev ? 1 : -1) },
        );
        patchIsFollowing(myId, userId, prev);
      }
    } catch (e) {
      console.warn('[ForeignProfile] toggle follow failed', e);
      setRel({ ...rel, isFollowing: prev });
      patchIsFollowing(myId, userId, prev);
    } finally {
      setToggling(false);
    }
  };

  const onOpenDM = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const chat = await createOrFindDM(userId);
      if (chat !== null) {
        nav.replace('App', {
          screen: 'Chats',
          params: { screen: 'Chat', params: { chatId: chat.id } },
        });
      }
    } catch (e) {
      console.warn('[ForeignProfile] open DM failed', e);
    } finally {
      setOpening(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.text2} />
      </View>
    );
  }

  if (profile === null) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: t.text2, fontSize: 14, fontFamily: t.font, textAlign: 'center' }}>
          Не удалось загрузить профиль
        </Text>
        <Pressable onPress={() => nav.goBack()} style={{ marginTop: 16 }} hitSlop={10}>
          <Text style={{ color: t.lime, fontSize: 14, fontFamily: t.font }}>Назад</Text>
        </Pressable>
      </View>
    );
  }

  const displayName = profile.displayName ?? profile.username ?? userId.slice(0, 8);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="close" size={24} color={t.text} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20, alignItems: 'center' }}>
        <View style={{ position: 'relative' }}>
          <Avatar size={96} name={displayName} />
          <View style={{ position: 'absolute', bottom: 0, right: 0 }}>
            <GradeBadge grade={profile.grade} size={32} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 }}>
          <Text
            style={{
              fontSize: 24 * t.fontScale,
              fontWeight: '800',
              letterSpacing: -0.5,
              color: t.text,
              fontFamily: t.font,
            }}
          >
            {displayName}
          </Text>
          {profile.verified ? <Icon name="checkbadge" size={20} color={t.lime} /> : null}
        </View>
        {profile.username ? (
          <Text style={{ fontSize: 13 * t.fontScale, color: t.text2, marginTop: 2, fontFamily: t.font }}>
            @{profile.username}
          </Text>
        ) : null}
        {profile.bio ? (
          <Text style={{ fontSize: 14 * t.fontScale, color: t.text2, marginTop: 12, lineHeight: 20, fontFamily: t.font, textAlign: 'center' }}>
            {profile.bio}
          </Text>
        ) : null}
      </View>

      {/* Stats */}
      <View style={{ paddingHorizontal: 16, marginTop: 20, flexDirection: 'row', gap: 10 }}>
        <StatCell value={profile.followersCount} label="подписчиков" t={t} />
        <StatCell value={profile.followingCount} label="подписок" t={t} />
        <StatCell value={profile.xpTotal} label="XP" t={t} />
      </View>

      {/* Actions */}
      {!isMe ? (
        <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 10 }}>
          {rel?.isBlocked || rel?.isBlockedBy ? (
            <Text style={{ color: t.error, fontSize: 13, textAlign: 'center', fontFamily: t.font }}>
              Контакт ограничен
            </Text>
          ) : (
            <>
              <Button
                variant={rel?.isFollowing ? 'secondary' : 'primary'}
                size="lg"
                full
                disabled={toggling}
                onPress={onToggleFollow}
                icon={
                  <Icon
                    name={rel?.isFollowing ? 'check' : 'userplus'}
                    size={18}
                    color={rel?.isFollowing ? t.text : '#000'}
                  />
                }
              >
                {toggling ? '…' : rel?.isFollowing ? 'Подписан' : 'Подписаться'}
              </Button>
              {rel?.isFollower ? (
                <Text style={{ color: t.text3, fontSize: 12, textAlign: 'center', fontFamily: t.font, marginTop: -4 }}>
                  Подписан(а) на вас
                </Text>
              ) : null}
              <Button
                variant="ghost"
                size="md"
                full
                disabled={opening || rel?.canDm === false}
                onPress={onOpenDM}
                icon={<Icon name="chat" size={18} color={t.text} />}
              >
                {opening ? 'Открываем…' : 'Написать'}
              </Button>
            </>
          )}
        </View>
      ) : null}

      {/* Hint про взаимную подписку */}
      {!isMe && rel?.isFollowing && rel?.isFollower ? (
        <Card style={{ marginTop: 24, marginHorizontal: 20, padding: 14, backgroundColor: 'rgba(198,245,96,0.08)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={16} color={t.lime} />
            <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font, flex: 1 }}>
              Взаимная подписка — вы видите забеги друг друга
            </Text>
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

function StatCell({ value, label, t }: { value: number; label: string; t: ReturnType<typeof useTheme> }) {
  return (
    <Card p={12} style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 22 * t.fontScale,
          fontWeight: '800',
          color: t.text,
          letterSpacing: -0.5,
          fontFamily: t.fontDisplay,
          fontStyle: 'italic',
        }}
      >
        {value.toLocaleString('ru-RU')}
      </Text>
      <Text style={{ fontSize: 11 * t.fontScale, color: t.text3, marginTop: 2, fontFamily: t.font }}>
        {label}
      </Text>
    </Card>
  );
}
