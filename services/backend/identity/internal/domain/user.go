// Package domain содержит доменные сущности identity-сервиса.
// Без зависимостей от Postgres / HTTP — только stdlib.
package domain

import (
	"errors"
	"time"
)

// User — зарегистрированный пользователь системы.
// Соответствует ТЗ §4.2 (минимальный набор Phase 2). В Phase 4
// добавляется отдельная сущность Athlete с физическими параметрами.
type User struct {
	ID           string
	Email        string
	PasswordHash string
	DisplayName  string
	Locale       string
	Timezone     string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// RefreshToken — выпущенный refresh-токен. Хранится захэшированным,
// сравнивается ConstantTime.
type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	RevokedAt *time.Time
	CreatedAt time.Time
	UserAgent string
}

// Доменные ошибки. HTTP-handler конвертирует их в коды.
var (
	ErrUserNotFound       = errors.New("user not found")
	ErrEmailAlreadyExists = errors.New("email already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrTokenNotFound      = errors.New("refresh token not found")
	ErrTokenRevoked       = errors.New("refresh token revoked")
	ErrTokenExpired       = errors.New("refresh token expired")
)
