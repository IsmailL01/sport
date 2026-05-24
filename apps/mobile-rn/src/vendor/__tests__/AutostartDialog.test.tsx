// AutostartDialog gating tests (Phase 7 / Plan 07-03 Task 4).
//
// Three concerns covered:
//   1. shouldShowDialog() vendor gating (xiaomi + samsung = yes; generic + huawei = no).
//   2. shouldShowDialog() respects MMKV "already shown" flag.
//   3. markDialogShown() persists the flag so subsequent calls return false.
//
// Mocking:
//   - jest.mock('react-native-mmkv') with shared in-memory storage shim
//     (matches the existing pattern in src/state/__tests__/featureflags.test.ts).
//   - jest.mock('../oem') so we can toggle detectVendor return per case.

// Shared mutable MMKV-like store. Resetting between cases requires reaching
// in via the mocked module to call its `__reset` helper.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>();
  return {
    createMMKV: () => ({
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => {
        store.set(key, value);
      },
      remove: (key: string) => {
        store.delete(key);
      },
    }),
    __reset: () => {
      store.clear();
    },
  };
});

jest.mock('../oem', () => ({
  detectVendor: jest.fn(),
}));

import { detectVendor } from '../oem';
import { markDialogShown, resetDialogShown, shouldShowDialog } from '../AutostartDialog';

const detect = detectVendor as jest.Mock;

describe('AutostartDialog gating', () => {
  beforeEach(() => {
    resetDialogShown();
    detect.mockReset();
  });

  it('shows on Xiaomi when flag unset', () => {
    detect.mockReturnValue('xiaomi');
    expect(shouldShowDialog()).toBe(true);
  });

  it('shows on Samsung when flag unset (One UI one-shot opportunity)', () => {
    detect.mockReturnValue('samsung');
    expect(shouldShowDialog()).toBe(true);
  });

  it('hides on Xiaomi after markDialogShown() persists flag', () => {
    detect.mockReturnValue('xiaomi');
    expect(shouldShowDialog()).toBe(true);
    markDialogShown();
    expect(shouldShowDialog()).toBe(false);
  });

  it('hides on Samsung after markDialogShown()', () => {
    detect.mockReturnValue('samsung');
    markDialogShown();
    expect(shouldShowDialog()).toBe(false);
  });

  it('never shows on generic vendor (no autostart-killer)', () => {
    detect.mockReturnValue('generic');
    expect(shouldShowDialog()).toBe(false);
  });

  it('never shows on Huawei (deferred per CONTEXT D-17)', () => {
    detect.mockReturnValue('huawei');
    expect(shouldShowDialog()).toBe(false);
  });

  it('resetDialogShown() un-persists so dialog can show again (QA helper)', () => {
    detect.mockReturnValue('xiaomi');
    markDialogShown();
    expect(shouldShowDialog()).toBe(false);
    resetDialogShown();
    expect(shouldShowDialog()).toBe(true);
  });
});
