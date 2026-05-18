// Package domain — сущности messaging.
package domain

import (
	"errors"
	"time"
)

type ConversationType string

const (
	ConversationDM    ConversationType = "dm"
	ConversationGroup ConversationType = "group"
)

type MemberRole string

const (
	RoleOwner      MemberRole = "owner"
	RoleAdmin      MemberRole = "admin"
	RoleModerator  MemberRole = "moderator"
	RoleMember     MemberRole = "member"
	RoleRestricted MemberRole = "restricted"
)

type Conversation struct {
	ID            string
	Type          ConversationType
	Title         *string
	AvatarMediaID *string
	CreatedBy     string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	LastMessageAt *time.Time
	DeletedAt     *time.Time
}

type Member struct {
	ConversationID    string
	UserID            string
	Role              MemberRole
	JoinedAt          time.Time
	LastReadMessageID *string
	MutedUntil        *time.Time
	NotifLevel        string // all | mentions | none
}

type MessageKind string

const (
	MessageText   MessageKind = "text"
	MessageMedia  MessageKind = "media"
	MessageImage  MessageKind = "image"
	MessageVideo  MessageKind = "video"
	MessageAudio  MessageKind = "audio"
	MessageSystem MessageKind = "system"
)

type Message struct {
	ID             string
	ConversationID string
	SenderID       string
	ClientMsgID    string
	Kind           MessageKind
	Body           *string
	ReplyToID      *string
	MediaID        *string // Phase B3: optional reference в media table
	EditedAt       *time.Time
	DeletedAt      *time.Time
	Flagged        bool
	CreatedAt      time.Time
	// Reactions / ReplyPreview / MediaURL заполняются в ListByConversation
	// для UI; в send/get-by-id остаются nil.
	Reactions    []MessageReaction
	ReplyPreview *MessageReplyPreview
	MediaURL     *string // presigned download URL TTL 1h
	MediaMime    *string
	MediaWidth   *int
	MediaHeight  *int
}

type MessageReaction struct {
	MessageID string
	UserID    string
	Emoji     string
	CreatedAt time.Time
}

// MessageReplyPreview — мини-snapshot reply-target для UI bubble.
type MessageReplyPreview struct {
	MessageID string
	SenderID  string
	Body      *string // первые 80 chars если text; nil для media
	Kind      string
	Deleted   bool
}

// ConversationView — denormalized for list endpoint (last message + unread).
type ConversationView struct {
	Conversation
	MyRole       MemberRole
	MembersCount int
	LastMessage  *Message
	UnreadCount  int
	Muted        bool
}

var (
	ErrConvNotFound = errors.New("conversation not found")
	ErrMsgNotFound  = errors.New("message not found")
	ErrNotMember    = errors.New("not a member of conversation")
	ErrForbidden    = errors.New("forbidden")
	ErrInvalidArg   = errors.New("invalid argument")
	ErrSelfTarget   = errors.New("cannot target self")
)
