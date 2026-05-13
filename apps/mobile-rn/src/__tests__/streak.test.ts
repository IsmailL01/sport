// domain/streak pure-function tests. Phase 8 / M10.2.

import {
  buildHeatmap,
  computeStreak,
  dayKey,
  intensityForCell,
} from '../domain/streak';

const DAY = 24 * 60 * 60 * 1000;

function sess(daysAgo: number, distanceM: number = 5000, today: Date): { startedAt: number; distanceM: number } {
  return { startedAt: today.getTime() - daysAgo * DAY, distanceM };
}

describe('dayKey', () => {
  it('returns YYYY-MM-DD format in local TZ', () => {
    const d = new Date(2026, 0, 15, 14, 30); // 15 Jan 2026 14:30
    expect(dayKey(d.getTime(), d)).toBe('2026-01-15');
  });
});

describe('computeStreak', () => {
  const today = new Date(2026, 4, 11); // 11 May 2026, fixed.

  it('empty sessions → all zeros', () => {
    const r = computeStreak([], today);
    expect(r).toEqual({ current: 0, longest: 0, lastDayKey: null });
  });

  it('1 session today → current=1, longest=1', () => {
    const r = computeStreak([sess(0, 5000, today)], today);
    expect(r.current).toBe(1);
    expect(r.longest).toBe(1);
  });

  it('3 consecutive days ending today → current=3', () => {
    const r = computeStreak(
      [sess(0, 5000, today), sess(1, 4000, today), sess(2, 3000, today)],
      today,
    );
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
  });

  it('last session 2 days ago → current=0, longest preserved', () => {
    const r = computeStreak(
      [sess(2, 5000, today), sess(3, 4000, today), sess(4, 3000, today)],
      today,
    );
    expect(r.current).toBe(0);
    expect(r.longest).toBe(3);
  });

  it('streak с gap — выбирает longest', () => {
    const r = computeStreak(
      [
        sess(0, 5000, today),
        sess(1, 5000, today),
        // gap
        sess(3, 5000, today),
        sess(4, 5000, today),
        sess(5, 5000, today),
        sess(6, 5000, today),
      ],
      today,
    );
    expect(r.current).toBe(2);
    expect(r.longest).toBe(4);
  });

  it('grace: вчерашняя сессия → current не сбрасывается', () => {
    const r = computeStreak([sess(1, 5000, today)], today);
    expect(r.current).toBe(1);
  });

  it('multiple sessions same day считаются как 1', () => {
    const r = computeStreak(
      [
        { startedAt: today.getTime() - 1000, distanceM: 3000 },
        { startedAt: today.getTime() - 60_000, distanceM: 2000 },
      ],
      today,
    );
    expect(r.current).toBe(1);
    expect(r.longest).toBe(1);
  });
});

describe('buildHeatmap', () => {
  const today = new Date(2026, 4, 11); // Mon 11 May 2026

  it('returns weeks*7 cells', () => {
    const cells = buildHeatmap([], 12, today);
    expect(cells).toHaveLength(84);
  });

  it('заканчивается на конце текущей ISO-недели (воскресенье)', () => {
    // today = Mon, поэтому last cell = Sunday +6 days. Сегодняшняя ячейка
    // находится в последней неделе (строке), на правильной позиции.
    const cells = buildHeatmap([], 12, today);
    const todayKey = dayKey(today.getTime(), today);
    const found = cells.find((c) => c.dayKey === todayKey);
    expect(found).toBeDefined();
    // Сегодня (Mon) должно быть в последних 7 ячейках.
    const todayIdx = cells.findIndex((c) => c.dayKey === todayKey);
    expect(todayIdx).toBeGreaterThanOrEqual(cells.length - 7);
  });

  it('сумма distance per day correct', () => {
    const cells = buildHeatmap(
      [
        sess(0, 5000, today),
        sess(0, 3000, today),
        sess(2, 7000, today),
      ],
      12, today,
    );
    const todayKey = dayKey(today.getTime(), today);
    const todayCell = cells.find((c) => c.dayKey === todayKey)!;
    expect(todayCell.distanceM).toBe(8000);
    expect(todayCell.count).toBe(2);

    const twoAgoKey = dayKey(today.getTime() - 2 * DAY);
    const twoAgoCell = cells.find((c) => c.dayKey === twoAgoKey)!;
    expect(twoAgoCell.distanceM).toBe(7000);
    expect(twoAgoCell.count).toBe(1);
  });
});

describe('intensityForCell', () => {
  it('zero distance → 0', () => {
    expect(intensityForCell({ dayKey: 'x', ts: 0, distanceM: 0, count: 0 }, 10000)).toBe(0);
  });
  it('quartiles', () => {
    const max = 10000;
    expect(intensityForCell({ dayKey: 'a', ts: 0, distanceM: 1, count: 1 }, max)).toBe(1);
    expect(intensityForCell({ dayKey: 'b', ts: 0, distanceM: 3000, count: 1 }, max)).toBe(2);
    expect(intensityForCell({ dayKey: 'c', ts: 0, distanceM: 6000, count: 1 }, max)).toBe(3);
    expect(intensityForCell({ dayKey: 'd', ts: 0, distanceM: 9000, count: 1 }, max)).toBe(4);
  });
  it('max=0 fallback to 1 для non-zero distance', () => {
    expect(intensityForCell({ dayKey: 'a', ts: 0, distanceM: 100, count: 1 }, 0)).toBe(1);
  });
});
