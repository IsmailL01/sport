// Feature flag HTTP handlers — Phase 1 / REL-03.
//
// Endpoints:
//   - GET /featureflags         — public; возвращает резолвленные booleans
//                                  для requesting user (если authenticated)
//                                  или global enabled-state (anonymous).
//   - GET /admin/featureflags   — admin; full Flag[] с config + audit metadata.
//   - PUT /admin/featureflags/{flag_name} — admin write; gated permissions
//                                  + pkg/audit.LogQuiet.
//
// Admin endpoints живут в identity потому что весь shared admin UI (Caddy
// path-routing) проходит через identity для /me; profiles.global_role
// читается напрямую из БД (см. permFromDB() ниже).
package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/pkg/audit"
	"github.com/runningecosystem/backend/pkg/featureflags"
	"github.com/runningecosystem/backend/pkg/permissions"
)

// === DTOs ===

// flagResolvedDTO — public read (GET /featureflags).
// Намеренно НЕ экспоузит rollout_percent / description / audit columns —
// per-user privacy (T-01-C-04).
type flagResolvedDTO struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

// flagAdminDTO — admin read; включает rollout config + last-modified audit.
type flagAdminDTO struct {
	Name            string  `json:"name"`
	Enabled         bool    `json:"enabled"`
	RolloutPercent  int     `json:"rolloutPercent"`
	Description     string  `json:"description"`
	UpdatedAt       int64   `json:"updatedAt"`
	UpdatedByUserID *string `json:"updatedByUserId,omitempty"`
}

type adminPutFlagRequest struct {
	Enabled bool `json:"enabled"`
	Percent int  `json:"percent"`
}

// === handlers ===

