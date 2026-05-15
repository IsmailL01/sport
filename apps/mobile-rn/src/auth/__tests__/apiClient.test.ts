// Тесты для src/auth/apiClient.ts (Phase 1 / REL-02).
//
// Покрывают плановые behaviors 1-6:
//   1. Каждый outbound запрос стампит X-Client-Version
//   2. 426 → useForceUpdateStore.set({required:true, minVersion, forceUpdateUrl})
//   3. 426 с unparseable body → still set({required:true}) + console.warn
//   4. 426 с Platform.OS=ios → forceUpdateUrl = body.force_update_url_ios;
//      android → body.force_update_url_android
//   5. 426 response возвращается caller'у без изменений (не throw, не retry)
//   6. 401 retry path работает (existing behavior preserved)

import { Platform } from 'react-native';

// Хелпер: построить fake-Response с custom status и body.
function fakeResponse(status: number, body: object | string): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  // jest-expo + react-native polyfills предоставляют Response.
  // Дёргаем через Headers, чтобы избежать undefined-проблем.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headers: any = new Headers({ 'Content-Type': 'application/json' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp: any = {
    status,
    ok: status >= 200 && status < 300,
    headers,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    clone: () => fakeResponse(status, body),
  };
  return resp as Response;
}

// expo-secure-store нужно стабить, иначе tokenStorage упадёт при import.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// getClientVersionHeader — деsterministic, чтобы тестировать stamping.
jest.mock('../../util/version', () => ({
  getClientVersionHeader: jest.fn(() => '1.0.0 (42)'),
}));

describe('ApiClient — X-Client-Version stamping + 426 handling', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    jest.resetModules();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('stamps X-Client-Version on every outbound request', async () => {
    const fetchSpy = jest.fn(() => Promise.resolve(fakeResponse(200, { ok: true })));
    global.fetch = fetchSpy as unknown as typeof fetch;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiClient } = require('../apiClient');
    await apiClient.api('/test', { method: 'GET' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('X-Client-Version')).toBe('1.0.0 (42)');
  });

  it('intercepts 426 and populates useForceUpdateStore (android URL)', async () => {
    const oldOS = Platform.OS;
    (Platform as { OS: string }).OS = 'android';

    const body = {
      error: 'client_too_old',
      min_version: '1.0.0',
      force_update_url_android: 'https://example.com/android',
      force_update_url_ios: 'https://example.com/ios',
    };
    global.fetch = jest.fn(() => Promise.resolve(fakeResponse(426, body))) as unknown as typeof fetch;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiClient } = require('../apiClient');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useForceUpdateStore } = require('../../state/forceUpdate');
    useForceUpdateStore.getState().reset();

    const resp = await apiClient.api('/secret');

    const s = useForceUpdateStore.getState();
    expect(s.required).toBe(true);
    expect(s.minVersion).toBe('1.0.0');
    expect(s.forceUpdateUrl).toBe('https://example.com/android');
    // 426 response возвращается caller'у без изменений.
    expect(resp.status).toBe(426);

    (Platform as { OS: string }).OS = oldOS;
  });

  it('intercepts 426 and uses iOS URL when Platform.OS=ios', async () => {
    const oldOS = Platform.OS;
    (Platform as { OS: string }).OS = 'ios';

    const body = {
      error: 'client_too_old',
      min_version: '1.0.0',
      force_update_url_android: 'https://example.com/android',
      force_update_url_ios: 'https://example.com/ios',
    };
    global.fetch = jest.fn(() => Promise.resolve(fakeResponse(426, body))) as unknown as typeof fetch;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiClient } = require('../apiClient');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useForceUpdateStore } = require('../../state/forceUpdate');
    useForceUpdateStore.getState().reset();

    await apiClient.api('/secret');

    expect(useForceUpdateStore.getState().forceUpdateUrl).toBe('https://example.com/ios');

    (Platform as { OS: string }).OS = oldOS;
  });

  it('handles 426 with unparseable body — still sets required=true + console.warn', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Body that fails JSON.parse (text() returns "not-json", json() rejects).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const badResp: any = {
      status: 426,
      ok: false,
      headers: new Headers(),
      text: () => Promise.resolve('not-json'),
      json: () => Promise.reject(new Error('bad json')),
      clone: function () {
        return this;
      },
    };
    global.fetch = jest.fn(() => Promise.resolve(badResp)) as unknown as typeof fetch;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiClient } = require('../apiClient');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useForceUpdateStore } = require('../../state/forceUpdate');
    useForceUpdateStore.getState().reset();

    const resp = await apiClient.api('/secret');

    const s = useForceUpdateStore.getState();
    expect(s.required).toBe(true);
    expect(s.minVersion).toBe('');
    expect(s.forceUpdateUrl).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    expect(resp.status).toBe(426);
  });

  it('does not throw on 426 — returns response unchanged for caller', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        fakeResponse(426, {
          error: 'client_too_old',
          min_version: '1.0.0',
          force_update_url_android: 'a',
          force_update_url_ios: 'b',
        }),
      ),
    ) as unknown as typeof fetch;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiClient } = require('../apiClient');
    let threw = false;
    try {
      const resp = await apiClient.api('/secret');
      expect(resp.status).toBe(426);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it('preserves 401 → refresh → retry path (existing behavior)', async () => {
    // Need apiClient with refresh token. The internal refresh() POSTs to
    // /auth/refresh. Sequence: doFetch → 401 → refresh → 200; refresh response
    // → 200 with new tokens; retry → 200.
    const okBody = { ok: true };
    const refreshBody = { accessToken: 'new-access', refreshToken: 'new-refresh' };

    const fetchSpy = jest
      .fn()
      .mockImplementationOnce(() => Promise.resolve(fakeResponse(401, { error: 'unauthorized' })))
      .mockImplementationOnce(() => Promise.resolve(fakeResponse(200, refreshBody)))
      .mockImplementationOnce(() => Promise.resolve(fakeResponse(200, okBody)));
    global.fetch = fetchSpy as unknown as typeof fetch;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { apiClient } = require('../apiClient');
    // Bootstrap tokens.
    await apiClient.setTokens('old-access', 'old-refresh');

    const resp = await apiClient.api('/secret');
    expect(resp.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // initial → refresh → retry
  });
});
