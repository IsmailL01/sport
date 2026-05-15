// Тесты для src/util/version.ts (Phase 1 / REL-02).
//
// Покрывают:
//   - Test 1: getClientVersionHeader() возвращает "X.Y.Z (N)" формат при
//     валидных значениях expo-application
//   - Test 2: nativeApplicationVersion = null → fallback '0.0.0'
//   - Test 3: nativeBuildVersion = null → fallback '0'
//   - Test 4: header вычисляется при module-load (memoized) — повторные
//     вызовы возвращают тот же string без дополнительных обращений к
//     expo-application

describe('getClientVersionHeader', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('returns "X.Y.Z (N)" when expo-application provides valid values', () => {
    jest.doMock('expo-application', () => ({
      __esModule: true,
      nativeApplicationVersion: '1.2.3',
      nativeBuildVersion: '42',
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getClientVersionHeader } = require('../version');
    const got = getClientVersionHeader();
    expect(got).toMatch(/^\d+\.\d+\.\d+ \(\d+\)$/);
    expect(got).toBe('1.2.3 (42)');
  });

  it('falls back to "0.0.0" when nativeApplicationVersion is null', () => {
    jest.doMock('expo-application', () => ({
      __esModule: true,
      nativeApplicationVersion: null,
      nativeBuildVersion: '7',
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getClientVersionHeader } = require('../version');
    expect(getClientVersionHeader()).toBe('0.0.0 (7)');
  });

  it('falls back to "0" when nativeBuildVersion is null', () => {
    jest.doMock('expo-application', () => ({
      __esModule: true,
      nativeApplicationVersion: '2.0.0',
      nativeBuildVersion: null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getClientVersionHeader } = require('../version');
    expect(getClientVersionHeader()).toBe('2.0.0 (0)');
  });

  it('memoizes header at module load — two calls produce identical string', () => {
    jest.doMock('expo-application', () => ({
      __esModule: true,
      nativeApplicationVersion: '3.4.5',
      nativeBuildVersion: '99',
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getClientVersionHeader } = require('../version');
    const a = getClientVersionHeader();
    const b = getClientVersionHeader();
    expect(a).toBe(b);
    expect(a).toBe('3.4.5 (99)');
  });
});
