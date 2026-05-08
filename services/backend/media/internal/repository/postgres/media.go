package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/media/internal/domain"
)

type MediaRepo struct {
	pool *pgxpool.Pool
}

func NewMediaRepo(pool *pgxpool.Pool) *MediaRepo {
	return &MediaRepo{pool: pool}
}

const cols = `id, owner_id, kind, mime, size_bytes, s3_key, status,
		thumb_key, width, height, duration_ms, created_at, completed_at`

func (r *MediaRepo) Create(ctx context.Context, m *domain.Media) error {
	const sql = `
		INSERT INTO media (owner_id, kind, mime, size_bytes, s3_key, status)
		VALUES ($1, $2, $3, $4, $5, 'pending')
		RETURNING id, created_at`
	return r.pool.QueryRow(ctx, sql,
		m.OwnerID, m.Kind, m.Mime, m.SizeBytes, m.S3Key,
	).Scan(&m.ID, &m.CreatedAt)
}

func (r *MediaRepo) GetByID(ctx context.Context, id string) (*domain.Media, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+cols+` FROM media WHERE id = $1`, id)
	return scan(row)
}

// MarkReady — после client подтверждает upload через POST /uploads/{id}/complete.
func (r *MediaRepo) MarkReady(ctx context.Context, id string, width, height *int, durationMs *int) (*domain.Media, error) {
	const sql = `
		UPDATE media SET status='ready', completed_at=now(),
		  width=$2, height=$3, duration_ms=$4
		WHERE id=$1 AND status='pending'
		RETURNING ` + cols
	row := r.pool.QueryRow(ctx, sql, id, width, height, durationMs)
	return scan(row)
}

// MarkFailed.
func (r *MediaRepo) MarkFailed(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE media SET status='failed' WHERE id=$1`, id)
	return err
}

// Delete — owner-only (gated в service layer).
func (r *MediaRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM media WHERE id=$1`, id)
	return err
}

func scan(row pgx.Row) (*domain.Media, error) {
	var m domain.Media
	var thumbKey *string
	var width, height, durMs *int
	var completedAt *time.Time
	if err := row.Scan(
		&m.ID, &m.OwnerID, &m.Kind, &m.Mime, &m.SizeBytes, &m.S3Key, &m.Status,
		&thumbKey, &width, &height, &durMs, &m.CreatedAt, &completedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	m.ThumbKey = thumbKey
	m.Width = width
	m.Height = height
	m.DurationMs = durMs
	m.CompletedAt = completedAt
	return &m, nil
}