// listFlags — public.  Anonymous user видит только глобальные booleans;
// authenticated user видит результаты с применённым per-user rollout.
//
// Per-flag IsEnabled делает cache lookup + опционально DB fetch.  Для 5
// флагов это 5 cache reads (~µs) и максимум 5 DB queries после cache miss.
func (h *AuthHandler) listFlags(w http.ResponseWriter, r *http.Request) {
	if h.flags == nil {
		writeError(w, http.StatusServiceUnavailable, "featureflags_disabled", "feature flag store not initialized")
		return
	}
	// Auth optional: pull userID если присутствует Bearer-token, иначе ""
	// (anonymous). Per CONTEXT D-13.
	actorID := h.tryUserID(r)
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	flags, err := h.flags.List(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}

	out := make([]flagResolvedDTO, 0, len(flags))
	uid := actorIDToInt64(actorID)
	for _, f := range flags {
		out = append(out, flagResolvedDTO{
			Name:    f.Name,
			Enabled: h.flags.IsEnabled(ctx, uid, f.Name),
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// adminListFlags — admin read с full DTO.  Gated по pkg/permissions
// CapFeatureFlagToggle (admin/moderator role only).
func (h *AuthHandler) adminListFlags(w http.ResponseWriter, r *http.Request) {
	if h.flags == nil || h.pool == nil {
		writeError(w, http.StatusServiceUnavailable, "featureflags_disabled", "feature flag store not initialized")
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	if !h.adminGate(ctx, w, actorID) {
		return
	}

	flags, err := h.flags.List(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}

	out := make([]flagAdminDTO, 0, len(flags))
	for _, f := range flags {
		out = append(out, flagAdminDTO{
			Name:            f.Name,
			Enabled:         f.Enabled,
			RolloutPercent:  f.RolloutPercent,
			Description:     f.Description,
			UpdatedAt:       f.UpdatedAt.UnixMilli(),
			UpdatedByUserID: f.UpdatedByUserID,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// adminPutFlag — admin write.  Validates → checks permission → updates →
// audit.LogQuiet.  Returns updated DTO.
func (h *AuthHandler) adminPutFlag(w http.ResponseWriter, r *http.Request) {
	if h.flags == nil || h.pool == nil {
		writeError(w, http.StatusServiceUnavailable, "featureflags_disabled", "feature flag store not initialized")
		return
	}
	actorID := userIDFromContext(r.Context())
	name := r.PathValue("flag_name")
	if name == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "missing flag_name path value")
		return
	}

	var req adminPutFlagRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if req.Percent < 0 || req.Percent > 100 {
		writeError(w, http.StatusBadRequest, "invalid_request", "percent must be in [0,100]")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	if !h.adminGate(ctx, w, actorID) {
		return
	}

	if err := h.flags.Set(ctx, name, req.Enabled, req.Percent, actorID); err != nil {
		// "does not exist" → 404; иначе 500.
		if isNotFoundErr(err) {
			writeError(w, http.StatusNotFound, "flag_not_found", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "set_failed", err.Error())
		return
	}

	// Audit (best-effort; не блокирует ответ).
	if h.audit != nil {
		aID := actorID
		h.audit.LogQuiet(ctx, audit.Entry{
			ActorID:    &aID,
			Capability: permissions.CapFeatureFlagToggle,
			Action:     "toggle_feature_flag",
			TargetKind: "feature_flag",
			TargetID:   name,
			Metadata: map[string]any{
				"enabled": req.Enabled,
				"percent": req.Percent,
			},
		})
	}

	// Re-read для возврата updated DTO.
	flags, err := h.flags.List(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	for _, f := range flags {
		if f.Name == name {
			writeJSON(w, http.StatusOK, flagAdminDTO{
				Name:            f.Name,
				Enabled:         f.Enabled,
				RolloutPercent:  f.RolloutPercent,
				Description:     f.Description,
				UpdatedAt:       f.UpdatedAt.UnixMilli(),
				UpdatedByUserID: f.UpdatedByUserID,
			})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// === helpers ===

// adminGate — выполняет permissions.Check для CapFeatureFlagToggle.
// Возвращает true если allow, иначе пишет 403/500 и возвращает false.
func (h *AuthHandler) adminGate(ctx context.Context, w http.ResponseWriter, actorID string) bool {
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "missing_actor", "actor user_id not found in context")
		return false
	}
	role, err := h.loadGlobalRole(ctx, actorID)
	if err != nil {
		// Profile lookup error → 500.  Fail-closed по auth, не leak DB error
		// в production.
		writeError(w, http.StatusInternalServerError, "role_lookup_failed", "")
		return false
	}
	subj := permissions.Subject{
		UserID:          actorID,
		GlobalRole:      role,
		IsAuthenticated: true,
	}
	decision := permissions.Check(subj, permissions.CapFeatureFlagToggle, permissions.ResourceContext{Now: time.Now()})
	if !decision.Allow {
		writeError(w, http.StatusForbidden, "forbidden", decision.Reason)
		return false
	}
	return true
}

// loadGlobalRole — читает profiles.global_role напрямую из shared DB.
// Identity не владеет profiles table, но БД общая; для admin-gate это
// pragmatic shortcut. Если row не найдена — возвращаем 'user' (наименьшая
// привилегия).
func (h *AuthHandler) loadGlobalRole(ctx context.Context, userID string) (permissions.GlobalRole, error) {
	if h.pool == nil {
		return permissions.GlobalUser, errors.New("identity: no pool for role lookup")
	}
	const q = `SELECT global_role FROM profiles WHERE user_id = $1`
	var role string
	err := h.pool.QueryRow(ctx, q, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return permissions.GlobalUser, nil
		}
		return permissions.GlobalUser, err
	}
	return permissions.GlobalRole(role), nil
}

// tryUserID — best-effort: вычитывает Bearer-token и парсит userID. На
// missing/invalid возвращает "" (anonymous).  Не пишет в response.
func (h *AuthHandler) tryUserID(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(authHeader) <= len(prefix) || authHeader[:len(prefix)] != prefix {
		return ""
	}
	token := authHeader[len(prefix):]
	claims, err := h.signer.VerifyAccess(token)
	if err != nil {
		return ""
	}
	return claims.UserID
}

// actorIDToInt64 — стабильное преобразование UUID-string в int64 для
// Rollout. Берём FNV-1a hash UUID-байтов; гарантирует deterministic
// per-user bucket независимо от формы userID на mobile vs server.
//
// Принимаем "" → 0 (anonymous).
func actorIDToInt64(actorID string) int64 {
	if actorID == "" {
		return 0
	}
	// Простая FNV над UUID-bytes; используем тот же хеш что и Rollout
	// (consistent bucket).
	const offset64 = 14695981039346656037
	const prime64 = 1099511628211
	var h uint64 = offset64
	for _, b := range []byte(actorID) {
		h ^= uint64(b)
		h *= prime64
	}
	// Mask старший bit чтобы получить положительное int64.
	return int64(h & 0x7FFFFFFFFFFFFFFF)
}

// isNotFoundErr — heuristic для Set() "does not exist" error.
func isNotFoundErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for i := 0; i+13 <= len(msg); i++ {
		if msg[i:i+14] == "does not exist" {
			return true
		}
	}
	return false
}

// Ensure pgxpool import is exercised (defensive vs goimports drop).
var _ = (*pgxpool.Pool)(nil)
var _ = featureflags.Flag{}
