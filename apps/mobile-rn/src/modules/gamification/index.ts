// Public surface модуля gamification.
// Phase 8 / M3.

export type { SessionInput } from './domain/xp';
export { FORMULA_VERSION, xpForSession } from './domain/xp';

export type { Grade } from './domain/grade';
export { gradeForXP, nextGrade } from './domain/grade';

export type { ProfileGamification } from './sync/xpApi';
export { fetchMyGamification } from './sync/xpApi';

export { useXpStore } from './state/useXpStore';
