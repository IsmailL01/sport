// Package handler — HTTP routes messaging.
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

	"github.com/runningecosystem/backend/messaging/internal/domain"
	"github.com/runningecosystem/backend/messaging/internal/service"
	"github.com/runningecosystem/backend/pkg/auth"
	"github.com/runningecosystem/backend/pkg/ratelimit"
)

const requestTimeout = 30 * time.Second

// Rate-limit budget: per-user per-window.
const (
	msgsPerMinute = 30
	msgWindow     = time.Minute
)

type Handler struct {
	svc     *service.Service
	signer  *auth.Signer
	log     *slog.Logger
	limiter *ratelimit.Limiter // nil → no rate limiting
}

func New(svc *service.Service, signer *auth.Signer, limiter *ratelimit.Limiter, log *slog.Logger) *Handler {
	return &Handler{svc: svc, signer: signer, limiter: limiter, log: log}
}

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.healthz)

	mux.HandleFunc("POST /conversations", h.requireAuth(h.createOrFindConv))
	mux.HandleFunc("GET /conversations", h.requireAuth(h.listConvs))
	mux.HandleFunc("GET /conversations/{id}", h.requireAuth(h.getConv))
	mux.HandleFunc("PATCH /conversations/{id}", h.requireAuth(h.patchConv))
	mux.HandleFunc("GET /conversations/{id}/members", h.requireAuth(h.listMembers))
	mux.HandleFunc("POST /conversations/{id}/members", h.requireAuth(h.addMembers))
	mux.HandleFunc("DELETE /conversations/{id}/members/{userId}", h.requireAuth(h.removeMember))
	mux.HandleFunc("PATCH /conversations/{id}/members/{userId}", h.requireAuth(h.changeRole))
	mux.HandleFunc("POST /conversations/{id}/messages", h.requireAuth(h.sendMessage))
	mux.HandleFunc("GET /conversations/{id}/messages", h.requireAuth(h.listMessages))
	mux.HandleFunc("POST /conversations/{id}/read", h.requireAuth(h.markRead))
	mux.HandleFunc("DELETE /messages/{id}", h.requireAuth(h.deleteMessage))
	mux.HandleFunc("PATCH /messages/{id}", h.requireAuth(h.editMessage))
	mux.HandleFunc("POST /messages/{id}/reactions", h.requireAuth(h.addReaction))
	mux.HandleFunc("DELETE /messages/{id}/reactions/{emoji}", h.requireAuth(h.removeReaction))

	return loggingMiddleware(h.log)(mux)
}

func (h *Handler) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// === DTOs ===

type createConvRequest struct {
	Type      string   `json:"type"`                // 'dm' | 'group'
	PeerID    string   `json:"peerId,omitempty"`    // для DM
	Title     string   `json:"title,omitempty"`     // для group
	MemberIDs []string `json:"memberIds,omitempty"` // для group
}

type addMembersRequest struct {
	UserIDs []string `json:"userIds"`
}

type changeRoleRequest struct {
	Role string `json:"role"`
}

type patchConvRequest struct {
	Title         *string `json:"title,omitempty"`
	AvatarMediaID *string `json:"avatarMediaId,omitempty"`
}

type memberDTO struct {
	UserID            string  `json:"userId"`
	Role              string  `json:"role"`
	JoinedAt          int64   `json:"joinedAt"`
	LastReadMessageID *string `json:"lastReadMessageId,omitempty"`
	NotifLevel        string  `json:"notifLevel"`
}

type convDTO struct {
	ID            string      `json:"id"`
	Type          string      `json:"type"`
	Title         *string     `json:"title,omitempty"`
	AvatarMediaID *string     `json:"avatarMediaId,omitempty"`
	CreatedBy     string      `json:"createdBy"`
	CreatedAt     int64       `json:"createdAt"` // ms
	UpdatedAt     int64       `json:"updatedAt"`
	LastMessageAt *int64      `json:"lastMessageAt,omitempty"`
	MyRole        string      `json:"myRole"`
	MembersCount  int         `json:"membersCount"`
	UnreadCount   int         `json:"unreadCount"`
	Muted         bool        `json:"muted"`
	LastMessage   *messageDTO `json:"lastMessage,omitempty"`
}

type sendMessageRequest struct {
	ClientMsgID string  `json:"clientMsgId"`
	Kind        string  `json:"kind,omitempty"` // default text
	Body        *string `json:"body,omitempty"`
	ReplyToID   *string `json:"replyToId,omitempty"`
	MediaID     *string `json:"mediaId,omitempty"`
}

