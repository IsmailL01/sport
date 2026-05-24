// Phase 8 Plan 08-01 Task 5 — manifestCheck.ts unit tests.
//
// Mocks: react-native-mmkv (in-memory store), fetch (Jest mock), the
// manifestSigning module (always-accept stub for state-transition focus),
// util/version.ts (controllable installed-version), forceUpdate store.

const VALID_MANIFEST = {
  apk_sha256: 'a'.repeat(64),
  apk_size_bytes: 1024,
  apk_url: 'https://example.com/test.apk',
  min_supported_version: '1.0.0-beta.1',
  released_at: '2026-05-24T00:00:00Z',
  signature: 'A'.repeat(86) + '==',
  version: '1.0.0-beta.5',
  version_code: 5,
};

// MMKV shim — both stores share this mock to allow cross-store state inspection.
jest.mock('react-native-mmkv', () => {
  const stores = new Map<string, Map<string, string>>();
  return {
    createMMKV: (opts: { id?: string } = {}) => {
      const id = opts.id ?? 'default';
      if (!stores.has(id)) stores.set(id, new Map());
      const m = stores.get(id)!;
      return {
        getString: (key: string) => m.get(key),
        set: (key: string, value: string) => {
          m.set(key, value);
        },
        remove: (key: string) => {
          m.delete(key);
        },
      };
    },
    __reset: () => stores.clear(),
  };
});

// AppState mock (RN provides it; the hook isn't tested here but the module
// imports react-native chain through @noble/ed25519's runtime detection).
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

// Mock signature verification — focus tests on dispatch logic, not crypto
// (crypto is covered by manifestSigning.test.ts).
// Define mocks INSIDE the factory (jest.mock is hoisted; outer-scope refs
// to non-mock-prefixed lets are forbidden + even with `mock` prefix, the
// hoisted factory runs before module top-level statements). The factory
// instantiates `jest.fn()` directly; tests reach in via jest.requireMock.
jest.mock('../manifestSigning', () => ({
  __esModule: true,
  verifyManifestSignature: jest.fn(() => true),
}));
jest.mock('../../util/version', () => ({
  __esModule: true,
  getInstalledVersion: jest.fn(() => '1.0.0-beta.3'),
}));

// Retrieve handles to the auto-generated mocks for per-test control.
const mockVerify = jest.requireMock('../manifestSigning').verifyManifestSignature as jest.Mock;
const mockInstalledVersion = jest.requireMock('../../util/version').getInstalledVersion as jest.Mock;

import { checkForUpdate } from '../manifestCheck';
import { useForceUpdateStore } from '../../state/forceUpdate';
import { useUpdateBannerStore } from '../updateBannerStore';
import { useUpdateCheckStore } from '../updateCheckStore';

const __reset = () => {
  jest.requireMock('react-native-mmkv').__reset();
  useForceUpdateStore.getState().reset();
  useUpdateBannerStore.setState({
    available: false,
    manifest: null,
    suppressedUntil: null,
  });
  useUpdateCheckStore.setState({
    lastCheckedAt: null,
    checking: false,
    lastError: null,
    installedReleasedAt: null,
  });
};

beforeEach(() => {
  __reset();
  mockVerify.mockReset().mockReturnValue(true);
  mockInstalledVersion.mockReset().mockReturnValue('1.0.0-beta.3');
  global.fetch = jest.fn();
  // Open the ADR-0011 Amendment 5 gate for the dispatch-logic tests. The
  // gated-off path is exercised in its own describe-block below.
  process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL =
    'https://test.example/manifest.json';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL;
});

describe('checkForUpdate — optional update path', () => {
  it('shows banner when manifest.version > installed AND min_supported_version <= installed', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => VALID_MANIFEST,
    });
    const r = await checkForUpdate();
    expect(r.state).toBe('banner-shown');
    expect(useUpdateBannerStore.getState().available).toBe(true);
    expect(useUpdateBannerStore.getState().manifest?.version).toBe(
      '1.0.0-beta.5',
    );
    expect(useForceUpdateStore.getState().required).toBe(false);
  });
});

describe('checkForUpdate — force-update path', () => {
  it('triggers REL-02 force when min_supported_version > installed', async () => {
    const forceManifest = {
      ...VALID_MANIFEST,
      min_supported_version: '1.0.0-beta.99',
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => forceManifest,
    });
    const r = await checkForUpdate();
    expect(r.state).toBe('force-required');
    expect(useForceUpdateStore.getState().required).toBe(true);
    expect(useForceUpdateStore.getState().minVersion).toBe('1.0.0-beta.99');
    expect(useForceUpdateStore.getState().forceUpdateUrl).toBe(
      VALID_MANIFEST.apk_url,
    );
    // Banner cleared (force overrides).
    expect(useUpdateBannerStore.getState().available).toBe(false);
  });
});

