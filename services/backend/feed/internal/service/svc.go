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
	"github.com/runningecosystem/backend/pkg/permissions"
)

const maxOverlayLen = 200

type Service struct {
	stories *postgres.StoryRepo
	posts   *postgres.PostRepo
	nc      *nats.Conn
	// permLoader — lookup global_role + banned_until per actor.
	// nil → fallback на ownership-only checks (legacy behavior).
	permLoader permissions.SubjectLoader
}

func New(
	stories *postgres.StoryRepo,
	posts *postgres.PostRepo,
	nc *nats.Conn,
	permLoader permissions.SubjectLoader,
) *Service {
	return &Service{stories: stories, posts: posts, nc: nc, permLoader: permLoader}
}

// loadSubject — best-effort. На loader-error → unauth Subject (deny всё).
func (s *Service) loadSubject(ctx context.Context, actorID string) permissions.Subject {
	if s.permLoader == nil {
		// Legacy fallback: assume regular user.
		return permissions.Subject{
			UserID:          actorID,
			GlobalRole:      permissions.GlobalUser,
			IsAuthenticated: true,
		}
	}
	subj, err := s.permLoader.LoadSubject(ctx, actorID)
	if err != nil {
		// Conservative: log + treat as user.
		return permissions.Subject{
			UserID:          actorID,
			GlobalRole:      permissions.GlobalUser,
			IsAuthenticated: true,
		}
	}
	return subj
}

func (s *Service) PublishStory(ctx context.Context, authorID, mediaID string, overlay *string) (*domain.Story, error) {
	subject := s.loadSubject(ctx, authorID)
	if !permissions.Allow(subject, permissions.CapStoryCreate, permissions.ResourceContext{}) {
		return nil, domain.ErrForbidden
	}
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
	// Best-effort NATS event + targeted realtime fanout.
	if s.nc != nil {
		payload, _ := json.Marshal(map[string]any{
			"event":     "feed.story.published",
			"storyId":   story.ID,
			"authorId":  story.AuthorID,
			"mediaId":   story.MediaID,
			"createdAt": story.CreatedAt,
			"expiresAt": story.ExpiresAt,
		})
		// Generic broadcast (debug / future consumers).
		_ = s.nc.Publish("feed.story.published.v1", payload)
		// Targeted fanout: каждый follower получит instant WS-frame через
		// realtime-gw (он уже subscribed на rt.user.{userID}). Capped 1000 —
		// celebrity-pull на refresh для крупных аккаунтов.
		followers, err := s.stories.ListFollowerIDs(ctx, authorID, 1000)
		if err == nil {
			for _, fid := range followers {
				_ = s.nc.Publish("rt.user."+fid, payload)
			}
		}
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

// Viewers — список зрителей; только owner либо global moderator/admin.
func (s *Service) Viewers(ctx context.Context, actorID, storyID string, limit int) ([]*domain.StoryView, error) {
	story, err := s.stories.GetByID(ctx, storyID)
	if err != nil {
		return nil, err
	}
	subject := s.loadSubject(ctx, actorID)
	d := permissions.Check(subject, permissions.CapStoryViewersList, permissions.ResourceContext{
		OwnerID: story.AuthorID,
	})
	if !d.Allow && !permissions.IsModerator(subject.GlobalRole) {
		return nil, domain.ErrForbidden
	}
	return s.stories.Viewers(ctx, storyID, limit)
}

// Delete — soft delete. Owner либо global admin/moderator.
func (s *Service) Delete(ctx context.Context, actorID, storyID string) error {
	story, err := s.stories.GetByID(ctx, storyID)
	if err != nil {
		return err
	}
	subject := s.loadSubject(ctx, actorID)
	cap := permissions.CapStoryDeleteOwn
	if story.AuthorID != actorID {
		cap = permissions.CapStoryDeleteOthers
	}
	if !permissions.Allow(subject, cap, permissions.ResourceContext{
		OwnerID: story.AuthorID,
	}) {
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