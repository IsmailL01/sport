// Moderation HTTP handlers — Phase 8 / E.
package handler

import (
	"context"
	"net/http"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
	"github.com/runningecosystem/backend/social-graph/internal/repository/postgres"
	"github.com/runningecosystem/backend/social-graph/internal/service"
)

// === DTOs ===

type createReportRequest struct {
	TargetKind string  `json:"targetKind"` // message|post|comment|story|user
	TargetID   string  `json:"targetId"`
	Reason     string  `json:"reason"`     // spam|harassment|nudity|violence|illegal|other
	Body       *string `json:"body,omitempty"`
}

type reportDTO struct {
	ID               string  `json:"id"`
	ReporterID       string  `json:"reporterId"`
	TargetKind       string  `json:"targetKind"`
	TargetID         string  `json:"targetId"`
	Reason           string  `json:"reason"`
	Body             *string `json:"body,omitempty"`
	Status           string  `json:"status"`
	ResolutionAction *string `json:"resolutionAction,omitempty"`
	ResolvedAt       *int64  `json:"resolvedAt,omitempty"`
	ResolvedBy       *string `json:"resolvedBy,omitempty"`
	CreatedAt        int64   `json:"createdAt"`
}

func reportToDTO(r *domain.Report) reportDTO {
	dto := reportDTO{
		ID:         r.ID,
		ReporterID: r.ReporterID,
		TargetKind: string(r.TargetKind),
		TargetID:   r.TargetID,
		Reason:     string(r.Reason),
		Body:       r.Body,
		Status:     string(r.Status),
		CreatedAt:  r.CreatedAt.UnixMilli(),
	}
	if r.ResolutionAction != nil {
		v := string(*r.ResolutionAction)
		dto.ResolutionAction = &v
	}
	if r.ResolvedAt != nil {
		v := r.ResolvedAt.UnixMilli()
		dto.ResolvedAt = &v
	}
	dto.ResolvedBy = r.ResolvedBy
	return dto
}

type resolveReportRequest struct {
	Action string `json:"action"`           // delete|warn|ban|mute|no_action
	Status string `json:"status,omitempty"` // resolved|rejected (default derived)
}

// === handlers ===

func (h *Handler) createReport(w http.ResponseWriter, r *http.Request) {
	var req createReportRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	report, err := h.svc.CreateReport(ctx, actorID, postgres.CreateReportInput{
		TargetKind: domain.ReportTargetKind(req.TargetKind),
		TargetID:   req.TargetID,
		Reason:     domain.ReportReason(req.Reason),
		Body:       req.Body,
	})
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, reportToDTO(report))
}

func (h *Handler) myReports(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	reports, err := h.svc.MyReports(ctx, actorID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]reportDTO, len(reports))
	for i, r := range reports {
		out[i] = reportToDTO(r)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) adminListReports(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	status := domain.ReportStatus(r.URL.Query().Get("status"))
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	reports, err := h.svc.AdminListReports(ctx, actorID, status)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]reportDTO, len(reports))
	for i, r := range reports {
		out[i] = reportToDTO(r)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) adminResolveReport(w http.ResponseWriter, r *http.Request) {
	var req resolveReportRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	err := h.svc.AdminResolveReport(ctx, actorID, id, service.ResolveInput{
		Action: domain.ResolutionAction(req.Action),
		Status: domain.ReportStatus(req.Status),
	})
	if err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
