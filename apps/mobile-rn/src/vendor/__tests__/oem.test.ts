// Mutable mock state — declared inline so both `oem.ts` (via `import *`) and this
// test (via `jest.requireMock`) read from the SAME object. Plain
// `jest.mock('expo-device', () => ({ manufacturer: '' }))` frozen-namespace
// gotcha: ESM `import * as Device` returns a namespace object whose properties
// can't be reassigned from the test → mutations silently no-op. Using a
// getter-backed object survives the ESM/CJS transpilation roundtrip.
const mockState: { manufacturer: string | null | undefined } = { manufacturer: '' };

jest.mock('expo-device', () => ({
  get manufacturer() {
    return mockState.manufacturer;
  },
}));

import { detectVendor } from '../oem';

describe('detectVendor', () => {
  const cases: Array<[string, ReturnType<typeof detectVendor>]> = [
    ['Xiaomi', 'xiaomi'],
    ['xiaomi', 'xiaomi'],
    ['XIAOMI', 'xiaomi'],
    ['Redmi', 'xiaomi'],
    ['POCO', 'xiaomi'],
    ['Samsung', 'samsung'],
    ['SAMSUNG Electronics', 'samsung'],
    ['Huawei', 'huawei'],
    ['HUAWEI', 'huawei'],
    ['HONOR', 'huawei'],
    ['Google', 'generic'],
    ['OnePlus', 'generic'],
    ['Realme', 'generic'],
    ['Oppo', 'generic'],
    ['', 'generic'],
  ];

  it.each(cases)('detects vendor for "%s" → %s', (manuf, expected) => {
    mockState.manufacturer = manuf;
    expect(detectVendor()).toBe(expected);
  });

  it('handles null manufacturer', () => {
    mockState.manufacturer = null;
    expect(detectVendor()).toBe('generic');
  });

  it('handles undefined manufacturer', () => {
    mockState.manufacturer = undefined;
    expect(detectVendor()).toBe('generic');
  });
});
