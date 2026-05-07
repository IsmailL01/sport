import { create } from 'zustand';

import { runOutboxSync, runPullDown, type SyncProgress } from '../sync/syncEngine';
import { useHistoryStore } from './history';
import { useTrainingStore } from './training';

export type SyncStatus = 'idle' | 'syncing' | 'error';

type SyncStore = {
  status: SyncStatus;
  /** Unix epoch ms последней успешной синхронизации. */
  lastSyncAt: number | null;
  /** Текущий прогресс (только когда status === 'syncing'). */
  progress: SyncProgress | null;
  error: string | null;

  /** Push: outbox upload локальных не синхронизированных. */
  trigger: () => Promise<void>;
  /** Pull: download сессий из backend которых нет локально. */
  pullDown: () => Promise<void>;
  /** Push + Pull в одну операцию. */
  fullSync: () => Promise<void>;
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

  pullDown: async () => {
    if (get().status === 'syncing') return;
    set({ status: 'syncing', error: null });
    try {
      const result = await runPullDown();
      if (!result.ok) {
        set({ status: 'error', error: result.error ?? 'pull failed' });
        return;
      }
      // Обновить локальные store если что-то скачалось.
      if (result.sessionsDownloaded > 0) {
        useHistoryStore.getState().refresh();
        useHistoryStore.getState().loadAllPoints();
        useTrainingStore.getState().recompute();
      }
      set({
        status: 'idle',
        lastSyncAt: Date.now(),
        error: null,
      });
    } catch (e) {
      console.warn('[sync] pullDown failed', e);
      set({ status: 'error', error: String(e) });
    }
  },

  fullSync: async () => {
    // Сначала push (наши локальные → сервер), потом pull (новые с сервера).
    // Если push fails — pull всё равно может полезное забрать.
    await get().trigger();
    if (get().status === 'idle') {
      await get().pullDown();
    } else {
      // Status был error после push — попробуем pull всё равно но без сброса error.
      const prevError = get().error;
      const r = await runPullDown();
      if (r.ok && r.sessionsDownloaded > 0) {
        useHistoryStore.getState().refresh();
        useHistoryStore.getState().loadAllPoints();
        useTrainingStore.getState().recompute();
      }
      if (prevError) set({ error: prevError });
    }
  },
}));
