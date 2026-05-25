// Tests for PauseDetector warmup gate (2026-05-25 polish pass).
// Validates that auto-paused emission is suppressed during the GPS-lock
// warmup window AND that resume-from-pause is never gated.

import { PauseDetector, type PauseEvent } from '../PauseDetector';
import type { Point } from '../../../domain/types';

function makePoint(opts: {
  ts: number;
  speed: number;
  lat?: number;
  lng?: number;
}): Point {
  return {
    timestamp: opts.ts,
    latitude: opts.lat ?? 55.7558,
    longitude: opts.lng ?? 37.6173,
    altitude: null,
    accuracy: 5,
    speed: opts.speed,
    heading: null,
    source: 'raw',
  };
}

describe('PauseDetector — warmup gate', () => {
  describe('no warmup (backward-compat default)', () => {
    it('emits auto-paused immediately when 5s of slow data', () => {
      const events: PauseEvent[] = [];
      const pd = new PauseDetector((e) => events.push(e));
      for (let i = 0; i <= 6; i += 1) {
        pd.observe(makePoint({ ts: i * 1000, speed: 0.2 }));
      }
      expect(events.map((e) => e.type)).toContain('auto-paused');
    });
  });

  describe('warmup configured', () => {
    const WARMUP = { warmupMs: 10_000, warmupMeters: 2 };

    it('suppresses auto-paused within warmup window (stationary < 10s)', () => {
      const events: PauseEvent[] = [];
      const pd = new PauseDetector((e) => events.push(e), 0.5, 5_000, 1.5, 2_000, WARMUP);
      // 6 points across 6 seconds, all slow, stationary (same lat/lng)
      for (let i = 0; i <= 6; i += 1) {
        pd.observe(makePoint({ ts: i * 1000, speed: 0.2 }));
      }
      expect(events).toHaveLength(0);
    });

    it('emits auto-paused after warmupMs elapses even with no motion', () => {
      const events: PauseEvent[] = [];
      const pd = new PauseDetector((e) => events.push(e), 0.5, 5_000, 1.5, 2_000, WARMUP);
      // 12 points across 11 seconds, all slow, stationary
      for (let i = 0; i <= 11; i += 1) {
        pd.observe(makePoint({ ts: i * 1000, speed: 0.2 }));
      }
      expect(events.map((e) => e.type)).toContain('auto-paused');
    });

    it('emits auto-paused once warmup distance threshold crossed (>2m moved)', () => {
      const events: PauseEvent[] = [];
      const pd = new PauseDetector((e) => events.push(e), 0.5, 5_000, 1.5, 2_000, WARMUP);
      // First 2 points — moved ~10 meters (lat delta ~0.0001 = ~11.1m)
      pd.observe(makePoint({ ts: 0, speed: 2.0, lat: 55.7558, lng: 37.6173 }));
      pd.observe(makePoint({ ts: 1000, speed: 2.0, lat: 55.7559, lng: 37.6173 }));
      // Now stationary — should auto-pause after 5s (because warmup distance crossed)
      for (let i = 2; i <= 7; i += 1) {
        pd.observe(makePoint({ ts: i * 1000, speed: 0.2, lat: 55.7559, lng: 37.6173 }));
      }
      expect(events.map((e) => e.type)).toContain('auto-paused');
    });

    it('does NOT suppress auto-resumed (only auto-paused is gated)', () => {
      const events: PauseEvent[] = [];
      const pd = new PauseDetector((e) => events.push(e), 0.5, 5_000, 1.5, 2_000, WARMUP);
      // Warmup ends via timeout
      for (let i = 0; i <= 11; i += 1) {
        pd.observe(makePoint({ ts: i * 1000, speed: 0.2 }));
      }
      // After warmup: auto-paused fired. Now run fast → expect auto-resumed.
      pd.observe(makePoint({ ts: 12_000, speed: 2.5 }));
      pd.observe(makePoint({ ts: 13_000, speed: 2.5 }));
      pd.observe(makePoint({ ts: 14_000, speed: 2.5 }));
      expect(events.map((e) => e.type)).toContain('auto-resumed');
    });

    it('reset() clears warmup state — next session starts fresh warmup', () => {
      const events: PauseEvent[] = [];
      const pd = new PauseDetector((e) => events.push(e), 0.5, 5_000, 1.5, 2_000, WARMUP);
      // Run through warmup + auto-pause
      for (let i = 0; i <= 11; i += 1) {
        pd.observe(makePoint({ ts: i * 1000, speed: 0.2 }));
      }
      expect(events.map((e) => e.type)).toContain('auto-paused');

      // Reset and start new session at later timestamp
      pd.reset();
      events.length = 0;

      // Even though wallclock is far ahead, new session is stationary < 10s
      // → must NOT emit (firstObservedTs resets)
      for (let i = 100; i <= 106; i += 1) {
        pd.observe(makePoint({ ts: i * 1000, speed: 0.2 }));
      }
      expect(events).toHaveLength(0);
    });
  });
});