type messageDTO struct {
	ID             string           `json:"id"`
	ConversationID string           `json:"conversationId"`
	SenderID       string           `json:"senderId"`
	ClientMsgID    string           `json:"clientMsgId"`
	Kind           string           `json:"kind"`
	Body           *string          `json:"body,omitempty"`
	ReplyToID      *string          `json:"replyToId,omitempty"`
	ReplyPreview   *replyPreviewDTO `json:"replyPreview,omitempty"`
	Reactions      []reactionDTO    `json:"reactions,omitempty"`
	MediaID        *string          `json:"mediaId,omitempty"`
	MediaMime      *string          `json:"mediaMime,omitempty"`
	MediaWidth     *int             `json:"mediaWidth,omitempty"`
	MediaHeight    *int             `json:"mediaHeight,omitempty"`
	EditedAt       *int64           `json:"editedAt,omitempty"`
	DeletedAt      *int64           `json:"deletedAt,omitempty"`
	CreatedAt      int64            `json:"createdAt"`
}

type reactionDTO struct {
	UserID    string `json:"userId"`
	Emoji     string `json:"emoji"`
	CreatedAt int64  `json:"createdAt"`
}

type replyPreviewDTO struct {
	MessageID string  `json:"messageId"`
	SenderID  string  `json:"senderId"`
	Body      *string `json:"body,omitempty"`
	Kind      string  `json:"kind"`
	Deleted   bool    `json:"deleted"`
}

type editMessageRequest struct {
	Body string `json:"body"`
}

type addReactionRequest struct {
	Emoji string `json:"emoji"`
}

type markReadRequest struct {
	UpToMessageID string `json:"upToMessageId"`
}

// === Handlers ===

func (h *Handler) createOrFindConv(w http.ResponseWriter, r *http.Request) {
	var req createConvRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	switch req.Type {
	case "dm":
		if req.PeerID == "" {
			writeError(w, http.StatusBadRequest, "invalid_request", "peerId required for dm")
			return
		}
		conv, _, err := h.svc.FindOrCreateDM(ctx, actorID, req.PeerID)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, convToDTO(&domain.ConversationView{
			Conversation: *conv, MyRole: domain.RoleMember, MembersCount: 2,
		}))
	case "group":
		conv, err := h.svc.CreateGroup(ctx, actorID, req.Title, req.MemberIDs)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, convToDTO(&domain.ConversationView{
			Conversation: *conv, MyRole: domain.RoleOwner,
			MembersCount: len(req.MemberIDs) + 1,
		}))
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "type must be 'dm' or 'group'")
	}
}

func (h *Handler) patchConv(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	actorID := userIDFromContext(r.Context())
	var req patchConvRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	conv, err := h.svc.UpdateConversationMeta(ctx, actorID, convID, req.Title, req.AvatarMediaID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, convToDTO(&domain.ConversationView{Conversation: *conv}))
}

