// Tab: Я / profile root — Phase 8 / M8.
//
// Замена MeScreenStub. Реальные данные из useAuthStore + useXpStore +
// useHistoryStore. Все CTA — стрелочки в стэк (Settings, Clubs).
//
// Layout:
//   - Cover background + avatar overlap + grade badge corner
//   - Name + sub-line (email пока — позже @username)
//   - VerifyCTA (если !xp.verified)
//   - Stats row: total km / total sessions / total hours (из всех закрытых)
//   - XP card: total + GradeBadge + progress bar + «до X еще N XP»
//   - Action list rows: Тренировки, Датчики, Клубы, Настройки, Выйти
//   - Footer: версия приложения

import { useEffect, useMemo } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Avatar, Card, GradeBadge, HeatmapCalendar, Icon, useTheme } from '../../../design';
import { computeStreak } from '../../../domain/streak';
import { useAuthStore } from '../../../state/auth';
import { useHistoryStore } from '../../../state/history';
import { useXpStore } from '../../../modules/gamification';
import { useFriendsStore } from '../../../modules/friends';
import { useWalletStore } from '../../../state/wallet';
import { aggregateSessions } from '../../../domain/stats';
import { formatDistance, formatDuration } from '../../../ui/format';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Profile'>;

const APP_VERSION = '0.9';

