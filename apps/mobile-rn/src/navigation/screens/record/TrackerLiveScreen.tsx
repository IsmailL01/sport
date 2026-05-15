// Tab: Запись / live — Phase 8 / M6.
//
// During recording:
//   - Full-screen Mapbox с TrackLayer + CorridorLayer (open) / ZoneLayer (closed)
//   - Top overlay: 4 крупных метрики (distance, time, pace, HR) в Cursona стиле
//   - Bottom: Pause/Resume + Stop buttons
//
// Stop flow (Alert):
//   - Cancel
//   - Удалить → locationAdapter.stop + activity.stop + reset → nav.goBack
//   - Сохранить → locationAdapter.stop + activity.stop + (sync + health) →
//                 nav.replace('RunDetails', { sessionId })
//
// Swipe-back / gestureEnabled выключен на уровне navigator (AppTabs.tsx).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Icon, useTheme } from '../../../design';
import {
  CorridorLayer,
  HistoryTerritoryLayer,
  LocationPuckLayer,
  MapboxView,
  TrackLayer,
  ZoneLayer,
} from '../../../map';
import { locationAdapter } from '../../../location';
import { useActivityStore } from '../../../state/activity';
import { useHistoryStore } from '../../../state/history';
import { useSensorsStore } from '../../../state/sensors';
import { useSyncStore } from '../../../state/sync';
import { writeSessionToHealth } from '../../../health/sync';
import { currentPace, currentSpeed } from '../../../domain/metrics';
import { bestPaceForDistance } from '../../../domain/records';
import { totalDistance } from '../../../util/geo';
import { formatDistance, formatDuration, formatPace } from '../../../ui/format';
import { useClosureFeedback } from './hooks/useClosureFeedback';
import { useLayerVisibility } from './hooks/useLayerVisibility';
import { usePauseUI } from './hooks/usePauseUI';
import { useTrackerCamera } from './hooks/useTrackerCamera';
import type { RecordStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RecordStackParamList, 'TrackerLive'>;

export function TrackerLiveScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();

  // PHASE1-06: camera / layer-visibility / pause-UI логика вынесена в hooks.
  // Селекторы ниже остались для метрик / Stop+Save flow / lap controls —
  // их move в hooks выйдет за scope этого плана (см. CONTEXT.md D-06).
  const { cameraProps } = useTrackerCamera();
  const layerFlags = useLayerVisibility();
  const pauseUi = usePauseUI();
  // PHASE1-08: haptic + toast feedback при первом замыкании зоны в сессии.
  // Hook — fire-and-forget, ничего не возвращает. См. CONTEXT.md D-16..D-19.
  useClosureFeedback();

  const points = useActivityStore((s) => s.points);
  const startedAt = useActivityStore((s) => s.startedAt);
  const stopActivity = useActivityStore((s) => s.stop);
  const resetActivity = useActivityStore((s) => s.reset);
  const markLap = useActivityStore((s) => s.markLap);
  const laps = useActivityStore((s) => s.laps);
  const closedSessionsPoints = useHistoryStore((s) => s.closedSessionsPoints);
  const triggerSync = useSyncStore((s) => s.trigger);
  const liveHr = useSensorsStore((s) => s.liveHrBpm);

  // Тик для обновления длительности (раз в секунду).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const distanceM = useMemo(() => totalDistance(points), [points]);
  const speedMs = useMemo(() => currentSpeed(points), [points]);
  const paceMinKm = currentPace(speedMs);
  const durationS = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  // M10.4: avg + best 1km pace на лету (cheap при <1000 точек).
  const avgPaceMinKm = (distanceM > 0 && durationS > 0)
    ? durationS / 60 / (distanceM / 1000)
    : null;
  const bestPace1KmMinKm = useMemo(
    () => bestPaceForDistance(points, 1000),
    [points],
  );

  // Guard: если кто-то занавиговал сюда не имея recording — kick обратно.
  const stateRef = useRef(useActivityStore.getState().state);
  useEffect(() => {
    stateRef.current = useActivityStore.getState().state;
    if (stateRef.current === 'idle') {
      nav.goBack();
    }
  }, [nav]);

  const handleStop = () => {
    Alert.alert(
      'Завершить запись?',
      'Сохранить пробежку или удалить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await locationAdapter.stop();
            stopActivity();
            resetActivity();
            nav.goBack();
          },
        },
        {
          text: 'Сохранить',
          isPreferred: true,
          onPress: async () => {
            await locationAdapter.stop();
            stopActivity();
            const s = useActivityStore.getState();
            // Fire-and-forget: sync + health-write.
            triggerSync().catch((e) => console.warn('[Tracker] sync after stop failed', e));
            if (s.sessionId !== null && s.startedAt !== null && s.endedAt !== null) {
              const sess = useHistoryStore.getState().sessions.find((x) => x.id === s.sessionId);
              writeSessionToHealth({
                id: s.sessionId,
                startedAt: s.startedAt,
                endedAt: s.endedAt,
                distanceM: totalDistance(s.points),
                avgHrBpm: sess?.avgHrBpm ?? null,
                calories: sess?.caloriesKcal ?? null,
              }).catch((e) => console.warn('[Tracker] writeSessionToHealth failed', e));
              nav.replace('RunDetails', { sessionId: String(s.sessionId) });
            } else {
              // Нет точек? Просто назад на старт.
              resetActivity();
              nav.goBack();
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <MapboxView
        followUserLocation={cameraProps.followUserLocation}
        followZoomLevel={cameraProps.followZoomLevel}
      >
        <LocationPuckLayer />
        {/* PHASE1-05: zoom прокидываем из useTrackerCamera (live followZoomLevel ≈ 16),
            чтобы simplifyForDisplay масштабировал tolerance под текущий масштаб. */}
        <HistoryTerritoryLayer
          closedSessionsPoints={closedSessionsPoints}
          zoom={cameraProps.followZoomLevel}
        />
        {layerFlags.showCorridor && <CorridorLayer points={points} />}
        {layerFlags.showTrack && (
          <TrackLayer points={points} zoom={cameraProps.followZoomLevel} />
        )}
        {layerFlags.showZone && <ZoneLayer points={points} />}
      </MapboxView>

      {/* Тусклая карта на паузе — overlay поверх MapboxView. */}
      {layerFlags.dimOverlay ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
        />
      ) : null}

      {/* Top overlay: метрики */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 56,
          left: 16,
          right: 16,
          backgroundColor: 'rgba(0,0,0,0.72)',
          borderRadius: 24,
          padding: 18,
        }}
      >
        {/* Главная — дистанция огромным */}
        <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, fontFamily: t.font, letterSpacing: 0.5 }}>
          ДИСТАНЦИЯ
        </Text>
        <Text
          style={{
            color: t.text,
            fontSize: 56 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            fontStyle: 'italic',
            letterSpacing: -2,
            marginTop: 2,
          }}
        >
          {formatDistance(distanceM)}
        </Text>

        {/* Row из 3 sub-метрик */}
        <View style={{ flexDirection: 'row', marginTop: 14, gap: 16 }}>
          <SubMetric label="ВРЕМЯ" value={formatDuration(durationS)} t={t} />
          <SubMetric label="ТЕМП" value={`${formatPace(paceMinKm)}`} sub="/км" t={t} />
          <SubMetric
            label="ПУЛЬС"
            value={liveHr === null ? '—' : String(liveHr)}
            sub={liveHr === null ? '' : 'уд/мин'}
            t={t}
          />
        </View>

        {/* M10.4: Avg + Best 1km pace */}
        <View style={{ flexDirection: 'row', marginTop: 10, gap: 16 }}>
          <SubMetric
            label="СР. ТЕМП"
            value={avgPaceMinKm !== null ? formatPace(avgPaceMinKm) : '—'}
            sub={avgPaceMinKm !== null ? '/км' : ''}
            t={t}
          />
          <SubMetric
            label="BEST 1K"
            value={bestPace1KmMinKm !== null ? formatPace(bestPace1KmMinKm) : '—'}
            sub={bestPace1KmMinKm !== null ? '/км' : ''}
            t={t}
          />
          <View style={{ flex: 1 }} />
        </View>

        {pauseUi.isPaused ? (
          <Text style={{ marginTop: 10, color: t.warn, fontSize: 13, fontWeight: '700', fontFamily: t.font }}>
            ⏸ Пауза
          </Text>
        ) : null}
      </View>

      {/* Bottom controls */}
      <View
        style={{
          position: 'absolute',
          bottom: 36,
          left: 16,
          right: 16,
          flexDirection: 'row',
          gap: 10,
        }}
      >
        <Pressable
          onPress={markLap}
          disabled={pauseUi.isPaused || points.length < 2}
          style={({ pressed }) => ({
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: t.surface,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : pauseUi.isPaused || points.length < 2 ? 0.4 : 1,
          })}
        >
          <Icon name="stopwatch" size={22} color={t.text} />
          {laps.length > 0 ? (
            <Text
              style={{
                position: 'absolute',
                bottom: 6,
                color: t.lime,
                fontSize: 10,
                fontWeight: '800',
                fontFamily: t.font,
              }}
            >
              {laps.length}
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={pauseUi.toggle}
          style={({ pressed }) => ({
            flex: 1,
            height: 64,
            borderRadius: 32,
            backgroundColor: t.surface,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name={pauseUi.isPaused ? 'play' : 'pause'} size={22} color={t.text} />
          <Text style={{ color: t.text, fontSize: 15 * t.fontScale, fontWeight: '700', fontFamily: t.font }}>
            {pauseUi.pauseLabel}
          </Text>
        </Pressable>

        <Pressable
          testID="tracker-stop-button"
          onPress={handleStop}
          style={({ pressed }) => ({
            flex: 1,
            height: 64,
            borderRadius: 32,
            backgroundColor: t.error,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Icon name="stop" size={22} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15 * t.fontScale, fontWeight: '800', fontFamily: t.font }}>
            СТОП
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SubMetric({
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
    <View style={{ flex: 1 }}>
      <Text style={{ color: t.text3, fontSize: 10 * t.fontScale, fontFamily: t.font, letterSpacing: 0.5 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <Text
          style={{
            color: t.text,
            fontSize: 22 * t.fontScale,
            fontWeight: '800',
            fontFamily: t.fontDisplay,
            fontStyle: 'italic',
          }}
        >
          {value}
        </Text>
        {sub ? (
          <Text style={{ color: t.text2, fontSize: 11 * t.fontScale, fontFamily: t.font }}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
