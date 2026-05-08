package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
)

type BlockRepo struct {
	pool *pgxpool.Pool
}

func NewBlockRepo(pool *pgxpool.Pool) *BlockRepo {
	return &BlockRepo{pool: pool}
}

func (r *BlockRepo) Block(ctx context.Context, blockerID, blockedID string) error {
	if blockerID == blockedID {
		return domain.ErrSelfTarget
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		blockerID, blockedID,
	)
	return err
}

func (r *BlockRepo) Unblock(ctx context.Context, blockerID, blockedID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
		blockerID, blockedID,
	)
	return err
}

// IsBlocked — заблокировал ли blockerID юзера blockedID.
func (r *BlockRepo) IsBlocked(ctx context.Context, blockerID, blockedID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2)`,
		blockerID, blockedID,
	).Scan(&exists)
	return exists, err
}

// ListBlocked — список юзеров которых я заблокировал (для BlockedUsersScreen).
func (r *BlockRepo) ListBlocked(ctx context.Context, blockerID string, limit int) ([]string, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx,
		`SELECT blocked_id FROM user_blocks WHERE blocker_id = $1 ORDER BY created_at DESC LIMIT $2`,
		blockerID, limit,
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
