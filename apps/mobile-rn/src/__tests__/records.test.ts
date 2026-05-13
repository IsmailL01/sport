// domain/records pure-function tests. Phase 8 / M10.1.

import {
  avgSpeedKmh,
  bestPaceForDistance,
  detectNewRecords,
  isBetter,
  type RecordKind,
} from '../domain/records';
import type { Point } from '../domain/types';

// Helper: build a synthetic straight-line track.
// Step = meters between consecutive points, dtMs = ms per step.
function buildLineTrack(steps: number, stepMeters: number, dtMs: number): Point[] {
  const baseLat = 55.7558; // Moscow
  const baseLon = 37.6173;
  // 1 degree latitude ≈ 111_320 m.
  const dLat = stepMeters / 111_320;
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    out.push({
      timestamp: 1_000_000_000_000 + i * dtMs,
      latitude: baseLat + dLat * i,
      longitude: baseLon,
      altitude: null,
      accuracy: 5,
      speed: null,
      heading: null,
      source: 'raw',
    });
  }
  return out;
}

describe('isBetter', () => {
  it('higher distance wins when current is null', () => {
    expect(isBetter('longest_distance', 1000, null)).toBe(true);
  });
  it('higher distance wins over existing', () => {
    expect(isBetter('longest_distance', 1001, 1000)).toBe(true);
    expect(isBetter('longest_distance', 999, 1000)).toBe(false);
  });
  it('lower pace wins (pace = min/km, lower = faster)', () => {
    expect(isBetter('best_pace_1km', 4.5, 5.0)).toBe(true);
    expect(isBetter('best_pace_1km', 5.5, 5.0)).toBe(false);
    expect(isBetter('best_pace_5km', 4.0, null)).toBe(true);
  });
  it('infinite / NaN candidates rejected', () => {
    expect(isBetter('longest_distance', Infinity, 1000)).toBe(false);
    expect(isBetter('best_pace_1km', NaN, 5)).toBe(false);
  });
});

describe('bestPaceForDistance', () => {
  it('returns null when track too short', () => {
    const t = buildLineTrack(2, 100, 60_000); // 200 m
    expect(bestPaceForDistance(t, 1000)).toBeNull();
  });

  it('1 km in 5 min uniform → pace ≈ 5.0 min/km', () => {
    // 10 шагов × 100 м = 1000 м, по 30 секунд каждый → 5 минут total.
    const t = buildLineTrack(10, 100, 30_000);
    const p = bestPaceForDistance(t, 1000);
    expect(p).not.toBeNull();
    expect(p!).toBeCloseTo(5.0, 1);
  });

  it('finds fastest 1 km in mixed track', () => {
    // Sеgment 1: 1 km in 6 min (slow). Segment 2: 1 km in 4 min (fast).
    const slow = buildLineTrack(10, 100, 36_000); // 6 min for 1 km
    // Start slow segment at slow's end time + lat.
    const lastSlow = slow[slow.length - 1];
    const baseLat2 = lastSlow.latitude;
    const baseLon2 = lastSlow.longitude;
    const ts0 = lastSlow.timestamp;
    const dLat = 100 / 111_320; // 100 m
    const fast: Point[] = [];
    for (let i = 1; i <= 10; i++) {
      fast.push({
        timestamp: ts0 + i * 24_000, // 24 s × 10 = 240 s = 4 min
        latitude: baseLat2 + dLat * i,
        longitude: baseLon2,
        altitude: null, accuracy: 5, speed: null, heading: null, source: 'raw',
      });
    }
    const all = [...slow, ...fast];
    const p = bestPaceForDistance(all, 1000);
    expect(p).not.toBeNull();
    expect(p!).toBeCloseTo(4.0, 1);
  });
});

