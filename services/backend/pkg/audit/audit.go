// Package audit — shared audit_log writer (Phase 8 / L).
//
// Все state-changing actions across сервисов пишут row в audit_log
// в той же transaction что и domain change (или as best-effort POST-write).
//
// Каждый row несёт capability string (из pkg/permissions) — стабильный
// machine-readable identifier действия. Audit_log table живёт в общей DB,
// схема в migration 0018_moderation.up.sql.
//
// Usage:
//   logger := audit.New(pool)
//   logger.Log(ctx, audit.Entry{
//       ActorID:    actorID,
//       Capability: permissions.CapPostDeleteOthers,
//       Action:     "delete_post",                 // human-readable verb
//       TargetKind: "post",
//       TargetID:   postID,
//       Metadata:   map[string]any{"reason": "spam"},
//   })
//
// Best-effort: на DB-error логирует warn и продолжает; не валит main flow.
package audit

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/pkg/permissions"
)

// Entry — single audit_log row.
type Entry struct {
	// ActorID — кто произвёл действие. nil → system action.
	ActorID *string
	// Capability — machine-readable ID из pkg/permissions. Required.
	Capability permissions.Capability
	// Action — короткое слово-глагол (delete_post, ban_user, resolve_report).
	Action string
	// TargetKind — тип ресурса (post, story, message, user, report).
	TargetKind string
	// TargetID — UUID или составной string-ID.
	TargetID string
	// Before / After — snapshots (опц., для replay / forensics).
	Before any
	After  any
	// Metadata — extra context (reason, oldRole/newRole, IP, user-agent).
	Metadata map[string]any
}

// Logger — append-only writer для audit_log.
type Logger struct {
	q querier
}

type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// New — конструктор. Принимает pgxpool либо tx (через интерфейс Exec).
func New(q *pgxpool.Pool) *Logger { return &Logger{q: q} }

// NewFromQuerier — для tx-based audit (write в той же транзакции что и
// domain change). Пример: postgres.AuditInTx(tx, entry).
func NewFromQuerier(q querier) *Logger { return &Logger{q: q} }

// Log — best-effort. На error возвращает err но caller обычно ignores
// (audit failure не должен валить domain action).
func (l *Logger) Log(ctx context.Context, e Entry) error {
	if l == nil || l.q == nil {
		return errors.New("audit: nil logger")
	}
	if e.Action == "" {
		return errors.New("audit: empty action")
	}

	// Capability дописываем в metadata (chrono-search "all post.delete_others").
	meta := e.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	if e.Capability != "" {
		meta["capability"] = string(e.Capability)
	}

	beforeJSON := mustJSON(e.Before)
	afterJSON := mustJSON(e.After)
	metaJSON := mustJSON(meta)

	_, err := l.q.Exec(ctx, `
		INSERT INTO audit_log
		  (actor_id, action, target_kind, target_id, before_data, after_data, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		e.ActorID, e.Action, e.TargetKind, e.TargetID,
		nilIfEmpty(beforeJSON), nilIfEmpty(afterJSON), nilIfEmpty(metaJSON),
	)
	return err
}

// LogQuiet — best-effort wrapper. На error пишет в logger (callable из
// hot-path кода без error-bubbling).
func (l *Logger) LogQuiet(ctx context.Context, e Entry) {
	_ = l.Log(ctx, e)
}

func mustJSON(v any) []byte {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return b
}

func nilIfEmpty(b []byte) []byte {
	if len(b) == 0 {
		return nil
	}
	return b
}
