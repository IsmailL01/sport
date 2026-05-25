// Package handler — HTTP routes social-graph.
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

	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/ratelimit"
	"github.com/runningecosystem/backend/social-graph/internal/domain"
	"github.com/runningecosystem/backend/social-graph/internal/repository/postgres"
	"github.com/runningecosystem/backend/social-graph/internal/service"
)

const requestTimeout = 30 * time.Second

// Phase I: rate-limit budgets per-user.
const (
	followsPerMinute = 5
	reportsPerHour   = 5
	rateWindowMinute = time.Minute
	rateWindowHour   = time.Hour
)

type Handler struct {
	svc     *service.Service
	signer  *auth.Signer
	limiter *ratelimit.Limiter
	log     *slog.Logger
}

func New(svc *service.Service, signer *auth.Signer, limiter *ratelimit.Limiter, log *slog.Logger) *Handler {
	return &Handler{svc: svc, signer: signer, limiter: limiter, log: log}
}

func (h *Handler) rateLimit(
	w http.ResponseWriter, ctx context.Context,
	scope, actorID string, limit int, window time.Duration,
) bool {
	if h.limiter == nil {
		return true
	}
	d := h.limiter.Check(ctx, scope+":"+actorID, limit, window)
	if !d.Allow {
		w.Header().Set("Retry-After", strconv.Itoa(d.RetryAfter))
		writeError(w, http.StatusTooManyRequests, "rate_limited",
			"too many requests, retry after Retry-After seconds")
		return false
	}
	return true
}

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.healthz)

	// Profiles
	mux.HandleFunc("GET /profiles/{user_id}", h.requireAuth(h.getProfile))
	mux.HandleFunc("PATCH /profiles/me", h.requireAuth(h.patchOwnProfile))
	mux.HandleFunc("POST /profiles/bulk", h.requireAuth(h.bulkProfiles))

	// Search
	mux.HandleFunc("GET /search/users", h.requireAuth(h.searchUsers))

	// Relations & follow
	mux.HandleFunc("GET /relations/{user_id}", h.requireAuth(h.getRelation))
	mux.HandleFunc("POST /follows/{user_id}", h.requireAuth(h.follow))
	mux.HandleFunc("DELETE /follows/{user_id}", h.requireAuth(h.unfollow))
	mux.HandleFunc("GET /follows/me/followers", h.requireAuth(h.listFollowers))
	mux.HandleFunc("GET /follows/me/following", h.requireAuth(h.listFollowing))

	// Blocks
	mux.HandleFunc("POST /blocks/{user_id}", h.requireAuth(h.block))
	mux.HandleFunc("DELETE /blocks/{user_id}", h.requireAuth(h.unblock))
	mux.HandleFunc("GET /blocks/me", h.requireAuth(h.listBlocks))

	// Phase 10 / FRIEND-REQUEST-FLOW (ADR-0011 Amendment 6)
	mux.HandleFunc("POST /friend-requests/{user_id}", h.requireAuth(h.sendFriendRequest))
	mux.HandleFunc("GET /friend-requests/incoming", h.requireAuth(h.listIncomingFriendRequests))
	mux.HandleFunc("GET /friend-requests/outgoing", h.requireAuth(h.listOutgoingFriendRequests))
	mux.HandleFunc("POST /friend-requests/{id}/accept", h.requireAuth(h.acceptFriendRequest))
	mux.HandleFunc("POST /friend-requests/{id}/reject", h.requireAuth(h.rejectFriendRequest))
	mux.HandleFunc("DELETE /friend-requests/{id}", h.requireAuth(h.cancelFriendRequest))
	mux.HandleFunc("GET /friends", h.requireAuth(h.listFriends))
	mux.HandleFunc("GET /friends/check/{user_id}", h.requireAuth(h.checkAreFriends))

	// Phase E: модерация — reports + admin queue.
	mux.HandleFunc("POST /reports", h.requireAuth(h.createReport))
	mux.HandleFunc("GET /reports/me", h.requireAuth(h.myReports))
	mux.HandleFunc("GET /admin/reports", h.requireAuth(h.adminListReports))
	mux.HandleFunc("POST /admin/reports/{id}/resolve", h.requireAuth(h.adminResolveReport))
	mux.HandleFunc("GET /admin/audit", h.requireAuth(h.adminAuditLog))

	return loggingMiddleware(h.log)(mux)
}

