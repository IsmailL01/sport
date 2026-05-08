// Package handler — REST endpoints media.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/runningecosystem/backend/media/internal/domain"
	"github.com/runningecosystem/backend/media/internal/service"
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
	mux.HandleFunc("POST /uploads", h.requireAuth(h.initUpload))
	mux.HandleFunc("POST /uploads/{id}/complete", h.requireAuth(h.completeUpload))
	mux.HandleFunc("GET /media/{id}", h.requireAuth(h.getMedia))
	mux.HandleFunc("DELETE /media/{id}", h.requireAuth(h.deleteMedia))
	return loggingMiddleware(h.log)(mux)
}

func (h *Handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// === DTOs ===

type initUploadRequest struct {
	Kind      string `json:"kind"`
	Mime      string `json:"mime"`
	SizeBytes int64  `json:"sizeBytes"`
}

type initUploadResponse struct {
	MediaID    string `json:"mediaId"`
	UploadURL  string `json:"uploadUrl"`
	Key        string `json:"key"`
	ExpiresInS int    `json:"expiresInS"`
}

type completeRequest struct {
	Width      *int `json:"width,omitempty"`
	Height     *int `json:"height,omitempty"`
	DurationMs *int `json:"durationMs,omitempty"`
}

type mediaDTO struct {
	ID          string  `json:"id"`
	OwnerID     string  `json:"ownerId"`
	Kind        string  `json:"kind"`
	Mime        string  `json:"mime"`
	SizeBytes   int64   `json:"sizeBytes"`
	Status      string  `json:"status"`
	Width       *int    `json:"width,omitempty"`
	Height      *int    `json:"height,omitempty"`
	DurationMs  *int    `json:"durationMs,omitempty"`
	DownloadURL *string `json:"downloadUrl,omitempty"`
	CreatedAt   int64   `json:"createdAt"`
}

func mediaToDTO(m *domain.Media, downloadURL string) mediaDTO {
	d := mediaDTO{
		ID: m.ID, OwnerID: m.OwnerID, Kind: string(m.Kind),
		Mime: m.Mime, SizeBytes: m.SizeBytes, Status: string(m.Status),
		Width: m.Width, Height: m.Height, DurationMs: m.DurationMs,
		CreatedAt: m.CreatedAt.UnixMilli(),
	}
	if downloadURL != "" {
		d.DownloadURL = &downloadURL
	}
	return d
}

// === handlers ===

func (h *Handler) initUpload(w http.ResponseWriter, r *http.Request) {
	var req initUploadRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	out, err := h.svc.InitUpload(ctx, service.InitUploadInput{
		OwnerID: actorID, Kind: domain.MediaKind(req.Kind),
		Mime: req.Mime, SizeBytes: req.SizeBytes,
	})
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, initUploadResponse{
		MediaID: out.MediaID, UploadURL: out.UploadURL,
		Key: out.Key, ExpiresInS: out.ExpiresInS,
	})
}

func (h *Handler) completeUpload(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	actorID := userIDFromContext(r.Context())
	var req completeRequest
	if r.ContentLength > 0 {
		if err := readJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	m, err := h.svc.CompleteUpload(ctx, service.CompleteInput{
		MediaID: id, OwnerID: actorID,
		Width: req.Width, Height: req.Height, DurationMs: req.DurationMs,
	})
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, mediaToDTO(m, ""))
}

func (h *Handler) getMedia(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	m, downloadURL, err := h.svc.GetWithDownloadURL(ctx, id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, mediaToDTO(m, downloadURL))
}

func (h *Handler) deleteMedia(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.Delete(ctx, actorID, id); err != nil {
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
		writeError(w, http.StatusNotFound, "not_found", "media not found")
	case service.IsForbidden(err):
		writeError(w, http.StatusForbidden, "forbidden", "access denied")
	case service.IsTooLarge(err):
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "file too large")
	case service.IsInvalidArg(err):
		writeError(w, http.StatusBadRequest, "invalid_arg", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
	}
}
