// modules/moderation/domain — типы Phase E.

export type ReportTargetKind =
  | 'message' | 'post' | 'comment' | 'story' | 'user';

export type ReportReason =
  | 'spam' | 'harassment' | 'nudity' | 'violence' | 'illegal' | 'other';

export type ReportStatus =
  | 'open' | 'under_review' | 'resolved' | 'rejected';

export type ResolutionAction =
  | 'delete' | 'warn' | 'ban' | 'mute' | 'no_action';

export type Report = {
  id: string;
  reporterId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  body: string | null;
  status: ReportStatus;
  resolutionAction: ResolutionAction | null;
  /** ms epoch UTC */
  resolvedAt: number | null;
  resolvedBy: string | null;
  /** ms epoch UTC */
  createdAt: number;
};

/** UI-метаданные для radio-выбора причин. */
export const REPORT_REASONS: Array<{
  value: ReportReason;
  label: string;
  hint: string;
}> = [
  { value: 'spam', label: 'Спам', hint: 'Реклама, накрутка, повторяющийся контент' },
  { value: 'harassment', label: 'Оскорбления', hint: 'Травля, угрозы, унижение' },
  { value: 'nudity', label: 'Контент 18+', hint: 'Нагота, сексуальный контент' },
  { value: 'violence', label: 'Насилие', hint: 'Жестокость, угрозы насилия' },
  { value: 'illegal', label: 'Незаконный контент', hint: 'Нарушение закона РФ' },
  { value: 'other', label: 'Другое', hint: 'Другая причина (опишите ниже)' },
];

export const REPORT_BODY_MAX_LENGTH = 2000;
