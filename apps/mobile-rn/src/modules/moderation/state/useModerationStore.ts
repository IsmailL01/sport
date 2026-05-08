// modules/moderation/state — minimal store для submit-report flow.
//
// Storage не нужен — list reports редкий запрос, кэшируем in-memory только
// последний pull. Вне контекста UI/admin store не используется.

import { create } from 'zustand';

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

  submit: (input: {
    targetKind: ReportTargetKind;
    targetId: string;
    reason: ReportReason;
    body: string | null;
  }) => Promise<Report>;

  refreshMine: () => Promise<void>;
  refreshAdmin: (status?: ReportStatus) => Promise<void>;
  resolveReport: (id: string, action: ResolutionAction) => Promise<void>;

  clearAll: () => void;
};

export const useModerationStore = create<State>((set, get) => ({
  myReports: [],
  adminQueue: [],
  submitting: false,
  loading: false,
  error: null,

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

  clearAll: () => {
    set({
      myReports: [],
      adminQueue: [],
      submitting: false,
      loading: false,
      error: null,
    });
  },
}));
