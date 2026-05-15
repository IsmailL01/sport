// useClosureFeedback hook test.
// Phase 1 / PHASE1-08. Покрывает: haptic fire once на transition false→true,
// toast show с formatArea, idempotency на re-render, guard areaM2===null,
// silent swallow rejected promise (Pitfall 2 — iOS sim / Android без permission).

import { renderHook } from '@testing-library/react-native';

import { formatArea } from '../ui/format';

// ── Mocks ────────────────────────────────────────────────────────────────────
// jest.mock hoisted to top by Babel — module-level mockState нужен ДО imports
// тестируемого хука. См. Zustand-mock-pattern из Plan 02's SUMMARY (раздел
// "Why this pattern").

type MockState = {
  closureFired: boolean;
  areaM2: number | null;
};

const mockState: MockState = {
  closureFired: false,
  areaM2: null,
};

function resetMockState() {
  mockState.closureFired = false;
  mockState.areaM2 = null;
}

jest.mock('../state/activity', () => ({
  useActivityStore: <T,>(selector: (s: MockState) => T): T => selector(mockState),
}));

const mockShow = jest.fn();
jest.mock('../ui/Toast', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ToastProvider: ({ children }: any) => children,
  useToast: () => ({ show: mockShow }),
}));

const mockHaptics = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('expo-haptics', () => ({
  notificationAsync: (...args: unknown[]) => mockHaptics(...args),
  NotificationFeedbackType: { Success: 'success' },
}));

// Тестируемое (импорт ПОСЛЕ jest.mock).
import { useClosureFeedback } from '../navigation/screens/record/hooks/useClosureFeedback';

// ── Unhandled-rejection guard (Test 5) ────────────────────────────────────────

let unhandledRejections: unknown[] = [];
function onUnhandled(reason: unknown) {
  unhandledRejections.push(reason);
}

beforeAll(() => {
  process.on('unhandledRejection', onUnhandled);
});
afterAll(() => {
  process.off('unhandledRejection', onUnhandled);
});

beforeEach(() => {
  resetMockState();
  mockShow.mockClear();
  mockHaptics.mockClear();
  mockHaptics.mockImplementation(() => Promise.resolve());
  unhandledRejections = [];
});

describe('useClosureFeedback', () => {
  it('fires Haptics.notificationAsync(Success) once when closureFired flips false→true', () => {
    mockState.closureFired = false;
    mockState.areaM2 = null;
    const { rerender } = renderHook(() => useClosureFeedback());
    expect(mockHaptics).not.toHaveBeenCalled();

    // Transition: closureFired=true с валидным area.
    mockState.closureFired = true;
    mockState.areaM2 = 1234;
    rerender(undefined);

    expect(mockHaptics).toHaveBeenCalledTimes(1);
    expect(mockHaptics).toHaveBeenCalledWith('success');
  });

  it('calls show() with Russian-formatted area string', () => {
    mockState.closureFired = false;
    mockState.areaM2 = null;
    const { rerender } = renderHook(() => useClosureFeedback());

    mockState.closureFired = true;
    mockState.areaM2 = 1234;
    rerender(undefined);

    expect(mockShow).toHaveBeenCalledTimes(1);
    // Сверяем с РЕАЛЬНЫМ formatArea — никаких hard-coded literals.
    const expected = `Зона замкнута! Площадь: ${formatArea(1234)}`;
    expect(mockShow).toHaveBeenCalledWith(expected);
  });

  it('does not re-fire haptic or toast on re-render with same closureFired=true / areaM2', () => {
    mockState.closureFired = true;
    mockState.areaM2 = 5000;
    const { rerender } = renderHook(() => useClosureFeedback());

    expect(mockHaptics).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalledTimes(1);

    // Перерисовка с теми же deps — useEffect не должен сработать заново.
    rerender(undefined);
    rerender(undefined);

    expect(mockHaptics).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it('does NOT call haptic or toast when closureFired===true but areaM2===null (guard)', () => {
    mockState.closureFired = true;
    mockState.areaM2 = null;
    renderHook(() => useClosureFeedback());

    expect(mockHaptics).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('silently swallows rejected Haptics promise — no unhandled rejection, toast still fires', async () => {
    // На этот один вызов — promise reject.
    mockHaptics.mockImplementationOnce(() => Promise.reject(new Error('sim no haptic')));

    mockState.closureFired = false;
    mockState.areaM2 = null;
    const { rerender } = renderHook(() => useClosureFeedback());

    mockState.closureFired = true;
    mockState.areaM2 = 1234;
    rerender(undefined);

    // Drain microtask queue per plan-checker round 1 warning #7 —
    // unhandledRejection листенер срабатывает на следующий tick.
    await new Promise((resolve) => setImmediate(resolve));

    // Toast всё равно вызвался (best-effort feedback).
    expect(mockShow).toHaveBeenCalledTimes(1);
    // Haptic был вызван (отвергся).
    expect(mockHaptics).toHaveBeenCalledTimes(1);
    // Нет unhandled rejection.
    expect(unhandledRejections).toEqual([]);
  });
});
