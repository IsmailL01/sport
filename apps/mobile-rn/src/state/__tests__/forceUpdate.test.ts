// Тесты для src/state/forceUpdate.ts (Phase 1 / REL-02).
//
// Test 7 из плана: set({...}) обновляет state; reset() сбрасывает required в false.

describe('useForceUpdateStore', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('initial state: required=false, empty strings', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useForceUpdateStore } = require('../forceUpdate');
    const s = useForceUpdateStore.getState();
    expect(s.required).toBe(false);
    expect(s.minVersion).toBe('');
    expect(s.forceUpdateUrl).toBe('');
  });

  it('set({required:true, minVersion, forceUpdateUrl}) populates state', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useForceUpdateStore } = require('../forceUpdate');
    useForceUpdateStore.getState().set({
      required: true,
      minVersion: '1.0.0',
      forceUpdateUrl: 'https://example.com/update',
    });
    const s = useForceUpdateStore.getState();
    expect(s.required).toBe(true);
    expect(s.minVersion).toBe('1.0.0');
    expect(s.forceUpdateUrl).toBe('https://example.com/update');
  });

  it('partial set merges with existing state', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useForceUpdateStore } = require('../forceUpdate');
    useForceUpdateStore.getState().set({ required: true, minVersion: '1.0.0', forceUpdateUrl: 'a' });
    useForceUpdateStore.getState().set({ forceUpdateUrl: 'b' });
    const s = useForceUpdateStore.getState();
    expect(s.required).toBe(true);
    expect(s.minVersion).toBe('1.0.0');
    expect(s.forceUpdateUrl).toBe('b');
  });

  it('reset() clears required and other fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useForceUpdateStore } = require('../forceUpdate');
    useForceUpdateStore.getState().set({
      required: true,
      minVersion: '1.0.0',
      forceUpdateUrl: 'https://example.com',
    });
    useForceUpdateStore.getState().reset();
    const s = useForceUpdateStore.getState();
    expect(s.required).toBe(false);
    expect(s.minVersion).toBe('');
    expect(s.forceUpdateUrl).toBe('');
  });
});
