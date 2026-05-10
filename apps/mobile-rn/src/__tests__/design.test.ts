// Phase 8 / M1 — design system smoke tests.
//
// Покрывают только pure / pure-ish things (tokens, gradeLetter). Snapshot
// тесты для React Native компонентов отложены (нужен react-test-renderer
// + setup mock для react-native-svg; в M2/M3 добавим).

// Import direct from tokens.ts (pure module, no native deps). The barrel
// `src/design/index.ts` re-exports ThemeProvider which loads MMKV (nitro
// module) — fails in jest. Pure tokens fine here.
import {
  DEFAULT_TWEAKS,
  gradeLetter,
  makeTheme,
} from '../design/tokens';

describe('design/tokens makeTheme', () => {
  it('default dark theme has expected base colours', () => {
    const t = makeTheme(DEFAULT_TWEAKS);
    expect(t.bg).toBe('#0A0A0A');
    expect(t.text).toBe('#FFFFFF');
    expect(t.accent).toBe('#FF4D2E');
    expect(t.lime).toBe('#C6F560');
  });

  it('light theme overrides backgrounds + text', () => {
    const t = makeTheme({ ...DEFAULT_TWEAKS, theme: 'light' });
    expect(t.bg).toBe('#FFFFFF');
    expect(t.text).toBe('#0A0A0A');
    // accent остаётся в light theme.
    expect(t.accent).toBe('#FF4D2E');
  });

  it('custom accent flows through + computes accentDim', () => {
    const t = makeTheme({ ...DEFAULT_TWEAKS, accent: '#5B5DF2' });
    expect(t.accent).toBe('#5B5DF2');
    expect(t.accentDim).toMatch(/^rgba\(91,93,242,0\.16\)$/);
  });

  it('radiusScale multiplies radii (pill stays 9999)', () => {
    const compact = makeTheme({ ...DEFAULT_TWEAKS, radiusScale: 0.5 });
    expect(compact.r.md).toBe(8); // 16 * 0.5
    expect(compact.r.lg).toBe(10); // 20 * 0.5
    expect(compact.r.pill).toBe(9999);

    const soft = makeTheme({ ...DEFAULT_TWEAKS, radiusScale: 1.5 });
    expect(soft.r.md).toBe(24); // 16 * 1.5
  });

  it('density multiplies padding', () => {
    const dense = makeTheme({ ...DEFAULT_TWEAKS, density: 0.5 });
    expect(dense.pad.md).toBe(8); // 16 * 0.5

    const wide = makeTheme({ ...DEFAULT_TWEAKS, density: 1.5 });
    expect(wide.pad.md).toBe(24);
  });

  it('fontScale flows through', () => {
    const big = makeTheme({ ...DEFAULT_TWEAKS, fontSize: 1.2 });
    expect(big.fontScale).toBe(1.2);
  });

  it('grade colour table covers D / C / B / A / S', () => {
    const t = makeTheme(DEFAULT_TWEAKS);
    expect(t.grades.D).toBe('#C6F560');
    expect(t.grades.C).toBe('#7FE3A6');
    expect(t.grades.B).toBe('#4DC9D9');
    expect(t.grades.A).toBe('#FFB020');
    expect(t.grades.S).toBe('#FF4D2E');
  });
});

describe('design/tokens gradeLetter', () => {
  it('strips +/- modifiers and returns base letter', () => {
    expect(gradeLetter('D')).toBe('D');
    expect(gradeLetter('C+')).toBe('C');
    expect(gradeLetter('A+')).toBe('A');
    expect(gradeLetter('S')).toBe('S');
  });
  it('lowercases input', () => {
    expect(gradeLetter('a+')).toBe('A');
  });
  it('null / undefined / empty → D (fallback)', () => {
    expect(gradeLetter(null)).toBe('D');
    expect(gradeLetter(undefined)).toBe('D');
    expect(gradeLetter('')).toBe('D');
  });
  it('unknown letter → D', () => {
    expect(gradeLetter('X')).toBe('D');
    expect(gradeLetter('Z+')).toBe('D');
  });
});
