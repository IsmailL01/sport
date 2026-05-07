// Performance Manager Chart + Race Predictor + Workout Library.
// Phase 6 / P6-A-04, P6-A-07, P6-A-10.

import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { tsbZone } from '../domain/training/banister';
import {
  STANDARD_DISTANCES_M,
  paceMinKmFromTime,
  predictCameron,
  predictRiegel,
  type StandardDistanceId,
} from '../domain/training/racePredictor';
import { WORKOUT_LIBRARY, workoutTotalDurationS } from '../domain/training/workout';
import {
  generateWeeklyPlan,
  recommendToday,
  startOfWeekLocal,
  type WorkoutType,
} from '../domain/training/planGenerator';
import { useHistoryStore } from '../state/history';
import { useSettingsStore } from '../state/settings';
import { useTrainingStore } from '../state/training';
import { useWorkoutPlayerStore } from '../state/workoutPlayer';
import { BarChart } from './charts/BarChart';
import { formatDistance, formatDuration, formatPace } from './format';

export type TrainingModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Открыть workout player после выбора workout-а. */
  onStartWorkout?: () => void;
};

type Tab = 'plan' | 'pmc' | 'race' | 'workouts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'План' },
  { id: 'pmc', label: 'PMC' },
  { id: 'race', label: 'Прогноз' },
  { id: 'workouts', label: 'Тренировки' },
];

export function TrainingModal({ visible, onClose, onStartWorkout }: TrainingModalProps) {
  const [tab, setTab] = useState<Tab>('plan');
  const refreshHistory = useHistoryStore((s) => s.refresh);
  const recompute = useTrainingStore((s) => s.recompute);
  const startPlayer = useWorkoutPlayerStore((s) => s.start);

  useEffect(() => {
    if (visible) {
      refreshHistory();
      recompute();
    }
  }, [visible, refreshHistory, recompute]);

  const handleStartWorkout = (workoutId: string) => {
    const w = WORKOUT_LIBRARY.find((x) => x.id === workoutId);
    if (!w) return;
    startPlayer(w);
    onClose();
    onStartWorkout?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Тренировки</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.tab, tab === t.id && styles.tabActive]}
              onPress={() => setTab(t.id)}
            >
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'plan' && <PlanTab onStart={handleStartWorkout} />}
        {tab === 'pmc' && <PmcTab />}
        {tab === 'race' && <RaceTab />}
        {tab === 'workouts' && <WorkoutsTab onStart={handleStartWorkout} />}
      </View>
    </Modal>
  );
}

