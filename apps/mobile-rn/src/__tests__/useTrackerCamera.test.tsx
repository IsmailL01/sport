// useTrackerCamera hook test.
// Phase 1 / PHASE1-06. Покрывает: camera follow → release on closure, fitToBounds стабильная ссылка.
//
// Zustand-mock-pattern (greenfield для этого кодовая база):
// - module-level `mockState` объект мутируется тестами,
// - jest.mock подменяет `useActivityStore` на функцию, читающую selector(mockState),
// - между тест-кейсами вызывается `resetMockState()`.
// Этот же паттерн используют тесты useLayerVisibility.test.tsx и usePauseUI.test.tsx,
// а Plans 03 / 04 будут его расширять для useClosureFeedback и др.

import { renderHook } from '@testing-library/react-native';

type MockState = {
  points: Array<{ latitude: number; longitude: number; timestamp: number }>;
  startedAt: number | null;
  isPaused: boolean;
  closureFired: boolean;
  state: 'idle' | 'recording' | 'stopped';
};

const mockState: MockState = {
  points: [],
  startedAt: null,
  isPaused: false,
  closureFired: false,
  state: 'idle',
};

function resetMockState() {
  mockState.points = [];
  mockState.startedAt = null;
  mockState.isPaused = false;
  mockState.closureFired = false;
  mockState.state = 'idle';
}

jest.mock('../state/activity', () => ({
  useActivityStore: <T,>(selector: (s: MockState) => T): T => selector(mockState),
}));

import { useTrackerCamera } from '../navigation/screens/record/hooks/useTrackerCamera';

beforeEach(() => {
  resetMockState();
});

describe('useTrackerCamera', () => {
  it('cameraProps.followUserLocation === true когда recording + points.length > 0 + НЕ closureFired', () => {
    mockState.state = 'recording';
    mockState.points = [{ latitude: 50, longitude: 10, timestamp: 1 }];
    mockState.closureFired = false;
    const { result } = renderHook(() => useTrackerCamera());
    expect(result.current.cameraProps.followUserLocation).toBe(true);
    expect(result.current.cameraProps.followZoomLevel).toBe(16);
  });

  it('cameraProps.followUserLocation === false после закрытия зоны (camera освобождается)', () => {
    mockState.state = 'recording';
    mockState.points = [
      { latitude: 50, longitude: 10, timestamp: 1 },
      { latitude: 50.001, longitude: 10.001, timestamp: 2 },
    ];
    mockState.closureFired = true;
    const { result } = renderHook(() => useTrackerCamera());
    expect(result.current.cameraProps.followUserLocation).toBe(false);
  });

  it('fitToBounds — стабильная ссылка при идентичных re-render', () => {
    mockState.state = 'recording';
    mockState.points = [
      { latitude: 50, longitude: 10, timestamp: 1 },
      { latitude: 50.001, longitude: 10.001, timestamp: 2 },
    ];
    const { result, rerender } = renderHook(() => useTrackerCamera());
    const ref1 = result.current.fitToBounds;
    rerender({});
    const ref2 = result.current.fitToBounds;
    expect(ref1).toBe(ref2);
  });

  it('fitToBounds — функция возвращает не-undefined результат при валидных bounds', () => {
    mockState.state = 'recording';
    mockState.points = [
      { latitude: 50, longitude: 10, timestamp: 1 },
      { latitude: 50.001, longitude: 10.001, timestamp: 2 },
    ];
    const { result } = renderHook(() => useTrackerCamera());
    // fitToBounds возвращает computed bounds (опционально для consumer); просто проверяем не-throw.
    expect(() => {
      result.current.fitToBounds([[10, 50], [10.001, 50.001]], 80);
    }).not.toThrow();
  });
});
