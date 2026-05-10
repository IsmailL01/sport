// Zustand store: текущий XP/grade/verified пользователя.
// Phase 8 / M3.
//
// Sources of truth:
//   - server profile (fetchMyGamification после auth)
//   - WS event user.xp.changed → applyXpChanged() bump'ит локально (instant UX)

import { create } from 'zustand';

import { fetchMyGamification, type ProfileGamification } from '../sync/xpApi';
import { gradeForXP, nextGrade, type Grade } from '../domain/grade';

type XpState = {
  userId: string | null;
  xpTotal: number;
  grade: Grade;
  verified: boolean;
  /** ms epoch when last fetched / updated; for UI freshness hint. */
  updatedAt: number | null;
  loading: boolean;

  /** Pull from server (после auth + опционально periodic refresh). */
  refresh: (myUserId: string) => Promise<void>;
  /** Apply realtime WS event user.xp.changed. */
  applyXpChanged: (delta: number, total: number, newGrade?: string) => void;
  /** Wipe (logout). */
  clearAll: () => void;
  /** Convenience: до следующего grade сколько XP. */
  xpToNextGrade: () => { label: Grade; xpRemaining: number } | null;
};

export const useXpStore = create<XpState>((set, get) => ({
  userId: null,
  xpTotal: 0,
  grade: 'D',
  verified: false,
  updatedAt: null,
  loading: false,

  refresh: async (myUserId) => {
    set({ loading: true });
    const data: ProfileGamification | null = await fetchMyGamification(myUserId);
    if (data) {
      set({
        userId: data.userId,
        xpTotal: data.xpTotal,
        grade: data.grade,
        verified: data.verified,
        updatedAt: Date.now(),
        loading: false,
      });
    } else {
      set({ loading: false });
    }
  },

  applyXpChanged: (_delta, total, newGrade) => {
    const grade = (newGrade as Grade | undefined) ?? gradeForXP(total);
    set({
      xpTotal: total,
      grade,
      updatedAt: Date.now(),
    });
  },

  clearAll: () => {
    set({
      userId: null,
      xpTotal: 0,
      grade: 'D',
      verified: false,
      updatedAt: null,
      loading: false,
    });
  },

  xpToNextGrade: () => nextGrade(get().xpTotal),
}));
