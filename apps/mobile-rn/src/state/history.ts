import { create } from 'zustand';

import type { Point, Session } from '../domain/types';
import { loadPointsForSession } from '../storage/pointRepository';
import {
  deleteSession as deleteSessionRow,
  listSessions,
} from '../storage/sessionRepository';

type HistoryStore = {
  sessions: Session[];
  /** Все точки всех закрытых сессий — для all-time territory layer на карте. */
  closedSessionsPoints: Map<number, Point[]>;
  loading: boolean;

  refresh: () => void;
  delete: (sessionId: number) => void;
  loadAllPoints: () => void;
};

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  sessions: [],
  closedSessionsPoints: new Map(),
  loading: false,

  refresh: () => {
    set({ loading: true });
    try {
      const sessions = listSessions(500);
      set({ sessions, loading: false });
    } catch (e) {
      console.error('[history] refresh failed', e);
      set({ loading: false });
    }
  },

  delete: (sessionId) => {
    try {
      deleteSessionRow(sessionId);
      set((s) => ({
        sessions: s.sessions.filter((sess) => sess.id !== sessionId),
        closedSessionsPoints: removeFromMap(s.closedSessionsPoints, sessionId),
      }));
    } catch (e) {
      console.error('[history] delete failed', e);
    }
  },

  loadAllPoints: () => {
    const { sessions } = get();
    const next = new Map<number, Point[]>();
    for (const s of sessions) {
      if (s.isClosed === true) {
        try {
          next.set(s.id, loadPointsForSession(s.id));
        } catch (e) {
          console.error(`[history] loadPoints(${s.id}) failed`, e);
        }
      }
    }
    set({ closedSessionsPoints: next });
  },
}));

function removeFromMap<K, V>(map: Map<K, V>, key: K): Map<K, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}
