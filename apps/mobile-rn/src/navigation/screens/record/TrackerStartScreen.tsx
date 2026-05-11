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

import { useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Chip, Icon, useTheme } from '../../../design';
import { LocationPuckLayer, MapboxView } from '../../../map';
import { locationAdapter } from '../../../location';
import { useActivityStore } from '../../../state/activity';
import { useSettingsStore } from '../../../state/settings';
import type { RecordStackParamList } from '../../types';

type PermStatus = 'pending' | 'granted' | 'denied';

type Genre = 'run' | 'trail' | 'intervals' | 'bike';
const GENRES: Array<{ id: Genre; label: string }> = [
  { id: 'run', label: 'Бег' },
  { id: 'trail', label: 'Трейл' },
  { id: 'intervals', label: 'Интервалы' },
  { id: 'bike', label: 'Велик' },
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
  const [genre, setGenre] = useState<Genre>('run');
  const [starting, setStarting] = useState(false);

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
      startActivity();
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

        {/* Жанр */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          {GENRES.map((g) => {
            const active = g.id === genre;
            const disabled = g.id !== 'run';
            return (
              <View
                key={g.id}
                onTouchEnd={() => { if (!disabled) setGenre(g.id); }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? t.lime : t.surface,
                  opacity: disabled ? 0.4 : 1,
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
    </View>
  );
}
