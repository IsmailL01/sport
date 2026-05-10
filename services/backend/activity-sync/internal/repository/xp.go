// XpRepo — cross-domain UPDATE на profiles из activity-sync.
// Phase 8 / M3.
//
// Использует тот же pgxpool. Single tx: UPDATE profiles + UPDATE sessions.xp_awarded.
// Если profile нет (lazy-create в social-graph) — INSERT с базовыми значениями
// (ON CONFLICT) чтобы не валить выдачу XP.
package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/pkg/gamification"
)

// XpRepo — обёртка для атомарной выдачи XP за session.
type XpRepo struct {
	pool *pgxpool.Pool
}

func NewXpRepo(pool *pgxpool.Pool) *XpRepo { return &XpRepo{pool: pool} }

// XpResult — outcome выдачи. Возвращается caller для NATS publish + logging.
type XpResult struct {
	XpAwarded int
	XpTotal   int
	OldGrade  string
	NewGrade  string
}

// AwardForSession — atomic: incr xp_total + cached grade + mark session.
// Idempotent: если sessions.xp_awarded > 0 — skip (выдано в прошлый upsert).
// Возвращает nil-result если ничего не сделано (idempotency hit), без error.
func (r *XpRepo) AwardForSession(
	ctx context.Context,
	sessionID, userID string,
	xp int,
) (*XpResult, error) {
	if xp <= 0 {
		return nil, nil
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// 1) Mark session — only if not already awarded. UPDATE returning current.
	var prev int
	err = tx.QueryRow(ctx, `
		UPDATE sessions
		SET xp_awarded = $1
		WHERE id = $2 AND xp_awarded = 0
		RETURNING xp_awarded`, xp, sessionID).Scan(&prev)
	if err != nil {
		if err == pgx.ErrNoRows {
			// Already awarded — idempotency hit.
			return nil, tx.Commit(ctx)
		}
		return nil, err
	}

	// 2) Ensure profile exists (lazy-create row если нет).
	if _, err := tx.Exec(ctx, `
		INSERT INTO profiles (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO NOTHING`, userID); err != nil {
		return nil, err
	}

	// 3) Increment xp_total + recompute grade.
	var oldGrade string
	if err := tx.QueryRow(ctx, `
		SELECT grade FROM profiles WHERE user_id = $1 FOR UPDATE`, userID).Scan(&oldGrade); err != nil {
		return nil, err
	}

	var newTotal int
	if err := tx.QueryRow(ctx, `
		UPDATE profiles
		SET xp_total = xp_total + $1
		WHERE user_id = $2
		RETURNING xp_total`, xp, userID).Scan(&newTotal); err != nil {
		return nil, err
	}

	newGrade := gamification.GradeForXP(newTotal)
	if newGrade != oldGrade {
		if _, err := tx.Exec(ctx, `
			UPDATE profiles SET grade = $1 WHERE user_id = $2`,
			newGrade, userID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &XpResult{
		XpAwarded: xp,
		XpTotal:   newTotal,
		OldGrade:  oldGrade,
		NewGrade:  newGrade,
	}, nil
}
