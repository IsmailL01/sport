import { fastestAndSlowestLap, lapFromRange, type Lap, type LapInput } from '../domain/lap';

function pt(t: number, lat: number, lon: number, hr?: number | null): LapInput {
  return {
    timestamp: t,
    latitude: lat,
    longitude: lon,
    altitude: null,
    accuracy: 5,
    speed: null,
    heading: null,
    source: 'raw',
    hrBpm: hr ?? null,
  };
}

describe('lapFromRange', () => {
  it('null when too few points', () => {
    expect(lapFromRange([], 0, 1)).toBeNull();
    expect(lapFromRange([pt(0, 0, 0)], 0, 1)).toBeNull();
  });

  it('computes distance/duration/pace', () => {
    // Two points ~111m apart (1/1000 degree lat ≈ 111m), 60s gap.
    const pts: LapInput[] = [
      pt(0, 0, 0),
      pt(60 * 1000, 0.001, 0),
    ];
    const lap = lapFromRange(pts, 0, 1)!;
    expect(lap.lapNumber).toBe(1);
    expect(lap.distanceM).toBeGreaterThan(100);
    expect(lap.distanceM).toBeLessThan(120);
    expect(lap.durationS).toBe(60);
    expect(lap.paceMinKm).not.toBeNull();
  });

  it('averages HR across lap points', () => {
    const pts: LapInput[] = [
      pt(0, 0, 0, 100),
      pt(30_000, 0.0005, 0, 140),
      pt(60_000, 0.001, 0, 160),
    ];
    const lap = lapFromRange(pts, 0, 1)!;
    // First HR point is excluded from sum (fromIdx+1 onwards); average of 140 and 160.
    expect(lap.avgHrBpm).toBeCloseTo(150, 0);
  });

  it('null avgHr when no hr data', () => {
    const pts: LapInput[] = [pt(0, 0, 0), pt(60_000, 0.001, 0)];
    const lap = lapFromRange(pts, 0, 1)!;
    expect(lap.avgHrBpm).toBeNull();
  });

  it('fromIdx slicing — second lap from idx mid-array', () => {
    const pts: LapInput[] = [
      pt(0, 0, 0),
      pt(60_000, 0.001, 0),       // ~111m
      pt(120_000, 0.002, 0),      // +111m
    ];
    const lap2 = lapFromRange(pts, 1, 2)!;
    expect(lap2.lapNumber).toBe(2);
    expect(lap2.distanceM).toBeGreaterThan(100);
    expect(lap2.distanceM).toBeLessThan(120);
    expect(lap2.durationS).toBe(60);
  });
});

describe('fastestAndSlowestLap', () => {
  const make = (n: number, durS: number, distM: number): Lap => ({
    lapNumber: n,
    startedAt: 0,
    endedAt: durS * 1000,
    distanceM: distM,
    durationS: durS,
    paceMinKm: distM > 0 ? (durS / 60) / (distM / 1000) : null,
    avgHrBpm: null,
  });

  it('returns nulls for empty', () => {
    expect(fastestAndSlowestLap([])).toEqual({ fastest: null, slowest: null });
  });

  it('picks min/max by pace', () => {
    const laps = [
      make(1, 360, 1000),  // 6:00/km
      make(2, 300, 1000),  // 5:00/km — fastest
      make(3, 420, 1000),  // 7:00/km — slowest
    ];
    const { fastest, slowest } = fastestAndSlowestLap(laps);
    expect(fastest).toBe(2);
    expect(slowest).toBe(3);
  });

  it('ignores laps with distance < 100m', () => {
    const laps = [
      make(1, 10, 50),    // noisy short
      make(2, 360, 1000),
    ];
    const { fastest, slowest } = fastestAndSlowestLap(laps);
    expect(fastest).toBe(2);
    expect(slowest).toBe(2);
  });
});
