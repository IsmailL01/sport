// Package service — бизнес-логика social-graph (profiles, follows, blocks, search, relations).
package service

import (
	"context"
	"errors"
	"strings"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
	"github.com/runningecosystem/backend/social-graph/internal/repository/postgres"
)

type Service struct {
	profiles   *postgres.ProfileRepo
	follows    *postgres.FollowRepo
	blocks     *postgres.BlockRepo
	reports    *postgres.ReportRepo
	audit      *postgres.AuditRepo
	friendReqs *postgres.FriendRequestRepo
}

func New(
	profiles *postgres.ProfileRepo,
	follows *postgres.FollowRepo,
	blocks *postgres.BlockRepo,
	reports *postgres.ReportRepo,
	audit *postgres.AuditRepo,
	friendReqs *postgres.FriendRequestRepo,
) *Service {
	return &Service{
		profiles: profiles, follows: follows, blocks: blocks,
		reports: reports, audit: audit,
		friendReqs: friendReqs,
	}
}

// GetProfile — получить профиль пользователя; lazy-create если ещё нет.
func (s *Service) GetProfile(ctx context.Context, userID string) (*domain.Profile, error) {
	prof, err := s.profiles.GetByID(ctx, userID)
	if errors.Is(err, domain.ErrProfileNotFound) {
		// Lazy-create. Если у пользователя есть row в users — создастся; иначе остаётся NotFound.
		if err := s.profiles.EnsureExists(ctx, userID); err != nil {
			return nil, err
		}
		prof, err = s.profiles.GetByID(ctx, userID)
	}
	if err != nil {
		return nil, err
	}
	return prof, nil
}

// PatchOwnProfile — редактирование своего профиля.
func (s *Service) PatchOwnProfile(ctx context.Context, userID string, p postgres.ProfilePatch) (*domain.Profile, error) {
	// Гарантируем что row есть.
	if err := s.profiles.EnsureExists(ctx, userID); err != nil {
		return nil, err
	}
	// Username нормализация: trim + lowercase. CITEXT в БД делает unique-чек.
	if p.Username != nil {
		u := strings.TrimSpace(*p.Username)
		u = strings.ToLower(u)
		if u != "" && !validUsername(u) {
			return nil, domain.ErrInvalidArg
		}
		p.Username = &u
	}
	if p.Privacy != nil {
		switch *p.Privacy {
		case "public", "followers", "private":
		default:
			return nil, domain.ErrInvalidArg
		}
	}
	return s.profiles.Patch(ctx, userID, p)
}

// validUsername — 3–30 символов, буквы/цифры/_ только.
func validUsername(s string) bool {
	if len(s) < 3 || len(s) > 30 {
		return false
	}
	for _, c := range s {
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '_' && c != '-' {
			return false
		}
	}
	return true
}

func (s *Service) Search(ctx context.Context, q string, limit int) ([]*domain.Profile, error) {
	q = strings.TrimSpace(q)
	if len(q) < 2 {
		return nil, domain.ErrInvalidArg
	}
	return s.profiles.SearchByQuery(ctx, q, limit)
}

func (s *Service) BulkProfiles(ctx context.Context, ids []string) ([]*domain.Profile, error) {
	return s.profiles.BulkGet(ctx, ids)
}

// Follow — actor подписывается на targetID.
// Запрет: на себя; если targetID заблокировал actor.
func (s *Service) Follow(ctx context.Context, actorID, targetID string) error {
	if actorID == targetID {
		return domain.ErrSelfTarget
	}
	blocked, err := s.blocks.IsBlocked(ctx, targetID, actorID)
	if err != nil {
		return err
	}
	if blocked {
		return domain.ErrForbidden
	}
	return s.follows.Follow(ctx, actorID, targetID)
}

func (s *Service) Unfollow(ctx context.Context, actorID, targetID string) error {
	return s.follows.Unfollow(ctx, actorID, targetID)
}

// Block — actor блокирует targetID. Side-effect: автоматически удаляются взаимные подписки.
func (s *Service) Block(ctx context.Context, actorID, targetID string) error {
	if actorID == targetID {
		return domain.ErrSelfTarget
	}
	if err := s.blocks.Block(ctx, actorID, targetID); err != nil {
		return err
	}
	// Удаляем follow в обе стороны (best-effort).
	_ = s.follows.Unfollow(ctx, actorID, targetID)
	_ = s.follows.Unfollow(ctx, targetID, actorID)
	// Phase E: audit log (best-effort — не fail-ить block если audit упал).
	if s.audit != nil {
		_ = s.audit.Log(ctx, postgres.AuditInput{
			ActorID:    &actorID,
			Action:     "block_user",
			TargetKind: "user",
			TargetID:   targetID,
		})
	}
	return nil
}

