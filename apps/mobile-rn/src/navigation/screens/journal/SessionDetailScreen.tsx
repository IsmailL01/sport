// Tab: Журнал / детали пробежки — Phase 8 / M7.
//
// Открывается из JournalScreen.SessionRow. Принимает sessionId (string из
// React-Navigation params, парсится в number).
//
// Layout: back-button + hero distance + mini stats + map preview + actions.
// В отличие от RunDetailsScreen (M6, post-run): без auto-snapshot/reset и
// без принудительного «Готово» — это обычный детальный экран в стеке.

import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Icon, useTheme } from '../../../design';
import {
  HistoryTerritoryLayer,
  LocationPuckLayer,
  MapboxView,
  TrackLayer,
  ZoneLayer,
} from '../../../map';
import { useAuthStore } from '../../../state/auth';
import { useHistoryStore } from '../../../state/history';
import { useFeedStore } from '../../../modules/feed';
import { serializeToGpx } from '../../../domain/gpx';
import { loadPointsForSession } from '../../../storage/pointRepository';
import {
  formatArea,
  formatCalories,
  formatDistance,
  formatDuration,
  formatPace,
} from '../../../ui/format';
import type { Point } from '../../../domain/types';
import type { JournalStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<JournalStackParamList, 'SessionDetail'>;
type RouteP = RouteProp<JournalStackParamList, 'SessionDetail'>;

export function SessionDetailScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteP>();
  const sessionId = Number(route.params?.sessionId ?? 0);

  const session = useHistoryStore((s) => s.sessions.find((x) => x.id === sessionId));
  const closedSessionsPoints = useHistoryStore((s) => s.closedSessionsPoints);
  const deleteSession = useHistoryStore((s) => s.delete);
  const myUser = useAuthStore((s) => s.user);

  // Точки сессии: сначала проверим in-memory cache, потом lazy load.
  const [points, setPoints] = useState<Point[] | null>(null);
  useEffect(() => {
    if (session === undefined) return;
    const cached = closedSessionsPoints.get(sessionId);
    if (cached !== undefined) {
      setPoints(cached);
      return;
    }
    try {
      const loaded = loadPointsForSession(sessionId);
      setPoints(loaded);
    } catch (e) {
      console.error('[SessionDetail] loadPoints failed', e);
      setPoints([]);
    }
  }, [session, sessionId, closedSessionsPoints]);

  const distanceM = session?.distanceM ?? 0;
  const durationS =
    session !== undefined && session.endedAt !== null
      ? Math.max(0, Math.floor((session.endedAt - session.startedAt) / 1000))
      : 0;
  const avgPaceMinKm = useMemo(() => {
    if (distanceM === 0 || durationS === 0) return null;
    return durationS / 60 / (distanceM / 1000);
  }, [distanceM, durationS]);

  const [sharedToFeed, setSharedToFeed] = useState(false);

  const handleShare = async () => {
    if (myUser === null || session === undefined) return;
    const km = distanceM / 1000;
    const minutes = Math.round(durationS / 60);
    const caption = `🏃 Пробежка: ${km.toFixed(2)} км · ${minutes} мин`;
    try {
      await useFeedStore
        .getState()
        .composeSession(myUser.id, String(session.id), caption);
      setSharedToFeed(true);
      Alert.alert('Опубликовано в ленте', caption);
    } catch (e) {
      Alert.alert('Не получилось опубликовать', String(e));
    }
  };

  const handleExport = async () => {
    if (session === undefined || points === null || points.length === 0) {
      Alert.alert('Нет данных', 'Точки сессии ещё не загрузились.');
      return;
    }
    try {
      const gpx = serializeToGpx(
        { startedAt: session.startedAt, endedAt: session.endedAt },
        points,
      );
      await Share.share({
        message: gpx,
        title: `Пробежка ${new Date(session.startedAt).toLocaleString('ru-RU')}`,
      });
    } catch (e) {
      Alert.alert('Не получилось экспортировать', String(e));
    }
  };

  const handleDelete = () => {
    Alert.alert('Удалить пробежку?', 'Действие необратимо.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          deleteSession(sessionId);
          nav.goBack();
        },
      },
    ]);
  };

  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.text2, fontSize: 14, fontFamily: t.font }}>
          Сессия не найдена
        </Text>
        <Pressable onPress={() => nav.goBack()} style={{ marginTop: 12 }} hitSlop={10}>
          <Text style={{ color: t.lime, fontSize: 14, fontFamily: t.font }}>
            Назад
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="back" size={26} color={t.text} />
        </Pressable>
        <Text
          style={{
            marginTop: 18,
            fontSize: 28 * t.fontScale,
            fontWeight: '800',
            letterSpacing: -1,
            color: t.text,
            fontFamily: t.font,
          }}
        >
          Пробежка
        </Text>
        <Text style={{ color: t.text2, fontSize: 14 * t.fontScale, marginTop: 4, fontFamily: t.font }}>
          {new Date(session.startedAt).toLocaleString('ru-RU')}
        </Text>
      </View>

      {/* Hero */}
      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <Text style={{ color: t.text3, fontSize: 11 * t.fontScale, letterSpacing: 0.5, fontFamily: t.font }}>
          ДИСТАНЦИЯ
        </Text>
        <Text
          style={{
            fontSize: 64 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            fontStyle: 'italic',
            letterSpacing: -2,
            color: t.text,
          }}
        >
          {formatDistance(distanceM)}
        </Text>

        <View style={{ flexDirection: 'row', gap: 18, marginTop: 6, flexWrap: 'wrap' }}>
          <MiniStat label="ВРЕМЯ" value={formatDuration(durationS)} t={t} />
          <MiniStat label="ТЕМП" value={formatPace(avgPaceMinKm)} sub="/км" t={t} />
          {session.avgHrBpm !== null ? (
            <MiniStat label="ПУЛЬС" value={String(session.avgHrBpm)} sub="уд/мин" t={t} />
          ) : null}
          {session.caloriesKcal !== null ? (
            <MiniStat label="КАЛОРИИ" value={formatCalories(session.caloriesKcal)} t={t} />
          ) : null}
          {session.isClosed === true && session.areaM2 !== null ? (
            <MiniStat label="ПЛОЩАДЬ" value={formatArea(session.areaM2)} t={t} />
          ) : null}
        </View>
      </View>

      {/* Map */}
      <View
        style={{
          height: 280,
          marginHorizontal: 20,
          marginTop: 20,
          borderRadius: 20,
          overflow: 'hidden',
          backgroundColor: t.surface3,
        }}
      >
        {points !== null && points.length > 0 ? (
          <MapboxView followUserLocation={false}>
            <LocationPuckLayer />
            <HistoryTerritoryLayer closedSessionsPoints={closedSessionsPoints} />
            <TrackLayer points={points} />
            {session.isClosed === true ? <ZoneLayer points={points} /> : null}
          </MapboxView>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.text3, fontSize: 13, fontFamily: t.font }}>
              {points === null ? 'Загружаем точки…' : 'Точек нет'}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 10 }}>
        <Button
          variant="primary"
          size="lg"
          full
          disabled={sharedToFeed || myUser === null}
          onPress={handleShare}
          icon={<Icon name="share" size={20} color="#000" />}
        >
          {sharedToFeed ? 'Опубликовано' : 'Поделиться в ленте'}
        </Button>
        <Button
          variant="secondary"
          size="md"
          full
          onPress={handleExport}
          icon={<Icon name="download" size={18} color={t.text} />}
        >
          Экспорт GPX
        </Button>
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => ({
            paddingVertical: 14,
            alignItems: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: t.error, fontSize: 14 * t.fontScale, fontWeight: '600', fontFamily: t.font }}>
            Удалить пробежку
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function MiniStat({
  label,
  value,
  sub,
  t,
}: {
  label: string;
  value: string;
  sub?: string;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View>
      <Text style={{ color: t.text3, fontSize: 10 * t.fontScale, letterSpacing: 0.5, fontFamily: t.font }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <Text
          style={{
            color: t.text,
            fontSize: 20 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            fontStyle: 'italic',
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
    </View>
  );
}
