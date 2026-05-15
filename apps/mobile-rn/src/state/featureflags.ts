// Phase 1 / REL-03: feature flag store с MMKV persist + 5min TTL.
//
// Architecture (per CONTEXT D-13/D-14/D-15/D-16):
//   - Bundled DEFAULT_FLAGS — баки, доступные на 1-м запуске offline.
//   - Server response через fetchFeatureFlags() обновляет cache.
//   - MMKV persist хранит cache между запусками.
//   - 5min TTL на refresh() — не перезапрашиваем чаще раз в 5 минут.
//   - clearAll() сбрасывает cache до defaults (вызывается из auth.logout).
//
// Per CONVENTIONS.md §Adapters: этот store НЕ импортирует expo-application
// или другие platform-specific модули — fetching делегирован
// featureflagsApi.ts. Store платформо-агностичен.
//
// Per CLAUDE.md offline-first: на network error мы СОХРАНЯЕМ существующие
// values (не reset на defaults).  Defaults применяются только когда мы
// никогда не успешно загрузили (server-side null).

import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_FLAGS } from './featureflags.defaults';
import { fetchFeatureFlags } from './featureflagsApi';

/** TTL для refresh (per CONTEXT D-13). */
const TTL_MS = 5 * 60 * 1000;

export type FeatureFlagsStore = {
  /** Резолвленные booleans (server overrides поверх defaults). */
  flags: Record<string, boolean>;
  /** ms epoch последнего успешного fetch. null = ещё не загружались. */
  lastFetchedAt: number | null;
  /** True во время in-flight fetch — предотвращает race на concurrent refresh(). */
  loading: boolean;
  /** Human-readable error для UI (RU per CONVENTIONS.md). */
  error: string | null;

  /**
   * Idempotent refresh: fetches только если loading=false и lastFetchedAt
   * старше TTL_MS (или ни разу не fetched).  На network error СОХРАНЯЕТ
   * cached values (offline-first).
   */
  refresh: () => Promise<void>;

  /**
   * Read single flag с three-tier resolution:
   *   1. server cache (resolved per-user) → 2. DEFAULT_FLAGS → 3. false.
   */
  isEnabled: (name: string) => boolean;

  /**
   * Drop server-overrides; revert to bundled defaults.  Вызывается из
   * auth.logout через dynamic import (см. CONVENTIONS.md §State Mgmt).
   */
  clearAll: () => void;
};

const mmkv = createMMKV();

const mmkvStorage = {
  getItem: (name: string): string | null => {
    const value = mmkv.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string): void => {
    mmkv.set(name, value);
  },
  removeItem: (name: string): void => {
    mmkv.remove(name);
  },
};

export const useFeatureFlagsStore = create<FeatureFlagsStore>()(
  persist(
    (set, get) => ({
      flags: { ...DEFAULT_FLAGS },
      lastFetchedAt: null,
      loading: false,
      error: null,

      refresh: async () => {
        const { lastFetchedAt, loading } = get();
        if (loading) return;
        if (lastFetchedAt !== null && Date.now() - lastFetchedAt < TTL_MS) {
          return;
        }
        set({ loading: true, error: null });
        try {
          const server = await fetchFeatureFlags();
          if (server === null) {
            // Offline / server error → сохраняем cache.
            set({ loading: false });
            return;
          }
          // Merge: defaults → server.  server flags overwrite defaults для
          // тех ключей которые сервер вернул; неизвестные defaults
          // сохраняются (forward-compat если добавляем новый default).
          set({
            flags: { ...DEFAULT_FLAGS, ...server },
            lastFetchedAt: Date.now(),
            loading: false,
          });
        } catch (e) {
          set({ loading: false, error: 'Не удалось обновить feature flags' });
          console.warn('[featureflags] refresh failed', e);
        }
      },

      isEnabled: (name) => {
        const fromCache = get().flags[name];
        if (typeof fromCache === 'boolean') return fromCache;
        const fromDefault = DEFAULT_FLAGS[name];
        if (typeof fromDefault === 'boolean') return fromDefault;
        return false;
      },

      clearAll: () =>
        set({
          flags: { ...DEFAULT_FLAGS },
          lastFetchedAt: null,
          error: null,
          loading: false,
        }),
    }),
    {
      name: 'running-ecosystem-featureflags',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
    },
  ),
);
