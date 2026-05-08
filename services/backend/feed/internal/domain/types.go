// Package domain — сущности feed (stories + posts позже).
package domain

import (
	"errors"
	"time"
)

type Story struct {
	ID          string
	AuthorID    string
	MediaID     string
	OverlayText *string
	CreatedAt   time.Time
	ExpiresAt   time.Time
	DeletedAt   *time.Time
}

// StoryWithStats — для GET /stories/feed с view-count + флаг "я смотрел".
type StoryWithStats struct {
	Story
	ViewCount int
	IViewed   bool
}

type StoryView struct {
	StoryID  string
	ViewerID string
	ViewedAt time.Time
}

var (
	ErrNotFound   = errors.New("not found")
	ErrForbidden  = errors.New("forbidden")
	ErrInvalidArg = errors.New("invalid argument")
	ErrExpired    = errors.New("story expired")
)

// === Posts (Phase D) ===

type PostKind string

const (
	PostKindText    PostKind = "text"
	PostKindPhoto   PostKind = "photo"
	PostKindSession PostKind = "session"
)

type Post struct {
	ID           string
	AuthorID     string
	Kind         PostKind
	Body         *string // text content / photo caption
	MediaID      *string // для kind=photo
	SessionRef   *string // для kind=session — server-side session_id из activity-sync
	LikeCount    int
	CommentCount int
	CreatedAt    time.Time
	EditedAt     *time.Time
	DeletedAt    *time.Time
}

// PostWithViewerState — для feed: + iLiked.
type PostWithViewerState struct {
	Post
	ILiked bool
}

type PostComment struct {
	ID        string
	PostID    string
	AuthorID  string
	Body      string
	CreatedAt time.Time
	DeletedAt *time.Time
}