describe('checkForUpdate — silent (no-update) path', () => {
  it('clears banner when installed === manifest.version', async () => {
    mockInstalledVersion.mockReturnValue('1.0.0-beta.5');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => VALID_MANIFEST,
    });
    const r = await checkForUpdate();
    expect(r.state).toBe('no-update');
    expect(useUpdateBannerStore.getState().available).toBe(false);
  });
});

describe('checkForUpdate — failure paths (all silent per D-13)', () => {
  it('returns failed on HTTP non-200', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const r = await checkForUpdate();
    expect(r.state).toBe('failed');
    if (r.state === 'failed') expect(r.error).toMatch(/HTTP 503/);
    expect(useUpdateCheckStore.getState().lastError).toMatch(/HTTP 503/);
  });

  it('returns failed on schema invalid', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ...VALID_MANIFEST, version: 'not-a-version' }),
    });
    const r = await checkForUpdate();
    expect(r.state).toBe('failed');
    if (r.state === 'failed') expect(r.error).toMatch(/schema/);
  });

  it('returns failed on signature verification failure', async () => {
    mockVerify.mockReturnValue(false);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => VALID_MANIFEST,
    });
    const r = await checkForUpdate();
    expect(r.state).toBe('failed');
    if (r.state === 'failed') expect(r.error).toMatch(/signature/);
  });

  it('returns failed on replay (released_at < installedReleasedAt)', async () => {
    useUpdateCheckStore.setState({
      installedReleasedAt: Date.parse('2027-01-01T00:00:00Z'),
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => VALID_MANIFEST,
    });
    const r = await checkForUpdate();
    expect(r.state).toBe('failed');
    if (r.state === 'failed') expect(r.error).toMatch(/replay/);
  });
});

describe('checkForUpdate — throttle', () => {
  it('skips check if lastCheckedAt < 6h ago and not forced', async () => {
    useUpdateCheckStore.setState({
      lastCheckedAt: Date.now() - 1000 * 60 * 30, // 30 min ago
    });
    const r = await checkForUpdate();
    expect(r.state).toBe('throttled');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('bypasses throttle when force: true', async () => {
    useUpdateCheckStore.setState({
      lastCheckedAt: Date.now() - 1000 * 60 * 30,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => VALID_MANIFEST,
    });
    const r = await checkForUpdate({ force: true });
    expect(r.state).toBe('banner-shown');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('checkForUpdate — gated (ADR-0011 Amendment 5)', () => {
  it('returns disabled without fetch when EXPO_PUBLIC_UPDATE_MANIFEST_URL is empty', async () => {
    process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL = '';
    const r = await checkForUpdate({ force: true });
    expect(r.state).toBe('disabled');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns disabled without fetch when EXPO_PUBLIC_UPDATE_MANIFEST_URL is unset', async () => {
    delete process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL;
    const r = await checkForUpdate({ force: true });
    expect(r.state).toBe('disabled');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('checkForUpdate — banner suppression edge case (RESEARCH §9 Q6)', () => {
  it('preserves suppressedUntil when same manifest version returns', async () => {
    const future = Date.now() + 1000 * 60 * 60 * 24;
    useUpdateBannerStore.setState({
      available: true,
      manifest: VALID_MANIFEST,
      suppressedUntil: future,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => VALID_MANIFEST,
    });
    await checkForUpdate({ force: true });
    // Same version → suppressedUntil preserved.
    expect(useUpdateBannerStore.getState().suppressedUntil).toBe(future);
  });

  it('clears suppressedUntil when manifest version changes', async () => {
    const future = Date.now() + 1000 * 60 * 60 * 24;
    useUpdateBannerStore.setState({
      available: true,
      manifest: { ...VALID_MANIFEST, version: '1.0.0-beta.4' },
      suppressedUntil: future,
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => VALID_MANIFEST, // version: 1.0.0-beta.5
    });
    await checkForUpdate({ force: true });
    expect(useUpdateBannerStore.getState().suppressedUntil).toBeNull();
    expect(useUpdateBannerStore.getState().manifest?.version).toBe(
      '1.0.0-beta.5',
    );
  });
});
