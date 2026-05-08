// Package postgres — pgx-репозитории messaging.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/messaging/internal/domain"
)

type ConversationRepo struct {
	pool *pgxpool.Pool
}

func NewConversationRepo(pool *pgxpool.Pool) *ConversationRepo {
	return &ConversationRepo{pool: pool}
}

const convCols = `id, type, title, avatar_media_id, created_by,
		created_at, updated_at, last_message_at, deleted_at`

// FindOrCreateDM — атомарный lookup + create DM с парой юзеров (через dm_pairs lock).
// Возвращает existing или новую conversation. user_a и user_b в произвольном порядке —
// функция нормализует.
func (r *ConversationRepo) FindOrCreateDM(ctx context.Context, userA, userB string) (*domain.Conversation, bool, error) {
	if userA == userB {
		return nil, false, domain.ErrSelfTarget
	}
	a, b := userA, userB
	if a > b {
		a, b = b, a
	}

	// Сначала быстрый lookup без транзакции.
	var convID string
	err := r.pool.QueryRow(ctx,
		`SELECT conversation_id FROM dm_pairs WHERE user_a=$1 AND user_b=$2`,
		a, b,
	).Scan(&convID)
	if err == nil {
		conv, err := r.GetByID(ctx, convID)
		return conv, false, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, err
	}

	// Не нашли — создаём через транзакцию.
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	// re-check внутри транзакции.
	err = tx.QueryRow(ctx,
		`SELECT conversation_id FROM dm_pairs WHERE user_a=$1 AND user_b=$2 FOR UPDATE`,
		a, b,
	).Scan(&convID)
	if err == nil {
		// Появилось пока ждали — fetch и возвращаем.
		conv, err := r.getByIDTx(ctx, tx, convID)
		if err != nil {
			return nil, false, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return conv, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, err
	}

	// INSERT conversation.
	var conv domain.Conversation
	err = tx.QueryRow(ctx,
		`INSERT INTO conversations (type, created_by) VALUES ('dm', $1)
		 RETURNING `+convCols, userA,
	).Scan(&conv.ID, &conv.Type, &conv.Title, &conv.AvatarMediaID, &conv.CreatedBy,
		&conv.CreatedAt, &conv.UpdatedAt, &conv.LastMessageAt, &conv.DeletedAt)
	if err != nil {
		return nil, false, err
	}

	// INSERT dm_pairs + members (оба).
	if _, err := tx.Exec(ctx,
		`INSERT INTO dm_pairs (user_a, user_b, conversation_id) VALUES ($1, $2, $3)`,
		a, b, conv.ID,
	); err != nil {
		return nil, false, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO conversation_members (conversation_id, user_id, role)
		 VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
		conv.ID, a, b,
	); err != nil {
		return nil, false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return &conv, true, nil
}

func (r *ConversationRepo) GetByID(ctx context.Context, id string) (*domain.Conversation, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+convCols+` FROM conversations WHERE id=$1 AND deleted_at IS NULL`, id)
	return scanConv(row)
}

func (r *ConversationRepo) getByIDTx(ctx context.Context, tx pgx.Tx, id string) (*domain.Conversation, error) {
	row := tx.QueryRow(ctx, `SELECT `+convCols+` FROM conversations WHERE id=$1 AND deleted_at IS NULL`, id)
	return scanConv(row)
}

// ListForUser — все conversations где user является членом, sorted by last_message_at desc.
// Возвращает denormalized view (с last_message preview, unread count).
func (r *ConversationRepo) ListForUser(ctx context.Context, userID string, limit int) ([]*domain.ConversationView, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	const sql = `
		SELECT
		  c.id, c.type, c.title, c.avatar_media_id, c.created_by,
		  c.created_at, c.updated_at, c.last_message_at, c.deleted_at,
		  cm.role,
		  cm.last_read_message_id,
		  cm.muted_until,
		  (SELECT count(*) FROM conversation_members WHERE conversation_id = c.id),
		  -- last message preview (latest non-deleted)
		  (SELECT id FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  (SELECT sender_id FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  (SELECT body FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  (SELECT created_at FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  -- unread count
		  (SELECT count(*) FROM messages
		    WHERE conversation_id = c.id AND deleted_at IS NULL
		    AND sender_id != $1
		    AND (cm.last_read_message_id IS NULL OR
		         created_at > (SELECT created_at FROM messages WHERE id = cm.last_read_message_id)))
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id
		WHERE cm.user_id = $1 AND c.deleted_at IS NULL
		ORDER BY c.last_message_at DESC NULLS LAST
		LIMIT $2`
	rows, err := r.pool.Query(ctx, sql, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.ConversationView
	for rows.Next() {
		var view domain.ConversationView
		var lastMsgID, lastSenderID, lastBody *string
		var lastCreatedAt *time.Time
		if err := rows.Scan(
			&view.ID, &view.Type, &view.Title, &view.AvatarMediaID, &view.CreatedBy,
			&view.CreatedAt, &view.UpdatedAt, &view.LastMessageAt, &view.DeletedAt,
			&view.MyRole, // role
			new(*string), // last_read_message_id (we don't surface here)
			new(*time.Time), // muted_until
			&view.MembersCount,
			&lastMsgID, &lastSenderID, &lastBody, &lastCreatedAt,
			&view.UnreadCount,
		); err != nil {
			return nil, err
		}
		if lastMsgID != nil {
			msg := &domain.Message{
				ID:             *lastMsgID,
				ConversationID: view.ID,
				SenderID:       safeStr(lastSenderID),
				Body:           lastBody,
				CreatedAt:      safeTime(lastCreatedAt),
				Kind:           domain.MessageText,
			}
			view.LastMessage = msg
		}
		out = append(out, &view)
	}
	return out, rows.Err()
}

// UpdateLastMessageAt — обновить денормализованный last_message_at в conversations.
// Вызывается после INSERT message в той же tx что и INSERT message + outbox.
func (r *ConversationRepo) UpdateLastMessageAt(ctx context.Context, tx pgx.Tx, convID string, ts time.Time) error {
	_, err := tx.Exec(ctx,
		`UPDATE conversations SET last_message_at = $2, updated_at = now() WHERE id = $1`,
		convID, ts,
	)
	return err
}

func scanConv(row pgx.Row) (*domain.Conversation, error) {
	var c domain.Conversation
	if err := row.Scan(&c.ID, &c.Type, &c.Title, &c.AvatarMediaID, &c.CreatedBy,
		&c.CreatedAt, &c.UpdatedAt, &c.LastMessageAt, &c.DeletedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrConvNotFound
		}
		return nil, err
	}
	return &c, nil
}

func safeStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func safeTime(p *time.Time) time.Time {
	if p == nil {
		return time.Time{}
	}
	return *p
}

// === Members ===

type MemberRepo struct {
	pool *pgxpool.Pool
}

func NewMemberRepo(pool *pgxpool.Pool) *MemberRepo {
	return &MemberRepo{pool: pool}
}

// IsMember — быстрый чек.
func (r *MemberRepo) IsMember(ctx context.Context, convID, userID string) (bool, domain.MemberRole, error) {
	var role domain.MemberRole
	err := r.pool.QueryRow(ctx,
		`SELECT role FROM conversation_members WHERE conversation_id=$1 AND user_id=$2`,
		convID, userID,
	).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, "", nil
	}
	if err != nil {
		return false, "", err
	}
	return true, role, nil
}

func (r *MemberRepo) MemberIDs(ctx context.Context, convID string) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT user_id FROM conversation_members WHERE conversation_id=$1`,
		convID,
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

func (r *MemberRepo) MarkRead(ctx context.Context, convID, userID, lastReadMessageID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE conversation_members SET last_read_message_id=$3
		 WHERE conversation_id=$1 AND user_id=$2`,
		convID, userID, lastReadMessageID,
	)
	return err
}
