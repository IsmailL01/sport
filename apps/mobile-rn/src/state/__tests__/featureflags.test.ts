// Тесты для src/state/featureflags.{defaults,ts,Api}.ts.
// Phase 1 / REL-03.
//
// Behaviors per plan:
//  1.  DEFAULT_FLAGS has exactly the 5 v1.0 flags, all false.
//  2.  DEFAULT_FLAGS frozen.
//  3.  refresh() в пределах TTL — no-op.
//  4.  refresh() после TTL — обновляет flags + lastFetchedAt.
//  5.  refresh() с network error → сохраняет existing flags.
//  6.  Concurrent refresh() — loading flag предотвращает double-fetch.
//  7.  isEnabled three-tier resolution (server → default → false).
//  8.  clearAll() сбрасывает к DEFAULT_FLAGS + null'ит lastFetchedAt/error.
// 10.  featureflagsApi.fetchFeatureFlags on 200 → Record<string,boolean>.
// 11.  fetchFeatureFlags on throw → null + warn.
// 12.  fetchFeatureFlags on non-2xx → null + warn.

import { DEFAULT_FLAGS } from '../featureflags.defaults';

// Мокаем зависимости перед импортом стора, чтобы MMKV и apiClient не
// дёргали native bridge.
jest.mock('react-native-mmkv', () => {
  // In-memory storage shim.
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
  };
});

jest.mock('../../auth/apiClient', () => ({
  apiClient: {
    api: jest.fn(),
  },
}));

// === Defaults tests ===

describe('DEFAULT_FLAGS', () => {
  it('exposes exactly 5 v1.0 flag names, all false', () => {
    const keys = Object.keys(DEFAULT_FLAGS).sort();
    expect(keys).toEqual(
      [
        'crash_telemetry_opt_in',
        'mapbox_sdk_v11',
        'release_channel_force_update',
        'strava_oauth_enabled',
        'tester_debug_logging',
      ].sort(),
    );
    for (const k of keys) {
      expect(DEFAULT_FLAGS[k]).toBe(false);
    }
  });

  it('is frozen (runtime immutability)', () => {
    expect(Object.isFrozen(DEFAULT_FLAGS)).toBe(true);
  });
});

// === Store tests ===

