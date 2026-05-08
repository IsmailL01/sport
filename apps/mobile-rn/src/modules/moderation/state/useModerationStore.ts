// modules/moderation/state — minimal store для submit-report flow.
//
// Storage не нужен — list reports редкий запрос, кэшируем in-memory только
// последний pull. Вне контекста UI/admin store не используется.

import { create } from 'zustand';

import { apiClient } from '../../../auth/apiClient';
import { isAdminRole } from '../../../domain/social';
import type { Report, ReportReason, ReportTargetKind, ResolutionAction, ReportStatus } from '../domain/types';
import {
  fetchAdminReports,
  fetchMyReports,
  resolveReportRemote,
  submitReport,
} from '../sync/moderationApi';

type State = {
  myReports: Report[];
  adminQueue: Report[];
  submitting: boolean;
  loading: boolean;
  error: string | null;
  /** Phase E: моя global_role; null если не загружено. */
  myRole: string | null;
  /** Convenience flag — true для moderator/admin. */
  isAdmin: boolean;

  submit: (input: {
    targetKind: ReportTargetKind;
    targetId: string;
    reason: ReportReason;
    body: string | null;
  }) => Promise<Report>;

  refreshMine: () => Promise<void>;
  refreshAdmin: (status?: ReportStatus) => Promise<void>;
  resolveReport: (id: string, action: ResolutionAction) => Promise<void>;

  /** Загрузить свою роль (вызывается при auth/login). */
  fetchMyRole: (myUserId: string) => Promise<void>;

  clearAll: () => void;
};

export const useModerationStore = create<State>((set, get) => ({
  myReports: [],
  adminQueue: [],
  submitting: false,
  loading: false,
  error: null,
  myRole: null,
  isAdmin: false,

  submit: async (input) => {
    set({ submitting: true, error: null });
    try {
      const r = await submitReport(input);
      set({
        submitting: false,
        myReports: [r, ...get().myReports],
      });
      return r;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      set({ submitting: false, error: err });
      throw e;
    }
  },

  refreshMine: async () => {
    set({ loading: true, error: null });
    try {
      const list = await fetchMyReports();
      set({ myReports: list, loading: false });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: err });
    }
  },

  refreshAdmin: async (status = 'open') => {
    set({ loading: true, error: null });
    try {
      const list = await fetchAdminReports(status);
      set({ adminQueue: list, loading: false });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: err });
    }
  },

  resolveReport: async (id, action) => {
    await resolveReportRemote(id, action);
    // Удалить из очереди после resolve.
    set({
      adminQueue: get().adminQueue.filter((r) => r.id !== id),
    });
  },

  fetchMyRole: async (myUserId) => {
    if (!apiClient.isAuthenticated()) return;
    try {
      const resp = await apiClient.api(`/profiles/${myUserId}`);
      if (!resp.ok) return;
      const data = (await resp.json()) as { globalRole?: string };
      const role = data.globalRole ?? 'user';
      set({ myRole: role, isAdmin: isAdminRole(role) });
    } catch (e) {
      console.warn('[moderation] fetchMyRole failed', e);
    }
  },

  clearAll: () => {
    set({
      myReports: [],
      adminQueue: [],
      submitting: false,
      loading: false,
      error: null,
      myRole: null,
      isAdmin: false,
    });
  },
}));
