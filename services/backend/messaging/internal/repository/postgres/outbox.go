package postgres

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type OutboxRow struct {
	ID           int64
	EventSubject string
	Payload      []byte
	CreatedAt    time.Time
}

type OutboxRepo struct {
	pool *pgxpool.Pool
}

func NewOutboxRepo(pool *pgxpool.Pool) *OutboxRepo {
	return &OutboxRepo{pool: pool}
}

// FetchUnpublished — pull до limit непрожатых событий, FOR UPDATE SKIP LOCKED
// чтобы безопасно работать с несколькими publisher-инстансами.
func (r *OutboxRepo) FetchUnpublished(ctx context.Context, limit int) ([]OutboxRow, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, event_subject, payload, created_at
		 FROM messaging_outbox WHERE published_at IS NULL
		 ORDER BY created_at ASC LIMIT $1
		 FOR UPDATE SKIP LOCKED`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OutboxRow
	for rows.Next() {
		var r OutboxRow
		if err := rows.Scan(&r.ID, &r.EventSubject, &r.Payload, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Insert — записать новый event в outbox. Используется для member-events
// (group rename, member added/removed, role changed). Сообщения создаются
// через MessageRepo.SendInTx и пишут outbox в той же tx — здесь же мы пишем
// атомарно отдельно, без strong transactional guarantee — но для member-events
// это OK: если outbox INSERT упадёт после UPDATE conversation_members, событие
// потеряется, но member-row останется. Push-уведомление просто не придёт —
// при следующем GET /conversations клиент увидит актуальное состояние.
func (r *OutboxRepo) Insert(ctx context.Context, subject string, payload []byte) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO messaging_outbox (event_subject, payload) VALUES ($1, $2)`,
		subject, payload,
	)
	return err
}

func (r *OutboxRepo) MarkPublished(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := r.pool.Exec(ctx,
		`UPDATE messaging_outbox SET published_at = now() WHERE id = ANY($1)`,
		ids,
	)
	return err
}
