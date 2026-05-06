import {
  formatArea,
  formatCalories,
  formatDistance,
  formatDuration,
  formatPace,
} from '../ui/format';

describe('formatDuration', () => {
  it('0 секунд', () => expect(formatDuration(0)).toBe('0:00'));
  it('59 секунд', () => expect(formatDuration(59)).toBe('0:59'));
  it('1 минута', () => expect(formatDuration(60)).toBe('1:00'));
  it('5:23', () => expect(formatDuration(5 * 60 + 23)).toBe('5:23'));
  it('1 час', () => expect(formatDuration(3600)).toBe('1:00:00'));
  it('1:23:45', () =>
    expect(formatDuration(3600 + 23 * 60 + 45)).toBe('1:23:45'));
});

describe('formatDistance', () => {
  it('< 1км в метрах', () => expect(formatDistance(500)).toBe('500 м'));
  it('999м в метрах', () => expect(formatDistance(999)).toBe('999 м'));
  it('1.00 км', () => expect(formatDistance(1000)).toBe('1.00 км'));
  it('5.43 км', () => expect(formatDistance(5432)).toBe('5.43 км'));
});

describe('formatArea', () => {
  it('< 1 га в м²', () => expect(formatArea(7140)).toBe('7140 м²'));
  it('1 га', () => expect(formatArea(10_000)).toBe('1.00 га'));
  it('15 га', () => expect(formatArea(150_000)).toBe('15.00 га'));
  it('1 км²', () => expect(formatArea(1_000_000)).toBe('1.000 км²'));
});

describe('formatPace', () => {
  it('null → --:--', () => expect(formatPace(null)).toBe('--:--'));
  it('Infinity → --:--', () => expect(formatPace(Infinity)).toBe('--:--'));
  it('5:00', () => expect(formatPace(5)).toBe('5:00'));
  it('5:30', () => expect(formatPace(5.5)).toBe('5:30'));
  it('4:23', () => expect(formatPace(4 + 23 / 60)).toBe('4:23'));
  it('rounding carry — 4:60 → 5:00', () => expect(formatPace(4.999)).toBe('5:00'));
});

describe('formatCalories', () => {
  it('362.6 → 363 ккал', () => expect(formatCalories(362.6)).toBe('363 ккал'));
  it('0 → 0 ккал', () => expect(formatCalories(0)).toBe('0 ккал'));
});
