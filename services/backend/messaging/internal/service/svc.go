// Package service — бизнес-логика messaging.
// Phase A2: DM + text. Phase B1: + groups, member management.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/runningecosystem/backend/messaging/internal/domain"
	"github.com/runningecosystem/backend/messaging/internal/permissions"
	"github.com/runningecosystem/backend/messaging/internal/repository/postgres"
)

const maxBodyLen = 4000

type Service struct {
	convs     *postgres.ConversationRepo
	members   *postgres.MemberRepo
	messages  *postgres.MessageRepo
	reactions *postgres.ReactionRepo
	outbox    *postgres.OutboxRepo
}

func New(
	c *postgres.ConversationRepo, m *postgres.MemberRepo,
	msgs *postgres.MessageRepo, rx *postgres.ReactionRepo, ob *postgres.OutboxRepo,
) *Service {
	return &Service{convs: c, members: m, messages: msgs, reactions: rx, outbox: ob}
}

// publishMemberEvent — INSERT outbox-rows для каждого члена с member-event.
// Outbox publisher (sidecar) разошлёт через NATS rt.user.{id}.
// Errors logged silently — outbox events не должны блокировать main op.
func (s *Service) publishMemberEvent(ctx context.Context, eventType string, convID string, payload map[string]any) {
	memberIDs, err := s.members.MemberIDs(ctx, convID)
	if err != nil {
		return
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	for _, mid := range memberIDs {
		_ = s.outbox.Insert(ctx, "rt.user."+mid, body)
	}
	_ = eventType // included в payload["event"] caller-side
}

// FindOrCreateDM — atomic create-or-fetch DM с peerID.
func (s *Service) FindOrCreateDM(ctx context.Context, actorID, peerID string) (*domain.Conversation, bool, error) {
	if actorID == peerID {
		return nil, false, domain.ErrSelfTarget
	}
	return s.convs.FindOrCreateDM(ctx, actorID, peerID)
}

// CreateGroup — создатель становится owner-ом, остальные members.
func (s *Service) CreateGroup(ctx context.Context, creatorID, title string, memberIDs []string) (*domain.Conversation, error) {
	title = strings.TrimSpace(title)
	if title == "" || len(title) > 200 {
		return nil, domain.ErrInvalidArg
	}
	// Dedupe + remove creator из списка (он добавится как owner).
	seen := map[string]bool{creatorID: true}
	clean := make([]string, 0, len(memberIDs))
	for _, id := range memberIDs {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		clean = append(clean, id)
	}
	if len(clean) == 0 {
		return nil, domain.ErrInvalidArg // group без members = просто self-DM
	}
	conv, err := s.convs.CreateGroup(ctx, creatorID, title, clean)
	if err != nil {
		return nil, err
	}
	// Notify all members.
	s.publishMemberEvent(ctx, "conversation.created", conv.ID, map[string]any{
		"event":          "conversation.created",
		"conversationId": conv.ID,
		"type":           "group",
		"title":          title,
		"createdBy":      creatorID,
	})
	return conv, nil
}

// AddMembers — owner/admin adds members to group.
func (s *Service) AddMembers(ctx context.Context, actorID, convID string, userIDs []string) error {
	_, actorRole, err := s.members.IsMember(ctx, convID, actorID)
	if err != nil {
		return err
	}
	if actorRole == "" {
		return domain.ErrNotMember
	}
	if !permissions.CanAddMember(actorRole) {
		return domain.ErrForbidden
	}
	for _, uid := range userIDs {
		if uid == "" || uid == actorID {
			continue
		}
		if err := s.members.AddMember(ctx, convID, uid, domain.RoleMember); err != nil {
			return err
		}
		s.publishMemberEvent(ctx, "member.added", convID, map[string]any{
			"event":          "member.added",
			"conversationId": convID,
			"userId":         uid,
			"role":           "member",
			"addedBy":        actorID,
		})
	}
	return nil
}

// RemoveMember — kick (если actor != target) или self-leave (actor == target).
func (s *Service) RemoveMember(ctx context.Context, actorID, convID, targetID string) error {
	_, actorRole, err := s.members.IsMember(ctx, convID, actorID)
	if err != nil {
		return err
	}
	if actorRole == "" {
		return domain.ErrNotMember
	}
	_, targetRole, err := s.members.IsMember(ctx, convID, targetID)
	if err != nil {
		return err
	}
	if targetRole == "" {
		return domain.ErrNotMember
	}

	if actorID == targetID {
		// Self-leave; check owner uniqueness.
		ownerCount, err := s.members.CountByRole(ctx, convID, domain.RoleOwner)
		if err != nil {
			return err
		}
		if !permissions.CanSelfLeave(actorRole, ownerCount) {
			return domain.ErrForbidden
		}
	} else {
		if !permissions.CanRemoveMember(actorRole, targetRole) {
			return domain.ErrForbidden
		}
	}

	if err := s.members.RemoveMember(ctx, convID, targetID); err != nil {
		return err
	}
	s.publishMemberEvent(ctx, "member.removed", convID, map[string]any{
		"event":          "member.removed",
		"conversationId": convID,
		"userId":         targetID,
		"removedBy":      actorID,
		"selfLeave":      actorID == targetID,
	})
	return nil
}

// ChangeRole.
func (s *Service) ChangeRole(ctx context.Context, actorID, convID, targetID string, newRole domain.MemberRole) error {
	_, actorRole, err := s.members.IsMember(ctx, convID, actorID)
	if err != nil {
		return err
	}
	if actorRole == "" {
		return domain.ErrNotMember
	}
	_, targetCurrent, err := s.members.IsMember(ctx, convID, targetID)
	if err != nil {
		return err
	}
	if targetCurrent == "" {
		return domain.ErrNotMember
	}
	if !permissions.CanChangeRole(actorRole, targetCurrent, newRole, actorID == targetID) {
		return domain.ErrForbidden
	}
	if err := s.members.UpdateRole(ctx, convID, targetID, newRole); err != nil {
		return err
	}
	s.publishMemberEvent(ctx, "role.changed", convID, map[string]any{
		"event":          "role.changed",
		"conversationId": convID,
		"userId":         targetID,
		"role":           string(newRole),
		"changedBy":      actorID,
	})
	return nil
}

// UpdateConversationMeta — title / avatar (admin/owner only).
func (s *Service) UpdateConversationMeta(ctx context.Context, actorID, convID string, title *string, avatarMediaID *string) (*domain.Conversation, error) {
	_, actorRole, err := s.members.IsMember(ctx, convID, actorID)
	if err != nil {
		return nil, err
	}
	if actorRole == "" {
		return nil, domain.ErrNotMember
	}
	if !permissions.CanRenameConversation(actorRole) {
		return nil, domain.ErrForbidden
	}
	if title != nil {
		t := strings.TrimSpace(*title)
		if t == "" || len(t) > 200 {
			return nil, domain.ErrInvalidArg
		}
		title = &t
	}
	conv, err := s.convs.UpdateMeta(ctx, convID, title, avatarMediaID)
	if err != nil {
		return nil, err
	}
	s.publishMemberEvent(ctx, "conversation.meta", convID, map[string]any{
		"event":          "conversation.meta",
		"conversationId": convID,
		"title":          conv.Title,
		"avatarMediaId":  conv.AvatarMediaID,
		"updatedBy":      actorID,
	})
	return conv, nil
}

// ListMembers — для UI ChatSettingsScreen.
func (s *Service) ListMembers(ctx context.Context, actorID, convID string) ([]*domain.Member, error) {
	isMember, _, err := s.members.IsMember(ctx, convID, actorID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, domain.ErrNotMember
	}
	return s.members.ListMembers(ctx, convID)
}

// ListConversations — мои чаты, sorted by last_message_at desc.
func (s *Service) ListConversations(ctx context.Context, userID string, limit int) ([]*domain.ConversationView, error) {
	return s.convs.ListForUser(ctx, userID, limit)
}

// GetConversation — fetch одного чата с проверкой membership.
func (s *Service) GetConversation(ctx context.Context, actorID, convID string) (*domain.Conversation, error) {
	isMember, _, err := s.members.IsMember(ctx, convID, actorID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, domain.ErrNotMember
	}
	return s.convs.GetByID(ctx, convID)
}

type SendMessageInput struct {
	ConvID      string
	SenderID    string
	ClientMsgID string
	Kind        domain.MessageKind
	Body        *string
	ReplyToID   *string
}

// SendMessage — POST /conversations/{id}/messages.
// Возвращает (message, isNew). isNew=false если идемпотентный hit по client_msg_id.
func (s *Service) SendMessage(ctx context.Context, in SendMessageInput) (*domain.Message, bool, error) {
	if in.ClientMsgID == "" {
		return nil, false, domain.ErrInvalidArg
	}
	if in.Kind == "" {
		in.Kind = domain.MessageText
	}
	if in.Kind == domain.MessageText {
		if in.Body == nil || strings.TrimSpace(*in.Body) == "" {
			return nil, false, domain.ErrInvalidArg
		}
		if len(*in.Body) > maxBodyLen {
			return nil, false, domain.ErrInvalidArg
		}
	}

	isMember, _, err := s.members.IsMember(ctx, in.ConvID, in.SenderID)
	if err != nil {
		return nil, false, err
	}
	if !isMember {
		return nil, false, domain.ErrNotMember
	}

	memberIDs, err := s.members.MemberIDs(ctx, in.ConvID)
	if err != nil {
		return nil, false, err
	}

	return s.messages.SendInTx(ctx, in.ConvID, in.SenderID, in.ClientMsgID,
		in.Kind, in.Body, in.ReplyToID, memberIDs)
}

func (s *Service) ListMessages(ctx context.Context, actorID, convID string, before *int64, limit int) ([]*domain.Message, error) {
	isMember, _, err := s.members.IsMember(ctx, convID, actorID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, domain.ErrNotMember
	}
	var beforeT *time.Time = nil
	if before != nil {
		t := time.UnixMilli(*before)
		beforeT = &t
	}
	msgs, err := s.messages.ListByConversation(ctx, convID, beforeT, limit)
	if err != nil {
		return nil, err
	}
	// Enrich: reactions + reply previews одним batch-запросом каждый.
	ids := make([]string, len(msgs))
	for i, m := range msgs {
		ids[i] = m.ID
	}
	reactionsByMsg, err := s.reactions.ListForMessages(ctx, ids)
	if err != nil {
		return nil, err
	}
	previewsByMsg, err := s.messages.LoadReplyPreviews(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, m := range msgs {
		m.Reactions = reactionsByMsg[m.ID]
		if p, ok := previewsByMsg[m.ID]; ok {
			m.ReplyPreview = p
		}
	}
	return msgs, nil
}

// === Edits ===

const editWindow = 24 * time.Hour

func (s *Service) EditMessage(ctx context.Context, actorID, msgID, newBody string) (*domain.Message, error) {
	newBody = strings.TrimSpace(newBody)
	if newBody == "" || len(newBody) > maxBodyLen {
		return nil, domain.ErrInvalidArg
	}
	m, err := s.messages.GetByID(ctx, msgID)
	if err != nil {
		return nil, err
	}
	if m.DeletedAt != nil {
		return nil, domain.ErrMsgNotFound
	}
	if m.SenderID != actorID {
		return nil, domain.ErrForbidden
	}
	if time.Since(m.CreatedAt) > editWindow {
		return nil, domain.ErrForbidden
	}
	memberIDs, err := s.members.MemberIDs(ctx, m.ConversationID)
	if err != nil {
		return nil, err
	}
	return s.messages.Edit(ctx, msgID, newBody, memberIDs)
}

// === Reactions ===

func (s *Service) AddReaction(ctx context.Context, actorID, msgID, emoji string) error {
	if emoji == "" || len(emoji) > 16 {
		return domain.ErrInvalidArg
	}
	m, err := s.messages.GetByID(ctx, msgID)
	if err != nil {
		return err
	}
	isMember, _, err := s.members.IsMember(ctx, m.ConversationID, actorID)
	if err != nil {
		return err
	}
	if !isMember {
		return domain.ErrNotMember
	}
	added, err := s.reactions.Add(ctx, msgID, actorID, emoji)
	if err != nil {
		return err
	}
	if added {
		s.publishMemberEvent(ctx, "reaction.added", m.ConversationID, map[string]any{
			"event":          "reaction.added",
			"messageId":      msgID,
			"conversationId": m.ConversationID,
			"userId":         actorID,
			"emoji":          emoji,
		})
	}
	return nil
}

func (s *Service) RemoveReaction(ctx context.Context, actorID, msgID, emoji string) error {
	m, err := s.messages.GetByID(ctx, msgID)
	if err != nil {
		return err
	}
	isMember, _, err := s.members.IsMember(ctx, m.ConversationID, actorID)
	if err != nil {
		return err
	}
	if !isMember {
		return domain.ErrNotMember
	}
	if err := s.reactions.Remove(ctx, msgID, actorID, emoji); err != nil {
		return err
	}
	s.publishMemberEvent(ctx, "reaction.removed", m.ConversationID, map[string]any{
		"event":          "reaction.removed",
		"messageId":      msgID,
		"conversationId": m.ConversationID,
		"userId":         actorID,
		"emoji":          emoji,
	})
	return nil
}

func (s *Service) MarkRead(ctx context.Context, actorID, convID, lastReadMessageID string) error {
	isMember, _, err := s.members.IsMember(ctx, convID, actorID)
	if err != nil {
		return err
	}
	if !isMember {
		return domain.ErrNotMember
	}
	return s.members.MarkRead(ctx, convID, actorID, lastReadMessageID)
}

func (s *Service) DeleteMessage(ctx context.Context, actorID, msgID string) error {
	msg, err := s.messages.GetByID(ctx, msgID)
	if err != nil {
		return err
	}
	if msg.DeletedAt != nil {
		return domain.ErrMsgNotFound
	}
	// Свои — всегда можно. Чужие — owner/admin/moderator (Phase B1).
	if msg.SenderID != actorID {
		_, role, err := s.members.IsMember(ctx, msg.ConversationID, actorID)
		if err != nil {
			return err
		}
		if !permissions.CanDeleteOthersMessage(role) {
			return domain.ErrForbidden
		}
	}
	memberIDs, err := s.members.MemberIDs(ctx, msg.ConversationID)
	if err != nil {
		return err
	}
	return s.messages.SoftDelete(ctx, msgID, actorID, memberIDs)
}

// === error helpers ===

func IsNotFound(err error) bool {
	return errors.Is(err, domain.ErrConvNotFound) || errors.Is(err, domain.ErrMsgNotFound)
}
func IsForbidden(err error) bool {
	return errors.Is(err, domain.ErrForbidden) || errors.Is(err, domain.ErrNotMember)
}
func IsInvalidArg(err error) bool { return errors.Is(err, domain.ErrInvalidArg) }
func IsSelfTarget(err error) bool { return errors.Is(err, domain.ErrSelfTarget) }
