package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/identity/internal/domain"
)

type RefreshTokenRepo struct {
	pool *pgxpool.Pool
}

func NewRefreshTokenRepo(pool *pgxpool.Pool) *RefreshTokenRepo {
	return &RefreshTokenRepo{pool: pool}
}

func (r *RefreshTokenRepo) Create(ctx context.Context, t *domain.RefreshToken) error {
	const sql = `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`
	createdAt := t.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	row := r.pool.QueryRow(ctx, sql, t.UserID, t.TokenHash, t.ExpiresAt.UTC(), nullable(t.UserAgent), createdAt)
	return row.Scan(&t.ID)
}

func (r *RefreshTokenRepo) GetByHash(ctx context.Context, tokenHash string) (*domain.RefreshToken, error) {
	const sql = `
		SELECT id, user_id, token_hash, expires_at, revoked_at, created_at, COALESCE(user_agent, '')
		FROM refresh_tokens
		WHERE token_hash = $1`
	var t domain.RefreshToken
	row := r.pool.QueryRow(ctx, sql, tokenHash)
	if err := row.Scan(&t.ID, &t.UserID, &t.TokenHash, &t.ExpiresAt, &t.RevokedAt, &t.CreatedAt, &t.UserAgent); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrTokenNotFound
		}
		return nil, err
	}
	return &t, nil
}

func (r *RefreshTokenRepo) Revoke(ctx context.Context, id string, at time.Time) error {
	const sql = `UPDATE refresh_tokens SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL`
	tag, err := r.pool.Exec(ctx, sql, at.UTC(), id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrTokenNotFound
	}
	return nil
}

func (r *RefreshTokenRepo) RevokeAllForUser(ctx context.Context, userID string, at time.Time) error {
	const sql = `UPDATE refresh_tokens SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL`
	_, err := r.pool.Exec(ctx, sql, at.UTC(), userID)
	return err
}
