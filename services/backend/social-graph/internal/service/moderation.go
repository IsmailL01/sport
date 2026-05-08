// Moderation business logic — Phase 8 / E.
package service

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
	"github.com/runningecosystem/backend/social-graph/internal/repository/postgres"
)

const (
	maxReportBodyLen = 2000
	defaultListLimit = 100
)

// CreateReport — submit жалобы. Любой авторизованный пользователь.
func (s *Service) CreateReport(
	ctx context.Context, reporterID string, in postgres.CreateReportInput,
) (*domain.Report, error) {
	if !validReportTarget(in.TargetKind) {
		return nil, domain.ErrInvalidArg
	}
	if !validReason(in.Reason) {
		return nil, domain.ErrInvalidArg
	}
	if in.TargetID == "" {
		return nil, domain.ErrInvalidArg
	}
	if in.Body != nil {
		t := strings.TrimSpace(*in.Body)
		if len(t) > maxReportBodyLen {
			return nil, domain.ErrInvalidArg
		}
		if t == "" {
			in.Body = nil
		} else {
			in.Body = &t
		}
	}
	in.ReporterID = reporterID

	report, err := s.reports.Create(ctx, in)
	if err != nil {
		return nil, err
	}

	// Audit log: report opened.
	meta, _ := json.Marshal(map[string]any{
		"reason":      string(in.Reason),
		"target_kind": string(in.TargetKind),
	})
	_ = s.audit.Log(ctx, postgres.AuditInput{
		ActorID:    &reporterID,
		Action:     "report_opened",
		TargetKind: string(in.TargetKind),
		TargetID:   in.TargetID,
		Metadata:   meta,
	})

	return report, nil
}

// MyReports — список моих репортов.
func (s *Service) MyReports(ctx context.Context, reporterID string) ([]*domain.Report, error) {
	return s.reports.ListByReporter(ctx, reporterID, defaultListLimit)
}

// AdminListReports — admin queue. Forbidden если actor не moderator/admin.
func (s *Service) AdminListReports(
	ctx context.Context, actorID string, status domain.ReportStatus,
) ([]*domain.Report, error) {
	if err := s.requireAdmin(ctx, actorID); err != nil {
		return nil, err
	}
	if status == "" {
		status = domain.ReportOpen
	}
	return s.reports.ListByStatus(ctx, status, defaultListLimit)
}

// AdminResolveReport — закрыть report решением. Forbidden если не admin.
type ResolveInput struct {
	Action domain.ResolutionAction
	// Status: 'resolved' или 'rejected'. Default — derived: no_action → rejected; иначе resolved.
	Status domain.ReportStatus
}

func (s *Service) AdminResolveReport(
	ctx context.Context, actorID, reportID string, in ResolveInput,
) error {
	if err := s.requireAdmin(ctx, actorID); err != nil {
		return err
	}
	if !validResolutionAction(in.Action) {
		return domain.ErrInvalidArg
	}
	status := in.Status
	if status == "" {
		if in.Action == domain.ResolveNoAction {
			status = domain.ReportRejected
		} else {
			status = domain.ReportResolved
		}
	}
	if status != domain.ReportResolved && status != domain.ReportRejected {
		return domain.ErrInvalidArg
	}

	report, err := s.reports.GetByID(ctx, reportID)
	if err != nil {
		return err
	}
	if err := s.reports.Resolve(ctx, reportID, in.Action, status, actorID); err != nil {
		return err
	}

	// Audit log: action taken.
	meta, _ := json.Marshal(map[string]any{
		"action":      string(in.Action),
		"status":      string(status),
		"target_kind": string(report.TargetKind),
		"target_id":   report.TargetID,
	})
	_ = s.audit.Log(ctx, postgres.AuditInput{
		ActorID:    &actorID,
		Action:     "report_resolved",
		TargetKind: "report",
		TargetID:   reportID,
		Metadata:   meta,
	})

	return nil
}

// requireAdmin — проверка глобальной роли.
func (s *Service) requireAdmin(ctx context.Context, actorID string) error {
	prof, err := s.profiles.GetByID(ctx, actorID)
	if err != nil {
		return domain.ErrForbidden
	}
	if !domain.IsAdminRole(prof.GlobalRole) {
		return domain.ErrForbidden
	}
	return nil
}

func validReportTarget(k domain.ReportTargetKind) bool {
	switch k {
	case domain.ReportTargetMessage,
		domain.ReportTargetPost,
		domain.ReportTargetComment,
		domain.ReportTargetStory,
		domain.ReportTargetUser:
		return true
	}
	return false
}

func validReason(r domain.ReportReason) bool {
	switch r {
	case domain.ReasonSpam,
		domain.ReasonHarassment,
		domain.ReasonNudity,
		domain.ReasonViolence,
		domain.ReasonIllegal,
		domain.ReasonOther:
		return true
	}
	return false
}

func validResolutionAction(a domain.ResolutionAction) bool {
	switch a {
	case domain.ResolveDelete,
		domain.ResolveWarn,
		domain.ResolveBan,
		domain.ResolveMute,
		domain.ResolveNoAction:
		return true
	}
	return false
}

// IsNotFound + IsForbidden + IsInvalidArg для moderation — переиспользуем
// существующие helpers из svc.go (errors.Is).
