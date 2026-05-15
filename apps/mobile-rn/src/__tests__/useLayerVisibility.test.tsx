// useLayerVisibility hook test.
// Phase 1 / PHASE1-06. Покрывает: showTrack / showCorridor / showZone / dimOverlay derivations.

import { renderHook } from '@testing-library/react-native';

type MockState = {
  points: Array<{ latitude: number; longitude: number; timestamp: number }>;
  isPaused: boolean;
  closureFired: boolean;
  state: 'idle' | 'recording' | 'stopped';
};

const mockState: MockState = {
  points: [],
  isPaused: false,
  closureFired: false,
  state: 'idle',
};

function resetMockState() {
  mockState.points = [];
  mockState.isPaused = false;
  mockState.closureFired = false;
  mockState.state = 'idle';
}

jest.mock('../state/activity', () => ({
  useActivityStore: <T,>(selector: (s: MockState) => T): T => selector(mockState),
}));

import { useLayerVisibility } from '../navigation/screens/record/hooks/useLayerVisibility';

beforeEach(() => {
  resetMockState();
});

describe('useLayerVisibility', () => {
  it('showTrack === true когда points.length >= 2', () => {
    mockState.state = 'recording';
    mockState.points = [
      { latitude: 50, longitude: 10, timestamp: 1 },
      { latitude: 50.001, longitude: 10.001, timestamp: 2 },
    ];
    const { result } = renderHook(() => useLayerVisibility());
    expect(result.current.showTrack).toBe(true);
  });

  it('showTrack === false когда points.length < 2', () => {
    mockState.state = 'recording';
    mockState.points = [{ latitude: 50, longitude: 10, timestamp: 1 }];
    const { result } = renderHook(() => useLayerVisibility());
    expect(result.current.showTrack).toBe(false);
  });

  it('showZone === true когда closureFired === true', () => {
    mockState.state = 'recording';
    mockState.closureFired = true;
    const { result } = renderHook(() => useLayerVisibility());
    expect(result.current.showZone).toBe(true);
  });

  it('dimOverlay === true когда isPaused === true', () => {
    mockState.state = 'recording';
    mockState.isPaused = true;
    const { result } = renderHook(() => useLayerVisibility());
    expect(result.current.dimOverlay).toBe(true);
  });

  it('showCorridor === true во время recording когда зона ещё не замкнута', () => {
    mockState.state = 'recording';
    mockState.closureFired = false;
    const { result } = renderHook(() => useLayerVisibility());
    expect(result.current.showCorridor).toBe(true);
  });

  it('showCorridor === false после замыкания зоны', () => {
    mockState.state = 'recording';
    mockState.closureFired = true;
    const { result } = renderHook(() => useLayerVisibility());
    expect(result.current.showCorridor).toBe(false);
  });
});
