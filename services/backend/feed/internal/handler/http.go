// Package handler — HTTP routes feed (stories для Phase C).
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

	"github.com/runningecosystem/backend/feed/internal/domain"
	"github.com/runningecosystem/backend/feed/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
)

const requestTimeout = 30 * time.Second

type Handler struct {
	svc    *service.Service
	signer *auth.Signer
	log    *slog.Logger
}

func New(svc *service.Service, signer *auth.Signer, log *slog.Logger) *Handler {
	return &Handler{svc: svc, signer: signer, log: log}
}

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.healthz)

	mux.HandleFunc("POST /stories", h.requireAuth(h.publishStory))
	mux.HandleFunc("GET /stories/feed", h.requireAuth(h.feed))
	mux.HandleFunc("GET /stories/me", h.requireAuth(h.myStories))
	mux.HandleFunc("GET /stories/{id}/views", h.requireAuth(h.listViewers))
	mux.HandleFunc("POST /stories/{id}/views", h.requireAuth(h.markViewed))
	mux.HandleFunc("DELETE /stories/{id}", h.requireAuth(h.deleteStory))

	return loggingMiddleware(h.log)(mux)
}

func (h *Handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// === DTOs ===

type publishStoryRequest struct {
	MediaID     string  `json:"mediaId"`
	OverlayText *string `json:"overlayText,omitempty"`
}

type storyDTO struct {
	ID          string  `json:"id"`
	AuthorID    string  `json:"authorId"`
	MediaID     string  `json:"mediaId"`
	OverlayText *string `json:"overlayText,omitempty"`
	CreatedAt   int64   `json:"createdAt"`
	ExpiresAt   int64   `json:"expiresAt"`
	ViewCount   int     `json:"viewCount"`
	IViewed     bool    `json:"iViewed"`
}

type viewerDTO struct {
	ViewerID string `json:"viewerId"`
	ViewedAt int64  `json:"viewedAt"`
}

func storyToDTO(s *domain.StoryWithStats) storyDTO {
	return storyDTO{
		ID: s.ID, AuthorID: s.AuthorID, MediaID: s.MediaID,
		OverlayText: s.OverlayText,
		CreatedAt:   s.CreatedAt.UnixMilli(),
		ExpiresAt:   s.ExpiresAt.UnixMilli(),
		ViewCount:   s.ViewCount, IViewed: s.IViewed,
	}
}

// === handlers ===

func (h *Handler) publishStory(w http.ResponseWriter, r *http.Request) {
	var req publishStoryRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	story, err := h.svc.PublishStory(ctx, actorID, req.MediaID, req.OverlayText)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, storyToDTO(&domain.StoryWithStats{
		Story: *story, ViewCount: 0, IViewed: false,
	}))
}

func (h *Handler) feed(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	stories, err := h.svc.FeedForUser(ctx, actorID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]storyDTO, len(stories))
	for i, s := range stories {
		out[i] = storyToDTO(s)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) myStories(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	stories, err := h.svc.MyStories(ctx, actorID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]storyDTO, len(stories))
	for i, s := range stories {
		out[i] = storyToDTO(s)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) markViewed(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	storyID := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.MarkViewed(ctx, actorID, storyID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listViewers(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	storyID := r.PathValue("id")
	limit := 100
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 500 {
		limit = l
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	views, err := h.svc.Viewers(ctx, actorID, storyID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]viewerDTO, len(views))
	for i, v := range views {
		out[i] = viewerDTO{ViewerID: v.ViewerID, ViewedAt: v.ViewedAt.UnixMilli()}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) deleteStory(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	storyID := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.Delete(ctx, actorID, storyID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// === middleware ===

type ctxKey string

const ctxKeyUserID ctxKey = "userID"

func userIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKeyUserID).(string); ok {
		return v
	}
	return ""
}

func (h *Handler) requireAuth(next http.HandlerFunc) http.HandlerFunc {
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
				"method", r.Method, "path", r.URL.Path,
				"status", rw.status, "duration_ms", time.Since(start).Milliseconds(),
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
		writeError(w, http.StatusNotFound, "not_found", "story not found")
	case service.IsForbidden(err):
		writeError(w, http.StatusForbidden, "forbidden", "access denied")
	case service.IsExpired(err):
		writeError(w, http.StatusGone, "expired", "story expired")
	case service.IsInvalidArg(err):
		writeError(w, http.StatusBadRequest, "invalid_arg", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
	}
}
