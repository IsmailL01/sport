import {
  aggregateSessions,
  bucketByDay,
  currentStreakDays,
  periodRange,
  startOfWeekMonday,
} from '../domain/stats';
import type { Session } from '../domain/types';

function sess(overrides: Partial<Session> & { startedAt: number }): Session {
  return {
    id: overrides.startedAt,
    endedAt: overrides.startedAt + 30 * 60 * 1000,
    isClosed: false,
    distanceM: 5000,
    areaM2: null,
    calcMethod: null,
    note: null,
    ...overrides,
  };
}

describe('startOfWeekMonday', () => {
  it('понедельник 2026-05-04 → сам же', () => {
    const monday = startOfWeekMonday(new Date('2026-05-04T15:00:00'));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(4);
  });

  it('воскресенье 2026-05-10 → понедельник 2026-05-04', () => {
    const monday = startOfWeekMonday(new Date('2026-05-10T15:00:00'));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(4);
  });
});

describe('periodRange', () => {
  it('week — от понедельника до now', () => {
    const r = periodRange('week', new Date('2026-05-07T12:00:00'));
    expect(new Date(r.startMs).getDay()).toBe(1);
    expect(r.endMs).toBeGreaterThan(r.startMs);
  });

  it('all — startMs=0', () => {
    const r = periodRange('all', new Date());
    expect(r.startMs).toBe(0);
  });
});

describe('aggregateSessions', () => {
  const now = new Date('2026-05-07T12:00:00');

  it('игнорирует незавершённые (endedAt = null)', () => {
    const r = aggregateSessions(
      [
        sess({ startedAt: now.getTime() - 60_000, endedAt: null }),
        sess({ startedAt: now.getTime() - 60_000 }),
      ],
      'week',
      now,
    );
    expect(r.totalSessions).toBe(1);
  });

  it('суммирует distanceM и duration', () => {
    const r = aggregateSessions(
      [
        sess({ startedAt: now.getTime() - 60_000, distanceM: 3000, endedAt: now.getTime() }),
        sess({ startedAt: now.getTime() - 600_000, distanceM: 2000, endedAt: now.getTime() - 100_000 }),
      ],
      'all',
      now,
    );
    expect(r.totalDistanceM).toBe(5000);
    expect(r.totalDurationS).toBeCloseTo(60 + 500, 0); // ~10.93 мин
  });

  it('average pace = total time / total distance', () => {
    const r = aggregateSessions(
      [
        sess({
          startedAt: now.getTime() - 30 * 60 * 1000,
          endedAt: now.getTime(),
          distanceM: 5000,
        }),
      ],
      'all',
      now,
    );
    // 30 минут / 5 км = 6:00 мин/км
    expect(r.averagePaceMinKm).toBeCloseTo(6, 1);
  });

  it('null pace если distance = 0', () => {
    const r = aggregateSessions([], 'all', now);
    expect(r.averagePaceMinKm).toBeNull();
  });

  it('areaM2 учитывается только для closed', () => {
    const r = aggregateSessions(
      [
        sess({ startedAt: now.getTime() - 60_000, isClosed: true, areaM2: 7140 }),
        sess({ startedAt: now.getTime() - 120_000, isClosed: false, areaM2: 1000 }),
      ],
      'all',
      now,
    );
    expect(r.totalAreaM2).toBe(7140);
  });
});

describe('bucketByDay', () => {
  const now = new Date('2026-05-07T12:00:00');

  it('возвращает N дней в порядке от старых к новым', () => {
    const buckets = bucketByDay([], 7, now);
    expect(buckets).toHaveLength(7);
    for (let i = 1; i < 7; i += 1) {
      expect(buckets[i].dayStartMs).toBeGreaterThan(buckets[i - 1].dayStartMs);
    }
  });

  it('распределяет сессии по дням', () => {
    const buckets = bucketByDay(
      [
        sess({ startedAt: new Date('2026-05-05T10:00:00').getTime(), distanceM: 5000 }),
        sess({ startedAt: new Date('2026-05-05T18:00:00').getTime(), distanceM: 3000 }),
        sess({ startedAt: new Date('2026-05-07T08:00:00').getTime(), distanceM: 2000 }),
      ],
      7,
      now,
    );
    // буфер сегодня (idx 6) и буфер 5го (idx 4)
    expect(buckets[6].distanceM).toBe(2000);
    expect(buckets[6].sessionCount).toBe(1);
    expect(buckets[4].distanceM).toBe(8000);
    expect(buckets[4].sessionCount).toBe(2);
  });
});

describe('currentStreakDays', () => {
  const now = new Date('2026-05-07T12:00:00');

  it('0 если нет сессий', () => {
    expect(currentStreakDays([], now)).toBe(0);
  });

  it('0 если последняя сессия не сегодня', () => {
    expect(
      currentStreakDays(
        [sess({ startedAt: new Date('2026-05-05T10:00:00').getTime() })],
        now,
      ),
    ).toBe(0);
  });

  it('1 для одной сессии сегодня', () => {
    expect(
      currentStreakDays(
        [sess({ startedAt: new Date('2026-05-07T08:00:00').getTime() })],
        now,
      ),
    ).toBe(1);
  });

  it('3 если today + вчера + позавчера', () => {
    expect(
      currentStreakDays(
        [
          sess({ startedAt: new Date('2026-05-05T10:00:00').getTime() }),
          sess({ startedAt: new Date('2026-05-06T10:00:00').getTime() }),
          sess({ startedAt: new Date('2026-05-07T10:00:00').getTime() }),
        ],
        now,
      ),
    ).toBe(3);
  });

  it('пропуск разрывает стрик', () => {
    // сегодня + 5 (пропустили 6) → стрик 1 (только сегодня учитывается)
    expect(
      currentStreakDays(
        [
          sess({ startedAt: new Date('2026-05-05T10:00:00').getTime() }),
          sess({ startedAt: new Date('2026-05-07T10:00:00').getTime() }),
        ],
        now,
      ),
    ).toBe(1);
  });
});
