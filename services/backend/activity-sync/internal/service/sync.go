// Package service — бизнес-логика activity-sync.
//
// Принципы (ТЗ §3, §5.4):
//   - Всё мульти-tenant: каждое чтение/запись фильтруется по userID из JWT.
//   - Multi-device sync: upsert по (user_id, client_session_id) идемпотентен.
//   - Append-only points: при конфликте (session_id, ts) — silent skip.
package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/runningecosystem/backend/activity-sync/internal/domain"
	"github.com/runningecosystem/backend/activity-sync/internal/repository"
)

type SyncService struct {
	sessions repository.SessionRepo
	points   repository.PointRepo
}

func NewSyncService(sessions repository.SessionRepo, points repository.PointRepo) *SyncService {
	return &SyncService{sessions: sessions, points: points}
}

// UpsertSession создаёт или обновляет сессию пользователя.
// Если userID не совпадает с владельцем существующей session с тем же id —
// возвращает ErrForbidden (попытка чужого UUID).
func (s *SyncService) UpsertSession(ctx context.Context, userID string, in *domain.Session) (*domain.Session, error) {
	if userID == "" {
		return nil, domain.ErrForbidden
	}
	in.UserID = userID
	if in.Source == "" {
		in.Source = "phone"
	}
	if err := s.sessions.UpsertByClientID(ctx, in); err != nil {
		return nil, fmt.Errorf("upsert session: %w", err)
	}
	return in, nil
}

// GetSession проверяет владение и возвращает сессию (без точек).
func (s *SyncService) GetSession(ctx context.Context, userID, sessionID string) (*domain.Session, error) {
	sess, err := s.sessions.GetByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if sess.UserID != userID {
		return nil, domain.ErrForbidden
	}
	return sess, nil
}

// ListSessions возвращает сессии пользователя в порядке started_at DESC.
func (s *SyncService) ListSessions(ctx context.Context, userID string, limit int) ([]*domain.Session, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return s.sessions.ListByUser(ctx, userID, limit)
}

// DeleteSession удаляет сессию (вместе с точками — каскадно через FK).
func (s *SyncService) DeleteSession(ctx context.Context, userID, sessionID string) error {
	sess, err := s.sessions.GetByID(ctx, sessionID)
	if err != nil {
		return err
	}
	if sess.UserID != userID {
		return domain.ErrForbidden
	}
	return s.sessions.Delete(ctx, sessionID)
}

// AppendPoints добавляет batch точек в сессию пользователя.
// Возвращает кол-во реально записанных (без учёта дублей по (session_id, ts)).
func (s *SyncService) AppendPoints(ctx context.Context, userID, sessionID string, points []*domain.Point) (int, error) {
	sess, err := s.sessions.GetByID(ctx, sessionID)
	if err != nil {
		return 0, err
	}
	if sess.UserID != userID {
		return 0, domain.ErrForbidden
	}
	if len(points) == 0 {
		return 0, nil
	}
	for _, p := range points {
		if p.Source == "" {
			p.Source = "raw"
		}
		p.SessionID = sessionID
	}
	return s.points.AppendBatch(ctx, sessionID, points)
}

// ListPoints возвращает точки сессии (после проверки владения).
func (s *SyncService) ListPoints(ctx context.Context, userID, sessionID string) ([]*domain.Point, error) {
	sess, err := s.sessions.GetByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if sess.UserID != userID {
		return nil, domain.ErrForbidden
	}
	return s.points.ListBySession(ctx, sessionID)
}

// IsNotFound — helper для handler.
func IsNotFound(err error) bool { return errors.Is(err, domain.ErrSessionNotFound) }

// IsForbidden — helper для handler.
func IsForbidden(err error) bool { return errors.Is(err, domain.ErrForbidden) }
