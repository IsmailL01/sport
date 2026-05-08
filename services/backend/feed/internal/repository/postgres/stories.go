package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/feed/internal/domain"
)

type StoryRepo struct {
	pool *pgxpool.Pool
}

func NewStoryRepo(pool *pgxpool.Pool) *StoryRepo {
	return &StoryRepo{pool: pool}
}

const cols = `id, author_id, media_id, overlay_text, created_at, expires_at, deleted_at`

func (r *StoryRepo) Create(ctx context.Context, authorID, mediaID string, overlay *string) (*domain.Story, error) {
	const sql = `
		INSERT INTO stories (author_id, media_id, overlay_text)
		VALUES ($1, $2, $3)
		RETURNING ` + cols
	row := r.pool.QueryRow(ctx, sql, authorID, mediaID, overlay)
	return scan(row)
}

func (r *StoryRepo) GetByID(ctx context.Context, id string) (*domain.Story, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM stories WHERE id = $1 AND deleted_at IS NULL`, id)
	return scan(row)
}

// FeedForUser — все активные stories авторов из follows + сам пользователь.
// Возвращает с view-count и iViewed флагом.
func (r *StoryRepo) FeedForUser(ctx context.Context, userID string) ([]*domain.StoryWithStats, error) {
	const sql = `
		SELECT s.id, s.author_id, s.media_id, s.overlay_text, s.created_at, s.expires_at, s.deleted_at,
		  (SELECT count(*) FROM story_views WHERE story_id = s.id),
		  EXISTS (SELECT 1 FROM story_views WHERE story_id = s.id AND viewer_id = $1)
		FROM stories s
		WHERE s.deleted_at IS NULL AND s.expires_at > now()
		AND (
		  s.author_id = $1
		  OR s.author_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)
		)
		ORDER BY s.author_id, s.created_at DESC`
	rows, err := r.pool.Query(ctx, sql, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.StoryWithStats
	for rows.Next() {
		var s domain.StoryWithStats
		var deletedAt *time.Time
		if err := rows.Scan(
			&s.ID, &s.AuthorID, &s.MediaID, &s.OverlayText,
			&s.CreatedAt, &s.ExpiresAt, &deletedAt,
			&s.ViewCount, &s.IViewed,
		); err != nil {
			return nil, err
		}
		s.DeletedAt = deletedAt
		out = append(out, &s)
	}
	return out, rows.Err()
}

// MyStories — только мои + viewers.
func (r *StoryRepo) MyStories(ctx context.Context, authorID string) ([]*domain.StoryWithStats, error) {
	const sql = `
		SELECT s.id, s.author_id, s.media_id, s.overlay_text, s.created_at, s.expires_at, s.deleted_at,
		  (SELECT count(*) FROM story_views WHERE story_id = s.id),
		  false
		FROM stories s
		WHERE s.author_id = $1 AND s.deleted_at IS NULL AND s.expires_at > now()
		ORDER BY s.created_at DESC`
	rows, err := r.pool.Query(ctx, sql, authorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.StoryWithStats
	for rows.Next() {
		var s domain.StoryWithStats
		var deletedAt *time.Time
		if err := rows.Scan(
			&s.ID, &s.AuthorID, &s.MediaID, &s.OverlayText,
			&s.CreatedAt, &s.ExpiresAt, &deletedAt,
			&s.ViewCount, &s.IViewed,
		); err != nil {
			return nil, err
		}
		s.DeletedAt = deletedAt
		out = append(out, &s)
	}
	return out, rows.Err()
}

func (r *StoryRepo) MarkViewed(ctx context.Context, storyID, viewerID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`,
		storyID, viewerID,
	)
	return err
}

// Viewers — для owner просмотра "кто смотрел".
func (r *StoryRepo) Viewers(ctx context.Context, storyID string, limit int) ([]*domain.StoryView, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx,
		`SELECT story_id, viewer_id, viewed_at FROM story_views
		 WHERE story_id = $1 ORDER BY viewed_at DESC LIMIT $2`,
		storyID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.StoryView
	for rows.Next() {
		var v domain.StoryView
		if err := rows.Scan(&v.StoryID, &v.ViewerID, &v.ViewedAt); err != nil {
			return nil, err
		}
		out = append(out, &v)
	}
	return out, rows.Err()
}

func (r *StoryRepo) SoftDelete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE stories SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL`, id)
	return err
}

// CleanupExpired — для cron job. Hard-delete с истёкшим expires_at.
// Возвращает count удалённых.
func (r *StoryRepo) CleanupExpired(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM stories WHERE expires_at < now() OR deleted_at IS NOT NULL`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func scan(row pgx.Row) (*domain.Story, error) {
	var s domain.Story
	var deletedAt *time.Time
	if err := row.Scan(&s.ID, &s.AuthorID, &s.MediaID, &s.OverlayText,
		&s.CreatedAt, &s.ExpiresAt, &deletedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	s.DeletedAt = deletedAt
	return &s, nil
}
