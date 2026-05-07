// Workout Player UI — fullscreen overlay показывающий текущий шаг,
// прогресс, target zone, кнопки skip/stop.
// Phase 6 / P6-A-09.

import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  stepProgress,
  stepLimit,
  stepRepeats,
  type WorkoutSessionState,
} from '../domain/training/workoutSession';
import { resolveHrTargetBpm, type Workout, type WorkoutStep } from '../domain/training/workout';
import { useSettingsStore } from '../state/settings';
import { useWorkoutPlayerStore } from '../state/workoutPlayer';
import { resolveMaxHR } from '../domain/athlete';
import { useSensorsStore } from '../state/sensors';
import { useActivityStore } from '../state/activity';
import { totalDistance } from '../util/geo';
import { formatDistance, formatDuration } from './format';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function WorkoutPlayer({ visible, onClose }: Props) {
  const workout = useWorkoutPlayerStore((s) => s.workout);
  const session = useWorkoutPlayerStore((s) => s.session);
  const skip = useWorkoutPlayerStore((s) => s.skip);
  const finish = useWorkoutPlayerStore((s) => s.finish);
  const liveHrBpm = useSensorsStore((s) => s.liveHrBpm);
  const athlete = useSettingsStore((s) => s.athlete);
  const points = useActivityStore((s) => s.points);
  const startedAt = useActivityStore((s) => s.startedAt);

  // Tick UI каждую секунду чтобы прогрессбар плавно обновлялся
  // даже без новых GPS точек.
  const [, setTickTs] = useState(0);
  useEffect(() => {
    if (!visible || session.isComplete) return;
    const id = setInterval(() => setTickTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible, session.isComplete]);

  if (!workout) return null;

  const step = workout.steps[session.currentStepIdx];
  const next = workout.steps[session.currentStepIdx + 1];
  const totalDistM = totalDistance(points);
  const elapsedTotalS = startedAt !== null ? (Date.now() - startedAt) / 1000 : 0;
  const maxHR = resolveMaxHR(athlete);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>{workout.name}</Text>
          <Text style={styles.subtitle}>{workout.description}</Text>

          <View style={styles.totalBar}>
            <Text style={styles.totalText}>
              ⏱ {formatDuration(elapsedTotalS)} · 📏 {formatDistance(totalDistM)}
              {liveHrBpm !== null ? ` · ♥ ${liveHrBpm}` : ''}
            </Text>
          </View>

          {session.isComplete ? (
            <CompletedView />
          ) : step ? (
            <StepCard
              step={step}
              session={session}
              maxHR={maxHR}
              liveHrBpm={liveHrBpm}
            />
          ) : null}

          {next && !session.isComplete && (
            <View style={styles.nextCard}>
              <Text style={styles.nextLabel}>СЛЕДУЮЩИЙ</Text>
              <Text style={styles.nextTitle}>
                {stepTypeLabel(next.type)}
                {(next.repeats ?? 1) > 1 ? ` × ${next.repeats}` : ''}
              </Text>
              {next.description && (
                <Text style={styles.nextDescr}>{next.description}</Text>
              )}
            </View>
          )}

          <View style={styles.allSteps}>
            <Text style={styles.allStepsTitle}>Шаги</Text>
            {workout.steps.map((s, i) => {
              const isCurrent = i === session.currentStepIdx && !session.isComplete;
              const isPast = i < session.currentStepIdx || session.isComplete;
              return (
                <View
                  key={i}
                  style={[
                    styles.allStepRow,
                    isCurrent && styles.allStepRowCurrent,
                    isPast && styles.allStepRowPast,
                  ]}
                >
                  <Text style={[styles.allStepText, isPast && styles.allStepTextPast]}>
                    {isCurrent ? '▶ ' : isPast ? '✓ ' : '  '}
                    {stepTypeLabel(s.type)}
                    {(s.repeats ?? 1) > 1 ? ` × ${s.repeats}` : ''}
                    {' — '}
                    {s.durationType === 'time' && s.durationValue !== null
                      ? `${Math.round(s.durationValue / 60)} мин`
                      : s.durationType === 'distance' && s.durationValue !== null
                      ? `${s.durationValue} м`
                      : 'open'}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          {session.isComplete ? (
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => {
                finish();
                onClose();
              }}
            >
              <Text style={styles.btnText}>Закрыть</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={skip}
              >
                <Text style={styles.btnText}>SKIP</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnDanger]}
                onPress={() => {
                  finish();
                  onClose();
                }}
              >
                <Text style={styles.btnText}>STOP</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function StepCard({
  step,
  session,
  maxHR,
  liveHrBpm,
}: {
  step: WorkoutStep;
  session: WorkoutSessionState;
  maxHR: number | null;
  liveHrBpm: number | null;
}) {
  const progress = stepProgress(session, step);
  const limit = stepLimit(step);
  const repeats = stepRepeats(step);
  const value = step.durationType === 'time'
    ? session.elapsedInStepS
    : session.distanceInStepM;
  const remaining = limit !== null ? Math.max(0, limit - value) : null;

  // HR target в BPM (если задан в %HRmax).
  const hrTargetBpm = maxHR !== null ? resolveHrTargetBpm(step, maxHR) : null;
  const hrInZone = hrTargetBpm !== null && liveHrBpm !== null
    ? liveHrBpm >= hrTargetBpm.minBpm && liveHrBpm <= hrTargetBpm.maxBpm
    : null;

  return (
    <View style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepLabel}>
          {stepTypeLabel(step.type)}
          {repeats > 1 ? ` ${session.repeatIdx + 1}/${repeats}` : ''}
        </Text>
        {limit !== null ? (
          <Text style={styles.stepRemaining}>
            {step.durationType === 'time'
              ? `Осталось ${formatDuration(remaining ?? 0)}`
              : `Осталось ${Math.round(remaining ?? 0)} м`}
          </Text>
        ) : (
          <Text style={styles.stepRemaining}>open</Text>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(progress * 100)}%` },
          ]}
        />
      </View>

      {step.description && (
        <Text style={styles.stepDescription}>{step.description}</Text>
      )}

      <View style={styles.targetRow}>
        {step.targetType === 'hr' && hrTargetBpm !== null && (
          <View
            style={[
              styles.targetCard,
              hrInZone === true && styles.targetCardInZone,
              hrInZone === false && styles.targetCardOutZone,
            ]}
          >
            <Text style={styles.targetLabel}>HR target</Text>
            <Text style={styles.targetValue}>
              {hrTargetBpm.minBpm}–{hrTargetBpm.maxBpm}
            </Text>
            {liveHrBpm !== null && (
              <Text style={styles.targetCurrent}>сейчас {liveHrBpm}</Text>
            )}
          </View>
        )}
        {step.targetType === 'pace' && step.targetMin !== null && step.targetMax !== null && (
          <View style={styles.targetCard}>
            <Text style={styles.targetLabel}>Pace target</Text>
            <Text style={styles.targetValue}>
              {fmtPace(step.targetMin)}–{fmtPace(step.targetMax)}
            </Text>
            <Text style={styles.targetCurrent}>мин/км</Text>
          </View>
        )}
        {step.targetType === 'rpe' && step.targetMin !== null && step.targetMax !== null && (
          <View style={styles.targetCard}>
            <Text style={styles.targetLabel}>RPE</Text>
            <Text style={styles.targetValue}>
              {step.targetMin}–{step.targetMax} / 10
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function CompletedView() {
  return (
    <View style={styles.completedCard}>
      <Text style={styles.completedTitle}>🎉 Тренировка завершена!</Text>
      <Text style={styles.completedSub}>
        Молодец. Не забудь нажать STOP чтобы сохранить пробежку.
      </Text>
    </View>
  );
}

function fmtPace(minKm: number): string {
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function stepTypeLabel(t: WorkoutStep['type']): string {
  switch (t) {
    case 'warmup': return 'Разминка';
    case 'interval': return 'Интервал';
    case 'recovery': return 'Восстановление';
    case 'cooldown': return 'Заминка';
    case 'steady': return 'Ровный темп';
    case 'tempo': return 'Темповой';
    case 'race_pace': return 'Соревн. темп';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419' },
  scroll: { padding: 20, paddingBottom: 120 },
  title: { color: '#F8FAFC', fontSize: 22, fontWeight: '800', marginTop: 24 },
  subtitle: { color: '#94A3B8', fontSize: 13, marginTop: 4, marginBottom: 12 },
  totalBar: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  totalText: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },

  stepCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  stepLabel: { color: '#F8FAFC', fontSize: 18, fontWeight: '700' },
  stepRemaining: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  stepDescription: { color: '#CBD5E1', fontSize: 13, marginTop: 8, lineHeight: 18 },
  progressTrack: {
    height: 8,
    backgroundColor: '#0F1419',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#10B981' },
  targetRow: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  targetCard: {
    backgroundColor: '#0F1419',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    minWidth: 110,
  },
  targetCardInZone: { borderWidth: 1, borderColor: '#10B981' },
  targetCardOutZone: { borderWidth: 1, borderColor: '#EF4444' },
  targetLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  targetValue: { color: '#F8FAFC', fontSize: 16, fontWeight: '700', marginTop: 2 },
  targetCurrent: { color: '#94A3B8', fontSize: 11, marginTop: 2 },

  nextCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  nextLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  nextTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginTop: 4 },
  nextDescr: { color: '#94A3B8', fontSize: 12, marginTop: 4 },

  allSteps: { marginTop: 8 },
  allStepsTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  allStepRow: { paddingVertical: 6 },
  allStepRowCurrent: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  allStepRowPast: { opacity: 0.5 },
  allStepText: { color: '#F8FAFC', fontSize: 13 },
  allStepTextPast: { textDecorationLine: 'line-through' },

  completedCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  completedTitle: { color: '#10B981', fontSize: 22, fontWeight: '800' },
  completedSub: {
    color: '#94A3B8', fontSize: 13, marginTop: 10, textAlign: 'center', lineHeight: 18,
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 36,
    backgroundColor: '#0F1419',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: '#10B981' },
  btnSecondary: { backgroundColor: '#3B82F6' },
  btnDanger: { backgroundColor: '#EF4444' },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});
