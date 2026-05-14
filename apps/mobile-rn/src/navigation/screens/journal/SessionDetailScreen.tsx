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
import { useHistoryStore } from '../../../state/history';
import { serializeToGpx } from '../../../domain/gpx';
import { loadPointsForSession } from '../../../storage/pointRepository';
import { computeSplits, fastestAndSlowestKm, type Split } from '../../../domain/splits';
import { fastestAndSlowestLap, type Lap } from '../../../domain/lap';
import { listLapsForSession } from '../../../storage/lapRepository';
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

  const splits = useMemo<Split[]>(() => {
    if (points === null || points.length < 2) return [];
    return computeSplits(points);
  }, [points]);
  const splitHighlights = useMemo(() => fastestAndSlowestKm(splits), [splits]);

  const [laps, setLaps] = useState<Lap[]>([]);
  useEffect(() => {
    if (session === undefined) return;
    try {
      setLaps(listLapsForSession(sessionId));
    } catch (e) {
      console.warn('[SessionDetail] listLaps failed', e);
      setLaps([]);
    }
  }, [session, sessionId]);
  const lapHighlights = useMemo(() => fastestAndSlowestLap(laps), [laps]);

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

      {/* Laps (manual) */}
      {laps.length > 0 ? (
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text
            style={{
              color: t.text3,
              fontSize: 11 * t.fontScale,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontFamily: t.font,
              marginBottom: 10,
            }}
          >
            Круги
          </Text>
          <View
            style={{
              backgroundColor: t.surface,
              borderRadius: 16,
              paddingVertical: 4,
              paddingHorizontal: 14,
            }}
          >
            {laps.map((lp, idx) => {
              const fastest = lapHighlights.fastest === lp.lapNumber;
              const slowest = lapHighlights.slowest === lp.lapNumber;
              const accent = fastest ? t.lime : slowest ? t.warn : t.text;
              return (
                <View
                  key={lp.lapNumber}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderBottomWidth: idx < laps.length - 1 ? 1 : 0,
                    borderBottomColor: t.divider,
                  }}
                >
                  <Text
                    style={{
                      width: 36,
                      color: t.text2,
                      fontSize: 13 * t.fontScale,
                      fontFamily: t.font,
                      fontWeight: '700',
                    }}
                  >
                    {lp.lapNumber}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      color: t.text,
                      fontSize: 14 * t.fontScale,
                      fontFamily: t.fontDisplay,
                      fontStyle: 'italic',
                      fontWeight: '700',
                    }}
                  >
                    {formatDuration(lp.durationS)}
                  </Text>
                  <Text
                    style={{
                      color: t.text2,
                      fontSize: 12 * t.fontScale,
                      marginRight: 12,
                      fontFamily: t.font,
                    }}
                  >
                    {formatDistance(lp.distanceM)}
                  </Text>
                  <Text
                    style={{
                      color: accent,
                      fontSize: 14 * t.fontScale,
                      fontFamily: t.fontDisplay,
                      fontStyle: 'italic',
                      fontWeight: '700',
                    }}
                  >
                    {lp.paceMinKm !== null ? `${formatPace(lp.paceMinKm)}/км` : '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Splits per km */}
      {splits.length > 0 ? (
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text
            style={{
              color: t.text3,
              fontSize: 11 * t.fontScale,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontFamily: t.font,
              marginBottom: 10,
            }}
          >
            Сплиты по км
          </Text>
          <View
            style={{
              backgroundColor: t.surface,
              borderRadius: 16,
              paddingVertical: 4,
              paddingHorizontal: 14,
            }}
          >
            {splits.map((sp, idx) => {
              const fastest = splitHighlights.fastestKm === sp.km;
              const slowest = splitHighlights.slowestKm === sp.km;
              const accent = fastest ? t.lime : slowest ? t.warn : t.text;
              return (
                <View
                  key={sp.km}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderBottomWidth: idx < splits.length - 1 ? 1 : 0,
                    borderBottomColor: t.divider,
                  }}
                >
                  <Text
                    style={{
                      width: 36,
                      color: t.text2,
                      fontSize: 13 * t.fontScale,
                      fontFamily: t.font,
                      fontWeight: '700',
                    }}
                  >
                    {sp.km}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      color: t.text,
                      fontSize: 14 * t.fontScale,
                      fontFamily: t.fontDisplay,
                      fontStyle: 'italic',
                      fontWeight: '700',
                    }}
                  >
                    {formatDuration(Math.round(sp.durationS))}
                  </Text>
                  <Text
                    style={{
                      color: accent,
                      fontSize: 14 * t.fontScale,
                      fontFamily: t.fontDisplay,
                      fontStyle: 'italic',
                      fontWeight: '700',
                    }}
                  >
                    {formatPace(sp.paceMinKm)}/км
                  </Text>
                  {sp.avgHrBpm !== null ? (
                    <Text
                      style={{
                        marginLeft: 10,
                        color: t.text3,
                        fontSize: 12 * t.fontScale,
                        fontFamily: t.font,
                      }}
                    >
                      {Math.round(sp.avgHrBpm)} уд
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 10 }}>
        <Button
          variant="primary"
          size="lg"
          full
          onPress={handleExport}
          icon={<Icon name="download" size={20} color="#000" />}
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
