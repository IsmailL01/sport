import { create } from 'zustand';

import { runOutboxSync, type SyncProgress } from '../sync/syncEngine';

export type SyncStatus = 'idle' | 'syncing' | 'error';

type SyncStore = {
  status: SyncStatus;
  /** Unix epoch ms последней успешной синхронизации. */
  lastSyncAt: number | null;
  /** Текущий прогресс (только когда status === 'syncing'). */
  progress: SyncProgress | null;
  error: string | null;

  trigger: () => Promise<void>;
};

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: 'idle',
  lastSyncAt: null,
  progress: null,
  error: null,

  trigger: async () => {
    if (get().status === 'syncing') return;
    set({ status: 'syncing', error: null, progress: null });
    try {
      const result = await runOutboxSync({
        onProgress: (p) => set({ progress: p }),
      });
      if (!result.ok) {
        set({
          status: 'error',
          error: result.error ?? 'sync failed',
          progress: null,
        });
        return;
      }
      set({
        status: 'idle',
        lastSyncAt: Date.now(),
        progress: null,
        error: null,
      });
    } catch (e) {
      console.warn('[sync] trigger failed', e);
      set({
        status: 'error',
        error: String(e),
        progress: null,
      });
    }
  },
}));
