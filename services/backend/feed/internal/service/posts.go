// Posts business logic — Phase 8 / D.
//
// Изолирован от stories.go: разные сущности. Шарят errors + nats.Conn
// через общую Service struct (см. svc.go).
package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/runningecosystem/backend/feed/internal/domain"
	"github.com/runningecosystem/backend/feed/internal/repository/postgres"
	"github.com/runningecosystem/backend/pkg/audit"
	"github.com/runningecosystem/backend/pkg/permissions"
)

// timeNow — abstraction для тестов / стабильности clock.
var timeNow = time.Now

const (
	maxPostBodyLen    = 4000
	maxCommentBodyLen = 2000
	defaultFeedLimit  = 50
	maxFeedLimit      = 100
)

// CreatePostInput — DTO к hadnler уровню; service валидирует поля.
type CreatePostInput struct {
	Kind       domain.PostKind
	Body       *string
	MediaID    *string
	SessionRef *string
}

func (s *Service) CreatePost(
	ctx context.Context, authorID string, in CreatePostInput,
) (*domain.Post, error) {
	// Phase K: ban check + capability.
	subject := s.loadSubject(ctx, authorID)
	if !permissions.Allow(subject, permissions.CapPostCreate, permissions.ResourceContext{}) {
		return nil, domain.ErrForbidden
	}
	// Валидация: kind задаёт обязательные поля.
	switch in.Kind {
	case domain.PostKindText:
		if in.Body == nil {
			return nil, domain.ErrInvalidArg
		}
		t := strings.TrimSpace(*in.Body)
		if t == "" || len(t) > maxPostBodyLen {
			return nil, domain.ErrInvalidArg
		}
		in.Body = &t
		in.MediaID = nil
		in.SessionRef = nil
	case domain.PostKindPhoto:
		if in.MediaID == nil || *in.MediaID == "" {
			return nil, domain.ErrInvalidArg
		}
		if in.Body != nil {
			t := strings.TrimSpace(*in.Body)
			if len(t) > maxPostBodyLen {
				return nil, domain.ErrInvalidArg
			}
			if t == "" {
				in.Body = nil
			} else {
				in.Body = &t
			}
		}
		in.SessionRef = nil
	case domain.PostKindSession:
		if in.SessionRef == nil || *in.SessionRef == "" {
			return nil, domain.ErrInvalidArg
		}
		if in.Body != nil {
			t := strings.TrimSpace(*in.Body)
			if len(t) > maxPostBodyLen {
				return nil, domain.ErrInvalidArg
			}
			if t == "" {
				in.Body = nil
			} else {
				in.Body = &t
			}
		}
		in.MediaID = nil
	default:
		return nil, domain.ErrInvalidArg
	}

	post, err := s.posts.Create(ctx, postgres.CreatePostInput{
		AuthorID:   authorID,
		Kind:       in.Kind,
		Body:       in.Body,
		MediaID:    in.MediaID,
		SessionRef: in.SessionRef,
	})
	if err != nil {
		return nil, err
	}

	if s.nc != nil {
		payload, _ := json.Marshal(map[string]any{
			"event":     "feed.post.created",
			"postId":    post.ID,
			"authorId":  post.AuthorID,
			"kind":      string(post.Kind),
			"createdAt": post.CreatedAt,
		})
		_ = s.nc.Publish("feed.post.created.v1", payload)
	}
	return post, nil
}

func (s *Service) GetPost(ctx context.Context, id string) (*domain.Post, error) {
	return s.posts.GetByID(ctx, id)
}

func (s *Service) DeletePost(ctx context.Context, actorID, postID string) error {
	post, err := s.posts.GetByID(ctx, postID)
	if err != nil {
		return err
	}
	subject := s.loadSubject(ctx, actorID)
	cap := permissions.CapPostDeleteOwn
	if post.AuthorID != actorID {
		cap = permissions.CapPostDeleteOthers
	}
	if !permissions.Allow(subject, cap, permissions.ResourceContext{
		OwnerID: post.AuthorID,
	}) {
		return domain.ErrForbidden
	}
	if err := s.posts.SoftDelete(ctx, postID); err != nil {
		return err
	}
	if s.audit != nil {
		s.audit.LogQuiet(ctx, audit.Entry{
			ActorID:    &actorID,
			Capability: cap,
			Action:     "delete_post",
			TargetKind: "post",
			TargetID:   postID,
			Metadata: map[string]any{
				"author_id": post.AuthorID,
				"kind":      string(post.Kind),
			},
		})
	}
	return nil
}

// HomeFeed — chronological. Cursor-pagination.
func (s *Service) HomeFeed(
	ctx context.Context, userID, cursor string, limit int,
) ([]*domain.PostWithViewerState, string, error) {
	if limit <= 0 || limit > maxFeedLimit {
		limit = defaultFeedLimit
	}
	return s.posts.HomeFeed(ctx, userID, cursor, limit)
}

