// Package domain — доменная модель activity-sync сервиса.
package domain

import (
	"errors"
	"time"
)

// Session — метаданные одной пробежки. На сервере id — UUID, у клиента
// — BIGINT (Date.now() на момент start). Связь через ClientSessionID.
type Session struct {
	ID              string
	UserID          string
	ClientSessionID int64
	StartedAt       time.Time
	EndedAt         *time.Time
	IsClosed        *bool
	DistanceM       *float64
	AreaM2          *float64
	CalcMethod      *string
	Note            *string
	Source          string
	// AvgHrBpm/MaxHrBpm — агрегированные на клиенте при finalize.
	// Phase 6.5+. Опциональные: nil если HR не записывался.
	AvgHrBpm *float64
	MaxHrBpm *float64
	// CaloriesKcal — MET-estimate, считается на клиенте при finalize.
	CaloriesKcal *float64
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Point — одна GPS-точка. Идентификатор — (SessionID, Timestamp).
type Point struct {
	SessionID string
	Timestamp time.Time
	Latitude  float64
	Longitude float64
	Altitude  *float32
	Accuracy  *float32
	Speed     *float32
	Source    string // raw | kalman | interpolated
}

// Доменные ошибки. HTTP-handler конвертирует их в коды.
var (
	ErrSessionNotFound = errors.New("session not found")
	ErrSessionConflict = errors.New("session conflict")
	ErrForbidden       = errors.New("forbidden")
)
