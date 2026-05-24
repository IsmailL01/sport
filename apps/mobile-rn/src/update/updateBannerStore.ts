// Phase 8 Plan 08-01 Task 5 — non-blocking update banner store.
//
// Mirrors the existing Zustand+MMKV pattern in src/state/featureflags.ts +
// src/state/settings.ts. Each store gets its own createMMKV() instance per
// project convention.
//
// State semantics:
//   - available: boolean — true when manifest.version > installed AND
//     manifest.min_supported_version <= installed (optional update)
//   - manifest: Manifest | null — the verified manifest (after signature
//     check passes)
//   - suppressedUntil: number | null — epoch ms; if set, banner suppressed
//     until that time. "Позже" sets to now + 24h. RESEARCH §9 Q6 resolution:
//     when manifest.version changes (different release than the one user
//     dismissed), clear suppressedUntil automatically — see manifestCheck.ts.

import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Manifest } from './manifestSchema';

const mmkv = createMMKV({ id: 'update-banner' });

export type UpdateBannerState = {
  available: boolean;
  manifest: Manifest | null;
  suppressedUntil: number | null;
};

export const useUpdateBannerStore = create<UpdateBannerState>()(
  persist(
    (): UpdateBannerState => ({
      available: false,
      manifest: null,
      suppressedUntil: null,
    }),
    {
      name: 'update-banner-store',
      storage: createJSONStorage(() => ({
        getItem: (key) => mmkv.getString(key) ?? null,
        setItem: (key, value) => {
          mmkv.set(key, value);
        },
        removeItem: (key) => {
          mmkv.remove(key);
        },
      })),
    },
  ),
);
