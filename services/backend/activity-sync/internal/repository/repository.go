// Package repository — интерфейсы хранилища activity-sync.
package repository

import (
	"context"

	"github.com/runningecosystem/backend/activity-sync/internal/domain"
)

// SessionRepo — CRUD сессий.
type SessionRepo interface {
	// UpsertByClientID — атомарно создаёт или обновляет сессию по
	// (user_id, client_session_id). Идемпотентно — outbox клиента
	// может re-send один и тот же session.
	UpsertByClientID(ctx context.Context, s *domain.Session) error

	GetByID(ctx context.Context, id string) (*domain.Session, error)

	ListByUser(ctx context.Context, userID string, limit int) ([]*domain.Session, error)

	Delete(ctx context.Context, id string) error
}

// PointRepo — append-only хранилище точек time-series.
type PointRepo interface {
	// AppendBatch — batch insert. Конфликты по (session_id, ts) игнорируются.
	// Возвращает кол-во вставленных строк.
	AppendBatch(ctx context.Context, sessionID string, points []*domain.Point) (int, error)

	// ListBySession — все точки сессии в порядке времени.
	ListBySession(ctx context.Context, sessionID string) ([]*domain.Point, error)
}
