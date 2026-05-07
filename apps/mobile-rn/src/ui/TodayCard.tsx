// Виджет «Сегодня» в правой колонке главного экрана.
// Показывает рекомендацию на сегодня + быстрый запуск.
// Phase 9 / extra. Дизайн нейтральный — будет переделан позже.

import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  recommendToday,
  startOfWeekLocal,
  tssByDayOfWeek,
} from '../domain/training/planGenerator';
import type { WorkoutType } from '../domain/training/planGenerator';
import { useTrainingStore } from '../state/training';
import { useSettingsStore } from '../state/settings';
import { WORKOUT_LIBRARY } from '../domain/training/workout';

export function TodayCard({
  onStartWorkout,
}: {
  /** Пользователь нажал ▶ → передать workout id наверх для запуска плеера. */
  onStartWorkout: (workoutId: string) => void;
}) {
  const pmc = useTrainingStore((s) => s.pmc);
  const sessionsWithTSS = useTrainingStore((s) => s.sessionsWithTSS);
  const recompute = useTrainingStore((s) => s.recompute);
  const goals = useSettingsStore((s) => s.goals);

  // Recompute on mount чтобы видеть свежие данные после новых сессий.
  useEffect(() => {
    recompute();
  }, [recompute]);

  const rec = useMemo(() => {
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7;
    const weekStart = startOfWeekLocal(today);
    const tssPerDay = tssByDayOfWeek(sessionsWithTSS, weekStart);
    const weeklyTssSoFar = tssPerDay.slice(0, dayOfWeek).reduce((a, b) => a + b, 0);
    return recommendToday({
      pmc,
      weeklyDistanceKmGoal: goals.weeklyDistanceKm,
      dayOfWeek,
      weeklyTssSoFar,
    });
  }, [pmc, sessionsWithTSS, goals.weeklyDistanceKm]);

  const w = rec.suggestedWorkout
    ?? (rec.workoutType !== 'rest' ? WORKOUT_LIBRARY.find((x) => x.id === 'easy-30') ?? null : null);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>СЕГОДНЯ</Text>
      <Text style={styles.type}>{labelWorkoutType(rec.workoutType)}</Text>
      {rec.targetTss > 0 && (
        <Text style={styles.tss}>~{rec.targetTss} TSS</Text>
      )}
      {w !== null && (
        <Pressable
          style={styles.startBtn}
          onPress={() => onStartWorkout(w.id)}
          hitSlop={6}
        >
          <Text style={styles.startText}>▶ Старт</Text>
        </Pressable>
      )}
    </View>
  );
}

function labelWorkoutType(t: WorkoutType): string {
  switch (t) {
    case 'rest': return 'Отдых';
    case 'easy': return 'Лёгкий';
    case 'long': return 'Длительный';
    case 'tempo': return 'Темповой';
    case 'interval': return 'Интервалы';
    case 'race_pace': return 'Race pace';
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(15, 20, 25, 0.92)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 130,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    alignItems: 'flex-end',
  },
  label: { color: '#94A3B8', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  type: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  tss: { color: '#94A3B8', fontSize: 10, marginTop: 1 },
  startBtn: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 4,
  },
  startText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
});
