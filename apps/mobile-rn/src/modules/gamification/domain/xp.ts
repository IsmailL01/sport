// modules/gamification/domain — TS mirror Go pkg/gamification.
// Phase 8 / M3.
//
// КРИТИЧНО: формулы должны 1-к-1 совпадать с backend pkg/gamification/xp.go.
// Mirror тесты сверяют идентичные inputs/outputs.

/** Bump on formula change; should match Go FormulaVersion. */
export const FORMULA_VERSION = 1;

export type SessionInput = {
  distanceM: number;
  durationS: number;
  avgHrBpm?: number;
  maxHrBpm?: number;
};

/**
 * XP за финализированную сессию. Pure function — те же inputs всегда дают
 * тот же output. На клиенте используется для preview "сколько XP получу"
 * перед finalize; реальный source-of-truth — server pkg/gamification.
 *
 * Формула (mirror Go):
 *   base   = floor(distanceM / 1000)
 *   +5 XP  if distance >= 10 km
 *   +3 XP  if avg_hr_bpm >= 150
 */
export function xpForSession(input: SessionInput): number {
  if (input.distanceM <= 0 || input.durationS <= 0) return 0;
  const km = input.distanceM / 1000;
  let xp = Math.floor(km);
  if (km >= 10) xp += 5;
  if ((input.avgHrBpm ?? 0) >= 150) xp += 3;
  return Math.max(0, xp);
}
