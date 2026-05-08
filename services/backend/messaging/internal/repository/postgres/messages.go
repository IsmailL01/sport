package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/messaging/internal/domain"
)

type MessageRepo struct {
	pool *pgxpool.Pool
}

func NewMessageRepo(pool *pgxpool.Pool) *MessageRepo {
	return &MessageRepo{pool: pool}
}

const msgCols = `id, conversation_id, sender_id, client_msg_id, kind, body,
		reply_to_id, edited_at, deleted_at, flagged, created_at`

// SendInTx — INSERT message + outbox-rows для каждого члена + UPDATE conversations.last_message_at,
// всё в одной транзакции. Идемпотентен через UNIQUE(conversation_id, client_msg_id).
//
// Возвращает (созданное сообщение, true) если новое; (existing, false) если по client_msg_id уже было.
func (r *MessageRepo) SendInTx(
	ctx context.Context,
	convID, senderID, clientMsgID string,
	kind domain.MessageKind, body *string, replyToID *string,
	memberIDs []string,
) (*domain.Message, bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)

	// idempotency check
	var existing domain.Message
	err = tx.QueryRow(ctx,
		`SELECT `+msgCols+` FROM messages WHERE conversation_id=$1 AND client_msg_id=$2`,
		convID, clientMsgID,
	).Scan(&existing.ID, &existing.ConversationID, &existing.SenderID, &existing.ClientMsgID,
		&existing.Kind, &existing.Body, &existing.ReplyToID, &existing.EditedAt,
		&existing.DeletedAt, &existing.Flagged, &existing.CreatedAt)
	if err == nil {
		if err := tx.Commit(ctx); err != nil {
			return nil, false, err
		}
		return &existing, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, err
	}

	// INSERT new message.
	var m domain.Message
	err = tx.QueryRow(ctx,
		`INSERT INTO messages (conversation_id, sender_id, client_msg_id, kind, body, reply_to_id)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING `+msgCols,
		convID, senderID, clientMsgID, kind, body, replyToID,
	).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.ClientMsgID, &m.Kind, &m.Body,
		&m.ReplyToID, &m.EditedAt, &m.DeletedAt, &m.Flagged, &m.CreatedAt)
	if err != nil {
		return nil, false, err
	}

	// UPDATE last_message_at.
	if _, err := tx.Exec(ctx,
		`UPDATE conversations SET last_message_at=$2, updated_at=now() WHERE id=$1`,
		convID, m.CreatedAt,
	); err != nil {
		return nil, false, err
	}

	// INSERT outbox для каждого члена (включая отправителя — для multi-device sync).
	payload, err := json.Marshal(map[string]any{
		"event":          "message.new",
		"messageId":      m.ID,
		"conversationId": m.ConversationID,
		"senderId":       m.SenderID,
		"clientMsgId":    m.ClientMsgID,
		"kind":           string(m.Kind),
		"body":           m.Body,
		"replyToId":      m.ReplyToID,
		"createdAt":      m.CreatedAt,
	})
	if err != nil {
		return nil, false, err
	}
	for _, memberID := range memberIDs {
		subject := "rt.user." + memberID
		if _, err := tx.Exec(ctx,
			`INSERT INTO messaging_outbox (event_subject, payload) VALUES ($1, $2)`,
			subject, payload,
		); err != nil {
			return nil, false, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return &m, true, nil
}

// ListByConversation — cursor-pagination, default DESC. Если before != nil — раньше этого ts.
func (r *MessageRepo) ListByConversation(ctx context.Context, convID string, before *time.Time, limit int) ([]*domain.Message, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows pgx.Rows
	var err error
	if before != nil {
		rows, err = r.pool.Query(ctx,
			`SELECT `+msgCols+` FROM messages WHERE conversation_id=$1 AND deleted_at IS NULL
			 AND created_at < $2 ORDER BY created_at DESC LIMIT $3`,
			convID, *before, limit,
		)
	} else {
		rows, err = r.pool.Query(ctx,
			`SELECT `+msgCols+` FROM messages WHERE conversation_id=$1 AND deleted_at IS NULL
			 ORDER BY created_at DESC LIMIT $2`,
			convID, limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Message
	for rows.Next() {
		var m domain.Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.ClientMsgID,
			&m.Kind, &m.Body, &m.ReplyToID, &m.EditedAt, &m.DeletedAt, &m.Flagged, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, &m)
	}
	return out, rows.Err()
}

// Edit — обновить body. Гарантирует не-deleted + сохраняет sender; service
// проверяет actor + 24h окно.
// Возвращает обновлённое сообщение + memberIDs для outbox event.
func (r *MessageRepo) Edit(ctx context.Context, messageID string, newBody string, memberIDs []string) (*domain.Message, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var m domain.Message
	err = tx.QueryRow(ctx,
		`UPDATE messages SET body=$2, edited_at=now() WHERE id=$1 AND deleted_at IS NULL
		 RETURNING `+msgCols,
		messageID, newBody,
	).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.ClientMsgID, &m.Kind, &m.Body,
		&m.ReplyToID, &m.EditedAt, &m.DeletedAt, &m.Flagged, &m.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrMsgNotFound
		}
		return nil, err
	}

	// Outbox events для всех членов.
	payload, _ := json.Marshal(map[string]any{
		"event":          "message.edited",
		"messageId":      m.ID,
		"conversationId": m.ConversationID,
		"body":           newBody,
		"editedAt":       m.EditedAt,
	})
	for _, mid := range memberIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO messaging_outbox (event_subject, payload) VALUES ($1, $2)`,
			"rt.user."+mid, payload,
		); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &m, nil
}

// LoadReplyPreviews — для batch messages, загрузить snapshot их reply-targets.
// Возвращает map[messageID]→preview (только для тех у кого reply_to_id != null).
func (r *MessageRepo) LoadReplyPreviews(ctx context.Context, messageIDs []string) (map[string]*domain.MessageReplyPreview, error) {
	if len(messageIDs) == 0 {
		return map[string]*domain.MessageReplyPreview{}, nil
	}
	const sql = `
		SELECT m.id, t.id, t.sender_id, t.body, t.kind, (t.deleted_at IS NOT NULL) AS deleted
		FROM messages m
		JOIN messages t ON t.id = m.reply_to_id
		WHERE m.id = ANY($1) AND m.reply_to_id IS NOT NULL`
	rows, err := r.pool.Query(ctx, sql, messageIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]*domain.MessageReplyPreview)
	for rows.Next() {
		var msgID string
		var p domain.MessageReplyPreview
		if err := rows.Scan(&msgID, &p.MessageID, &p.SenderID, &p.Body, &p.Kind, &p.Deleted); err != nil {
			return nil, err
		}
		// Truncate body для preview.
		if p.Body != nil && len(*p.Body) > 80 {
			t := (*p.Body)[:77] + "..."
			p.Body = &t
		}
		out[msgID] = &p
	}
	return out, rows.Err()
}

func (r *MessageRepo) GetByID(ctx context.Context, id string) (*domain.Message, error) {
	var m domain.Message
	err := r.pool.QueryRow(ctx, `SELECT `+msgCols+` FROM messages WHERE id=$1`, id).
		Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.ClientMsgID, &m.Kind, &m.Body,
			&m.ReplyToID, &m.EditedAt, &m.DeletedAt, &m.Flagged, &m.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrMsgNotFound
	}
	return &m, err
}

// SoftDelete — UPDATE deleted_at. Кто может — проверяется в service layer.
// Outbox-event message.deleted публикуется в той же tx.
func (r *MessageRepo) SoftDelete(ctx context.Context, id, deletedBy string, memberIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var convID string
	err = tx.QueryRow(ctx,
		`UPDATE messages SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL
		 RETURNING conversation_id`,
		id,
	).Scan(&convID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrMsgNotFound
	}
	if err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{
		"event":          "message.deleted",
		"messageId":      id,
		"conversationId": convID,
		"deletedBy":      deletedBy,
	})
	for _, memberID := range memberIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO messaging_outbox (event_subject, payload) VALUES ($1, $2)`,
			"rt.user."+memberID, payload,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
