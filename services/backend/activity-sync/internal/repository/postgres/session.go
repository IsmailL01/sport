// Package postgres — pgx-реализации репозиториев activity-sync.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/activity-sync/internal/domain"
)

type SessionRepo struct {
	pool *pgxpool.Pool
}

func NewSessionRepo(pool *pgxpool.Pool) *SessionRepo {
	return &SessionRepo{pool: pool}
}

func (r *SessionRepo) UpsertByClientID(ctx context.Context, s *domain.Session) error {
	const sql = `
		INSERT INTO sessions (
			user_id, client_session_id, started_at, ended_at,
			is_closed, distance_m, area_m2, calc_method, note, source
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (user_id, client_session_id) DO UPDATE SET
			started_at  = EXCLUDED.started_at,
			ended_at    = EXCLUDED.ended_at,
			is_closed   = EXCLUDED.is_closed,
			distance_m  = EXCLUDED.distance_m,
			area_m2     = EXCLUDED.area_m2,
			calc_method = EXCLUDED.calc_method,
			note        = EXCLUDED.note,
			source      = EXCLUDED.source,
			updated_at  = now()
		RETURNING id, created_at, updated_at`
	row := r.pool.QueryRow(ctx, sql,
		s.UserID, s.ClientSessionID, s.StartedAt, s.EndedAt,
		s.IsClosed, s.DistanceM, s.AreaM2, s.CalcMethod, s.Note, s.Source,
	)
	if err := row.Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt); err != nil {
		return err
	}
	return nil
}

func (r *SessionRepo) GetByID(ctx context.Context, id string) (*domain.Session, error) {
	const sql = `
		SELECT id, user_id, client_session_id, started_at, ended_at,
			is_closed, distance_m, area_m2, calc_method, note, source,
			created_at, updated_at
		FROM sessions WHERE id = $1`
	row := r.pool.QueryRow(ctx, sql, id)
	return scanSession(row)
}

func (r *SessionRepo) ListByUser(ctx context.Context, userID string, limit int) ([]*domain.Session, error) {
	const sql = `
		SELECT id, user_id, client_session_id, started_at, ended_at,
			is_closed, distance_m, area_m2, calc_method, note, source,
			created_at, updated_at
		FROM sessions WHERE user_id = $1
		ORDER BY started_at DESC
		LIMIT $2`
	rows, err := r.pool.Query(ctx, sql, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []*domain.Session
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

func (r *SessionRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrSessionNotFound
	}
	return nil
}

// scanSession работает с *pgx.Rows и pgx.Row (Scan-совместимы).
type scannable interface {
	Scan(dest ...any) error
}

func scanSession(row scannable) (*domain.Session, error) {
	var s domain.Session
	var endedAt *time.Time
	var isClosed *bool
	var distanceM, areaM2 *float64
	var calcMethod, note *string
	if err := row.Scan(
		&s.ID, &s.UserID, &s.ClientSessionID, &s.StartedAt, &endedAt,
		&isClosed, &distanceM, &areaM2, &calcMethod, &note, &s.Source,
		&s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrSessionNotFound
		}
		return nil, err
	}
	s.EndedAt = endedAt
	s.IsClosed = isClosed
	s.DistanceM = distanceM
	s.AreaM2 = areaM2
	s.CalcMethod = calcMethod
	s.Note = note
	return &s, nil
}
