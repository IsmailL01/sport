// Package domain — сущности media сервиса.
package domain

import (
	"errors"
	"time"
)

type MediaKind string

const (
	KindImage MediaKind = "image"
	KindVideo MediaKind = "video"
	KindAudio MediaKind = "audio"
)

type MediaStatus string

const (
	StatusPending MediaStatus = "pending"
	StatusReady   MediaStatus = "ready"
	StatusFailed  MediaStatus = "failed"
)

type Media struct {
	ID          string
	OwnerID     string
	Kind        MediaKind
	Mime        string
	SizeBytes   int64
	S3Key       string
	Status      MediaStatus
	ThumbKey    *string
	Width       *int
	Height      *int
	DurationMs  *int
	CreatedAt   time.Time
	CompletedAt *time.Time
}

var (
	ErrNotFound   = errors.New("media not found")
	ErrForbidden  = errors.New("forbidden")
	ErrInvalidArg = errors.New("invalid argument")
	ErrTooLarge   = errors.New("file too large")
)

// Limits per kind (bytes).
const (
	MaxImageBytes = 10 * 1024 * 1024  // 10MB
	MaxVideoBytes = 100 * 1024 * 1024 // 100MB
	MaxAudioBytes = 25 * 1024 * 1024  // 25MB
)

func MaxBytesForKind(k MediaKind) int64 {
	switch k {
	case KindImage:
		return MaxImageBytes
	case KindVideo:
		return MaxVideoBytes
	case KindAudio:
		return MaxAudioBytes
	}
	return 0
}
