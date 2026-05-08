// modules/moderation/sync — обёртка над social-graph backend (Phase E).
//
// Server endpoints:
//   POST /reports
//   GET  /reports/me
//   GET  /admin/reports?status=
//   POST /admin/reports/{id}/resolve

import { apiClient, parseRateLimit } from '../../../auth/apiClient';
import type {
  Report,
  ReportReason,
  ReportStatus,
  ReportTargetKind,
  ResolutionAction,
} from '../domain/types';

export class RateLimitedError extends Error {
  retryAfterS: number;
  constructor(retryAfterS: number) {
    super(`rate limited; retry in ${retryAfterS}s`);
    this.name = 'RateLimitedError';
    this.retryAfterS = retryAfterS;
  }
}

type ServerReportDTO = {
  id: string;
  reporterId: string;
  targetKind: string;
  targetId: string;
  reason: string;
  body?: string | null;
  status: string;
  resolutionAction?: string | null;
  resolvedAt?: number | null;
  resolvedBy?: string | null;
  createdAt: number;
};

function dtoToReport(d: ServerReportDTO): Report {
  return {
    id: d.id,
    reporterId: d.reporterId,
    targetKind: d.targetKind as ReportTargetKind,
    targetId: d.targetId,
    reason: d.reason as ReportReason,
    body: d.body ?? null,
    status: d.status as ReportStatus,
    resolutionAction: (d.resolutionAction ?? null) as ResolutionAction | null,
    resolvedAt: d.resolvedAt ?? null,
    resolvedBy: d.resolvedBy ?? null,
    createdAt: d.createdAt,
  };
}

async function expectJSON<T>(resp: Response, label: string): Promise<T> {
  if (!resp.ok) {
    const rl = parseRateLimit(resp);
    if (rl !== null) throw new RateLimitedError(rl.retryAfterS);
    const text = await resp.text().catch(() => '<unreadable>');
    throw new Error(`${label} failed: ${resp.status} ${text}`);
  }
  return (await resp.json()) as T;
}

export async function submitReport(input: {
  targetKind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  body: string | null;
}): Promise<Report> {
  const resp = await apiClient.api('/reports', {
    method: 'POST',
    body: JSON.stringify({
      targetKind: input.targetKind,
      targetId: input.targetId,
      reason: input.reason,
      body: input.body,
    }),
  });
  return dtoToReport(await expectJSON<ServerReportDTO>(resp, 'submitReport'));
}

export async function fetchMyReports(): Promise<Report[]> {
  const resp = await apiClient.api('/reports/me');
  const arr = await expectJSON<ServerReportDTO[]>(resp, 'fetchMyReports');
  return arr.map(dtoToReport);
}

// Admin only:

export async function fetchAdminReports(status: ReportStatus = 'open'): Promise<Report[]> {
  const resp = await apiClient.api(`/admin/reports?status=${status}`);
  const arr = await expectJSON<ServerReportDTO[]>(resp, 'fetchAdminReports');
  return arr.map(dtoToReport);
}

export async function resolveReportRemote(
  id: string,
  action: ResolutionAction,
): Promise<void> {
  const resp = await apiClient.api(`/admin/reports/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
  if (!resp.ok && resp.status !== 204) {
    const text = await resp.text().catch(() => '');
    throw new Error(`resolve failed: ${resp.status} ${text}`);
  }
}
