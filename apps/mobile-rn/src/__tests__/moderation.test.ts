// Phase 8 / E — модуль moderation: проверка типов и констант.

import {
  REPORT_BODY_MAX_LENGTH,
  REPORT_REASONS,
  type Report,
  type ReportReason,
  type ReportStatus,
  type ReportTargetKind,
  type ResolutionAction,
} from '../modules/moderation/domain/types';

describe('moderation: constants', () => {
  it('REPORT_BODY_MAX_LENGTH = 2000', () => {
    expect(REPORT_BODY_MAX_LENGTH).toBe(2000);
  });

  it('REPORT_REASONS has all 6 server-supported reasons', () => {
    const values = REPORT_REASONS.map((r) => r.value).sort();
    expect(values).toEqual([
      'harassment', 'illegal', 'nudity', 'other', 'spam', 'violence',
    ]);
  });

  it('every reason has label and hint', () => {
    for (const r of REPORT_REASONS) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('moderation: type compatibility', () => {
  it('Report covers all server fields', () => {
    const r: Report = {
      id: 'r1', reporterId: 'u1',
      targetKind: 'post', targetId: 'p1',
      reason: 'spam', body: null,
      status: 'open',
      resolutionAction: null, resolvedAt: null, resolvedBy: null,
      createdAt: 1000,
    };
    expect(r.status).toBe('open');
  });

  it('ReportTargetKind union has 5 variants', () => {
    const kinds: ReportTargetKind[] = [
      'message', 'post', 'comment', 'story', 'user',
    ];
    expect(kinds).toHaveLength(5);
  });

  it('ReportStatus union has 4 variants', () => {
    const statuses: ReportStatus[] = ['open', 'under_review', 'resolved', 'rejected'];
    expect(statuses).toHaveLength(4);
  });

  it('ResolutionAction union has 5 variants', () => {
    const actions: ResolutionAction[] = ['delete', 'warn', 'ban', 'mute', 'no_action'];
    expect(actions).toHaveLength(5);
  });

  it('ReportReason union has 6 variants', () => {
    const reasons: ReportReason[] = [
      'spam', 'harassment', 'nudity', 'violence', 'illegal', 'other',
    ];
    expect(reasons).toHaveLength(6);
  });
});

// Helper: validate body length для submit (mirrors server limit).
function validateReportBody(body: string | null): boolean {
  if (body === null) return true;
  return body.length <= REPORT_BODY_MAX_LENGTH;
}

describe('moderation: validateReportBody', () => {
  it('null body is valid', () => {
    expect(validateReportBody(null)).toBe(true);
  });
  it('short body is valid', () => {
    expect(validateReportBody('spam!')).toBe(true);
  });
  it('exactly limit is valid', () => {
    expect(validateReportBody('x'.repeat(REPORT_BODY_MAX_LENGTH))).toBe(true);
  });
  it('over limit is invalid', () => {
    expect(validateReportBody('x'.repeat(REPORT_BODY_MAX_LENGTH + 1))).toBe(false);
  });
});
