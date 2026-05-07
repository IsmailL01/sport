// Детальный экран одной сессии — карта + сплиты + HR-чарт + share GPX.
// Phase 6.5 / extra.

import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Session } from '../domain/types';
import { computeSplits, fastestAndSlowestKm, type SplitInput } from '../domain/splits';
import { computeHrZoneBreakdown } from '../domain/training/hrZoneBreakdown';
import { resolveMaxHR } from '../domain/athlete';
import { useHistoryStore } from '../state/history';
import { useSettingsStore } from '../state/settings';
import { loadSensorReadingsForSession } from '../storage/sensorRepository';
import { serializeToGpx } from '../domain/gpx';
import { MapboxView, TrackLayer, ZoneLayer } from '../map';
import { formatArea, formatDistance, formatDuration, formatPace } from './format';
import { BarChart } from './charts/BarChart';

export type SessionDetailProps = {
  session: Session | null;
  onClose: () => void;
};

export function SessionDetailModal({ session, onClose }: SessionDetailProps) {
  const allPoints = useHistoryStore((s) => s.closedSessionsPoints);
  const athlete = useSettingsStore((s) => s.athlete);
  const points = useMemo(() => {
    if (session === null) return [];
    return allPoints.get(session.id) ?? [];
  }, [session, allPoints]);

  const [hrSamples, setHrSamples] = useState<{ ts: number; bpm: number }[]>([]);
  useEffect(() => {
    if (session === null) return;
    try {
      const readings = loadSensorReadingsForSession(session.id, 'hr');
      setHrSamples(readings.map((r) => ({ ts: r.timestamp, bpm: Math.round(r.value) })));
    } catch (e) {
      console.warn('[SessionDetail] loadSensorReadings failed', e);
      setHrSamples([]);
    }
  }, [session]);

  const zoneBreakdown = useMemo(() => {
    const maxHR = resolveMaxHR(athlete);
    if (maxHR === null || hrSamples.length < 2) return [];
    return computeHrZoneBreakdown(hrSamples, maxHR);
  }, [hrSamples, athlete]);

  // Splits: точки + HR (берём ближайшее по времени readiing для каждой точки).
  const splits = useMemo(() => {
    if (points.length === 0) return [];
    const enriched: SplitInput[] = points.map((p) => ({
      ...p,
      hrBpm: nearestHr(hrSamples, p.timestamp),
    }));
    return computeSplits(enriched);
  }, [points, hrSamples]);

  const { fastestKm, slowestKm } = useMemo(() => fastestAndSlowestKm(splits), [splits]);

  const handleShareGpx = async () => {
    if (!session || points.length === 0) return;
    try {
      const gpx = serializeToGpx(
        { startedAt: session.startedAt, endedAt: session.endedAt },
        points,
      );
      await Share.share({
        message: gpx,
        title: `Running Ecosystem — ${formatStartDate(session.startedAt)}`,
      });
    } catch (e) {
      console.warn('[SessionDetail] share failed', e);
    }
  };

  if (session === null) return null;

  const durationS = session.endedAt !== null
    ? (session.endedAt - session.startedAt) / 1000
    : 0;
  const distanceM = session.distanceM ?? 0;
  const avgPaceMinKm = distanceM > 0 && durationS > 0
    ? (durationS / 60) / (distanceM / 1000)
    : null;

  return (
    <Modal visible={session !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{formatStartDate(session.startedAt)}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.mapWrap}>
            {points.length > 0 && (
              <MapboxView followUserLocation={false}>
                <TrackLayer points={points} />
                {session.isClosed === true && <ZoneLayer points={points} />}
              </MapboxView>
            )}
          </View>

          <View style={styles.metricsRow}>
            <Metric label="Дистанция" value={formatDistance(distanceM)} />
            <Metric label="Время" value={formatDuration(durationS)} />
            <Metric label="Темп" value={avgPaceMinKm !== null ? formatPace(avgPaceMinKm) : '—'} />
          </View>
          <View style={styles.metricsRow}>
            <Metric
              label="Ср. HR"
              value={session.avgHrBpm !== null ? `${session.avgHrBpm}` : '—'}
              hint="bpm"
            />
            <Metric
              label="Макс. HR"
              value={session.maxHrBpm !== null ? `${session.maxHrBpm}` : '—'}
              hint="bpm"
            />
            <Metric
              label="Площадь"
              value={
                session.isClosed === true && session.areaM2 !== null
                  ? formatArea(session.areaM2)
                  : '—'
              }
              hint={session.isClosed === true ? 'замкнут' : 'не замкнут'}
            />
          </View>

          {hrSamples.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>HR за тренировку</Text>
              <BarChart
                values={downsample(hrSamples.map((s) => s.bpm), 60)}
                maxHeight={80}
                color="#EF4444"
              />
            </View>
          )}

          {zoneBreakdown.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Время в зонах</Text>
              <View style={styles.zoneBarRow}>
                {zoneBreakdown.map((entry) => (
                  <View
                    key={entry.zone.index}
                    style={{
                      flex: entry.fraction,
                      backgroundColor: entry.zone.color,
                      height: 14,
                    }}
                  />
                ))}
              </View>
              {zoneBreakdown.map((entry) => (
                <View key={entry.zone.index} style={styles.zoneRow}>
                  <View style={[styles.zoneDot, { backgroundColor: entry.zone.color }]} />
                  <Text style={styles.zoneName}>
                    Z{entry.zone.index} {entry.zone.name}
                  </Text>
                  <Text style={styles.zoneRange}>
                    {entry.zone.lowerBpm}–{entry.zone.upperBpm}
                  </Text>
                  <Text style={styles.zoneTime}>{formatDuration(entry.durationS)}</Text>
                  <Text style={styles.zonePct}>
                    {Math.round(entry.fraction * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {splits.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Сплиты по км</Text>
              <View style={styles.splitsHeader}>
                <Text style={[styles.splitCol, styles.splitColKm]}>км</Text>
                <Text style={[styles.splitCol, styles.splitColPace]}>темп</Text>
                <Text style={[styles.splitCol, styles.splitColTime]}>время</Text>
                <Text style={[styles.splitCol, styles.splitColHr]}>HR</Text>
              </View>
              {splits.map((s) => (
                <View
                  key={s.km}
                  style={[
                    styles.splitsRow,
                    s.km === fastestKm && styles.splitFastest,
                    s.km === slowestKm && styles.splitSlowest,
                  ]}
                >
                  <Text style={[styles.splitCol, styles.splitColKm, styles.splitText]}>
                    {s.km}
                  </Text>
                  <Text style={[styles.splitCol, styles.splitColPace, styles.splitText]}>
                    {formatPace(s.paceMinKm)}
                  </Text>
                  <Text style={[styles.splitCol, styles.splitColTime, styles.splitText]}>
                    {formatDuration(s.durationS)}
                  </Text>
                  <Text style={[styles.splitCol, styles.splitColHr, styles.splitText]}>
                    {s.avgHrBpm ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.shareBtn} onPress={handleShareGpx}>
            <Text style={styles.shareBtnText}>📤 Поделиться GPX</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {hint && <Text style={styles.metricHint}>{hint}</Text>}
    </View>
  );
}

function nearestHr(samples: { ts: number; bpm: number }[], targetTs: number): number | null {
  if (samples.length === 0) return null;
  // Binary search-ish; samples sorted by ts.
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].ts < targetTs) lo = mid + 1;
    else hi = mid;
  }
  // Compare lo and lo-1 distance.
  if (lo === 0) return samples[0].bpm;
  const a = samples[lo - 1];
  const b = samples[lo];
  // Не должен быть слишком далеко (>30s) — иначе считаем что HR не записывался.
  const closer = Math.abs(targetTs - a.ts) < Math.abs(b.ts - targetTs) ? a : b;
  if (Math.abs(closer.ts - targetTs) > 30_000) return null;
  return closer.bpm;
}

function downsample(values: number[], maxBuckets: number): number[] {
  if (values.length <= maxBuckets) return values;
  const bucketSize = Math.ceil(values.length / maxBuckets);
  const out: number[] = [];
  for (let i = 0; i < values.length; i += bucketSize) {
    const slice = values.slice(i, i + bucketSize);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

function formatStartDate(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E293B',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E293B',
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginTop: -2 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },

  scroll: { padding: 16, paddingBottom: 64, gap: 14 },
  mapWrap: {
    height: 240,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
  },

  metricsRow: { flexDirection: 'row', gap: 10 },
  metric: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  metricLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  metricValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 4 },
  metricHint: { color: '#64748B', fontSize: 11, marginTop: 2 },

  card: { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, gap: 8 },
  cardTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  splitsHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  splitsRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  splitFastest: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  splitSlowest: { backgroundColor: 'rgba(239, 68, 68, 0.10)' },
  splitCol: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  splitText: { color: '#FFFFFF', fontSize: 13 },
  splitColKm: { width: 36 },
  splitColPace: { flex: 1, textAlign: 'left' },
  splitColTime: { flex: 1, textAlign: 'left' },
  splitColHr: { width: 50, textAlign: 'right' },

  zoneBarRow: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 8,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  zoneDot: { width: 10, height: 10, borderRadius: 5 },
  zoneName: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  zoneRange: { color: '#94A3B8', fontSize: 11, width: 64, textAlign: 'right' },
  zoneTime: { color: '#FFFFFF', fontSize: 12, width: 56, textAlign: 'right' },
  zonePct: { color: '#94A3B8', fontSize: 12, width: 36, textAlign: 'right' },

  shareBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  shareBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
