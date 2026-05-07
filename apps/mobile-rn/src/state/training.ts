// Computed training metrics: TSS per session, daily PMC.
// Phase 6 / P6-A.

import { create } from 'zustand';

import { buildDailyTSS, computePMC, type PMCPoint } from '../domain/training/banister';
import {
  estimateLthrFromHistory,
  estimateLthrPaceFromHistory,
} from '../domain/training/lthr';
import {
  averagePaceFromTotals,
  bestTSS,
} from '../domain/training/tss';
import { useHistoryStore } from './history';
import { useSettingsStore } from './settings';
import { resolveMaxHR } from '../domain/athlete';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionWithTSS = {
  id: number;
  startedAt: number;
  durationS: number;
  distanceM: number;
  /** Уже вычисленный TSS (null если нет данных). */
  tss: number | null;
  tssMethod: 'hr' | 'pace' | null;
  avgPaceMinKm: number | null;
};

type TrainingStore = {
  /** Computed TSS для всех сессий пользователя. */
  sessionsWithTSS: SessionWithTSS[];
  /** PMC за последние 90 дней. */
  pmc: PMCPoint[];
  lthrBpm: number | null;
  lthrPaceMinKm: number | null;

  recompute: () => void;
};

export const useTrainingStore = create<TrainingStore>((set) => ({
  sessionsWithTSS: [],
  pmc: [],
  lthrBpm: null,
  lthrPaceMinKm: null,

  recompute: () => {
    const sessions = useHistoryStore.getState().sessions;
    const athlete = useSettingsStore.getState().athlete;

    // Шаг 1: оценить LTHR из истории — берём avg HR из last sessions если
    // они есть. Phase 5+: будем хранить avgHr в session metadata; пока null.
    // Поэтому LTHR оценивается только если пользователь явно задал maxHR + restingHR.
    const maxHR = resolveMaxHR(athlete);
    // Простая эвристика: LTHR ≈ 0.85 × maxHR.
    const lthrBpm = maxHR !== null ? Math.round(maxHR * 0.85) : null;

    // Шаг 2: оценить LTHR pace — 5-й перцентиль самого быстрого темпа.
    const sessionPaces = sessions
      .filter((s) => s.endedAt !== null && s.distanceM !== null && s.distanceM >= 1000)
      .map((s) => averagePaceFromTotals(s.distanceM ?? 0, (s.endedAt! - s.startedAt) / 1000))
      .filter((p): p is number => p !== null);
    const lthrPaceEstimate = estimateLthrPaceFromHistory(sessionPaces);

    // Шаг 3: посчитать TSS для каждой завершённой сессии.
    // avgHr берём из session row (агрегируется на finalize, см. activity.stop).
    const sessionsWithTSS: SessionWithTSS[] = sessions
      .filter((s) => s.endedAt !== null && s.distanceM !== null)
      .map((s) => {
        const durationS = (s.endedAt! - s.startedAt) / 1000;
        const distanceM = s.distanceM ?? 0;
        const avgPace = averagePaceFromTotals(distanceM, durationS);
        const t = bestTSS({
          avgHrBpm: s.avgHrBpm ?? null,
          lthrBpm,
          avgPaceMinKm: avgPace,
          lthrPaceMinKm: lthrPaceEstimate.paceMinKm,
          durationS,
        });
        return {
          id: s.id,
          startedAt: s.startedAt,
          durationS,
          distanceM,
          tss: t?.value ?? null,
          tssMethod: t?.method ?? null,
          avgPaceMinKm: avgPace,
        };
      });

    // Шаг 4: PMC за 90 дней.
    const dailyTss = buildDailyTSS(
      sessionsWithTSS.map((s) => ({ startedAt: s.startedAt, tss: s.tss })),
    );
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(), today.getMonth(), today.getDate(),
    ).getTime();
    const pmcStart = startOfDay - 89 * DAY_MS;
    const pmc = computePMC(dailyTss, pmcStart, startOfDay + DAY_MS);

    // Шаг 5: LTHR estimate из реальных avgHr ≥30мин сессий.
    const longSessionAvgHrs = sessions
      .filter((s) =>
        s.endedAt !== null
        && (s.endedAt - s.startedAt) >= 30 * 60 * 1000
        && s.avgHrBpm !== null
        && s.avgHrBpm > 0,
      )
      .map((s) => s.avgHrBpm!);
    const lthrEstimate = estimateLthrFromHistory(longSessionAvgHrs);

    set({
      sessionsWithTSS,
      pmc,
      lthrBpm: lthrEstimate.bpm ?? lthrBpm,
      lthrPaceMinKm: lthrPaceEstimate.paceMinKm,
    });
  },
}));