function PlanTab({ onStart }: { onStart: (id: string) => void }) {
  const pmc = useTrainingStore((s) => s.pmc);
  const goals = useSettingsStore((s) => s.goals);

  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // JS: Sun=0, Mon=1; нам надо Mon=0
  const weekStart = startOfWeekLocal(today);

  // Сколько TSS набрали за эту неделю до сегодня.
  const sessionsWithTSS = useTrainingStore((s) => s.sessionsWithTSS);
  const weeklyTssSoFar = sessionsWithTSS
    .filter((s) => s.startedAt >= weekStart && s.startedAt < weekStart + dayOfWeek * 86_400_000)
    .reduce((sum, s) => sum + (s.tss ?? 0), 0);

  const todayRec = recommendToday({
    pmc,
    weeklyDistanceKmGoal: goals.weeklyDistanceKm,
    dayOfWeek,
    weeklyTssSoFar,
  });

  const plan = generateWeeklyPlan({
    pmc,
    weeklyDistanceKmGoal: goals.weeklyDistanceKm,
    weekStart,
  });

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.planTodayCard}>
        <Text style={styles.planTodayLabel}>СЕГОДНЯ</Text>
        <Text style={styles.planTodayType}>{labelWorkoutType(todayRec.workoutType)}</Text>
        {todayRec.targetTss > 0 && (
          <Text style={styles.planTodayTss}>Цель ~{todayRec.targetTss} TSS</Text>
        )}
        <Text style={styles.planTodayRationale}>{todayRec.rationale}</Text>
        {todayRec.suggestedWorkout !== null && (
          <Pressable
            style={styles.planStartBtn}
            onPress={() => onStart(todayRec.suggestedWorkout!.id)}
          >
            <Text style={styles.planStartBtnText}>
              ▶ {todayRec.suggestedWorkout.name}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.planWeekCard}>
        <View style={styles.planWeekHeader}>
          <Text style={styles.cardTitle}>Эта неделя</Text>
          <Text style={styles.planWeekTotal}>≈ {plan.totalTargetTss} TSS</Text>
        </View>

        {plan.days.map((day) => {
          const isToday = day.dayOfWeek === dayOfWeek;
          return (
            <View
              key={day.dayOfWeek}
              style={[styles.planDayRow, isToday && styles.planDayRowToday]}
            >
              <Text style={styles.planDayName}>{labelDayOfWeek(day.dayOfWeek)}</Text>
              <View style={styles.planDayBody}>
                <Text style={styles.planDayType}>
                  {labelWorkoutType(day.recommendation.workoutType)}
                </Text>
                {day.recommendation.targetTss > 0 && (
                  <Text style={styles.planDayTss}>{day.recommendation.targetTss} TSS</Text>
                )}
              </View>
              {day.recommendation.suggestedWorkout !== null ? (
                <Pressable
                  hitSlop={6}
                  onPress={() => onStart(day.recommendation.suggestedWorkout!.id)}
                  style={styles.planDayPlay}
                >
                  <Text style={styles.planDayPlayText}>▶</Text>
                </Pressable>
              ) : (
                <View style={styles.planDayPlay} />
              )}
            </View>
          );
        })}
      </View>

      <Text style={styles.cardSubtitle}>
        План пересчитывается ежедневно. Если форма меняется (TSB) — recommendations
        корректируются автоматически. Прогресс по неделе — на главном экране.
      </Text>
    </ScrollView>
  );
}

function labelWorkoutType(t: WorkoutType): string {
  switch (t) {
    case 'rest': return 'Отдых';
    case 'easy': return 'Лёгкий бег';
    case 'long': return 'Длительный';
    case 'tempo': return 'Темповой';
    case 'interval': return 'Интервалы';
    case 'race_pace': return 'Соревн. темп';
  }
}

function labelDayOfWeek(d: number): string {
  return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][d] ?? '';
}

function PmcTab() {
  const pmc = useTrainingStore((s) => s.pmc);
  const lthrBpm = useTrainingStore((s) => s.lthrBpm);
  const lthrPaceMinKm = useTrainingStore((s) => s.lthrPaceMinKm);

  const today = pmc[pmc.length - 1];
  const tsb = today?.tsb ?? 0;
  const ctl = today?.ctl ?? 0;
  const atl = today?.atl ?? 0;
  const zone = tsbZone(tsb);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Сегодня</Text>
        <View style={styles.metricsRow}>
          <Metric label="Фитнес (CTL)" value={ctl.toFixed(1)} hint="42-дн. среднее" />
          <Metric label="Усталость (ATL)" value={atl.toFixed(1)} hint="7-дн. среднее" />
          <Metric label="Форма (TSB)" value={(tsb >= 0 ? '+' : '') + tsb.toFixed(1)} hint={zone.zone} />
        </View>
        <Text style={[styles.zoneHint, zoneStyle(zone.zone)]}>{zone.hint}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Дневной TSS — последние 30 дней</Text>
        <BarChart
          values={pmc.slice(-30).map((p) => p.tss)}
          maxHeight={100}
          color="#10B981"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>CTL (фитнес) и ATL (усталость) — 90 дней</Text>
        <View style={{ position: 'relative', height: 100 }}>
          <BarChart
            values={pmc.map((p) => p.ctl)}
            maxHeight={100}
            color="rgba(59, 130, 246, 0.7)"
          />
        </View>
        <Text style={styles.cardSubtitle}>
          🟦 CTL — рост = улучшение фитнеса (медленный)
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Оценка порогов</Text>
        <Text style={styles.cardRow}>
          LTHR (HR порог):{' '}
          <Text style={styles.cardValue}>
            {lthrBpm !== null ? `${lthrBpm} уд/мин` : 'нужен maxHR + история'}
          </Text>
        </Text>
        <Text style={styles.cardRow}>
          LTHR pace:{' '}
          <Text style={styles.cardValue}>
            {lthrPaceMinKm !== null ? formatPace(lthrPaceMinKm) : '—'}
          </Text>
        </Text>
        <Text style={styles.cardSubtitle}>
          Phase 6.5 — реальный 30-min test для точной оценки.
        </Text>
      </View>
    </ScrollView>
  );
}