describe('useFeatureFlagsStore', () => {
  // Helper: получить store + mocked apiClient.api после fresh module reset.
  // Каждый test runs in isolation чтобы MMKV stub очищался между ними.
  function loadStoreFresh(): {
    useFeatureFlagsStore: typeof import('../featureflags').useFeatureFlagsStore;
    apiMock: jest.Mock;
  } {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useFeatureFlagsStore } = require('../featureflags') as typeof import('../featureflags');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiClient } = require('../../auth/apiClient') as { apiClient: { api: jest.Mock } };
    apiClient.api.mockReset();
    return { useFeatureFlagsStore, apiMock: apiClient.api };
  }

  beforeEach(() => {
    jest.useRealTimers();
  });

  it('initial state: flags = DEFAULT_FLAGS, lastFetchedAt=null, loading=false', () => {
    const { useFeatureFlagsStore } = loadStoreFresh();
    const s = useFeatureFlagsStore.getState();
    expect(s.flags).toEqual({ ...DEFAULT_FLAGS });
    expect(s.lastFetchedAt).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('refresh() within TTL window is a no-op (does not call fetchFeatureFlags)', async () => {
    const { useFeatureFlagsStore, apiMock } = loadStoreFresh();
    // Seed lastFetchedAt: 1 minute ago — внутри 5-min TTL.
    useFeatureFlagsStore.setState({ lastFetchedAt: Date.now() - 60_000 });
    await useFeatureFlagsStore.getState().refresh();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('refresh() after TTL fetches and updates flags + lastFetchedAt', async () => {
    const { useFeatureFlagsStore, apiMock } = loadStoreFresh();
    // Stub Response.json() → server returns strava_oauth_enabled=true.
    apiMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { name: 'strava_oauth_enabled', enabled: true },
        { name: 'mapbox_sdk_v11', enabled: false },
      ],
    });
    // Force stale.
    useFeatureFlagsStore.setState({ lastFetchedAt: Date.now() - 10 * 60 * 1000 });

    await useFeatureFlagsStore.getState().refresh();

    expect(apiMock).toHaveBeenCalledTimes(1);
    const after = useFeatureFlagsStore.getState();
    expect(after.flags.strava_oauth_enabled).toBe(true);
    expect(after.flags.mapbox_sdk_v11).toBe(false);
    expect(after.lastFetchedAt).not.toBeNull();
    expect(after.loading).toBe(false);
  });

  it('refresh() on network error keeps existing flags + sets loading=false', async () => {
    const { useFeatureFlagsStore, apiMock } = loadStoreFresh();
    apiMock.mockRejectedValue(new Error('network down'));

    // Seed существующее value.
    useFeatureFlagsStore.setState({
      flags: { ...DEFAULT_FLAGS, strava_oauth_enabled: true },
      lastFetchedAt: Date.now() - 10 * 60 * 1000,
    });

    await useFeatureFlagsStore.getState().refresh();

    const after = useFeatureFlagsStore.getState();
    // Existing value preserved (offline-first).
    expect(after.flags.strava_oauth_enabled).toBe(true);
    expect(after.loading).toBe(false);
  });

  it('concurrent refresh() calls deduplicate via loading flag', async () => {
    const { useFeatureFlagsStore, apiMock } = loadStoreFresh();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveApi: (value: any) => void = () => {};
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    apiMock.mockReturnValue(apiPromise);

    useFeatureFlagsStore.setState({ lastFetchedAt: Date.now() - 10 * 60 * 1000 });

    const p1 = useFeatureFlagsStore.getState().refresh();
    // Не ждём p1 — сразу зовём второй раз.
    const p2 = useFeatureFlagsStore.getState().refresh();
    // p2 должен спросить loading=true и вернуться сразу, не вызвав api.
    // Завершаем in-flight call.
    resolveApi({
      ok: true,
      status: 200,
      json: async () => [],
    });
    await Promise.all([p1, p2]);

    // apiMock вызван только один раз — race guard сработал.
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('isEnabled: server cache → default → false (three-tier)', () => {
    const { useFeatureFlagsStore } = loadStoreFresh();
    // 1. Server cache hit.
    useFeatureFlagsStore.setState({
      flags: { ...DEFAULT_FLAGS, strava_oauth_enabled: true },
    });
    expect(useFeatureFlagsStore.getState().isEnabled('strava_oauth_enabled')).toBe(true);
    // 2. Default fallback (флаг есть в defaults но flags-record его не имеет).
    useFeatureFlagsStore.setState({ flags: {} });
    expect(useFeatureFlagsStore.getState().isEnabled('mapbox_sdk_v11')).toBe(false);
    // 3. Unknown flag → false.
    expect(useFeatureFlagsStore.getState().isEnabled('nonexistent_flag')).toBe(false);
  });

  it('clearAll() reverts to DEFAULT_FLAGS and clears lastFetchedAt/error/loading', () => {
    const { useFeatureFlagsStore } = loadStoreFresh();
    useFeatureFlagsStore.setState({
      flags: { ...DEFAULT_FLAGS, strava_oauth_enabled: true, mapbox_sdk_v11: true },
      lastFetchedAt: 12345,
      error: 'something',
      loading: true,
    });
    useFeatureFlagsStore.getState().clearAll();
    const s = useFeatureFlagsStore.getState();
    expect(s.flags).toEqual({ ...DEFAULT_FLAGS });
    expect(s.lastFetchedAt).toBeNull();
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
  });
});

// === featureflagsApi tests ===

describe('fetchFeatureFlags', () => {
  function loadApiFresh(): {
    fetchFeatureFlags: typeof import('../featureflagsApi').fetchFeatureFlags;
    apiMock: jest.Mock;
  } {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetchFeatureFlags } = require('../featureflagsApi') as typeof import('../featureflagsApi');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiClient } = require('../../auth/apiClient') as { apiClient: { api: jest.Mock } };
    apiClient.api.mockReset();
    return { fetchFeatureFlags, apiMock: apiClient.api };
  }

  it('on 200 → builds Record<string,boolean> from server array', async () => {
    const { fetchFeatureFlags, apiMock } = loadApiFresh();
    apiMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { name: 'a', enabled: true },
        { name: 'b', enabled: false },
      ],
    });
    const got = await fetchFeatureFlags();
    expect(got).toEqual({ a: true, b: false });
  });

  it('on fetch throw → null + console.warn captured', async () => {
    const { fetchFeatureFlags, apiMock } = loadApiFresh();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    apiMock.mockRejectedValue(new Error('network down'));
    const got = await fetchFeatureFlags();
    expect(got).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[featureflags] fetch failed');
    warnSpy.mockRestore();
  });

  it('on non-2xx → null + console.warn captured', async () => {
    const { fetchFeatureFlags, apiMock } = loadApiFresh();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    apiMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const got = await fetchFeatureFlags();
    expect(got).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[featureflags] fetch non-ok');
    warnSpy.mockRestore();
  });

  it('on non-array body → null (defensive)', async () => {
    const { fetchFeatureFlags, apiMock } = loadApiFresh();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    apiMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: 'object' }),
    });
    const got = await fetchFeatureFlags();
    expect(got).toBeNull();
    warnSpy.mockRestore();
  });
});
