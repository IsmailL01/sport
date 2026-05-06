// Карточка с live-метриками: время, дистанция, темп, площадь.
// Перерисовывается раз в секунду через _tick (для обновления времени).

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatArea,
  formatDistance,
  formatDuration,
  formatPace,
} from './format';

export type MetricsBarProps = {
  /** Текущее состояние записи — для подсветки заголовка. */
  state: 'idle' | 'recording' | 'stopped';
  /** На авто-паузе (показывается ⏸ вместо 🔴). */
  isPaused: boolean;
  /** Unix epoch ms на момент Start. null если не запущено. */
  startedAt: number | null;
  /** Дистанция в метрах. */
  distanceM: number;
  /** Текущая скорость в м/с (для расчёта темпа). */
  currentSpeedMs: number;
  /** Кол-во принятых точек. */
  pointCount: number;
  /** Точность последней принятой точки (м). */
  lastAccuracyM: number | null;
  /** Точность последней raw-точки (даже если отброшена). Для диагностики GPS. */
  lastRawAccuracyM: number | null;
  /** Сколько raw-точек получено всего (до pipeline). */
  rawCount: number;
  /** Сколько raw-точек отброшено фильтрами. */
  droppedCount: number;
  /** Имя последнего фильтра, отбросившего точку. */
  lastDropFilter: string | null;
  /** Площадь м², null если трек не замкнут. */
  areaM2: number | null;
  /** Опциональные warnings (например 'self-intersection'). */
  warnings?: readonly string[];
};

export function MetricsBar(props: MetricsBarProps) {
  // Обновляем компонент раз в секунду, чтобы тикало elapsed-время.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (props.state !== 'recording' || props.isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [props.state, props.isPaused]);

  const elapsedSec = props.startedAt
    ? Math.max(0, Math.floor((Date.now() - props.startedAt) / 1000))
    : 0;
  const paceMinKm =
    props.currentSpeedMs > 0 ? 1000 / props.currentSpeedMs / 60 : null;

  const title =
    props.state === 'idle'
      ? 'Готов к записи'
      : props.state === 'recording'
        ? props.isPaused
          ? `⏸ Авто-пауза · ${formatDuration(elapsedSec)}`
          : `🔴 Запись · ${formatDuration(elapsedSec)}`
        : '⏸ Остановлено';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.row}>
        <Stat label="Дистанция" value={formatDistance(props.distanceM)} />
        <Stat label="Темп" value={formatPace(paceMinKm)} />
      </View>

      <Text style={styles.subtitle}>
        {`${props.pointCount}/${props.rawCount} точек`}
        {props.lastRawAccuracyM !== null && (
          <Text
            style={
              props.lastRawAccuracyM > 50
                ? styles.warn
                : props.lastRawAccuracyM > 20
                  ? styles.warnSoft
                  : undefined
            }
          >{`  ·  GPS ±${props.lastRawAccuracyM.toFixed(0)}m`}</Text>
        )}
        {props.droppedCount > 0 && (
          <Text style={styles.warn}>
            {`  ·  отбр.${props.lastDropFilter ? ` (${shortFilter(props.lastDropFilter)})` : ''}: ${props.droppedCount}`}
          </Text>
        )}
      </Text>

      {props.areaM2 !== null && (
        <Text style={styles.area}>🏆 Зона: {formatArea(props.areaM2)}</Text>
      )}

      {props.warnings && props.warnings.length > 0 && (
        <Text style={styles.warn}>
          ⚠ {props.warnings.join(', ')}
        </Text>
      )}
    </View>
  );
}

function shortFilter(name: string): string {
  return name
    .replace('Filter', '')
    .replace('Detector', '')
    .toLowerCase();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(15, 20, 25, 0.88)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  stat: { flex: 1 },
  statLabel: { color: '#64748B', fontSize: 11, textTransform: 'uppercase' },
  statValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: 2 },
  subtitle: { color: '#94A3B8', fontSize: 12 },
  warn: { color: '#F59E0B' },
  warnSoft: { color: '#FCD34D' },
  area: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
});