describe('avgSpeedKmh', () => {
  it('5 km in 30 min → 10 km/h', () => {
    const v = avgSpeedKmh({
      sessionId: 1, startedAt: 0, endedAt: 1_800_000,
      distanceM: 5000, durationS: 1800, caloriesKcal: null,
    });
    expect(v).toBeCloseTo(10, 1);
  });
  it('zero distance → null', () => {
    expect(avgSpeedKmh({ sessionId: 1, startedAt: 0, endedAt: 1, distanceM: 0, durationS: 1, caloriesKcal: null })).toBeNull();
  });
});

describe('detectNewRecords', () => {
  it('returns longest_distance + longest_duration on first session', () => {
    const t = buildLineTrack(5, 100, 60_000); // 500 m, 5 min
    const recs = detectNewRecords(
      { sessionId: 1, startedAt: 0, endedAt: 300_000, distanceM: 500, durationS: 300, caloriesKcal: 50 },
      t,
      {},
    );
    const kinds = recs.map((r) => r.kind).sort();
    expect(kinds).toEqual(
      expect.arrayContaining(['longest_distance', 'longest_duration', 'most_calories', 'max_avg_speed']),
    );
  });

  it('skips kinds that are not beaten', () => {
    const t = buildLineTrack(5, 100, 60_000);
    const recs = detectNewRecords(
      { sessionId: 1, startedAt: 0, endedAt: 300_000, distanceM: 500, durationS: 300, caloriesKcal: 50 },
      t,
      {
        longest_distance: 5000,
        longest_duration: 9999,
        most_calories: 999,
        max_avg_speed: 999,
      },
    );
    // Не одно из них не должно быть в out — наш кандидат хуже.
    const beaten = recs.map((r) => r.kind);
    expect(beaten).not.toContain('longest_distance');
    expect(beaten).not.toContain('longest_duration');
    expect(beaten).not.toContain('most_calories');
    expect(beaten).not.toContain('max_avg_speed');
  });

  it('includes prevValue when beating existing', () => {
    const t = buildLineTrack(5, 100, 60_000);
    const recs = detectNewRecords(
      { sessionId: 2, startedAt: 0, endedAt: 300_000, distanceM: 500, durationS: 300, caloriesKcal: 50 },
      t,
      { longest_distance: 400 },
    );
    const ld = recs.find((r) => r.kind === 'longest_distance')!;
    expect(ld.value).toBeCloseTo(500, 0);
    expect(ld.prevValue).toBe(400);
  });

  it('best_pace_1km появляется только если distance >= 1km', () => {
    const t = buildLineTrack(5, 100, 60_000); // 500 m → нет 1km window
    const recs = detectNewRecords(
      { sessionId: 1, startedAt: 0, endedAt: 300_000, distanceM: 500, durationS: 300, caloriesKcal: null },
      t,
      {},
    );
    const kinds = recs.map((r) => r.kind);
    expect(kinds).not.toContain('best_pace_1km');
  });

  it('best_pace_1km появляется когда distance >= 1km', () => {
    const t = buildLineTrack(10, 100, 30_000); // 1000m, 5min total
    const recs = detectNewRecords(
      { sessionId: 1, startedAt: 0, endedAt: 300_000, distanceM: 1000, durationS: 300, caloriesKcal: null },
      t,
      {},
    );
    const p1 = recs.find((r) => r.kind === 'best_pace_1km');
    expect(p1).toBeDefined();
    expect(p1!.value).toBeCloseTo(5.0, 1);
  });
});

// Sanity: enum coverage.
describe('coverage', () => {
  it('все RecordKind покрыты в isBetter', () => {
    const kinds: RecordKind[] = [
      'longest_distance', 'longest_duration',
      'best_pace_1km', 'best_pace_5km', 'best_pace_10km',
      'most_calories', 'max_avg_speed',
    ];
    for (const k of kinds) {
      // Не должно бросать; либо true (current=null) либо false (NaN).
      expect(typeof isBetter(k, 100, null)).toBe('boolean');
    }
  });
});
