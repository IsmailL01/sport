import {
  generateWeeklyPlan,
  isDayCompleted,
  recommendToday,
  startOfWeekLocal,
  tssByDayOfWeek,
} from '../domain/training/planGenerator';
import type { PMCPoint } from '../domain/training/banister';

function pmcOf(ctl: number, atl: number): PMCPoint[] {
  return [
    { dayMs: Date.now() - 86_400_000, ctl: ctl - 1, atl: atl - 1, tsb: ctl - atl, tss: 0 },
    { dayMs: Date.now(), ctl, atl, tsb: ctl - atl, tss: 0 },
  ];
}

describe('recommendToday', () => {
  it('overreached → rest', () => {
    // CTL=40, ATL=80, TSB=-40 → overreached
    const r = recommendToday({
      pmc: pmcOf(40, 80),
      weeklyDistanceKmGoal: 30,
      dayOfWeek: 1,
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('rest');
    expect(r.targetTss).toBe(0);
  });

  it('fresh с большим TSB → interval (если будний день)', () => {
    // CTL=50, ATL=20, TSB=+30 → fresh
    const r = recommendToday({
      pmc: pmcOf(50, 20),
      weeklyDistanceKmGoal: 30,
      dayOfWeek: 1, // вторник
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('interval');
    expect(r.targetTss).toBeGreaterThan(0);
  });

  it('средняя форма + понедельник → easy', () => {
    const r = recommendToday({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      dayOfWeek: 0,
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('easy');
  });

  it('средняя форма + четверг → interval', () => {
    const r = recommendToday({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      dayOfWeek: 3,
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('interval');
  });

  it('пятница → rest', () => {
    const r = recommendToday({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      dayOfWeek: 4,
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('rest');
  });

  it('суббота → long', () => {
    const r = recommendToday({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      dayOfWeek: 5,
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('long');
  });

  it('fatigued + interval день → понижается до easy', () => {
    // CTL=40, ATL=60, TSB=-20 → fatigued
    const r = recommendToday({
      pmc: pmcOf(40, 60),
      weeklyDistanceKmGoal: 30,
      dayOfWeek: 3, // должен быть interval по паттерну
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('easy');
  });

  it('suggestedWorkout для tempo дня — это tempo-40', () => {
    const r = recommendToday({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      dayOfWeek: 1,
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('tempo');
    expect(r.suggestedWorkout?.id).toBe('tempo-40');
  });

  it('пустой PMC + нет цели → rationale всё равно валидный', () => {
    const r = recommendToday({
      pmc: [],
      weeklyDistanceKmGoal: null,
      dayOfWeek: 0,
      weeklyTssSoFar: 0,
    });
    expect(r.workoutType).toBe('easy');
    expect(r.rationale.length).toBeGreaterThan(0);
  });
});

describe('generateWeeklyPlan', () => {
  it('возвращает 7 дней в правильном порядке', () => {
    const plan = generateWeeklyPlan({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      weekStart: 1_700_000_000_000,
    });
    expect(plan.days).toHaveLength(7);
    plan.days.forEach((d, i) => {
      expect(d.dayOfWeek).toBe(i);
    });
  });

  it('totalTargetTss соответствует CTL × 7 × 1.05', () => {
    const plan = generateWeeklyPlan({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      weekStart: 1_700_000_000_000,
    });
    // 50 × 7 × 1.05 = 367.5 → rounded
    expect(plan.totalTargetTss).toBe(368);
  });

  it('пятница — rest (targetTss = 0)', () => {
    const plan = generateWeeklyPlan({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      weekStart: 1_700_000_000_000,
    });
    const friday = plan.days[4];
    expect(friday.recommendation.workoutType).toBe('rest');
    expect(friday.recommendation.targetTss).toBe(0);
  });

  it('сумма TSS примерно соответствует totalTargetTss', () => {
    const plan = generateWeeklyPlan({
      pmc: pmcOf(50, 50),
      weeklyDistanceKmGoal: 30,
      weekStart: 1_700_000_000_000,
    });
    const sum = plan.days.reduce((a, d) => a + d.recommendation.targetTss, 0);
    // Должно быть примерно равно totalTargetTss (rounding).
    expect(Math.abs(sum - plan.totalTargetTss)).toBeLessThan(10);
  });

  it('нет PMC + нет цели → totalTargetTss = 0, нет crash', () => {
    const plan = generateWeeklyPlan({
      pmc: [],
      weeklyDistanceKmGoal: null,
      weekStart: 1_700_000_000_000,
    });
    expect(plan.totalTargetTss).toBe(0);
    expect(plan.days).toHaveLength(7);
  });
});

describe('tssByDayOfWeek', () => {
  it('пустые сессии → [0,0,0,0,0,0,0]', () => {
    expect(tssByDayOfWeek([], 1_700_000_000_000)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('бакетит сессии по дню недели', () => {
    const weekStart = 1_700_000_000_000;
    const day = 86_400_000;
    const sessions = [
      { startedAt: weekStart + 0.5 * day, tss: 50 },        // Mon
      { startedAt: weekStart + 1.2 * day, tss: 40 },        // Tue
      { startedAt: weekStart + 1.8 * day, tss: 20 },        // Tue (вторая)
      { startedAt: weekStart + 5.5 * day, tss: 100 },       // Sat
    ];
    const result = tssByDayOfWeek(sessions, weekStart);
    expect(result[0]).toBe(50);
    expect(result[1]).toBe(60);
    expect(result[5]).toBe(100);
  });

  it('игнорирует сессии вне недели', () => {
    const weekStart = 1_700_000_000_000;
    const sessions = [
      { startedAt: weekStart - 1, tss: 50 },                          // прошлая
      { startedAt: weekStart + 7 * 86_400_000, tss: 50 },             // следующая
      { startedAt: weekStart + 3 * 86_400_000, tss: 30 },             // в этой
    ];
    const result = tssByDayOfWeek(sessions, weekStart);
    expect(result.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it('null TSS считается как 0', () => {
    const weekStart = 1_700_000_000_000;
    const sessions = [{ startedAt: weekStart + 1000, tss: null }];
    expect(tssByDayOfWeek(sessions, weekStart)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('isDayCompleted', () => {
  it('rest-день без бега → выполнен', () => {
    expect(isDayCompleted(0, 0)).toBe(true);
    expect(isDayCompleted(0, 25)).toBe(true);
  });

  it('rest-день с большим TSS → не выполнен (нарушил план)', () => {
    expect(isDayCompleted(0, 50)).toBe(false);
  });

  it('actual ≥ 70% target → выполнен', () => {
    expect(isDayCompleted(100, 70)).toBe(true);
    expect(isDayCompleted(100, 100)).toBe(true);
    expect(isDayCompleted(100, 150)).toBe(true);
  });

  it('actual < 70% target → не выполнен', () => {
    expect(isDayCompleted(100, 69)).toBe(false);
    expect(isDayCompleted(100, 0)).toBe(false);
  });
});

describe('startOfWeekLocal', () => {
  it('понедельник → сам же день', () => {
    // 2026-05-04 — это понедельник.
    const monday = new Date(2026, 4, 4, 15, 30);
    const start = startOfWeekLocal(monday);
    const startDate = new Date(start);
    expect(startDate.getDay()).toBe(1); // Monday в JS = 1
    expect(startDate.getDate()).toBe(4);
    expect(startDate.getHours()).toBe(0);
  });

  it('воскресенье → предыдущий понедельник', () => {
    // 2026-05-10 — воскресенье; ожидаем 2026-05-04 (понедельник).
    const sunday = new Date(2026, 4, 10, 12, 0);
    const start = startOfWeekLocal(sunday);
    const startDate = new Date(start);
    expect(startDate.getDate()).toBe(4);
  });

  it('среда → понедельник той же недели', () => {
    // 2026-05-06 — среда; ожидаем 2026-05-04 (понедельник).
    const wed = new Date(2026, 4, 6, 23, 59);
    const start = startOfWeekLocal(wed);
    const startDate = new Date(start);
    expect(startDate.getDate()).toBe(4);
  });
});
