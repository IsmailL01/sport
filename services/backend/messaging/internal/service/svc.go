// Package service — бизнес-логика messaging.
// Phase A2 MVP: DM only, text only, no reactions/replies/edits.
package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/runningecosystem/backend/messaging/internal/domain"
	"github.com/runningecosystem/backend/messaging/internal/repository/postgres"
)

const maxBodyLen = 4000

type Service struct {
	convs    *postgres.ConversationRepo
	members  *postgres.MemberRepo
	messages *postgres.MessageRepo
}

func New(c *postgres.ConversationRepo, m *postgres.MemberRepo, msgs *postgres.MessageRepo) *Service {
	return &Service{convs: c, members: m, messages: msgs}
}

// FindOrCreateDM — atomic create-or-fetch DM с peerID.
func (s *Service) FindOrCreateDM(ctx context.Context, actorID, peerID string) (*domain.Conversation, bool, error) {
	if actorID == peerID {
		return nil, false, domain.ErrSelfTarget
	}
	return s.convs.FindOrCreateDM(ctx, actorID, peerID)
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
	return s.messages.ListByConversation(ctx, convID, beforeT, limit)
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
	// Phase A: only own messages. Phase E расширит admin/moderator capabilities.
	if msg.SenderID != actorID {
		return domain.ErrForbidden
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
