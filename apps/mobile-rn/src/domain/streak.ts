// Streak + heatmap pure-function math. Phase 8 / M10.2.
//
// streak = последовательность календарных дней, в каждом из которых
// есть хотя бы одна сессия. «Календарный день» определяется в local
// timezone устройства (Date.toDateString равенство).
//
// Heatmap = 12 недель × 7 дней = 84 ячейки. Понедельник — первый
// столбец каждой недели (ISO week). Каждая ячейка хранит суммарную
// дистанцию (м) за день — UI красит интенсивностью.

/** Минимальное представление сессии для расчёта (берём из useHistoryStore). */
export type StreakSession = {
  startedAt: number;       // epoch ms
  distanceM: number | null;
};

/**
 * Sets day key для группировки. Локальное время, YYYY-MM-DD.
 * Использует Intl-free алгоритм для скорости и стабильности.
 */
export function dayKey(epochMs: number, now: Date = new Date(epochMs)): string {
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Полночь локального дня для epochMs. Возвращает ms (Date.getTime()). */
export function localDayStart(epochMs: number): number {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type StreakResult = {
  /** Текущий стрик в днях (≥0). Сегодня обязан быть в стрике для current. */
  current: number;
  /** Максимальный стрик за всё время. */
  longest: number;
  /** Последний день со сессией (для UI «3 дня назад»). null если нет. */
  lastDayKey: string | null;
};

/**
 * Считает streak: current = непрерывные дни заканчивая сегодня (или вчера —
 * grace 1 день, чтобы не сбрасывать стрик пока день ещё идёт).
 * Longest = самая длинная непрерывная последовательность в истории.
 *
 * `today` overrideable для тестов.
 */
export function computeStreak(sessions: readonly StreakSession[], today: Date = new Date()): StreakResult {
  if (sessions.length === 0) {
    return { current: 0, longest: 0, lastDayKey: null };
  }

  // Unique day-keys, sorted ascending.
  const daysSet = new Set<string>();
  for (const s of sessions) {
    daysSet.add(dayKey(s.startedAt));
  }
  const days = Array.from(daysSet).sort();

  // Longest: проход по sorted days, считаем consecutive.
  let longest = 0;
  let run = 0;
  let prevTs: number | null = null;
  for (const k of days) {
    const ts = Date.parse(k);
    if (prevTs !== null && ts - prevTs === DAY_MS) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prevTs = ts;
  }

  const todayKey = dayKey(today.getTime(), today);
  const yesterdayKey = dayKey(today.getTime() - DAY_MS);
  const lastDayKey = days[days.length - 1];

  // Current: считаем от самого последнего к началу, идя назад через days.
  // Если lastDayKey не сегодня и не вчера — current = 0 (streak обрублен).
  let current = 0;
  if (lastDayKey === todayKey || lastDayKey === yesterdayKey) {
    current = 1;
    let prev = Date.parse(lastDayKey);
    for (let i = days.length - 2; i >= 0; i--) {
      const ts = Date.parse(days[i]);
      if (prev - ts === DAY_MS) {
        current++;
        prev = ts;
      } else {
        break;
      }
    }
  }

  return { current, longest, lastDayKey };
}

export type HeatmapCell = {
  /** YYYY-MM-DD ключ. */
  dayKey: string;
  /** epoch ms полуночи. */
  ts: number;
  /** Сумма distance в метрах за этот день (0 если нет сессий). */
  distanceM: number;
  /** Сколько сессий пришлось на этот день. */
  count: number;
};

/**
 * Heatmap для последних `weeks` недель, ровно `weeks * 7` ячеек,
 * упорядоченных по строкам недель: row 0 = самая старая, row 11 =
 * текущая. Понедельник — первый в неделе.
 *
 * Возвращает row-major (12 × 7) flat array.
 */
export function buildHeatmap(
  sessions: readonly StreakSession[],
  weeks: number = 12,
  today: Date = new Date(),
): HeatmapCell[] {
  // Сумма distance per dayKey.
  const sumByDay = new Map<string, { d: number; c: number }>();
  for (const s of sessions) {
    const k = dayKey(s.startedAt);
    const cur = sumByDay.get(k) ?? { d: 0, c: 0 };
    cur.d += s.distanceM ?? 0;
    cur.c += 1;
    sumByDay.set(k, cur);
  }

  // Найти понедельник текущей недели в локальной TZ.
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat. Сдвиг к понедельнику.
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const dow = (start.getDay() + 6) % 7; // 0=Mon, ..., 6=Sun
  // Понедельник самой старой нужной нам недели:
  const earliest = new Date(start);
  earliest.setDate(start.getDate() - dow - (weeks - 1) * 7);

  const cells: HeatmapCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(earliest);
    d.setDate(earliest.getDate() + i);
    const k = dayKey(d.getTime(), d);
    const sum = sumByDay.get(k) ?? { d: 0, c: 0 };
    cells.push({ dayKey: k, ts: d.getTime(), distanceM: sum.d, count: sum.c });
  }
  return cells;
}

/**
 * Распределить ячейки по интенсивности 0..4 (для UI красок) на основе
 * относительного распределения. 0 = нет тренировки, 1..4 = квартили
 * non-zero distance.
 */
export function intensityForCell(cell: HeatmapCell, maxDistance: number): 0 | 1 | 2 | 3 | 4 {
  if (cell.distanceM <= 0) return 0;
  if (maxDistance <= 0) return 1;
  const ratio = cell.distanceM / maxDistance;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}
