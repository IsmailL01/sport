// XP API — wrap social-graph profile endpoint для получения текущего
// xp/grade/verified. Phase 8 / M3.

import { apiClient } from '../../../auth/apiClient';
import type { Grade } from '../domain/grade';

export type ProfileGamification = {
  userId: string;
  xpTotal: number;
  grade: Grade;
  verified: boolean;
};

type ServerProfileDTO = {
  userId: string;
  xpTotal?: number;
  grade?: string;
  verified?: boolean;
};

export async function fetchMyGamification(userId: string): Promise<ProfileGamification | null> {
  if (!apiClient.isAuthenticated()) return null;
  try {
    const resp = await apiClient.api(`/profiles/${userId}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as ServerProfileDTO;
    return {
      userId: data.userId,
      xpTotal: data.xpTotal ?? 0,
      grade: (data.grade ?? 'D') as Grade,
      verified: data.verified ?? false,
    };
  } catch (e) {
    console.warn('[gamification] fetch failed', e);
    return null;
  }
}
