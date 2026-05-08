package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
)

type FollowRepo struct {
	pool *pgxpool.Pool
}

func NewFollowRepo(pool *pgxpool.Pool) *FollowRepo {
	return &FollowRepo{pool: pool}
}

// Follow — INSERT idempotent (ON CONFLICT DO NOTHING).
func (r *FollowRepo) Follow(ctx context.Context, followerID, followeeID string) error {
	if followerID == followeeID {
		return domain.ErrSelfTarget
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		followerID, followeeID,
	)
	return err
}

func (r *FollowRepo) Unfollow(ctx context.Context, followerID, followeeID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`,
		followerID, followeeID,
	)
	return err
}

func (r *FollowRepo) IsFollowing(ctx context.Context, followerID, followeeID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2)`,
		followerID, followeeID,
	).Scan(&exists)
	return exists, err
}

// Followers — кто подписан на followeeID, paginated by created_at desc.
func (r *FollowRepo) Followers(ctx context.Context, followeeID string, limit int, beforeCreatedAt *string) ([]string, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT follower_id FROM follows WHERE followee_id = $1 ORDER BY created_at DESC LIMIT $2`,
		followeeID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// Following — на кого подписан followerID.
func (r *FollowRepo) Following(ctx context.Context, followerID string, limit int) ([]string, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT followee_id FROM follows WHERE follower_id = $1 ORDER BY created_at DESC LIMIT $2`,
		followerID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// Counts — followers / following count для UI профиля.
func (r *FollowRepo) Counts(ctx context.Context, userID string) (followers int, following int, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT
		  (SELECT count(*) FROM follows WHERE followee_id = $1),
		  (SELECT count(*) FROM follows WHERE follower_id = $1)`,
		userID,
	).Scan(&followers, &following)
	return
}
