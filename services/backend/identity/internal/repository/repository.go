// Package repository определяет интерфейсы хранилища identity-сервиса.
// Реализации — в подпакетах (postgres/, memory/ для тестов).
package repository

import (
	"context"
	"time"

	"github.com/runningecosystem/backend/identity/internal/domain"
)

// UserRepo — хранилище пользователей.
type UserRepo interface {
	Create(ctx context.Context, u *domain.User) error
	GetByID(ctx context.Context, id string) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
}

// RefreshTokenRepo — хранилище refresh-токенов.
type RefreshTokenRepo interface {
	Create(ctx context.Context, t *domain.RefreshToken) error
	GetByHash(ctx context.Context, tokenHash string) (*domain.RefreshToken, error)
	Revoke(ctx context.Context, id string, at time.Time) error
	// RevokeAllForUser — для logout со всех устройств (Phase 4 / settings).
	RevokeAllForUser(ctx context.Context, userID string, at time.Time) error
}
