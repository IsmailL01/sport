// Tab: Запись / start screen — Phase 8 / M6.
//
// Pre-run UX:
//   - Map preview (location puck, no track)
//   - GPS status chip (top-right)
//   - Bottom sheet: genre chips + "00:00:00" hero + START button
//   - Permission gate (foreground location)
//
// Press START →
//   1. useActivityStore.start() (creates session row + sets state=recording)
//   2. locationAdapter.requestBackgroundPermission() (best-effort)
//   3. locationAdapter.start() (begin GPS pipeline)
//   4. nav.navigate('TrackerLive')
//
// Android battery-hint Alert показывается единожды (settings.batteryHintShown).

import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Chip, Icon, useTheme } from '../../../design';
import { LocationPuckLayer, MapboxView } from '../../../map';
import { locationAdapter } from '../../../location';
import { useActivityStore } from '../../../state/activity';
import { useHistoryStore } from '../../../state/history';
import { useSettingsStore } from '../../../state/settings';
import { aggregateSessions } from '../../../domain/stats';
import { formatDistance, formatDuration, formatPace } from '../../../ui/format';
import { AutostartDialog } from '../../../vendor/AutostartDialog';
import type { RecordStackParamList } from '../../types';

type PermStatus = 'pending' | 'granted' | 'denied';

import type { ActivityType } from '../../../domain/types';

const GENRES: Array<{ id: ActivityType; label: string }> = [
  { id: 'run', label: 'Бег' },
  { id: 'trail', label: 'Трейл' },
  { id: 'walk', label: 'Ходьба' },
  { id: 'cycle', label: 'Велик' },
  { id: 'treadmill', label: 'Дорожка' },
];

type Nav = NativeStackNavigationProp<RecordStackParamList, 'TrackerStart'>;

