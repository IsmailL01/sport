// usePauseUI hook test.
// Phase 1 / PHASE1-06. Покрывает: isPaused mirror, pauseLabel (ru), toggle binding.

import { renderHook, act } from '@testing-library/react-native';

type MockState = {
  isPaused: boolean;
  setPaused: jest.Mock;
};

const mockState: MockState = {
  isPaused: false,
  setPaused: jest.fn(),
};

function resetMockState() {
  mockState.isPaused = false;
  mockState.setPaused = jest.fn();
}

jest.mock('../state/activity', () => ({
  useActivityStore: <T,>(selector: (s: MockState) => T): T => selector(mockState),
}));

import { usePauseUI } from '../navigation/screens/record/hooks/usePauseUI';

beforeEach(() => {
  resetMockState();
});

describe('usePauseUI', () => {
  it('isPaused зеркалит store.isPaused — false', () => {
    mockState.isPaused = false;
    const { result } = renderHook(() => usePauseUI());
    expect(result.current.isPaused).toBe(false);
  });

  it('isPaused зеркалит store.isPaused — true', () => {
    mockState.isPaused = true;
    const { result } = renderHook(() => usePauseUI());
    expect(result.current.isPaused).toBe(true);
  });

  it('pauseLabel === "ПАУЗА" когда не на паузе', () => {
    mockState.isPaused = false;
    const { result } = renderHook(() => usePauseUI());
    expect(result.current.pauseLabel).toBe('ПАУЗА');
  });

  it('pauseLabel === "ПРОДОЛЖИТЬ" когда на паузе', () => {
    mockState.isPaused = true;
    const { result } = renderHook(() => usePauseUI());
    expect(result.current.pauseLabel).toBe('ПРОДОЛЖИТЬ');
  });

  it('toggle() вызывает setPaused(!isPaused)', () => {
    mockState.isPaused = false;
    const { result } = renderHook(() => usePauseUI());
    act(() => {
      result.current.toggle();
    });
    expect(mockState.setPaused).toHaveBeenCalledWith(true);
  });

  it('toggle() инвертирует isPaused когда на паузе', () => {
    mockState.isPaused = true;
    const { result } = renderHook(() => usePauseUI());
    act(() => {
      result.current.toggle();
    });
    expect(mockState.setPaused).toHaveBeenCalledWith(false);
  });
});
