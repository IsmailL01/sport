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
	ErrNotFound   = errors.New("story not found")
	ErrForbidden  = errors.New("forbidden")
	ErrInvalidArg = errors.New("invalid argument")
	ErrExpired    = errors.New("story expired")
)
