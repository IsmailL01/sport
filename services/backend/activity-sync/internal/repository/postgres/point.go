package postgres

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/activity-sync/internal/domain"
)

type PointRepo struct {
	pool *pgxpool.Pool
}

func NewPointRepo(pool *pgxpool.Pool) *PointRepo {
	return &PointRepo{pool: pool}
}

func (r *PointRepo) AppendBatch(ctx context.Context, sessionID string, points []*domain.Point) (int, error) {
	if len(points) == 0 {
		return 0, nil
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// COPY быстрее множественных INSERT для batch'ей > 100 точек.
	// Но для простоты сначала используем prepared INSERT с ON CONFLICT DO NOTHING.
	// Когда нужно — свитчнём на pgx.CopyFrom (Phase 3 / Activity Processing).
	rows := make([][]any, 0, len(points))
	for _, p := range points {
		rows = append(rows, []any{
			sessionID, p.Timestamp, p.Latitude, p.Longitude,
			toNullable(p.Altitude), toNullable(p.Accuracy), toNullable(p.Speed), p.Source,
		})
	}
	const sql = `
		INSERT INTO points (session_id, ts, lat, lon, alt, accuracy, speed, source)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (session_id, ts) DO NOTHING`
	inserted := 0
	for _, args := range rows {
		tag, err := tx.Exec(ctx, sql, args...)
		if err != nil {
			return inserted, err
		}
		inserted += int(tag.RowsAffected())
	}
	if err := tx.Commit(ctx); err != nil {
		return inserted, err
	}
	return inserted, nil
}

func (r *PointRepo) ListBySession(ctx context.Context, sessionID string) ([]*domain.Point, error) {
	const sql = `
		SELECT ts, lat, lon, alt, accuracy, speed, source
		FROM points WHERE session_id = $1
		ORDER BY ts ASC`
	rows, err := r.pool.Query(ctx, sql, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []*domain.Point
	for rows.Next() {
		p := &domain.Point{SessionID: sessionID}
		if err := rows.Scan(&p.Timestamp, &p.Latitude, &p.Longitude, &p.Altitude, &p.Accuracy, &p.Speed, &p.Source); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func toNullable(v *float32) any {
	if v == nil {
		return nil
	}
	return *v
}

// Compile-time проверка что row scanners реализуют один интерфейс.
var _ pgx.Row = (pgx.Rows)(nil)
