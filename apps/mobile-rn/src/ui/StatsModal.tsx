// Экран статистики: агрегация по периодам + график + streaks + цели.
// Phase 4 / P4-A-04..07.

import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  aggregateSessions,
  bucketByDay,
  currentStreakDays,
  type StatsPeriod,
} from '../domain/stats';
import { useHistoryStore } from '../state/history';
import { useSettingsStore } from '../state/settings';
import { BarChart } from './charts/BarChart';
import {
  formatArea,
  formatDistance,
  formatDuration,
  formatPace,
} from './format';

const PERIODS: { id: StatsPeriod; label: string }[] = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё' },
];

export type StatsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function StatsModal({ visible, onClose }: StatsModalProps) {
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const sessions = useHistoryStore((s) => s.sessions);
  const refresh = useHistoryStore((s) => s.refresh);
  const goals = useSettingsStore((s) => s.goals);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const stats = useMemo(() => aggregateSessions(sessions, period), [sessions, period]);
  const week = useMemo(() => bucketByDay(sessions, 7), [sessions]);
  const streak = useMemo(() => currentStreakDays(sessions), [sessions]);

  const dayLabels = week.map((b) => {
    const d = new Date(b.dayStartMs);
    return d.toLocaleDateString('ru-RU', { weekday: 'short' }).slice(0, 2);
  });

  const weekDistanceM = week.reduce((s, b) => s + b.distanceM, 0);
  const weeklyGoalM =
    goals.weeklyDistanceKm !== null ? goals.weeklyDistanceKm * 1000 : null;
  const monthlyAgg = useMemo(() => aggregateSessions(sessions, 'month'), [sessions]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Статистика</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {streak > 0 && (
            <View style={styles.streakCard}>
              <Text style={styles.streakBadge}>🔥 {streak} {streak === 1 ? 'день' : 'дней'} подряд</Text>
              <Text style={styles.streakHint}>не пропускай чтобы не сбросить</Text>
            </View>
          )}

          <View style={styles.tabs}>
            {PERIODS.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.tab, period === p.id && styles.tabActive]}
                onPress={() => setPeriod(p.id)}
              >
                <Text style={[styles.tabText, period === p.id && styles.tabTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.grid}>
            <Tile
              label="Дистанция"
              value={formatDistance(stats.totalDistanceM)}
            />
            <Tile label="Пробежек" value={String(stats.totalSessions)} />
            <Tile
              label="Время"
              value={formatDuration(Math.round(stats.totalDurationS))}
            />
            <Tile
              label="Средний темп"
              value={formatPace(stats.averagePaceMinKm)}
            />
            <Tile
              label="Зона захвачена"
              value={stats.totalAreaM2 > 0 ? formatArea(stats.totalAreaM2) : '—'}
            />
            <Tile
              label="Длиннейшая"
              value={stats.longestSessionM > 0 ? formatDistance(stats.longestSessionM) : '—'}
            />
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.cardTitle}>Последние 7 дней</Text>
              <Text style={styles.cardSubtitle}>
                {formatDistance(weekDistanceM)}
                {weeklyGoalM !== null && ` / ${formatDistance(weeklyGoalM)} цель`}
              </Text>
            </View>
            <BarChart
              values={week.map((b) => b.distanceM)}
              labels={dayLabels}
              maxHeight={120}
              thresholdValue={weeklyGoalM !== null ? weeklyGoalM / 7 : undefined}
              thresholdLabel="дневная цель"
            />
          </View>

          {goals.monthlySessionCount !== null && (
            <View style={styles.chartCard}>
              <Text style={styles.cardTitle}>Месячная цель</Text>
              <Text style={styles.cardSubtitle}>
                {monthlyAgg.totalSessions} / {goals.monthlySessionCount} пробежек
              </Text>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(
                        100,
                        (monthlyAgg.totalSessions / goals.monthlySessionCount) * 100,
                      )}%`,
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E293B',
  },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', flex: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#94A3B8', fontSize: 18 },

  scroll: { padding: 16, gap: 16 },

  streakCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  streakBadge: { color: '#F59E0B', fontSize: 18, fontWeight: '700' },
  streakHint: { color: '#94A3B8', fontSize: 12, marginTop: 4 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#10B981' },
  tabText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
  },
  tileLabel: { color: '#64748B', fontSize: 11, textTransform: 'uppercase' },
  tileValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 4 },

  chartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  cardSubtitle: { color: '#94A3B8', fontSize: 13 },

  progressBg: {
    backgroundColor: '#0F1419',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: { backgroundColor: '#10B981', height: 8 },
});
