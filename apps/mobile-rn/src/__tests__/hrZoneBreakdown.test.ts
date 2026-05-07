import { computeHrZoneBreakdown, type HrSample } from '../domain/training/hrZoneBreakdown';

const MAX_HR = 200; // удобные числа: Z1=100-120, Z2=120-140, Z3=140-160, Z4=160-180, Z5=180-200.

function makeSamples(durationsBpm: { dtS: number; bpm: number }[]): HrSample[] {
  // Возвращаем samples где между соседними dt разный bpm.
  const out: HrSample[] = [];
  let ts = 1_000_000;
  out.push({ ts, bpm: durationsBpm[0]?.bpm ?? 100 });
  for (const d of durationsBpm) {
    ts += d.dtS * 1000;
    out.push({ ts, bpm: d.bpm });
  }
  return out;
}

describe('computeHrZoneBreakdown', () => {
  it('пустые samples → пустой результат', () => {
    expect(computeHrZoneBreakdown([], MAX_HR)).toEqual([]);
  });

  it('один sample → пустой результат', () => {
    expect(computeHrZoneBreakdown([{ ts: 1, bpm: 130 }], MAX_HR)).toEqual([]);
  });

  it('некорректный maxHR → пустой результат', () => {
    expect(computeHrZoneBreakdown([{ ts: 0, bpm: 100 }, { ts: 1000, bpm: 110 }], 0)).toEqual([]);
  });

  it('всё в Z2 (130-140 bpm)', () => {
    const samples = makeSamples([
      { dtS: 10, bpm: 130 },
      { dtS: 10, bpm: 135 },
      { dtS: 10, bpm: 130 },
    ]);
    const out = computeHrZoneBreakdown(samples, MAX_HR);
    expect(out).toHaveLength(1);
    expect(out[0].zone.name).toBe('Aerobic');
    expect(out[0].durationS).toBeGreaterThanOrEqual(28);
    expect(out[0].fraction).toBeCloseTo(1, 2);
  });

  it('распределение между Z2 и Z4', () => {
    const samples = makeSamples([
      { dtS: 5, bpm: 130 }, // -> avg ~130 Z2
      { dtS: 5, bpm: 165 }, // avg ~147 Z3
      { dtS: 5, bpm: 170 }, // avg ~167 Z4
      { dtS: 5, bpm: 168 }, // avg ~169 Z4
    ]);
    const out = computeHrZoneBreakdown(samples, MAX_HR);
    const zoneNames = out.map((e) => e.zone.name);
    expect(zoneNames).toContain('Aerobic');
    expect(zoneNames).toContain('Threshold');
    const sum = out.reduce((a, b) => a + b.fraction, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('игнорирует gap > 30s между samples (sensor disconnect)', () => {
    const samples: HrSample[] = [
      { ts: 1_000_000, bpm: 130 },
      { ts: 1_000_000 + 10_000, bpm: 130 },
      // Gap 60s — должен игнорироваться.
      { ts: 1_000_000 + 70_000, bpm: 130 },
    ];
    const out = computeHrZoneBreakdown(samples, MAX_HR);
    // Только первый интервал (10s) считается.
    expect(out[0].durationS).toBeCloseTo(10, 0);
  });

  it('zones отсортированы по index в результате', () => {
    const samples = makeSamples([
      { dtS: 5, bpm: 110 }, // Z1
      { dtS: 5, bpm: 195 }, // avg ~152 Z3
      { dtS: 5, bpm: 195 }, // avg 195 Z5
    ]);
    const out = computeHrZoneBreakdown(samples, MAX_HR);
    const indices = out.map((e) => e.zone.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});