func (h *Handler) listMembers(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	members, err := h.svc.ListMembers(ctx, actorID, convID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]memberDTO, len(members))
	for i, m := range members {
		out[i] = memberDTO{
			UserID: m.UserID, Role: string(m.Role),
			JoinedAt:          m.JoinedAt.UnixMilli(),
			LastReadMessageID: m.LastReadMessageID,
			NotifLevel:        m.NotifLevel,
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) addMembers(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	actorID := userIDFromContext(r.Context())
	var req addMembersRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if len(req.UserIDs) == 0 || len(req.UserIDs) > 50 {
		writeError(w, http.StatusBadRequest, "invalid_request", "userIds must be 1..50")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.AddMembers(ctx, actorID, convID, req.UserIDs); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	targetID := r.PathValue("userId")
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.RemoveMember(ctx, actorID, convID, targetID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) changeRole(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	targetID := r.PathValue("userId")
	actorID := userIDFromContext(r.Context())
	var req changeRoleRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	switch domain.MemberRole(req.Role) {
	case domain.RoleOwner, domain.RoleAdmin, domain.RoleModerator,
		domain.RoleMember, domain.RoleRestricted:
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid role")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.ChangeRole(ctx, actorID, convID, targetID, domain.MemberRole(req.Role)); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listConvs(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	limit := parseLimit(r, 50, 200)
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	views, err := h.svc.ListConversations(ctx, actorID, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]convDTO, len(views))
	for i, v := range views {
		out[i] = convToDTO(v)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) getConv(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	convID := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	conv, err := h.svc.GetConversation(ctx, actorID, convID)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, convToDTO(&domain.ConversationView{
		Conversation: *conv, MyRole: domain.RoleMember,
	}))
}

func (h *Handler) sendMessage(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	convID := r.PathValue("id")
	var req sendMessageRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()

	// Phase I: rate limiting per-user.
	if h.limiter != nil {
		d := h.limiter.Check(ctx, "msg:"+actorID, msgsPerMinute, msgWindow)
		if !d.Allow {
			w.Header().Set("Retry-After", strconv.Itoa(d.RetryAfter))
			writeError(w, http.StatusTooManyRequests, "rate_limited",
				"too many messages, retry in seconds")
			return
		}
	}

	kind := domain.MessageKind(req.Kind)
	if kind == "" {
		kind = domain.MessageText
	}
	msg, isNew, err := h.svc.SendMessage(ctx, service.SendMessageInput{
		ConvID:      convID,
		SenderID:    actorID,
		ClientMsgID: req.ClientMsgID,
		Kind:        kind,
		Body:        req.Body,
		ReplyToID:   req.ReplyToID,
		MediaID:     req.MediaID,
	})
	if err != nil {
		writeServiceError(w, err)
		return
	}
	status := http.StatusCreated
	if !isNew {
		status = http.StatusOK
	}
	writeJSON(w, status, messageToDTO(msg))
}

func (h *Handler) listMessages(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	convID := r.PathValue("id")
	limit := parseLimit(r, 50, 200)
	var before *int64
	if v := r.URL.Query().Get("beforeMs"); v != "" {
		if ts, err := strconv.ParseInt(v, 10, 64); err == nil {
			before = &ts
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	msgs, err := h.svc.ListMessages(ctx, actorID, convID, before, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	out := make([]messageDTO, len(msgs))
	for i, m := range msgs {
		out[i] = messageToDTO(m)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	convID := r.PathValue("id")
	var req markReadRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if req.UpToMessageID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "upToMessageId required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.MarkRead(ctx, actorID, convID, req.UpToMessageID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) deleteMessage(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	msgID := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.DeleteMessage(ctx, actorID, msgID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// === conversions ===

func convToDTO(v *domain.ConversationView) convDTO {
	d := convDTO{
		ID: v.ID, Type: string(v.Type), Title: v.Title,
		AvatarMediaID: v.AvatarMediaID, CreatedBy: v.CreatedBy,
		CreatedAt: v.CreatedAt.UnixMilli(), UpdatedAt: v.UpdatedAt.UnixMilli(),
		MyRole: string(v.MyRole), MembersCount: v.MembersCount,
		UnreadCount: v.UnreadCount, Muted: v.Muted,
	}
	if v.LastMessageAt != nil {
		t := v.LastMessageAt.UnixMilli()
		d.LastMessageAt = &t
	}
	if v.LastMessage != nil {
		dto := messageToDTO(v.LastMessage)
		d.LastMessage = &dto
	}
	return d
}

func messageToDTO(m *domain.Message) messageDTO {
	d := messageDTO{
		ID: m.ID, ConversationID: m.ConversationID, SenderID: m.SenderID,
		ClientMsgID: m.ClientMsgID, Kind: string(m.Kind), Body: m.Body,
		ReplyToID: m.ReplyToID, CreatedAt: m.CreatedAt.UnixMilli(),
	}
	if m.EditedAt != nil {
		t := m.EditedAt.UnixMilli()
		d.EditedAt = &t
	}
	if m.DeletedAt != nil {
		t := m.DeletedAt.UnixMilli()
		d.DeletedAt = &t
	}
	if m.ReplyPreview != nil {
		d.ReplyPreview = &replyPreviewDTO{
			MessageID: m.ReplyPreview.MessageID,
			SenderID:  m.ReplyPreview.SenderID,
			Body:      m.ReplyPreview.Body,
			Kind:      m.ReplyPreview.Kind,
			Deleted:   m.ReplyPreview.Deleted,
		}
	}
	if m.MediaID != nil {
		d.MediaID = m.MediaID
		d.MediaMime = m.MediaMime
		d.MediaWidth = m.MediaWidth
		d.MediaHeight = m.MediaHeight
	}
	if len(m.Reactions) > 0 {
		d.Reactions = make([]reactionDTO, len(m.Reactions))
		for i, r := range m.Reactions {
			d.Reactions[i] = reactionDTO{
				UserID: r.UserID, Emoji: r.Emoji,
				CreatedAt: r.CreatedAt.UnixMilli(),
			}
		}
	}
	return d
}

// === handlers: edit + reactions ===

func (h *Handler) editMessage(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	msgID := r.PathValue("id")
	var req editMessageRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	msg, err := h.svc.EditMessage(ctx, actorID, msgID, req.Body)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, messageToDTO(msg))
}

func (h *Handler) addReaction(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	msgID := r.PathValue("id")
	var req addReactionRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.AddReaction(ctx, actorID, msgID, req.Emoji); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) removeReaction(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	msgID := r.PathValue("id")
	emoji := r.PathValue("emoji")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.RemoveReaction(ctx, actorID, msgID, emoji); err != nil {
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
	switch {
	case service.IsNotFound(err):
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	case service.IsForbidden(err):
		writeError(w, http.StatusForbidden, "forbidden", "access denied")
	case service.IsInvalidArg(err):
		writeError(w, http.StatusBadRequest, "invalid_arg", "invalid argument")
	case service.IsSelfTarget(err):
		writeError(w, http.StatusBadRequest, "self_target", "cannot target yourself")
	default:
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
	}
}
