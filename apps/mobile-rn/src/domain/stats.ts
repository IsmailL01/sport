// Аггрегация статистики по периодам (week / month / year / all).
// В Phase 4 считается на клиенте — для < 1000 сессий это копейки.
// При 10k+ — переедет на server-side ClickHouse (P4-A-08, отложено).

import type { Session } from './types';

export type StatsPeriod = 'week' | 'month' | 'year' | 'all';

export type AggregatedStats = {
  period: StatsPeriod;
  /** Unix epoch ms — начало периода (включительно). */
  startMs: number;
  /** Unix epoch ms — конец периода (исключительно). */
  endMs: number;
  totalSessions: number;
  totalDistanceM: number;
  totalDurationS: number;
  totalAreaM2: number;
  /** Среднее темп min/km, null если total time = 0. */
  averagePaceMinKm: number | null;
  longestSessionM: number;
};

export type DailyBucket = {
  /** Эпоха-полуночи дня в локальной TZ. */
  dayStartMs: number;
  /** Дистанция всех сессий в этом дне, м. */
  distanceM: number;
  /** Кол-во сессий в этом дне. */
  sessionCount: number;
};

export type WeeklyBucket = {
  /** Понедельник этой недели (00:00). */
  weekStartMs: number;
  distanceM: number;
  sessionCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Вернуть [start, end) для периода относительно `now` в локальной TZ. */
export function periodRange(period: StatsPeriod, now = new Date()): { startMs: number; endMs: number } {
  const endMs = now.getTime();
  switch (period) {
    case 'week': {
      const monday = startOfWeekMonday(now).getTime();
      return { startMs: monday, endMs };
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { startMs: m, endMs };
    }
    case 'year': {
      const y = new Date(now.getFullYear(), 0, 1).getTime();
      return { startMs: y, endMs };
    }
    case 'all':
      return { startMs: 0, endMs };
  }
}

/**
 * Полночь понедельника недели, к которой принадлежит `d`. Локальная TZ.
 */
export function startOfWeekMonday(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay(); // 0 = воскресенье
  const offset = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + offset);
  return out;
}

export function aggregateSessions(
  sessions: readonly Session[],
  period: StatsPeriod,
  now = new Date(),
): AggregatedStats {
  const { startMs, endMs } = periodRange(period, now);
  let totalSessions = 0;
  let totalDistanceM = 0;
  let totalDurationS = 0;
  let totalAreaM2 = 0;
  let longestSessionM = 0;

  for (const s of sessions) {
    if (s.startedAt < startMs || s.startedAt >= endMs) continue;
    if (s.endedAt === null) continue; // незавершённые не считаем
    totalSessions += 1;
    totalDistanceM += s.distanceM ?? 0;
    totalDurationS += Math.max(0, (s.endedAt - s.startedAt) / 1000);
    if (s.areaM2 !== null && s.isClosed === true) totalAreaM2 += s.areaM2;
    if ((s.distanceM ?? 0) > longestSessionM) longestSessionM = s.distanceM ?? 0;
  }

  const averagePaceMinKm =
    totalDurationS > 0 && totalDistanceM > 0
      ? totalDurationS / 60 / (totalDistanceM / 1000)
      : null;

  return {
    period,
    startMs,
    endMs,
    totalSessions,
    totalDistanceM,
    totalDurationS,
    totalAreaM2,
    averagePaceMinKm,
    longestSessionM,
  };
}

/**
 * Дни последних `days` (включая сегодня), от старых к новым.
 * Для bar-chart "дистанция за неделю".
 */
export function bucketByDay(
  sessions: readonly Session[],
  days: number,
  now = new Date(),
): DailyBucket[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const buckets: DailyBucket[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * DAY_MS);
    buckets.push({ dayStartMs: d.getTime(), distanceM: 0, sessionCount: 0 });
  }
  const start = buckets[0].dayStartMs;
  const end = buckets[buckets.length - 1].dayStartMs + DAY_MS;

  for (const s of sessions) {
    if (s.startedAt < start || s.startedAt >= end) continue;
    if (s.endedAt === null) continue;
    const idx = Math.floor((s.startedAt - start) / DAY_MS);
    if (idx < 0 || idx >= buckets.length) continue;
    buckets[idx].distanceM += s.distanceM ?? 0;
    buckets[idx].sessionCount += 1;
  }
  return buckets;
}

/**
 * Длина текущей серии (streak) — сколько подряд дней с хотя бы одной завершённой сессией,
 * заканчивая сегодня. Если сегодня сессий нет — серия = 0 (но если вчера была — будет 0).
 *
 * Альтернатива: streak с одним «греисом» (можно пропустить сегодня).
 * Возвращаем без греиса для строгости.
 */
export function currentStreakDays(sessions: readonly Session[], now = new Date()): number {
  if (sessions.length === 0) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Множество дней (epoch ms полуночи), в которые есть завершённая сессия.
  const daysWithSession = new Set<number>();
  for (const s of sessions) {
    if (s.endedAt === null) continue;
    const d = new Date(s.startedAt);
    daysWithSession.add(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
  }
  if (daysWithSession.size === 0) return 0;

  let streak = 0;
  let cursor = today;
  while (daysWithSession.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}