export function MeScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const sessions = useHistoryStore((s) => s.sessions);
  const refreshHistory = useHistoryStore((s) => s.refresh);
  const xpTotal = useXpStore((s) => s.xpTotal);
  const grade = useXpStore((s) => s.grade);
  const verified = useXpStore((s) => s.verified);
  const xpRefresh = useXpStore((s) => s.refresh);
  const xpToNext = useXpStore((s) => s.xpToNextGrade);
  const walletBalance = useWalletStore((s) => s.balance);

  // Phase 10 / ADR-0011 Amendment 6 — pull friend lists for tab badge + Me-row preview.
  const refreshFriends = useFriendsStore((s) => s.refresh);
  const incomingFriendCount = useFriendsStore((s) => s.incoming.length);

  useEffect(() => {
    refreshHistory();
    if (user !== null) {
      void xpRefresh(user.id);
      void refreshFriends();
    }
  }, [refreshHistory, xpRefresh, refreshFriends, user]);

  const totals = useMemo(() => aggregateSessions(sessions, 'all'), [sessions]);

  const next = xpToNext();
  const nextXpPct = (() => {
    if (next === null) return 1; // S grade — bar full
    const total = xpTotal + next.xpRemaining;
    if (total <= 0) return 0;
    return Math.min(1, xpTotal / total);
  })();

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => logout().catch((e) => console.warn('[Me] logout failed', e)),
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Cover */}
      <View style={{ height: 200, backgroundColor: t.surface2, position: 'relative' }}>
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1483721310020-03333e577078?w=800' }}
          style={{ width: '100%', height: '100%', opacity: 0.55 }}
        />
      </View>

      {/* Avatar + name */}
      <View style={{ paddingHorizontal: 16, marginTop: -64 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ position: 'relative' }}>
            <Avatar size={96} />
            <View style={{ position: 'absolute', bottom: 0, right: 0 }}>
              <GradeBadge grade={grade} size={32} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 }}>
            <Text
              style={{
                fontSize: 24 * t.fontScale,
                fontWeight: '800',
                letterSpacing: -0.5,
                color: t.text,
                fontFamily: t.font,
              }}
            >
              {user?.displayName ?? '—'}
            </Text>
            {verified ? <Icon name="checkbadge" size={20} color={t.lime} /> : null}
          </View>
          <Text style={{ fontSize: 13 * t.fontScale, color: t.text2, marginTop: 2, fontFamily: t.font }}>
            {user?.email ?? ''}
          </Text>
        </View>

        {/* Verify CTA */}
        {!verified ? (
          <View
            style={{
              marginTop: 18,
              backgroundColor: t.lime,
              borderRadius: t.r.lg,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15 * t.fontScale, fontWeight: '800', color: '#0A0A0A', fontFamily: t.font }}>
                Доступ к забегам
              </Text>
              <Text
                style={{
                  fontSize: 12 * t.fontScale,
                  color: '#0A0A0A',
                  opacity: 0.7,
                  marginTop: 2,
                  fontFamily: t.font,
                }}
              >
                Пройди обязательную верификацию
              </Text>
            </View>
            <View
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name="arrow" size={18} color="#FFFFFF" />
            </View>
          </View>
        ) : null}

        {/* Stats row */}
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
          <StatCell
            value={String(totals.totalSessions)}
            label="пробежек"
            t={t}
          />
          <StatCell
            value={formatDistance(totals.totalDistanceM).replace(/ км$/, '')}
            label="км всего"
            t={t}
          />
          <StatCell
            value={formatDuration(Math.round(totals.totalDurationS)).split(':')[0]}
            label="часов"
            t={t}
          />
        </View>

        {/* XP card */}
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 15 * t.fontScale, fontWeight: '700', color: t.text, fontFamily: t.font }}>
              {xpTotal.toLocaleString('ru-RU')} XP
            </Text>
            <GradeBadge grade={grade} size={24} />
          </View>
          <View style={{ marginTop: 12, height: 8, backgroundColor: t.surface2, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(nextXpPct * 100)}%`, height: '100%', backgroundColor: t.lime }} />
          </View>
          <Text style={{ marginTop: 8, fontSize: 12 * t.fontScale, color: t.text3, fontFamily: t.font }}>
            {next === null ? (
              <>Топовый грейд — <Text style={{ color: t.lime, fontWeight: '700' }}>S</Text></>
            ) : (
              <>
                До <Text style={{ color: t.lime, fontWeight: '700' }}>{next.label}</Text>{' '}
                ещё <Text style={{ color: t.lime, fontWeight: '700' }}>{next.xpRemaining} XP</Text>
              </>
            )}
          </Text>
        </Card>

        {/* M10.2: Streak + Heatmap */}
        <StreakCard sessions={sessions} t={t} />

        {/* Action list */}
        <View style={{ marginTop: 18, gap: 8 }}>
          <ActionRow
            icon="bolt"
            label="Тренировки"
            sub="планы и сценарии"
            onPress={() => Alert.alert('Тренировки', 'Скоро вернём — Phase M10.')}
            t={t}
          />
          <ActionRow
            icon="heart"
            label="Датчики"
            sub="HR / BLE сенсоры"
            onPress={() => Alert.alert('Датчики', 'Скоро вернём — Phase M10.')}
            t={t}
          />
          <ActionRow
            icon="trophy"
            label="Личные рекорды"
            sub="лучшая дистанция, темп, длительность"
            onPress={() => nav.navigate('Records')}
            t={t}
          />
          <ActionRow
            icon="bolt"
            label="Кошелёк"
            sub={`${walletBalance.toLocaleString('ru-RU')} монет`}
            onPress={() => nav.navigate('Wallet')}
            t={t}
          />
          <ActionRow
            icon="chart"
            label="Статистика"
            sub="графики и агрегаты по периодам"
            onPress={() => nav.navigate('Stats')}
            t={t}
          />
          <ActionRow
            icon="group"
            label="Клубы"
            sub="скоро — bicycle-runners, parkruns"
            onPress={() => nav.navigate('Clubs')}
            t={t}
          />
          <ActionRow
            icon="addFriend"
            label="Заявки в друзья"
            sub={
              incomingFriendCount > 0
                ? `${incomingFriendCount} ${incomingFriendCount === 1 ? 'новая заявка' : 'новых заявок'}`
                : 'входящие и исходящие'
            }
            badge={incomingFriendCount}
            onPress={() => nav.navigate('FriendRequests')}
            t={t}
          />
          <ActionRow
            icon="settings"
            label="Настройки"
            sub="тема, единицы, аккаунт"
            onPress={() => nav.navigate('Settings')}
            t={t}
          />
          <ActionRow
            icon="external"
            label="Выйти"
            sub=""
            danger
            onPress={handleLogout}
            t={t}
          />
        </View>

        <Text style={{ marginTop: 24, color: t.text3, fontSize: 11 * t.fontScale, textAlign: 'center', fontFamily: t.font }}>
          Running Ecosystem · {APP_VERSION}
        </Text>
      </View>
    </ScrollView>
  );
}

function StreakCard({
  sessions,
  t,
}: {
  sessions: ReadonlyArray<{ startedAt: number; distanceM: number | null }>;
  t: ReturnType<typeof useTheme>;
}) {
  const streak = computeStreak(sessions);
  return (
    <Card style={{ marginTop: 12, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <View>
          <Text style={{ fontSize: 11 * t.fontScale, color: t.text3, letterSpacing: 0.3, fontFamily: t.font }}>
            СТРИК
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <Text
              style={{
                fontSize: 28 * t.fontScale,
                fontWeight: '800',
                color: t.text,
                fontFamily: t.fontDisplay,
                fontStyle: 'italic',
                letterSpacing: -0.5,
              }}
            >
              {streak.current}
            </Text>
            <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font }}>
              {pluralizeDays(streak.current)} подряд
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 11 * t.fontScale, color: t.text3, letterSpacing: 0.3, fontFamily: t.font }}>
            ЛУЧШИЙ
          </Text>
          <Text
            style={{
              fontSize: 18 * t.fontScale,
              fontWeight: '700',
              color: t.text2,
              fontFamily: t.fontDisplay,
              fontStyle: 'italic',
              marginTop: 2,
            }}
          >
            {streak.longest}
          </Text>
        </View>
      </View>
      <HeatmapCalendar sessions={sessions} title="последние 12 недель" />
    </Card>
  );
}

function pluralizeDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function StatCell({
  value,
  label,
  t,
}: {
  value: string;
  label: string;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <Card p={12} style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 24 * t.fontScale,
          fontWeight: '800',
          color: t.text,
          letterSpacing: -0.5,
          fontFamily: t.fontDisplay,
          fontStyle: 'italic',
        }}
      >
        {value}
      </Text>
      <Text style={{ fontSize: 11 * t.fontScale, color: t.text3, marginTop: 2, fontFamily: t.font }}>
        {label}
      </Text>
    </Card>
  );
}

function ActionRow({
  icon,
  label,
  sub,
  danger,
  badge,
  onPress,
  t,
}: {
  icon: string;
  label: string;
  sub: string;
  danger?: boolean;
  /** Optional red-circle badge on the right with a count (e.g. unread items). */
  badge?: number;
  onPress: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <Card style={{ padding: 14, opacity: pressed ? 0.7 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: danger ? 'rgba(255,59,48,0.12)' : t.surface2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={icon as never} size={18} color={danger ? t.error : t.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: danger ? t.error : t.text, fontSize: 15 * t.fontScale, fontWeight: '700', fontFamily: t.font }}>
                {label}
              </Text>
              {sub ? (
                <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 1, fontFamily: t.font }}>
                  {sub}
                </Text>
              ) : null}
            </View>
            {badge !== undefined && badge > 0 ? (
              <View
                style={{
                  minWidth: 22,
                  height: 22,
                  paddingHorizontal: 7,
                  borderRadius: 11,
                  backgroundColor: t.error,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 4,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>
                  {badge > 99 ? '99+' : badge}
                </Text>
              </View>
            ) : null}
            {!danger ? <Icon name="chevron" size={18} color={t.text3} /> : null}
          </View>
        </Card>
      )}
    </Pressable>
  );
}