func (s *Service) Unblock(ctx context.Context, actorID, targetID string) error {
	if err := s.blocks.Unblock(ctx, actorID, targetID); err != nil {
		return err
	}
	if s.audit != nil {
		_ = s.audit.Log(ctx, postgres.AuditInput{
			ActorID:    &actorID,
			Action:     "unblock_user",
			TargetKind: "user",
			TargetID:   targetID,
		})
	}
	return nil
}

func (s *Service) ListBlocked(ctx context.Context, actorID string, limit int) ([]string, error) {
	return s.blocks.ListBlocked(ctx, actorID, limit)
}

// GetRelation — для UI: что показать на ProfileScreen чужого юзера.
//
// 2026-05-25 Phase 10 / ADR-0011 Amendment 6:
// CanDM теперь derives from are_friends(actor, target) AND no-block. Extended
// FriendStatus + FriendRequestID fields populated so client can render the
// right button state (Send / Pending / Accept / Friends).
func (s *Service) GetRelation(ctx context.Context, actorID, targetID string) (*domain.Relation, error) {
	rel := &domain.Relation{}
	if actorID == targetID {
		// На свой профиль — нейтральные значения.
		rel.CanDM = true
		rel.FriendStatus = "self"
		return rel, nil
	}
	following, err := s.follows.IsFollowing(ctx, actorID, targetID)
	if err != nil {
		return nil, err
	}
	follower, err := s.follows.IsFollowing(ctx, targetID, actorID)
	if err != nil {
		return nil, err
	}
	blocked, err := s.blocks.IsBlocked(ctx, actorID, targetID)
	if err != nil {
		return nil, err
	}
	blockedBy, err := s.blocks.IsBlocked(ctx, targetID, actorID)
	if err != nil {
		return nil, err
	}

	// Friend-request state lookup (Phase 10). Friends-first, then pending-
	// outgoing, then pending-incoming. Rejected/cancelled don't surface to
	// UI (user can re-send via SendFriendRequest which flips status).
	areFriends, err := s.friendReqs.AreFriends(ctx, actorID, targetID)
	if err != nil {
		return nil, err
	}
	friendStatus := "none"
	friendRequestID := ""
	if areFriends {
		friendStatus = "accepted"
	} else {
		// Check outgoing pending (I sent it).
		if fr, ferr := s.friendReqs.GetByPair(ctx, actorID, targetID); ferr == nil && fr.Status == domain.FriendRequestPending {
			friendStatus = "pending_outgoing"
			friendRequestID = fr.ID
		} else if fr, ferr := s.friendReqs.GetByPair(ctx, targetID, actorID); ferr == nil && fr.Status == domain.FriendRequestPending {
			friendStatus = "pending_incoming"
			friendRequestID = fr.ID
		}
	}

	rel.IsFollowing = following
	rel.IsFollower = follower
	rel.IsBlocked = blocked
	rel.IsBlockedBy = blockedBy
	// CanDM gates on friendship now (Phase 10). No-block enforced regardless.
	rel.CanDM = areFriends && !blocked && !blockedBy
	rel.FriendStatus = friendStatus
	rel.FriendRequestID = friendRequestID
	return rel, nil
}

func (s *Service) Followers(ctx context.Context, userID string, limit int) ([]string, error) {
	return s.follows.Followers(ctx, userID, limit, nil)
}

func (s *Service) Following(ctx context.Context, userID string, limit int) ([]string, error) {
	return s.follows.Following(ctx, userID, limit)
}

func (s *Service) FollowCounts(ctx context.Context, userID string) (followers int, following int, err error) {
	return s.follows.Counts(ctx, userID)
}

// === error helpers (handler-friendly) ===

func IsNotFound(err error) bool {
	return errors.Is(err, domain.ErrProfileNotFound) || errors.Is(err, domain.ErrNotFound)
}
func IsForbidden(err error) bool     { return errors.Is(err, domain.ErrForbidden) }
func IsSelfTarget(err error) bool    { return errors.Is(err, domain.ErrSelfTarget) }
func IsUsernameTaken(err error) bool { return errors.Is(err, domain.ErrUsernameTaken) }
func IsInvalidArg(err error) bool    { return errors.Is(err, domain.ErrInvalidArg) }
