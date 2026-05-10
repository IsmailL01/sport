// Grade tiers — D → S. TS mirror Go pkg/gamification/grade.go.
// Phase 8 / M3.

export type Grade =
  | 'D' | 'D+'
  | 'C' | 'C+'
  | 'B' | 'B+'
  | 'A' | 'A+'
  | 'S';

type Tier = { minXP: number; label: Grade };

const TIERS: ReadonlyArray<Tier> = [
  { minXP: 0,     label: 'D'  },
  { minXP: 100,   label: 'D+' },
  { minXP: 250,   label: 'C'  },
  { minXP: 500,   label: 'C+' },
  { minXP: 1000,  label: 'B'  },
  { minXP: 2000,  label: 'B+' },
  { minXP: 3500,  label: 'A'  },
  { minXP: 5500,  label: 'A+' },
  { minXP: 10000, label: 'S'  },
];

export function gradeForXP(totalXP: number): Grade {
  if (!Number.isFinite(totalXP) || totalXP < 0) return 'D';
  let out: Grade = 'D';
  for (const t of TIERS) {
    if (totalXP >= t.minXP) {
      out = t.label;
    } else {
      break;
    }
  }
  return out;
}

/**
 * Next grade tier + XP до неё. Возвращает null если уже на S (максимум).
 */
export function nextGrade(totalXP: number): { label: Grade; xpRemaining: number } | null {
  for (const t of TIERS) {
    if (totalXP < t.minXP) {
      return { label: t.label, xpRemaining: t.minXP - totalXP };
    }
  }
  return null;
}
