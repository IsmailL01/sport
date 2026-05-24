// Package service — бизнес-логика media (presign, complete, get, delete).
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/runningecosystem/backend/media/internal/domain"
	"github.com/runningecosystem/backend/media/internal/repository/postgres"
	"github.com/runningecosystem/backend/media/internal/s3"
)

type Service struct {
	repo *postgres.MediaRepo
	s3   *s3.Client
}

func New(repo *postgres.MediaRepo, s3c *s3.Client) *Service {
	return &Service{repo: repo, s3: s3c}
}

type InitUploadInput struct {
	OwnerID   string
	Kind      domain.MediaKind
	Mime      string
	SizeBytes int64
}

type InitUploadOutput struct {
	MediaID    string
	UploadURL  string
	Key        string
	ExpiresInS int
}

func (s *Service) InitUpload(ctx context.Context, in InitUploadInput) (*InitUploadOutput, error) {
	switch in.Kind {
	case domain.KindImage, domain.KindVideo, domain.KindAudio:
	default:
		return nil, domain.ErrInvalidArg
	}
	if in.SizeBytes <= 0 {
		return nil, domain.ErrInvalidArg
	}
	maxBytes := domain.MaxBytesForKind(in.Kind)
	if in.SizeBytes > maxBytes {
		return nil, domain.ErrTooLarge
	}
	if !validateMime(in.Kind, in.Mime) {
		return nil, domain.ErrInvalidArg
	}

	// S3 key: <owner>/<kind>/<uuid>.<ext>
	ext := mimeToExt(in.Mime)
	key := fmt.Sprintf("%s/%s/%s%s", in.OwnerID, in.Kind, uuid.New().String(), ext)

	// Persist row first (status=pending).
	m := &domain.Media{
		OwnerID:   in.OwnerID,
		Kind:      in.Kind,
		Mime:      in.Mime,
		SizeBytes: in.SizeBytes,
		S3Key:     key,
	}
	if err := s.repo.Create(ctx, m); err != nil {
		return nil, err
	}

	uploadURL, err := s.s3.PresignedPut(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("presign put: %w", err)
	}
	return &InitUploadOutput{
		MediaID:    m.ID,
		UploadURL:  uploadURL,
		Key:        key,
		ExpiresInS: int(s3.UploadTTL.Seconds()),
	}, nil
}

type CompleteInput struct {
	MediaID    string
	OwnerID    string
	Width      *int
	Height     *int
	DurationMs *int
}

func (s *Service) CompleteUpload(ctx context.Context, in CompleteInput) (*domain.Media, error) {
	m, err := s.repo.GetByID(ctx, in.MediaID)
	if err != nil {
		return nil, err
	}
	if m.OwnerID != in.OwnerID {
		return nil, domain.ErrForbidden
	}
	if m.Status != domain.StatusPending {
		// Already completed or failed — return current state.
		return m, nil
	}
	// Verify upload landed.
	size, exists, err := s.s3.StatObject(ctx, m.S3Key)
	if err != nil {
		return nil, fmt.Errorf("stat object: %w", err)
	}
	if !exists {
		_ = s.repo.MarkFailed(ctx, m.ID)
		return nil, domain.ErrInvalidArg
	}
	if size != m.SizeBytes {
		// Optional strictness: clients иногда compress before upload, so
		// accept slight mismatch but reject extreme overage.
		if size > m.SizeBytes*2 {
			_ = s.repo.MarkFailed(ctx, m.ID)
			return nil, domain.ErrTooLarge
		}
	}
	updated, err := s.repo.MarkReady(ctx, m.ID, in.Width, in.Height, in.DurationMs)
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (s *Service) GetWithDownloadURL(ctx context.Context, id string) (*domain.Media, string, error) {
	m, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, "", err
	}
	if m.Status != domain.StatusReady {
		return m, "", nil // нет URL пока не готово
	}
	url, err := s.s3.PresignedGet(ctx, m.S3Key)
	if err != nil {
		return nil, "", err
	}
	return m, url, nil
}

func (s *Service) Delete(ctx context.Context, actorID, id string) error {
	m, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if m.OwnerID != actorID {
		return domain.ErrForbidden
	}
	// Best-effort delete S3 object first.
	if err := s.s3.RemoveObject(ctx, m.S3Key); err != nil {
		// Log but continue — DB row deletion важнее.
		_ = err
	}
	return s.repo.Delete(ctx, id)
}

// === helpers ===

func validateMime(kind domain.MediaKind, mime string) bool {
	mime = strings.ToLower(mime)
	switch kind {
	case domain.KindImage:
		return strings.HasPrefix(mime, "image/")
	case domain.KindVideo:
		return strings.HasPrefix(mime, "video/")
	case domain.KindAudio:
		return strings.HasPrefix(mime, "audio/")
	}
	return false
}

func mimeToExt(mime string) string {
	switch strings.ToLower(mime) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/heic":
		return ".heic"
	case "video/mp4":
		return ".mp4"
	case "video/quicktime":
		return ".mov"
	case "video/webm":
		return ".webm"
	case "audio/mpeg", "audio/mp3":
		return ".mp3"
	case "audio/aac":
		return ".aac"
	case "audio/wav":
		return ".wav"
	}
	return ""
}

// Errors helpers.
func IsNotFound(err error) bool   { return errors.Is(err, domain.ErrNotFound) }
func IsForbidden(err error) bool  { return errors.Is(err, domain.ErrForbidden) }
func IsInvalidArg(err error) bool { return errors.Is(err, domain.ErrInvalidArg) }
func IsTooLarge(err error) bool   { return errors.Is(err, domain.ErrTooLarge) }