func (h *Handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// === DTOs ===

type profileDTO struct {
	UserID         string  `json:"userId"`
	Username       *string `json:"username,omitempty"`
	DisplayName    *string `json:"displayName,omitempty"`
	Bio            *string `json:"bio,omitempty"`
	AvatarMediaID  *string `json:"avatarMediaId,omitempty"`
	Privacy        string  `json:"privacy"`
	GlobalRole     string  `json:"globalRole"`
	FollowersCount int     `json:"followersCount"`
	FollowingCount int     `json:"followingCount"`
	// Phase M3: gamification.
	XPTotal  int    `json:"xpTotal"`
	Grade    string `json:"grade"`
	Verified bool   `json:"verified"`
}

type patchProfileRequest struct {
	Username      *string `json:"username,omitempty"`
	DisplayName   *string `json:"displayName,omitempty"`
	Bio           *string `json:"bio,omitempty"`
	AvatarMediaID *string `json:"avatarMediaId,omitempty"`
	Privacy       *string `json:"privacy,omitempty"`
}

type relationDTO struct {
	IsFollowing bool `json:"isFollowing"`
	IsFollower  bool `json:"isFollower"`
	IsBlocked   bool `json:"isBlocked"`
	IsBlockedBy bool `json:"isBlockedBy"`
	CanDM       bool `json:"canDm"`
	// 2026-05-25 Phase 10 / ADR-0011 Amendment 6: friend-request UI state.
	FriendStatus    string `json:"friendStatus"`              // none | pending_outgoing | pending_incoming | accepted | self
	FriendRequestID string `json:"friendRequestId,omitempty"` // present when status is pending_*
}

type bulkRequest struct {
	UserIDs []string `json:"userIds"`
}

// === Handlers ===

func (h *Handler) getProfile(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("user_id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	prof, err := h.svc.GetProfile(ctx, userID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	followers, following, err := h.svc.FollowCounts(ctx, userID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, profileToDTO(prof, followers, following))
}

func (h *Handler) patchOwnProfile(w http.ResponseWriter, r *http.Request) {
	var req patchProfileRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	prof, err := h.svc.PatchOwnProfile(ctx, actorID, postgres.ProfilePatch{
		Username:      req.Username,
		DisplayName:   req.DisplayName,
		Bio:           req.Bio,
		AvatarMediaID: req.AvatarMediaID,
		Privacy:       req.Privacy,
	})
	if err != nil {
		writeServiceError(w, err)
		return
	}
	followers, following, _ := h.svc.FollowCounts(ctx, actorID)
	writeJSON(w, http.StatusOK, profileToDTO(prof, followers, following))
}

func (h *Handler) bulkProfiles(w http.ResponseWriter, r *http.Request) {
	var req bulkRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if len(req.UserIDs) == 0 || len(req.UserIDs) > 200 {
		writeError(w, http.StatusBadRequest, "invalid_request", "userIds must be 1..200")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	profiles, err := h.svc.BulkProfiles(ctx, req.UserIDs)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]profileDTO, len(profiles))
	for i, p := range profiles {
		out[i] = profileToDTO(p, 0, 0)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) searchUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limit := 20
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 50 {
		limit = l
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	profiles, err := h.svc.Search(ctx, q, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]profileDTO, len(profiles))
	for i, p := range profiles {
		out[i] = profileToDTO(p, 0, 0)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) getRelation(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("user_id")
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	rel, err := h.svc.GetRelation(ctx, actorID, targetID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, relationDTO{
		IsFollowing: rel.IsFollowing, IsFollower: rel.IsFollower,
		IsBlocked: rel.IsBlocked, IsBlockedBy: rel.IsBlockedBy, CanDM: rel.CanDM,
		FriendStatus: rel.FriendStatus, FriendRequestID: rel.FriendRequestID,
	})
}

func (h *Handler) follow(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("user_id")
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if !h.rateLimit(w, ctx, "flw", actorID, followsPerMinute, rateWindowMinute) {
		return
	}
	if err := h.svc.Follow(ctx, actorID, targetID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) unfollow(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("user_id")
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.Unfollow(ctx, actorID, targetID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listFollowers(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	limit := parseLimit(r, 50, 100)
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	ids, err := h.svc.Followers(ctx, actorID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"userIds": ids})
}

func (h *Handler) listFollowing(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	limit := parseLimit(r, 50, 100)
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	ids, err := h.svc.Following(ctx, actorID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"userIds": ids})
}

func (h *Handler) block(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("user_id")
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.Block(ctx, actorID, targetID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) unblock(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("user_id")
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.Unblock(ctx, actorID, targetID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listBlocks(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	limit := parseLimit(r, 100, 200)
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	ids, err := h.svc.ListBlocked(ctx, actorID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"userIds": ids})
}

// === DTO conversions ===

func profileToDTO(p *domain.Profile, followers, following int) profileDTO {
	return profileDTO{
		UserID: p.UserID, Username: p.Username, DisplayName: p.DisplayName,
		Bio: p.Bio, AvatarMediaID: p.AvatarMediaID,
		Privacy: p.Privacy, GlobalRole: p.GlobalRole,
		FollowersCount: followers, FollowingCount: following,
		XPTotal: p.XPTotal, Grade: p.Grade, Verified: p.Verified,
	}
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

func parseLimit(r *http.Request, def, max int) int {
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= max {
		return l
	}
	return def
}

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
	// Phase 10 / ADR-0011 Amendment 6: friend-request errors handled
	// inline via writeFriendRequestError (file friend_requests.go).
	if writeFriendRequestError(w, err) {
		return
	}
	switch {
	case service.IsNotFound(err):
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	case service.IsSelfTarget(err):
		writeError(w, http.StatusBadRequest, "self_target", "cannot target yourself")
	case service.IsUsernameTaken(err):
		writeError(w, http.StatusConflict, "username_taken", "username already taken")
	case service.IsInvalidArg(err):
		writeError(w, http.StatusBadRequest, "invalid_arg", "invalid argument")
	case service.IsForbidden(err):
		writeError(w, http.StatusForbidden, "forbidden", "access denied")
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
	}
}
