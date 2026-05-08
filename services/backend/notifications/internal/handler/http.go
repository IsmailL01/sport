// Package handler — REST endpoints notifications.
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

	"github.com/runningecosystem/backend/notifications/internal/domain"
	"github.com/runningecosystem/backend/notifications/internal/service"
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
	mux.HandleFunc("POST /devices", h.requireAuth(h.registerDevice))
	mux.HandleFunc("DELETE /devices/{token}", h.requireAuth(h.deleteDevice))
	mux.HandleFunc("GET /notifications", h.requireAuth(h.listNotifications))
	mux.HandleFunc("POST /notifications/read", h.requireAuth(h.markAllRead))
	mux.HandleFunc("GET /preferences", h.requireAuth(h.getPrefs))
	mux.HandleFunc("PATCH /preferences", h.requireAuth(h.patchPrefs))
	return loggingMiddleware(h.log)(mux)
}

func (h *Handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// === DTOs ===

type registerDeviceRequest struct {
	ExpoToken string  `json:"expoToken"`
	Platform  string  `json:"platform"`
	DeviceID  *string `json:"deviceId,omitempty"`
}

type deviceDTO struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	ExpoToken string `json:"expoToken"`
	Platform  string `json:"platform"`
	DeviceID  *string `json:"deviceId,omitempty"`
	LastSeen  int64  `json:"lastSeen"`
	CreatedAt int64  `json:"createdAt"`
}

type notificationDTO struct {
	ID        string          `json:"id"`
	Kind      string          `json:"kind"`
	Payload   json.RawMessage `json:"payload"`
	ReadAt    *int64          `json:"readAt,omitempty"`
	CreatedAt int64           `json:"createdAt"`
}

type prefsDTO struct {
	PushEnabled     bool `json:"pushEnabled"`
	PushMessages    bool `json:"pushMessages"`
	PushFollows     bool `json:"pushFollows"`
	PushMentions    bool `json:"pushMentions"`
	QuietHoursStart *int `json:"quietHoursStart,omitempty"`
	QuietHoursEnd   *int `json:"quietHoursEnd,omitempty"`
}

// === handlers ===

func (h *Handler) registerDevice(w http.ResponseWriter, r *http.Request) {
	var req registerDeviceRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	d, err := h.svc.RegisterDevice(ctx, actorID, req.ExpoToken, domain.Platform(req.Platform), req.DeviceID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, deviceDTO{
		ID: d.ID, UserID: d.UserID, ExpoToken: d.ExpoToken,
		Platform: string(d.Platform), DeviceID: d.DeviceID,
		LastSeen: d.LastSeen.UnixMilli(), CreatedAt: d.CreatedAt.UnixMilli(),
	})
}

func (h *Handler) deleteDevice(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	token := r.PathValue("token")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.DeleteDevice(ctx, actorID, token); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listNotifications(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	limit := 50
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 200 {
		limit = l
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	ns, err := h.svc.ListNotifications(ctx, actorID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]notificationDTO, len(ns))
	for i, n := range ns {
		var readAt *int64
		if n.ReadAt != nil {
			t := n.ReadAt.UnixMilli()
			readAt = &t
		}
		out[i] = notificationDTO{
			ID: n.ID, Kind: n.Kind, Payload: n.Payload,
			ReadAt: readAt, CreatedAt: n.CreatedAt.UnixMilli(),
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) markAllRead(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.MarkAllRead(ctx, actorID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getPrefs(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	p, err := h.svc.GetPreferences(ctx, actorID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, prefsDTO{
		PushEnabled: p.PushEnabled, PushMessages: p.PushMessages,
		PushFollows: p.PushFollows, PushMentions: p.PushMentions,
		QuietHoursStart: p.QuietHoursStart, QuietHoursEnd: p.QuietHoursEnd,
	})
}

func (h *Handler) patchPrefs(w http.ResponseWriter, r *http.Request) {
	var req prefsDTO
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	p := domain.Preferences{
		UserID: actorID, PushEnabled: req.PushEnabled, PushMessages: req.PushMessages,
		PushFollows: req.PushFollows, PushMentions: req.PushMentions,
		QuietHoursStart: req.QuietHoursStart, QuietHoursEnd: req.QuietHoursEnd,
	}
	if err := h.svc.UpdatePreferences(ctx, p); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, req)
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
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	case service.IsInvalidArg(err):
		writeError(w, http.StatusBadRequest, "invalid_arg", "invalid argument")
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
	}
}
