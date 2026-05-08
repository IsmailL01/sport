// Package service — feed business logic (stories для Phase C).
package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/nats-io/nats.go"

	"github.com/runningecosystem/backend/feed/internal/domain"
	"github.com/runningecosystem/backend/feed/internal/repository/postgres"
)

const maxOverlayLen = 200

type Service struct {
	stories *postgres.StoryRepo
	posts   *postgres.PostRepo
	nc      *nats.Conn
}

func New(stories *postgres.StoryRepo, posts *postgres.PostRepo, nc *nats.Conn) *Service {
	return &Service{stories: stories, posts: posts, nc: nc}
}

func (s *Service) PublishStory(ctx context.Context, authorID, mediaID string, overlay *string) (*domain.Story, error) {
	if mediaID == "" {
		return nil, domain.ErrInvalidArg
	}
	if overlay != nil {
		t := strings.TrimSpace(*overlay)
		if len(t) > maxOverlayLen {
			return nil, domain.ErrInvalidArg
		}
		if t == "" {
			overlay = nil
		} else {
			overlay = &t
		}
	}
	story, err := s.stories.Create(ctx, authorID, mediaID, overlay)
	if err != nil {
		return nil, err
	}
	// Best-effort NATS event для notifications + future feed-fanout.
	if s.nc != nil {
		payload, _ := json.Marshal(map[string]any{
			"event":     "feed.story.published",
			"storyId":   story.ID,
			"authorId":  story.AuthorID,
			"mediaId":   story.MediaID,
			"createdAt": story.CreatedAt,
			"expiresAt": story.ExpiresAt,
		})
		_ = s.nc.Publish("feed.story.published.v1", payload)
	}
	return story, nil
}

func (s *Service) FeedForUser(ctx context.Context, userID string) ([]*domain.StoryWithStats, error) {
	return s.stories.FeedForUser(ctx, userID)
}

func (s *Service) MyStories(ctx context.Context, authorID string) ([]*domain.StoryWithStats, error) {
	return s.stories.MyStories(ctx, authorID)
}

// MarkViewed — отметить story просмотренной (idempotent ON CONFLICT).
func (s *Service) MarkViewed(ctx context.Context, viewerID, storyID string) error {
	story, err := s.stories.GetByID(ctx, storyID)
	if err != nil {
		return err
	}
	if story.ExpiresAt.Before(time.Now()) {
		return domain.ErrExpired
	}
	// Owner не считается просмотром (не bump-ить view_count для self-view).
	if story.AuthorID == viewerID {
		return nil
	}
	return s.stories.MarkViewed(ctx, storyID, viewerID)
}

// Viewers — список зрителей; только owner может смотреть.
func (s *Service) Viewers(ctx context.Context, actorID, storyID string, limit int) ([]*domain.StoryView, error) {
	story, err := s.stories.GetByID(ctx, storyID)
	if err != nil {
		return nil, err
	}
	if story.AuthorID != actorID {
		return nil, domain.ErrForbidden
	}
	return s.stories.Viewers(ctx, storyID, limit)
}

// Delete — soft delete. Owner only.
func (s *Service) Delete(ctx context.Context, actorID, storyID string) error {
	story, err := s.stories.GetByID(ctx, storyID)
	if err != nil {
		return err
	}
	if story.AuthorID != actorID {
		return domain.ErrForbidden
	}
	return s.stories.SoftDelete(ctx, storyID)
}

// CleanupExpired — вызывается из cron sidecar.
func (s *Service) CleanupExpired(ctx context.Context) (int64, error) {
	n, err := s.stories.CleanupExpired(ctx)
	if err != nil {
		return 0, err
	}
	if n > 0 && s.nc != nil {
		_ = s.nc.Publish("feed.story.expired.v1", []byte(`{"event":"feed.story.expired"}`))
	}
	return n, nil
}

// === errors ===

func IsNotFound(err error) bool   { return errors.Is(err, domain.ErrNotFound) }
func IsForbidden(err error) bool  { return errors.Is(err, domain.ErrForbidden) }
func IsInvalidArg(err error) bool { return errors.Is(err, domain.ErrInvalidArg) }
func IsExpired(err error) bool    { return errors.Is(err, domain.ErrExpired) }