// === Likes ===

func (s *Service) LikePost(ctx context.Context, userID, postID string) error {
	post, err := s.posts.GetByID(ctx, postID)
	if err != nil {
		return err
	}
	added, err := s.posts.AddLike(ctx, postID, userID)
	if err != nil {
		return err
	}
	if added && s.nc != nil {
		payload, _ := json.Marshal(map[string]any{
			"event":    "feed.post.liked",
			"postId":   postID,
			"authorId": post.AuthorID,
			"userId":   userID,
		})
		// Generic broadcast (для будущих consumers / debug stream).
		_ = s.nc.Publish("feed.post.liked.v1", payload)
		// Targeted realtime delivery: WS author получит instant; notifications
		// сервис конвертит в Expo Push если author offline. Skip self-likes.
		if post.AuthorID != userID {
			_ = s.nc.Publish("rt.user."+post.AuthorID, payload)
		}
	}
	return nil
}

func (s *Service) UnlikePost(ctx context.Context, userID, postID string) error {
	return s.posts.RemoveLike(ctx, postID, userID)
}

// === Comments ===

func (s *Service) CommentOnPost(
	ctx context.Context, authorID, postID, body string,
) (*domain.PostComment, error) {
	subject := s.loadSubject(ctx, authorID)
	if !permissions.Allow(subject, permissions.CapCommentCreate, permissions.ResourceContext{}) {
		return nil, domain.ErrForbidden
	}
	body = strings.TrimSpace(body)
	if body == "" || len(body) > maxCommentBodyLen {
		return nil, domain.ErrInvalidArg
	}
	post, err := s.posts.GetByID(ctx, postID)
	if err != nil {
		return nil, err
	}
	c, err := s.posts.CreateComment(ctx, postID, authorID, body)
	if err != nil {
		return nil, err
	}
	if s.nc != nil {
		payload, _ := json.Marshal(map[string]any{
			"event":        "feed.post.commented",
			"postId":       postID,
			"commentId":    c.ID,
			"postAuthorId": post.AuthorID,
			"commenterId":  authorID,
			"body":         c.Body,
		})
		_ = s.nc.Publish("feed.post.commented.v1", payload)
		// Targeted realtime + push для post author (если не self-comment).
		if post.AuthorID != authorID {
			_ = s.nc.Publish("rt.user."+post.AuthorID, payload)
		}
	}
	return c, nil
}

func (s *Service) ListComments(
	ctx context.Context, postID, cursor string, limit int,
) ([]*domain.PostComment, string, error) {
	if limit <= 0 || limit > maxFeedLimit {
		limit = defaultFeedLimit
	}
	return s.posts.ListComments(ctx, postID, cursor, limit)
}

// DeleteComment — owner-of-comment OR owner-of-post OR global moderator/admin.
func (s *Service) DeleteComment(
	ctx context.Context, actorID, postID, commentID string,
) error {
	c, err := s.posts.GetComment(ctx, commentID)
	if err != nil {
		return err
	}
	if c.PostID != postID {
		return domain.ErrNotFound
	}
	subject := s.loadSubject(ctx, actorID)

	var usedCap permissions.Capability
	allowed := false

	// Path 1: автор коммента — DeleteOwn capability.
	if c.AuthorID == actorID {
		if permissions.Allow(subject, permissions.CapCommentDeleteOwn,
			permissions.ResourceContext{OwnerID: c.AuthorID}) {
			allowed = true
			usedCap = permissions.CapCommentDeleteOwn
		}
	}

	if !allowed {
		// Path 2: post-owner — на свой пост может удалять чужие комменты.
		post, err := s.posts.GetByID(ctx, postID)
		if err != nil {
			return err
		}
		if post.AuthorID == actorID && !subject.IsBanned(timeNow()) {
			allowed = true
			usedCap = permissions.CapCommentDeleteOthers // Treated as moderation by post-owner.
		}
	}

	if !allowed {
		// Path 3: global moderator / admin.
		if permissions.Allow(subject, permissions.CapCommentDeleteOthers,
			permissions.ResourceContext{OwnerID: c.AuthorID}) {
			allowed = true
			usedCap = permissions.CapCommentDeleteOthers
		}
	}

	if !allowed {
		return domain.ErrForbidden
	}
	if err := s.posts.SoftDeleteComment(ctx, commentID); err != nil {
		return err
	}
	if s.audit != nil {
		s.audit.LogQuiet(ctx, audit.Entry{
			ActorID:    &actorID,
			Capability: usedCap,
			Action:     "delete_comment",
			TargetKind: "comment",
			TargetID:   commentID,
			Metadata: map[string]any{
				"post_id":           postID,
				"comment_author_id": c.AuthorID,
			},
		})
	}
	return nil
}
