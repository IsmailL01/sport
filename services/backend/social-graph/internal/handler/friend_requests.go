// Package handler — friend-request HTTP routes (Phase 10 / ADR-0011 Amendment 6).
package handler

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
)

// DTOs

type friendRequestDTO struct {
	ID          string  `json:"id"`
	SenderID    string  `json:"senderId"`
	ReceiverID  string  `json:"receiverId"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"createdAt"`
	RespondedAt *string `json:"respondedAt,omitempty"`
}

func toFriendRequestDTO(fr *domain.FriendRequest) friendRequestDTO {
	dto := friendRequestDTO{
		ID:         fr.ID,
		SenderID:   fr.SenderID,
		ReceiverID: fr.ReceiverID,
		Status:     string(fr.Status),
		CreatedAt:  fr.CreatedAt.Format(time.RFC3339),
	}
	if fr.RespondedAt != nil {
		s := fr.RespondedAt.Format(time.RFC3339)
		dto.RespondedAt = &s
	}
	return dto
}

// === Handlers ===

// POST /friend-requests/{user_id} — send a friend request to user_id.
func (h *Handler) sendFriendRequest(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing actor")
		return
	}
	receiverID := r.PathValue("user_id")

	// Rate-limit (re-use follows budget — friend-requests are similar low-volume).
	if !h.rateLimit(w, r.Context(), "friend_requests", actorID, followsPerMinute, rateWindowMinute) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	fr, err := h.svc.SendFriendRequest(ctx, actorID, receiverID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toFriendRequestDTO(fr))
}

// GET /friend-requests/incoming — list pending requests where I'm the receiver.
func (h *Handler) listIncomingFriendRequests(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing actor")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	limit := parseLimit(r, 50, 100)
	list, err := h.svc.ListIncomingFriendRequests(ctx, actorID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]friendRequestDTO, 0, len(list))
	for _, fr := range list {
		out = append(out, toFriendRequestDTO(fr))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

// GET /friend-requests/outgoing — list pending requests where I'm the sender.
func (h *Handler) listOutgoingFriendRequests(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing actor")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	limit := parseLimit(r, 50, 100)
	list, err := h.svc.ListOutgoingFriendRequests(ctx, actorID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]friendRequestDTO, 0, len(list))
	for _, fr := range list {
		out = append(out, toFriendRequestDTO(fr))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

// POST /friend-requests/{id}/accept
func (h *Handler) acceptFriendRequest(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing actor")
		return
	}
	requestID := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	if err := h.svc.AcceptFriendRequest(ctx, actorID, requestID); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
}

// POST /friend-requests/{id}/reject
func (h *Handler) rejectFriendRequest(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing actor")
		return
	}
	requestID := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	if err := h.svc.RejectFriendRequest(ctx, actorID, requestID); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

// DELETE /friend-requests/{id} — sender cancels own pending.
func (h *Handler) cancelFriendRequest(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing actor")
		return
	}
	requestID := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	if err := h.svc.CancelFriendRequest(ctx, actorID, requestID); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

// GET /friends — list my accepted friends (userIDs only).
func (h *Handler) listFriends(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing actor")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	limit := parseLimit(r, 100, 200)
	ids, err := h.svc.ListFriends(ctx, actorID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"friendIds": ids})
}

// GET /friends/check/{user_id} — server-side friendship check.
// Used by messaging service before allowing DM send. Returns {areFriends: bool}.
func (h *Handler) checkAreFriends(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	if actorID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "missing actor")
		return
	}
	targetID := r.PathValue("user_id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	areFriends, err := h.svc.AreFriends(ctx, actorID, targetID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"areFriends": areFriends})
}

// writeServiceError augmented to map friend-request domain errors.
// Note: existing writeServiceError in http.go handles ErrProfileNotFound,
// ErrSelfTarget, ErrNotFound, ErrForbidden, ErrInvalidArg. Extending it
// would require touching that file. Friend-request-specific errors below
// are caught here as a wrapper.
func writeFriendRequestError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, domain.ErrAlreadyFriends):
		writeError(w, http.StatusConflict, "already_friends", "users are already friends")
		return true
	case errors.Is(err, domain.ErrFriendRequestExists):
		writeError(w, http.StatusConflict, "friend_request_exists",
			"a friend request already exists between these users")
		return true
	case errors.Is(err, domain.ErrFriendRequestNotPending):
		writeError(w, http.StatusConflict, "not_pending",
			"friend request is no longer pending")
		return true
	case errors.Is(err, domain.ErrFriendRequestNotOwned):
		writeError(w, http.StatusForbidden, "not_owner",
			"only the request receiver/sender can act on it")
		return true
	}
	return false
}
