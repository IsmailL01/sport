package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/messaging/internal/domain"
)

type ReactionRepo struct {
	pool *pgxpool.Pool
}

func NewReactionRepo(pool *pgxpool.Pool) *ReactionRepo {
	return &ReactionRepo{pool: pool}
}

// Add — INSERT (idempotent ON CONFLICT). Возвращает true если новая.
func (r *ReactionRepo) Add(ctx context.Context, messageID, userID, emoji string) (bool, error) {
	tag, err := r.pool.Exec(ctx,
		`INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
		 ON CONFLICT DO NOTHING`,
		messageID, userID, emoji,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *ReactionRepo) Remove(ctx context.Context, messageID, userID, emoji string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3`,
		messageID, userID, emoji,
	)
	return err
}

// ListForMessages — все reactions для batch messages (для GET messages).
// Возвращает map[messageID]→[]Reaction, чтобы избежать N+1.
func (r *ReactionRepo) ListForMessages(ctx context.Context, messageIDs []string) (map[string][]domain.MessageReaction, error) {
	if len(messageIDs) == 0 {
		return map[string][]domain.MessageReaction{}, nil
	}
	rows, err := r.pool.Query(ctx,
		`SELECT message_id, user_id, emoji, created_at
		 FROM message_reactions WHERE message_id = ANY($1)`,
		messageIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string][]domain.MessageReaction)
	for rows.Next() {
		var r domain.MessageReaction
		var createdAt time.Time
		if err := rows.Scan(&r.MessageID, &r.UserID, &r.Emoji, &createdAt); err != nil {
			return nil, err
		}
		r.CreatedAt = createdAt
		out[r.MessageID] = append(out[r.MessageID], r)
	}
	return out, rows.Err()
}