export function TrackerStartScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const startActivity = useActivityStore((s) => s.start);
  const stopActivity = useActivityStore((s) => s.stop);
  const resetActivity = useActivityStore((s) => s.reset);
  const lastRawAccuracy = useActivityStore((s) => s.lastRawAccuracy);
  const activityState = useActivityStore((s) => s.state);

  const [perm, setPerm] = useState<PermStatus>('pending');
  const [genre, setGenre] = useState<ActivityType>('run');
  const [starting, setStarting] = useState(false);

  // History (week summary + last activity).
  const sessions = useHistoryStore((s) => s.sessions);
  const refreshHistory = useHistoryStore((s) => s.refresh);
  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const weekStats = useMemo(() => aggregateSessions(sessions, 'week'), [sessions]);
  const lastSession = useMemo(() => {
    const closed = sessions.filter((s) => s.endedAt !== null);
    if (closed.length === 0) return null;
    return [...closed].sort((a, b) => b.startedAt - a.startedAt)[0];
  }, [sessions]);

  // Запросить foreground permission на mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!cancelled) setPerm(status === 'granted' ? 'granted' : 'denied');
      } catch {
        if (!cancelled) setPerm('denied');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Если приложение восстановилось со stopped state (recoverLast подгрузил
  // последнюю сессию), сбросим — UI должен быть «чистым».
  useEffect(() => {
    if (activityState === 'stopped') {
      // best-effort — не блокируем UI.
    }
  }, [activityState]);

  const gpsLabel = (() => {
    if (perm === 'pending') return 'GPS…';
    if (perm === 'denied') return 'нет GPS';
    if (lastRawAccuracy === null) return 'поиск GPS';
    if (lastRawAccuracy <= 8) return 'GPS отличный';
    if (lastRawAccuracy <= 20) return 'GPS норм';
    return 'GPS слабый';
  })();

  const gpsColor = (() => {
    if (perm !== 'granted') return t.error;
    if (lastRawAccuracy === null || lastRawAccuracy > 20) return t.warn;
    return t.lime;
  })();

  const handleStart = async () => {
    if (perm !== 'granted') {
      Alert.alert(
        'Нет доступа к геолокации',
        'Открой настройки приложения и разреши доступ к местоположению.',
      );
      return;
    }
    if (starting) return;
    setStarting(true);
    try {
      // Если есть остаточные stopped-points (recoverLast), очистим.
      if (useActivityStore.getState().state === 'stopped') {
        resetActivity();
      }
      startActivity(genre);
      await locationAdapter.requestBackgroundPermission().catch(() => false);
      try {
        await locationAdapter.start();
      } catch (e) {
        console.error('[Tracker] locationAdapter.start failed', e);
        stopActivity();
        resetActivity();
        Alert.alert('Не получилось начать запись', String(e));
        setStarting(false);
        return;
      }

      // Android battery-hint первого раза.
      if (Platform.OS === 'android') {
        const settings = useSettingsStore.getState();
        if (!settings.batteryHintShown) {
          settings.markBatteryHintShown();
          Alert.alert(
            'Запись в фоне',
            'Если Android (особенно Xiaomi/Huawei/Oppo) обрывает запись в фоне — '
              + 'открой Настройки → Apps → Running Ecosystem → Battery → Unrestricted. '
              + 'Один раз.',
            [{ text: 'Понятно' }],
          );
        }
      }

      nav.navigate('TrackerLive');
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Map preview */}
      <View style={{ flex: 1, backgroundColor: t.surface3 }}>
        {perm === 'granted' ? (
          <MapboxView followUserLocation followZoomLevel={15}>
            <LocationPuckLayer />
          </MapboxView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Icon name="map" size={48} color={t.text3} />
            <Text style={{ marginTop: 12, color: t.text2, fontSize: 14, textAlign: 'center', fontFamily: t.font }}>
              {perm === 'pending' ? 'Запрашиваем доступ к геолокации…' : 'Без доступа к геолокации трекер не работает.\nОткрой настройки приложения.'}
            </Text>
          </View>
        )}

        {/* Top: GPS chip */}
        <View
          style={{
            position: 'absolute',
            top: 56,
            right: 16,
          }}
        >
          <Chip
            icon={<View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: gpsColor }} />}
            bg="rgba(0,0,0,0.6)"
            color={t.text}
          >
            {gpsLabel}
          </Chip>
        </View>
      </View>

      {/* Bottom sheet */}
      <View
        style={{
          backgroundColor: t.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 32,
        }}
      >
        <View style={{ width: 36, height: 4, backgroundColor: t.surface2, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />

        {/* Сводка за неделю */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: t.surface,
            borderRadius: 16,
            paddingVertical: 12,
            marginBottom: 12,
          }}
        >
          <WeekStat label="За неделю" value={`${weekStats.totalSessions}`} sub="трен." t={t} />
          <View style={{ width: 1, backgroundColor: t.divider }} />
          <WeekStat label="" value={formatDistance(weekStats.totalDistanceM)} sub="" t={t} />
          <View style={{ width: 1, backgroundColor: t.divider }} />
          <WeekStat label="" value={formatDuration(Math.floor(weekStats.totalDurationS))} sub="" t={t} />
        </View>

        {/* Последняя активность */}
        {lastSession !== null ? (
          <Pressable
            onPress={() => {
              const root = nav.getParent()?.getParent();
              if (root) {
                root.navigate('App', {
                  screen: 'Journal',
                  params: { screen: 'SessionDetail', params: { sessionId: String(lastSession.id) } },
                });
              }
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: t.surface,
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 18,
              gap: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: t.surface2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="run" size={18} color={t.text} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: t.text, fontSize: 14 * t.fontScale, fontWeight: '700', fontFamily: t.font }}
              >
                Последняя · {formatDistance(lastSession.distanceM ?? 0)}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 2, fontFamily: t.font }}
              >
                {formatRelative(lastSession.startedAt)} · {formatDuration(Math.max(0, Math.floor(((lastSession.endedAt ?? lastSession.startedAt) - lastSession.startedAt) / 1000)))} · {formatPace(paceOf(lastSession))}/км
              </Text>
            </View>
            <Icon name="chevron" size={16} color={t.text3} />
          </Pressable>
        ) : null}

        {/* Жанр */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {GENRES.map((g) => {
            const active = g.id === genre;
            return (
              <View
                key={g.id}
                onTouchEnd={() => setGenre(g.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? t.lime : t.surface,
                }}
              >
                <Text
                  style={{
                    color: active ? '#000' : t.text,
                    fontSize: 13 * t.fontScale,
                    fontWeight: '600',
                    fontFamily: t.font,
                  }}
                >
                  {g.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Hero "00:00:00" */}
        <Text style={{ fontSize: 12 * t.fontScale, color: t.text3, fontFamily: t.font }}>
          Длительность
        </Text>
        <Text
          style={{
            fontSize: 56 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            fontStyle: 'italic',
            letterSpacing: -2,
            color: t.text,
          }}
        >
          00:00:00
        </Text>

        <Button
          variant="primary"
          size="lg"
          full
          disabled={perm !== 'granted' || starting}
          onPress={handleStart}
          style={{ marginTop: 18, height: 64, borderRadius: 32 }}
          icon={<Icon name="play" size={22} color="#000" />}
        >
          {starting ? 'СТАРТ…' : 'НАЧАТЬ ЗАБЕГ'}
        </Button>
      </View>

      {/* Phase 7 / Plan 07-03 Task 4: one-shot autostart dialog for MIUI + One UI.
          Renders Modal portal-style above this screen only on first launch of
          a vendor whose foreground-service killer is known to bite. Generic +
          Huawei vendors → no-op. After first dismissal (either button), MMKV
          flag prevents re-show. */}
      <AutostartDialog />
    </View>
  );
}

function WeekStat({
  label,
  value,
  sub,
  t,
}: {
  label: string;
  value: string;
  sub: string;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 6 }}>
      {label ? (
        <Text style={{ color: t.text3, fontSize: 10 * t.fontScale, letterSpacing: 0.4, fontFamily: t.font }}>
          {label.toUpperCase()}
        </Text>
      ) : null}
      <Text
        style={{
          color: t.text,
          fontSize: 18 * t.fontScale,
          fontWeight: '800',
          fontFamily: t.fontDisplay,
          fontStyle: 'italic',
          marginTop: label ? 2 : 0,
        }}
      >
        {value}
      </Text>
      {sub ? (
        <Text style={{ color: t.text2, fontSize: 10 * t.fontScale, fontFamily: t.font }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function paceOf(s: { startedAt: number; endedAt: number | null; distanceM: number | null }): number | null {
  if (s.endedAt === null) return null;
  const m = s.distanceM ?? 0;
  if (m <= 0) return null;
  const sec = Math.max(0, (s.endedAt - s.startedAt) / 1000);
  if (sec <= 0) return null;
  return sec / 60 / (m / 1000);
}

function formatRelative(ms: number): string {
  const diffMs = Date.now() - ms;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;
  return new Date(ms).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}