function RaceTab() {
  const [knownDistance, setKnownDistance] = useState<StandardDistanceId>('5k');
  const [timeMin, setTimeMin] = useState('25');
  const [timeSec, setTimeSec] = useState('00');

  const known = STANDARD_DISTANCES_M.find((d) => d.id === knownDistance)!;
  const timeS = (parseInt(timeMin || '0', 10) || 0) * 60 + (parseInt(timeSec || '0', 10) || 0);

  const predictions = useMemo(() => {
    if (timeS <= 0) return [];
    return STANDARD_DISTANCES_M.filter((d) => d.id !== knownDistance).map((d) => {
      const tRiegel = predictRiegel(known.m, timeS, d.m);
      const tCameron = predictCameron(known.m, timeS, d.m);
      return {
        distance: d,
        riegelS: tRiegel,
        cameronS: tCameron,
        riegelPace: paceMinKmFromTime(d.m, tRiegel),
      };
    });
  }, [known, timeS, knownDistance]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Известный результат</Text>
        <View style={styles.distanceRow}>
          {STANDARD_DISTANCES_M.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => setKnownDistance(d.id)}
              style={[styles.distChip, knownDistance === d.id && styles.distChipActive]}
            >
              <Text style={[styles.distChipText, knownDistance === d.id && styles.distChipTextActive]}>
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.timeRow}>
          <TextInput
            style={styles.timeInput}
            value={timeMin}
            onChangeText={setTimeMin}
            keyboardType="number-pad"
            placeholder="мин"
            placeholderTextColor="#475569"
          />
          <Text style={styles.timeSep}>:</Text>
          <TextInput
            style={styles.timeInput}
            value={timeSec}
            onChangeText={setTimeSec}
            keyboardType="number-pad"
            placeholder="сек"
            placeholderTextColor="#475569"
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Прогнозы</Text>
        {predictions.length === 0 ? (
          <Text style={styles.cardSubtitle}>Введи время, чтобы увидеть прогнозы.</Text>
        ) : (
          predictions.map((p) => (
            <View key={p.distance.id} style={styles.predRow}>
              <Text style={styles.predDist}>{p.distance.label}</Text>
              <View style={{ alignItems: 'flex-end', flex: 1 }}>
                <Text style={styles.predTime}>{formatDuration(Math.round(p.riegelS))}</Text>
                <Text style={styles.predPace}>
                  ≈ {formatPace(p.riegelPace)}
                  {p.distance.m > 15000 && (
                    <Text style={styles.cameronHint}>
                      {' '}· Cameron {formatDuration(Math.round(p.cameronS))}
                    </Text>
                  )}
                </Text>
              </View>
            </View>
          ))
        )}
        <Text style={styles.cardSubtitle}>
          Riegel formula. Для длинных дистанций показывается также Cameron
          (более консервативная).
        </Text>
      </View>
    </ScrollView>
  );
}

