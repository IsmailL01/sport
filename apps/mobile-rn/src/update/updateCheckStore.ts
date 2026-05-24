// Phase 8 Plan 08-01 Task 5 — update-check timing/error store.
//
// Tracks the most recent manifest-fetch attempt's timestamp + outcome.
// `lastCheckedAt` powers the 6h throttle in checkForUpdate() and the
// "проверено N минут назад" subtitle in the SettingsScreen entry.

import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const mmkv = createMMKV({ id: 'update-check' });

export type UpdateCheckState = {
  lastCheckedAt: number | null; // epoch ms; null = never
  checking: boolean; // single-flight guard
  lastError: string | null; // for diagnostics; user-invisible per CONTEXT D-13
  installedReleasedAt: number | null; // RFC3339 epoch ms of last verified manifest.released_at — replay-protection per D-24
};

export const useUpdateCheckStore = create<UpdateCheckState>()(
  persist(
    (): UpdateCheckState => ({
      lastCheckedAt: null,
      checking: false,
      lastError: null,
      installedReleasedAt: null,
    }),
    {
      name: 'update-check-store',
      storage: createJSONStorage(() => ({
        getItem: (key) => mmkv.getString(key) ?? null,
        setItem: (key, value) => {
          mmkv.set(key, value);
        },
        removeItem: (key) => {
          mmkv.remove(key);
        },
      })),
      // Don't persist transient `checking` flag.
      partialize: (state) => ({
        lastCheckedAt: state.lastCheckedAt,
        lastError: state.lastError,
        installedReleasedAt: state.installedReleasedAt,
      }),
    },
  ),
);
