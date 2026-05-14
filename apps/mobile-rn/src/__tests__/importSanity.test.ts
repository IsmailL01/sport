import { checkWorkoutSanity } from '../health/importSanity';
import type { ImportedWorkout } from '../health';

function w(overrides: Partial<ImportedWorkout> = {}): ImportedWorkout {
  return {
    externalId: 'x',
    startedAt: Date.now() - 60 * 60 * 1000,
    endedAt: Date.now(),
    distanceM: 5000,
    calories: 300,
    avgHrBpm: 150,
    activityType: 'running',
    source: 'mock',
    sourceUuid: 'uuid-1',
    ...overrides,
  };
}

describe('checkWorkoutSanity', () => {
  it('passes a normal running session', () => {
    expect(checkWorkoutSanity(w())).toBeNull();
  });

  it('rejects zero duration', () => {
    expect(checkWorkoutSanity(w({ endedAt: w().startedAt }))).toBe('duration_zero');
  });

  it('rejects > 24h duration', () => {
    const wo = w({ startedAt: 0, endedAt: 25 * 3600 * 1000 });
    expect(checkWorkoutSanity(wo)).toBe('duration_too_long');
  });

  it('rejects negative distance', () => {
    expect(checkWorkoutSanity(w({ distanceM: -1 }))).toBe('distance_invalid');
  });

  it('rejects impossible running pace', () => {
    // 5km за 10min — 2:00/км (faster than world record).
    const wo = w({ startedAt: 0, endedAt: 10 * 60 * 1000, distanceM: 5000, activityType: 'running' });
    expect(checkWorkoutSanity(wo)).toBe('pace_too_fast');
  });

  it('allows fast walking', () => {
    const wo = w({
      activityType: 'walking',
      startedAt: 0,
      endedAt: 10 * 60 * 1000,
      distanceM: 5000,
    });
    expect(checkWorkoutSanity(wo)).toBeNull();
  });

  it('rejects > 100 km/h cycling speed', () => {
    const wo = w({
      activityType: 'cycling',
      startedAt: 0,
      endedAt: 60 * 60 * 1000,
      distanceM: 200_000,
    });
    expect(checkWorkoutSanity(wo)).toBe('speed_too_fast');
  });

  it('rejects HR out of range', () => {
    expect(checkWorkoutSanity(w({ avgHrBpm: 20 }))).toBe('hr_out_of_range');
    expect(checkWorkoutSanity(w({ avgHrBpm: 250 }))).toBe('hr_out_of_range');
  });

  it('null HR is OK', () => {
    expect(checkWorkoutSanity(w({ avgHrBpm: null }))).toBeNull();
  });
});
