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
	CreatedAt     time.Time
	UpdatedAt     time.Time
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
type Relation struct {
	IsFollowing  bool
	IsFollower   bool
	IsBlocked    bool
	IsBlockedBy  bool
	CanDM        bool
}

var (
	ErrProfileNotFound = errors.New("profile not found")
	ErrAlreadyExists   = errors.New("relation already exists")
	ErrSelfTarget      = errors.New("cannot target self")
	ErrUsernameTaken   = errors.New("username taken")
	ErrInvalidArg      = errors.New("invalid argument")
	ErrForbidden       = errors.New("forbidden")
)
