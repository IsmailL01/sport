// Public surface модуля `moderation`. Phase E.

export type {
  Report,
  ReportReason,
  ReportStatus,
  ReportTargetKind,
  ResolutionAction,
} from './domain/types';

export {
  REPORT_REASONS,
  REPORT_BODY_MAX_LENGTH,
} from './domain/types';

export { useModerationStore } from './state/useModerationStore';

export { ReportSheet } from './ui/ReportSheet';
