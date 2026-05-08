// Package postgres — pgx-репозитории notifications.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/notifications/internal/domain"
)

// === Devices ===

type DeviceRepo struct {
	pool *pgxpool.Pool
}

func NewDeviceRepo(pool *pgxpool.Pool) *DeviceRepo {
	return &DeviceRepo{pool: pool}
}

// Upsert — idempotent по (user_id, expo_token). Refreshes last_seen.
func (r *DeviceRepo) Upsert(ctx context.Context, userID, expoToken string, platform domain.Platform, deviceID *string) (*domain.PushDevice, error) {
	const sql = `
		INSERT INTO push_devices (user_id, expo_token, platform, device_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (expo_token) DO UPDATE SET
		  user_id = EXCLUDED.user_id,
		  platform = EXCLUDED.platform,
		  device_id = EXCLUDED.device_id,
		  last_seen = now()
		RETURNING id, user_id, expo_token, platform, device_id, last_seen, created_at`
	var d domain.PushDevice
	err := r.pool.QueryRow(ctx, sql, userID, expoToken, platform, deviceID).Scan(
		&d.ID, &d.UserID, &d.ExpoToken, &d.Platform, &d.DeviceID, &d.LastSeen, &d.CreatedAt,
	)
	return &d, err
}

func (r *DeviceRepo) Delete(ctx context.Context, userID, expoToken string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM push_devices WHERE user_id=$1 AND expo_token=$2`,
		userID, expoToken,
	)
	return err
}

// TokensForUser — все registered tokens (для broadcast push на все девайсы).
func (r *DeviceRepo) TokensForUser(ctx context.Context, userID string) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT expo_token FROM push_devices WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// === Notifications ===

type NotificationRepo struct {
	pool *pgxpool.Pool
}

func NewNotificationRepo(pool *pgxpool.Pool) *NotificationRepo {
	return &NotificationRepo{pool: pool}
}

func (r *NotificationRepo) Create(ctx context.Context, userID, kind string, payload []byte) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO notifications (user_id, kind, payload) VALUES ($1, $2, $3)`,
		userID, kind, payload,
	)
	return err
}

func (r *NotificationRepo) ListForUser(ctx context.Context, userID string, limit int) ([]*domain.Notification, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, kind, payload, read_at, created_at
		 FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Notification
	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Kind, &n.Payload, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &n)
	}
	return out, rows.Err()
}

func (r *NotificationRepo) MarkAllRead(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE notifications SET read_at = now() WHERE user_id=$1 AND read_at IS NULL`,
		userID,
	)
	return err
}

// === Preferences ===

type PreferencesRepo struct {
	pool *pgxpool.Pool
}

func NewPreferencesRepo(pool *pgxpool.Pool) *PreferencesRepo {
	return &PreferencesRepo{pool: pool}
}

func (r *PreferencesRepo) Get(ctx context.Context, userID string) (domain.Preferences, error) {
	var p domain.Preferences
	err := r.pool.QueryRow(ctx,
		`SELECT user_id, push_enabled, push_messages, push_follows, push_mentions,
		        quiet_hours_start, quiet_hours_end, updated_at
		 FROM notification_preferences WHERE user_id=$1`,
		userID,
	).Scan(&p.UserID, &p.PushEnabled, &p.PushMessages, &p.PushFollows, &p.PushMentions,
		&p.QuietHoursStart, &p.QuietHoursEnd, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.DefaultPreferences(userID), nil
	}
	return p, err
}

func (r *PreferencesRepo) Upsert(ctx context.Context, p domain.Preferences) error {
	const sql = `
		INSERT INTO notification_preferences
		  (user_id, push_enabled, push_messages, push_follows, push_mentions,
		   quiet_hours_start, quiet_hours_end, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (user_id) DO UPDATE SET
		  push_enabled = EXCLUDED.push_enabled,
		  push_messages = EXCLUDED.push_messages,
		  push_follows = EXCLUDED.push_follows,
		  push_mentions = EXCLUDED.push_mentions,
		  quiet_hours_start = EXCLUDED.quiet_hours_start,
		  quiet_hours_end = EXCLUDED.quiet_hours_end,
		  updated_at = now()`
	_, err := r.pool.Exec(ctx, sql,
		p.UserID, p.PushEnabled, p.PushMessages, p.PushFollows, p.PushMentions,
		p.QuietHoursStart, p.QuietHoursEnd,
	)
	return err
}

// silenceWord избегает unused imports
var _ = time.Time{}
