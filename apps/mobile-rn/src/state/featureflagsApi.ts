// Feature flags fetch — wrap GET /featureflags. Phase 1 / REL-03.
//
// Возвращает резолвленные booleans с сервера (после применения per-user
// rollout) ИЛИ null на любой ошибке.  Caller (useFeatureFlagsStore.refresh)
// сохраняет cached values когда возвращается null (offline-first per
// CLAUDE.md §Offline-first).
//
// Транспорт: HTTP GET /featureflags через apiClient.api() — Caddy
// path-routing направит запрос на identity-сервис.

import { apiClient } from '../auth/apiClient';

// Server response: array of resolved per-user flags.
type ServerFlagDTO = {
  name: string;
  enabled: boolean;
};

/**
 * Fetch resolved feature flags for the current user.
 *
 * Возвращает Record<string, boolean> если запрос успешен и тело валидно;
 * иначе null (caller сохраняет cached/defaults).
 */
export async function fetchFeatureFlags(): Promise<Record<string, boolean> | null> {
  try {
    const resp = await apiClient.api('/featureflags');
    if (!resp.ok) {
      console.warn('[featureflags] fetch non-ok', resp.status);
      return null;
    }
    const data = (await resp.json()) as ServerFlagDTO[];
    if (!Array.isArray(data)) {
      console.warn('[featureflags] fetch: response is not an array');
      return null;
    }
    const out: Record<string, boolean> = {};
    for (const f of data) {
      if (typeof f?.name === 'string' && typeof f?.enabled === 'boolean') {
        out[f.name] = f.enabled;
      }
    }
    return out;
  } catch (e) {
    console.warn('[featureflags] fetch failed', e);
    return null;
  }
}
