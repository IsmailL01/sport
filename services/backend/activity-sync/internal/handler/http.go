// Package handler — HTTP-layer activity-sync. Принимает JWT через Bearer,
// извлекает userID, форвардит в service, сериализует ответ.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/runningecosystem/backend/activity-sync/internal/domain"
	"github.com/runningecosystem/backend/activity-sync/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
)

const requestTimeout = 30 * time.Second

type SyncHandler struct {
	svc    *service.SyncService
	signer *auth.Signer
	log    *slog.Logger
}

func NewSyncHandler(svc *service.SyncService, signer *auth.Signer, log *slog.Logger) *SyncHandler {
	return &SyncHandler{svc: svc, signer: signer, log: log}
}

func (h *SyncHandler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.healthz)
	mux.HandleFunc("POST /sessions", h.requireAuth(h.upsertSession))
	mux.HandleFunc("GET /sessions", h.requireAuth(h.listSessions))
	mux.HandleFunc("GET /sessions/{id}", h.requireAuth(h.getSession))
	mux.HandleFunc("DELETE /sessions/{id}", h.requireAuth(h.deleteSession))
	mux.HandleFunc("POST /sessions/{id}/points", h.requireAuth(h.appendPoints))
	mux.HandleFunc("GET /sessions/{id}/points", h.requireAuth(h.listPoints))
	return loggingMiddleware(h.log)(mux)
}

// === DTOs ===

type sessionDTO struct {
	ID              string     `json:"id,omitempty"`
	ClientSessionID int64      `json:"clientSessionId"`
	StartedAt       time.Time  `json:"startedAt"`
	EndedAt         *time.Time `json:"endedAt,omitempty"`
	IsClosed        *bool      `json:"isClosed,omitempty"`
	DistanceM       *float64   `json:"distanceM,omitempty"`
	AreaM2          *float64   `json:"areaM2,omitempty"`
	CalcMethod      *string    `json:"calcMethod,omitempty"`
	Note            *string    `json:"note,omitempty"`
	Source          string     `json:"source,omitempty"`
}

type pointDTO struct {
	Timestamp time.Time `json:"timestamp"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Altitude  *float32  `json:"altitude,omitempty"`
	Accuracy  *float32  `json:"accuracy,omitempty"`
	Speed     *float32  `json:"speed,omitempty"`
	Source    string    `json:"source,omitempty"`
}

type appendPointsRequest struct {
	Points []pointDTO `json:"points"`
}

type appendPointsResponse struct {
	Inserted int `json:"inserted"`
}

func toDomainSession(in *sessionDTO) *domain.Session {
	return &domain.Session{
		ClientSessionID: in.ClientSessionID,
		StartedAt:       in.StartedAt,
		EndedAt:         in.EndedAt,
		IsClosed:        in.IsClosed,
		DistanceM:       in.DistanceM,
		AreaM2:          in.AreaM2,
		CalcMethod:      in.CalcMethod,
		Note:            in.Note,
		Source:          in.Source,
	}
}

func sessionToDTO(s *domain.Session) sessionDTO {
	return sessionDTO{
		ID:              s.ID,
		ClientSessionID: s.ClientSessionID,
		StartedAt:       s.StartedAt,
		EndedAt:         s.EndedAt,
		IsClosed:        s.IsClosed,
		DistanceM:       s.DistanceM,
		AreaM2:          s.AreaM2,
		CalcMethod:      s.CalcMethod,
		Note:            s.Note,
		Source:          s.Source,
	}
}

func pointsToDomain(in []pointDTO) []*domain.Point {
	out := make([]*domain.Point, len(in))
	for i, p := range in {
		out[i] = &domain.Point{
			Timestamp: p.Timestamp,
			Latitude:  p.Latitude,
			Longitude: p.Longitude,
			Altitude:  p.Altitude,
			Accuracy:  p.Accuracy,
			Speed:     p.Speed,
			Source:    p.Source,
		}
	}
	return out
}

func pointsToDTO(in []*domain.Point) []pointDTO {
	out := make([]pointDTO, len(in))
	for i, p := range in {
		out[i] = pointDTO{
			Timestamp: p.Timestamp,
			Latitude:  p.Latitude,
			Longitude: p.Longitude,
			Altitude:  p.Altitude,
			Accuracy:  p.Accuracy,
			Speed:     p.Speed,
			Source:    p.Source,
		}
	}
	return out
}

// === handlers ===

func (h *SyncHandler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *SyncHandler) upsertSession(w http.ResponseWriter, r *http.Request) {
	var in sessionDTO
	if err := readJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	out, err := h.svc.UpsertSession(ctx, userIDFromContext(r.Context()), toDomainSession(&in))
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionToDTO(out))
}

func (h *SyncHandler) listSessions(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	sessions, err := h.svc.ListSessions(ctx, userIDFromContext(r.Context()), limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]sessionDTO, len(sessions))
	for i, s := range sessions {
		out[i] = sessionToDTO(s)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *SyncHandler) getSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	s, err := h.svc.GetSession(ctx, userIDFromContext(r.Context()), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionToDTO(s))
}

func (h *SyncHandler) deleteSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	if err := h.svc.DeleteSession(ctx, userIDFromContext(r.Context()), id); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *SyncHandler) appendPoints(w http.ResponseWriter, r *http.Request) {
	var req appendPointsRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if len(req.Points) > 5000 {
		writeError(w, http.StatusBadRequest, "batch_too_large", "max 5000 points per batch")
		return
	}
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	n, err := h.svc.AppendPoints(ctx, userIDFromContext(r.Context()), id, pointsToDomain(req.Points))
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, appendPointsResponse{Inserted: n})
}

func (h *SyncHandler) listPoints(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	pts, err := h.svc.ListPoints(ctx, userIDFromContext(r.Context()), id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, pointsToDTO(pts))
}

// === middleware (общий с identity, дублирован для service-локальности) ===

type ctxKey string

const ctxKeyUserID ctxKey = "userID"

func userIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKeyUserID).(string); ok {
		return v
	}
	return ""
}

func (h *SyncHandler) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		const prefix = "Bearer "
		if !strings.HasPrefix(header, prefix) {
			writeError(w, http.StatusUnauthorized, "missing_bearer", "Authorization: Bearer <token> required")
			return
		}
		token := strings.TrimPrefix(header, prefix)
		claims, err := h.signer.VerifyAccess(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid_token", err.Error())
			return
		}
		ctx := context.WithValue(r.Context(), ctxKeyUserID, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func loggingMiddleware(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rw := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rw, r)
			log.InfoContext(r.Context(), "http",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rw.status,
				"duration_ms", time.Since(start).Milliseconds(),
			)
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (rw *statusRecorder) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// === helpers ===

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	if dec.More() {
		return errors.New("multiple JSON values in request body")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": code, "message": msg})
}

func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case service.IsNotFound(err):
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	case service.IsForbidden(err):
		writeError(w, http.StatusForbidden, "forbidden", "access denied")
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", "internal server error")
	}
}
