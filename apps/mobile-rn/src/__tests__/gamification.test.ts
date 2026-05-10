// modules/gamification mirror tests — должны 1-к-1 совпадать с Go
// pkg/gamification/gamification_test.go. Расхождение → fail обеих сторон.
//
// Phase 8 / M3.

import { gradeForXP, nextGrade } from '../modules/gamification/domain/grade';
import { FORMULA_VERSION, xpForSession } from '../modules/gamification/domain/xp';

describe('xpForSession base', () => {
  it('5 km / no hr → 5 xp', () => {
    expect(xpForSession({ distanceM: 5000, durationS: 1500 })).toBe(5);
  });
  it('zero distance → 0', () => {
    expect(xpForSession({ distanceM: 0, durationS: 1500 })).toBe(0);
  });
  it('zero duration → 0', () => {
    expect(xpForSession({ distanceM: 5000, durationS: 0 })).toBe(0);
  });
  it('floor partial km', () => {
    expect(xpForSession({ distanceM: 5999, durationS: 1500 })).toBe(5);
  });
});

describe('xpForSession long-run bonus', () => {
  it('10 km → 10 + 5 = 15', () => {
    expect(xpForSession({ distanceM: 10000, durationS: 3000 })).toBe(15);
  });
  it('16 km → 16 + 5 = 21', () => {
    expect(xpForSession({ distanceM: 16000, durationS: 4500 })).toBe(21);
  });
  it('9.999 km — no bonus', () => {
    expect(xpForSession({ distanceM: 9999, durationS: 3000 })).toBe(9);
  });
});

describe('xpForSession HR bonus', () => {
  it('5 km + hr 155 → 5 + 3 = 8', () => {
    expect(xpForSession({ distanceM: 5000, durationS: 1500, avgHrBpm: 155 })).toBe(8);
  });
  it('hr 149 — no bonus', () => {
    expect(xpForSession({ distanceM: 5000, durationS: 1500, avgHrBpm: 149 })).toBe(5);
  });
});

describe('xpForSession all bonuses', () => {
  it('16 km + hr 160 → 16 + 5 + 3 = 24', () => {
    expect(xpForSession({ distanceM: 16000, durationS: 4500, avgHrBpm: 160 })).toBe(24);
  });
});

describe('gradeForXP', () => {
  const cases: Array<[number, string]> = [
    [0, 'D'], [99, 'D'],
    [100, 'D+'], [249, 'D+'],
    [250, 'C'], [499, 'C'],
    [500, 'C+'], [999, 'C+'],
    [1000, 'B'], [1999, 'B'],
    [2000, 'B+'], [3499, 'B+'],
    [3500, 'A'], [5499, 'A'],
    [5500, 'A+'], [9999, 'A+'],
    [10000, 'S'], [100000, 'S'],
  ];
  it.each(cases)('xp=%i → %s', (xp, grade) => {
    expect(gradeForXP(xp)).toBe(grade);
  });
  it('negative → D', () => {
    expect(gradeForXP(-100)).toBe('D');
  });
  it('NaN → D', () => {
    expect(gradeForXP(NaN)).toBe('D');
  });
});

describe('nextGrade', () => {
  it('0 xp → D+ at 100 (100 remaining)', () => {
    expect(nextGrade(0)).toEqual({ label: 'D+', xpRemaining: 100 });
  });
  it('750 xp → B at 1000 (250 remaining)', () => {
    expect(nextGrade(750)).toEqual({ label: 'B', xpRemaining: 250 });
  });
  it('at S (10000+) → null', () => {
    expect(nextGrade(10000)).toBeNull();
    expect(nextGrade(50000)).toBeNull();
  });
});

describe('formula version', () => {
  it('aligned with Go pkg/gamification.FormulaVersion', () => {
    expect(FORMULA_VERSION).toBe(1);
  });
});