function WorkoutsTab({ onStart }: { onStart: (id: string) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {WORKOUT_LIBRARY.map((w) => (
        <View key={w.id} style={styles.workoutCard}>
          <View style={styles.workoutHeader}>
            <Text style={styles.workoutName}>{w.name}</Text>
            <Text style={[styles.workoutLevel, levelStyle(w.level)]}>
              {labelLevel(w.level)}
            </Text>
          </View>
          <Text style={styles.workoutDesc}>{w.description}</Text>
          <Text style={styles.workoutMeta}>
            {workoutTotalDurationS(w) > 0
              ? `≈ ${formatDuration(workoutTotalDurationS(w))}`
              : 'open ended'}
            {' · '}
            {w.steps.length} шаг{w.steps.length === 1 ? '' : 'а'}
          </Text>
          <Pressable style={styles.workoutStartBtn} onPress={() => onStart(w.id)}>
            <Text style={styles.workoutStartText}>▶ Запустить</Text>
          </Pressable>
        </View>
      ))}
      <Text style={styles.cardSubtitle}>
        Запуск открывает плеер с прогрессом по шагам и голосовыми подсказками.
        Начни запись пробежки (START на главном экране) до старта тренировки —
        тогда плеер будет привязан к реальной дистанции.
      </Text>
    </ScrollView>
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

function zoneStyle(zone: ReturnType<typeof tsbZone>['zone']) {
  switch (zone) {
    case 'fresh': return { color: '#94A3B8' };
    case 'optimal': return { color: '#10B981' };
    case 'neutral': return { color: '#FFFFFF' };
    case 'fatigued': return { color: '#F59E0B' };
    case 'overreached': return { color: '#EF4444' };
  }
}

function levelStyle(level: 'easy' | 'moderate' | 'hard') {
  switch (level) {
    case 'easy': return { backgroundColor: '#10B981' };
    case 'moderate': return { backgroundColor: '#F59E0B' };
    case 'hard': return { backgroundColor: '#EF4444' };
  }
}

function labelLevel(level: 'easy' | 'moderate' | 'hard'): string {
  return { easy: 'легко', moderate: 'средне', hard: 'сложно' }[level];
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
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E293B',
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#94A3B8', fontSize: 18 },

  tabsRow: {
    flexDirection: 'row', backgroundColor: '#1E293B',
    margin: 16, marginBottom: 0, borderRadius: 10, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#10B981' },
  tabText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },

  scroll: { padding: 16, gap: 12 },
  card: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, gap: 6 },
  cardTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { color: '#64748B', fontSize: 11, marginTop: 4 },
  cardRow: { color: '#94A3B8', fontSize: 13 },
  cardValue: { color: '#FFFFFF', fontWeight: '600' },

  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, backgroundColor: '#0F1419', borderRadius: 8, padding: 10 },
  metricLabel: { color: '#64748B', fontSize: 10, textTransform: 'uppercase' },
  metricValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 2 },
  metricHint: { color: '#475569', fontSize: 9, marginTop: 2 },

  zoneHint: { fontSize: 12, marginTop: 8, fontWeight: '600' },

  distanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  distChip: {
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0F1419',
    borderRadius: 8,
  },
  distChipActive: { backgroundColor: '#10B981' },
  distChipText: { color: '#94A3B8', fontSize: 12 },
  distChipTextActive: { color: '#FFFFFF', fontWeight: '600' },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  timeInput: {
    backgroundColor: '#0F1419', color: '#FFFFFF', fontSize: 24,
    fontWeight: '700', textAlign: 'center', minWidth: 70, padding: 8,
    borderRadius: 8,
  },
  timeSep: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },

  predRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#0F1419',
  },
  predDist: { color: '#94A3B8', fontSize: 14, flex: 1 },
  predTime: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  predPace: { color: '#64748B', fontSize: 11, marginTop: 2 },
  cameronHint: { color: '#475569' },

  workoutCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, gap: 4 },
  workoutHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  workoutName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', flex: 1 },
  workoutLevel: {
    color: '#FFFFFF', fontSize: 10, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, fontWeight: '700',
  },
  workoutDesc: { color: '#94A3B8', fontSize: 12 },
  workoutMeta: { color: '#64748B', fontSize: 11, marginTop: 2 },
  workoutStartBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  workoutStartText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  // Plan tab — neutral styling. Дизайн будет переделан позже.
  planTodayCard: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planTodayLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  planTodayType: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginTop: 4 },
  planTodayTss: { color: '#94A3B8', fontSize: 13, marginTop: 2 },
  planTodayRationale: { color: '#CBD5E1', fontSize: 13, marginTop: 8, lineHeight: 18 },
  planStartBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
  },
  planStartBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  planWeekCard: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  planWeekTotal: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  planDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 12,
  },
  planDayRowToday: {
    backgroundColor: '#0F1419',
    borderRadius: 6,
    paddingHorizontal: 8,
  },
  planDayName: { color: '#94A3B8', fontSize: 12, fontWeight: '700', width: 28 },
  planDayBody: { flex: 1 },
  planDayType: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  planDayTss: { color: '#64748B', fontSize: 11, marginTop: 1 },
  planDayPlay: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  planDayPlayText: { color: '#94A3B8', fontSize: 14, marginTop: -2 },
});
