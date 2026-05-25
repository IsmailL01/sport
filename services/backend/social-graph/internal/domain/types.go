// Package domain — сущности и ошибки social-graph сервиса.
package domain

import (
	"errors"
	"time"
)

// Profile — социальное «лицо» пользователя (расширение users из identity).
// user_id == users.id; auto-create lazy при первом GET (если ещё нет в profiles).
type Profile struct {
	UserID        string
	Username      *string // CITEXT UNIQUE; nil если ещё не задал
	DisplayName   *string
	Bio           *string
	AvatarMediaID *string
	Privacy       string // public | followers | private
	GlobalRole    string // user | premium | moderator | admin
	BannedUntil   *time.Time
	LastSeenAt    *time.Time
	// Phase M3: gamification.
	XPTotal   int    // cumulative xp; updated by activity-sync on finalize
	Grade     string // cached grade letter (D / D+ / C / ... / S)
	Verified  bool   // KYC / verified runner status (CTA gate)
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Follow — отношение «follower следит за followee».
type Follow struct {
	FollowerID string
	FolloweeID string
	CreatedAt  time.Time
}

// Block — блокировка одним пользователем другого.
type Block struct {
	BlockerID string
	BlockedID string
	CreatedAt time.Time
}

// Relation — агрегированное отношение между двумя пользователями (для UI button-state).
//
// 2026-05-25 Phase 10 / ADR-0011 Amendment 6: extended with friend-request fields.
// CanDM remains the canonical "can I message this user" boolean; it now derives
// from are_friends() check (existence of accepted friend_requests row) instead
// of a manually-set permission.
type Relation struct {
	IsFollowing bool
	IsFollower  bool
	IsBlocked   bool
	IsBlockedBy bool
	CanDM       bool
	// Friend-request state for UI rendering (Phase 10):
	//   none      — neither user has sent a request
	//   pending_outgoing — I sent a request, awaiting receiver
	//   pending_incoming — they sent me a request, awaiting my accept/reject
	//   accepted  — friends (CanDM=true)
	//   rejected  — request was rejected (either side may re-send)
	//   cancelled — sender cancelled own pending
	FriendStatus string
	// FriendRequestID — present iff FriendStatus is pending_*; used for accept/reject calls.
	FriendRequestID string
}

// === Phase 10 / FRIEND-REQUEST-FLOW ===

type FriendRequestStatus string

const (
	FriendRequestPending   FriendRequestStatus = "pending"
	FriendRequestAccepted  FriendRequestStatus = "accepted"
	FriendRequestRejected  FriendRequestStatus = "rejected"
	FriendRequestCancelled FriendRequestStatus = "cancelled"
)

// FriendRequest — one row of friend_requests table.
type FriendRequest struct {
	ID          string
	SenderID    string
	ReceiverID  string
	Status      FriendRequestStatus
	CreatedAt   time.Time
	RespondedAt *time.Time
}

var (
	ErrProfileNotFound         = errors.New("profile not found")
	ErrAlreadyExists           = errors.New("relation already exists")
	ErrSelfTarget              = errors.New("cannot target self")
	ErrUsernameTaken           = errors.New("username taken")
	ErrInvalidArg              = errors.New("invalid argument")
	ErrForbidden               = errors.New("forbidden")
	ErrNotFound                = errors.New("not found")
	ErrFriendRequestExists     = errors.New("friend request already pending")
	ErrAlreadyFriends          = errors.New("users are already friends")
	ErrFriendRequestNotPending = errors.New("friend request not pending")
	ErrFriendRequestNotOwned   = errors.New("not authorized for this friend request")
)

// === Phase 8 / E: модерация ===

type ReportTargetKind string

const (
	ReportTargetMessage ReportTargetKind = "message"
	ReportTargetPost    ReportTargetKind = "post"
	ReportTargetComment ReportTargetKind = "comment"
	ReportTargetStory   ReportTargetKind = "story"
	ReportTargetUser    ReportTargetKind = "user"
)

type ReportReason string

const (
	ReasonSpam       ReportReason = "spam"
	ReasonHarassment ReportReason = "harassment"
	ReasonNudity     ReportReason = "nudity"
	ReasonViolence   ReportReason = "violence"
	ReasonIllegal    ReportReason = "illegal"
	ReasonOther      ReportReason = "other"
)

type ReportStatus string

const (
	ReportOpen        ReportStatus = "open"
	ReportUnderReview ReportStatus = "under_review"
	ReportResolved    ReportStatus = "resolved"
	ReportRejected    ReportStatus = "rejected"
)

type ResolutionAction string

const (
	ResolveDelete   ResolutionAction = "delete"
	ResolveWarn     ResolutionAction = "warn"
	ResolveBan      ResolutionAction = "ban"
	ResolveMute     ResolutionAction = "mute"
	ResolveNoAction ResolutionAction = "no_action"
)

type Report struct {
	ID               string
	ReporterID       string
	TargetKind       ReportTargetKind
	TargetID         string
	Reason           ReportReason
	Body             *string
	Status           ReportStatus
	ResolutionAction *ResolutionAction
	ResolvedAt       *time.Time
	ResolvedBy       *string
	CreatedAt        time.Time
}

// AuditEntry — append-only журнал действий админов / системных делитов.
type AuditEntry struct {
	ID         int64
	ActorID    *string
	Action     string
	TargetKind string
	TargetID   string
	Before     []byte // JSON raw
	After      []byte // JSON raw
	Metadata   []byte // JSON raw
	CreatedAt  time.Time
}

// IsAdminRole — wrapper над pkg/permissions для legacy callers.
// Новый код должен использовать permissions.IsModerator() напрямую.
func IsAdminRole(role string) bool {
	return role == "moderator" || role == "admin"
}
