// Tab: Запись / post-run summary — Phase 8 / M6.
//
// Открывается из TrackerLive после Save. Принимает sessionId (как строка из
// React-Navigation params, парсится в number).
//
// Содержит:
//   - Cursona header "Готово" + grade chip
//   - Map preview (TrackLayer для open / ZoneLayer для closed)
//   - Stats: distance, duration, avg pace, avg HR, area, calories
//   - Actions: «Export GPX», «Удалить», «Готово»
//
// На mount копируем points/areaM2 из activityStore в локальный snapshot,
// чтобы потом безопасно сделать resetActivity (готов следующий запуск).

import { useEffect, useMemo, useRef } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Card, Icon, useTheme } from '../../../design';
import {
  HistoryTerritoryLayer,
  LocationPuckLayer,
  MapboxView,
  TrackLayer,
  ZoneLayer,
} from '../../../map';
import { useActivityStore } from '../../../state/activity';
import { useHistoryStore } from '../../../state/history';
import { useWalletStore } from '../../../state/wallet';
import { serializeToGpx } from '../../../domain/gpx';
import { totalDistance } from '../../../util/geo';
import {
  formatArea,
  formatCalories,
  formatDistance,
  formatDuration,
  formatPace,
} from '../../../ui/format';
import type { Point } from '../../../domain/types';
import { RECORD_LABELS, type PersonalRecord } from '../../../domain/records';
import { formatRecordValue } from '../../../domain/recordsFormat';
import { fastestAndSlowestLap, type Lap } from '../../../domain/lap';
import type { RecordStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RecordStackParamList, 'RunDetails'>;
type RouteP = RouteProp<RecordStackParamList, 'RunDetails'>;

export function RunDetailsScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteP>();
  const sessionIdNum = Number(route.params?.sessionId ?? 0);

  const refreshHistory = useHistoryStore((s) => s.refresh);
  const deleteSession = useHistoryStore((s) => s.delete);
  const session = useHistoryStore((s) =>
    s.sessions.find((x) => x.id === sessionIdNum),
  );
  const closedSessionsPoints = useHistoryStore((s) => s.closedSessionsPoints);
  const resetActivity = useActivityStore((s) => s.reset);
  const acknowledgeNewRecords = useActivityStore((s) => s.acknowledgeNewRecords);
  const walletTransactions = useWalletStore((s) => s.transactions);
  const coinsEarned = useMemo(() => {
    const tx = walletTransactions.find(
      (x) => x.sourceSessionId === sessionIdNum && x.kind === 'earn',
    );
    return tx?.amount ?? 0;
  }, [walletTransactions, sessionIdNum]);
  const coinsCapped = useMemo(() => {
    const tx = walletTransactions.find(
      (x) => x.sourceSessionId === sessionIdNum && x.kind === 'earn',
    );
    return tx?.meta !== null && tx?.meta !== undefined && tx.meta.capped === true;
  }, [walletTransactions, sessionIdNum]);

  // Snapshot points/area + newRecords + laps из activity (пока ещё state='stopped').
  const snapshot = useRef<{
    points: Point[];
    areaM2: number | null;
    closureFired: boolean;
    newRecords: PersonalRecord[];
    laps: Lap[];
  } | null>(null);
  if (snapshot.current === null) {
    const a = useActivityStore.getState();
    snapshot.current = {
      points: a.points,
      areaM2: a.areaM2,
      closureFired: a.closureFired,
      newRecords: a.lastNewRecords,
      laps: a.laps,
    };
  }
  const { points, areaM2, closureFired, newRecords, laps } = snapshot.current;
  const lapHighlights = useMemo(() => fastestAndSlowestLap(laps), [laps]);

  // Refresh + reset activity один раз. acknowledge → next visit чистый.
  useEffect(() => {
    refreshHistory();
    acknowledgeNewRecords();
    resetActivity();
  }, [refreshHistory, resetActivity, acknowledgeNewRecords]);

  const distanceM = useMemo(() => totalDistance(points), [points]);
  const durationS =
    session !== undefined && session.endedAt !== null
      ? Math.max(0, Math.floor((session.endedAt - session.startedAt) / 1000))
      : 0;
  // avg pace из distance/duration
  const avgPaceMinKm = (() => {
    if (distanceM === 0 || durationS === 0) return null;
    const km = distanceM / 1000;
    return durationS / 60 / km;
  })();

  const handleExport = async () => {
    if (session === undefined || points.length === 0) {
      Alert.alert('Нет данных', 'Сессия ещё не загрузилась.');
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
          deleteSession(sessionIdNum);
          nav.popToTop();
        },
      },
    ]);
  };

  const handleDone = () => {
    nav.popToTop();
  };

  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.text2, fontSize: 14, fontFamily: t.font }}>
          Загружаем сессию…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}>
        <Text
          style={{
            fontSize: 32 * t.fontScale,
            fontWeight: '800',
            letterSpacing: -1,
            color: t.text,
            fontFamily: t.font,
          }}
        >
          Готово
        </Text>
        <Text style={{ color: t.text2, fontSize: 14 * t.fontScale, marginTop: 4, fontFamily: t.font }}>
          {new Date(session.startedAt).toLocaleString('ru-RU')}
        </Text>
      </View>

      {/* Hero — distance + duration */}
      <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <Text style={{ color: t.text3, fontSize: 11 * t.fontScale, fontFamily: t.font, letterSpacing: 0.5 }}>
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
          {closureFired && areaM2 !== null ? (
            <MiniStat label="ПЛОЩАДЬ" value={formatArea(areaM2)} t={t} />
          ) : null}
        </View>
      </View>

      {/* M10.1: новый личный рекорд */}
      {newRecords.length > 0 ? (
        <Card
          style={{
            marginHorizontal: 20,
            marginTop: 20,
            padding: 16,
            backgroundColor: 'rgba(198,245,96,0.12)',
            borderColor: 'rgba(198,245,96,0.32)',
            borderWidth: 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="trophy" size={20} color={t.lime} />
            <Text
              style={{
                color: t.text,
                fontSize: 16 * t.fontScale,
                fontWeight: '800',
                fontFamily: t.font,
                letterSpacing: -0.3,
              }}
            >
              {newRecords.length === 1 ? 'Новый личный рекорд!' : `${newRecords.length} новых рекорда!`}
            </Text>
          </View>
          {newRecords.map((rec) => (
            <View
              key={rec.kind}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font, flex: 1 }}>
                {RECORD_LABELS[rec.kind]}
              </Text>
              <Text
                style={{
                  color: t.text,
                  fontSize: 15 * t.fontScale,
                  fontWeight: '700',
                  fontFamily: t.fontDisplay,
                  fontStyle: 'italic',
                  marginLeft: 12,
                }}
              >
                {formatRecordValue(rec.kind, rec.value)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Coins earned banner */}
      {coinsEarned > 0 ? (
        <Card
          style={{
            marginHorizontal: 20,
            marginTop: 12,
            padding: 14,
            backgroundColor: 'rgba(198,245,96,0.10)',
            borderColor: 'rgba(198,245,96,0.28)',
            borderWidth: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(198,245,96,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="bolt" size={20} color={t.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: t.text,
                fontSize: 15 * t.fontScale,
                fontWeight: '800',
                fontFamily: t.font,
              }}
            >
              +{coinsEarned} монет
            </Text>
            <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 2, fontFamily: t.font }}>
              {coinsCapped ? 'Дневной лимит — часть монет не зачислена' : 'Зачислено в кошелёк'}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* Map preview */}
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
        {/* PHASE1-05: zoom=13 совпадает с MapboxView.zoomLevel по умолчанию для
            followUserLocation=false preview. simplifyForDisplay масштабирует
            tolerance соответственно (см. CONTEXT.md D-13). */}
        <MapboxView followUserLocation={false}>
          <LocationPuckLayer />
          <HistoryTerritoryLayer
            closedSessionsPoints={closedSessionsPoints}
            zoom={13}
          />
          <TrackLayer points={points} zoom={13} />
          {closureFired ? <ZoneLayer points={points} /> : null}
        </MapboxView>
      </View>

      {/* Laps */}
      {laps.length > 0 ? (
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
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
          <Card style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
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
                  <Text style={{ width: 36, color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font, fontWeight: '700' }}>
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
                  <Text style={{ color: t.text2, fontSize: 12 * t.fontScale, marginRight: 12, fontFamily: t.font }}>
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
          </Card>
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

      {/* Done */}
      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <Button variant="ghost" size="md" full onPress={handleDone}>
          Готово
        </Button>
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
      <Text style={{ color: t.text3, fontSize: 10 * t.fontScale, fontFamily: t.font, letterSpacing: 0.5 }}>
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
