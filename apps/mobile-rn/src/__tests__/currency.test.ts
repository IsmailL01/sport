import {
  DAILY_COIN_CAP,
  MIN_SESSION_DURATION_S,
  decideCoinsForSession,
} from '../domain/currency';

describe('decideCoinsForSession', () => {
  const base = {
    kcalBurned: 300,
    durationS: 30 * 60,
    distanceM: 5000,
    avgHrBpm: 150 as number | null,
    coinsEarnedToday: 0,
  };

  it('happy path: running 300 kcal → 30 coins (×1.0 mult, ÷10)', () => {
    const d = decideCoinsForSession({ ...base, activity: 'run' });
    expect(d.coins).toBe(30);
    expect(d.reason).toBeNull();
    expect(d.meta.multiplier).toBeCloseTo(1.0);
    expect(d.meta.capped).toBe(false);
  });

  it('trail gets +10% multiplier', () => {
    const d = decideCoinsForSession({ ...base, activity: 'trail' });
    expect(d.coins).toBe(33);
    expect(d.meta.multiplier).toBeCloseTo(1.1);
  });

  it('walking gets 0.8 multiplier', () => {
    const d = decideCoinsForSession({ ...base, activity: 'walk' });
    expect(d.coins).toBe(24);
  });

  it('treadmill: 0.85', () => {
    const d = decideCoinsForSession({ ...base, activity: 'treadmill', distanceM: 0 });
    expect(d.coins).toBe(25); // floor(300 * 0.85 / 10)
  });

  it('rejects too-short session', () => {
    const d = decideCoinsForSession({
      ...base,
      durationS: MIN_SESSION_DURATION_S - 1,
      activity: 'run',
    });
    expect(d.coins).toBe(0);
    expect(d.reason).toBe('session_too_short');
  });

  it('rejects too few kcal', () => {
    const d = decideCoinsForSession({ ...base, kcalBurned: 5, activity: 'run' });
    expect(d.coins).toBe(0);
    expect(d.reason).toBe('kcal_too_low');
  });

  it('rejects impossible running pace (<2:30 min/km)', () => {
    const d = decideCoinsForSession({
      ...base,
      // 5km за 10 минут — pace 2:00/км, быстрее мирового рекорда
      distanceM: 5000,
      durationS: 600,
      kcalBurned: 200,
      activity: 'run',
    });
    expect(d.coins).toBe(0);
    expect(d.reason).toBe('pace_too_fast');
  });

  it('does NOT reject fast pace for cycling', () => {
    const d = decideCoinsForSession({
      ...base,
      distanceM: 30000,
      durationS: 60 * 60,
      kcalBurned: 600,
      activity: 'cycle',
    });
    expect(d.coins).toBeGreaterThan(0);
  });

  it('rejects out-of-range avg HR (too low)', () => {
    const d = decideCoinsForSession({ ...base, avgHrBpm: 20, activity: 'run' });
    expect(d.coins).toBe(0);
    expect(d.reason).toBe('hr_out_of_range');
  });

  it('rejects out-of-range avg HR (too high)', () => {
    const d = decideCoinsForSession({ ...base, avgHrBpm: 250, activity: 'run' });
    expect(d.coins).toBe(0);
    expect(d.reason).toBe('hr_out_of_range');
  });

  it('accepts null HR (no sensor)', () => {
    const d = decideCoinsForSession({ ...base, avgHrBpm: null, activity: 'run' });
    expect(d.coins).toBeGreaterThan(0);
  });

  it('caps daily earning: partial credit when raw exceeds remaining', () => {
    const d = decideCoinsForSession({
      ...base,
      activity: 'run',
      coinsEarnedToday: DAILY_COIN_CAP - 5,
    });
    expect(d.coins).toBe(5);
    expect(d.meta.capped).toBe(true);
    expect(d.reason).toBeNull();
  });

  it('caps daily earning: 0 when already at cap', () => {
    const d = decideCoinsForSession({
      ...base,
      activity: 'run',
      coinsEarnedToday: DAILY_COIN_CAP,
    });
    expect(d.coins).toBe(0);
    expect(d.reason).toBe('daily_cap_reached');
    expect(d.meta.capped).toBe(true);
  });
});
