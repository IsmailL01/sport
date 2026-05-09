// Reports + audit_log repository — Phase 8 / E.
package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
)

type ReportRepo struct {
	pool *pgxpool.Pool
}

func NewReportRepo(pool *pgxpool.Pool) *ReportRepo {
	return &ReportRepo{pool: pool}
}

const reportCols = `id, reporter_id, target_kind, target_id, reason, body,
       status, resolution_action, resolved_at, resolved_by, created_at`

type CreateReportInput struct {
	ReporterID string
	TargetKind domain.ReportTargetKind
	TargetID   string
	Reason     domain.ReportReason
	Body       *string
}

func (r *ReportRepo) Create(ctx context.Context, in CreateReportInput) (*domain.Report, error) {
	const sql = `
		INSERT INTO reports (reporter_id, target_kind, target_id, reason, body)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + reportCols
	row := r.pool.QueryRow(ctx, sql,
		in.ReporterID, string(in.TargetKind), in.TargetID, string(in.Reason), in.Body,
	)
	return scanReport(row)
}

func (r *ReportRepo) GetByID(ctx context.Context, id string) (*domain.Report, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+reportCols+` FROM reports WHERE id = $1`, id)
	return scanReport(row)
}

// ListByReporter — мои зарепорченные.
func (r *ReportRepo) ListByReporter(ctx context.Context, reporterID string, limit int) ([]*domain.Report, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+reportCols+` FROM reports WHERE reporter_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		reporterID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*domain.Report, 0, limit)
	for rows.Next() {
		rep, err := scanReport(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rep)
	}
	return out, rows.Err()
}

// ListByStatus — admin queue.
func (r *ReportRepo) ListByStatus(ctx context.Context, status domain.ReportStatus, limit int) ([]*domain.Report, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+reportCols+` FROM reports WHERE status = $1
		 ORDER BY created_at ASC LIMIT $2`,
		string(status), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*domain.Report, 0, limit)
	for rows.Next() {
		rep, err := scanReport(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rep)
	}
	return out, rows.Err()
}

// Resolve — admin принимает решение по report.
func (r *ReportRepo) Resolve(
	ctx context.Context, id string, action domain.ResolutionAction,
	status domain.ReportStatus, resolverID string,
) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE reports
		 SET status = $1, resolution_action = $2, resolved_at = now(), resolved_by = $3
		 WHERE id = $4 AND status IN ('open','under_review')`,
		string(status), string(action), resolverID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// === audit_log ===

type AuditRepo struct {
	pool *pgxpool.Pool
}

func NewAuditRepo(pool *pgxpool.Pool) *AuditRepo {
	return &AuditRepo{pool: pool}
}

type AuditInput struct {
	ActorID    *string
	Action     string
	TargetKind string
	TargetID   string
	Before     []byte // raw JSON or nil
	After      []byte
	Metadata   []byte
}

func (r *AuditRepo) Log(ctx context.Context, in AuditInput) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO audit_log
		  (actor_id, action, target_kind, target_id, before_data, after_data, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		in.ActorID, in.Action, in.TargetKind, in.TargetID,
		nilIfEmpty(in.Before), nilIfEmpty(in.After), nilIfEmpty(in.Metadata),
	)
	return err
}

// ListRecent — последние N audit entries для admin web UI / forensics.
func (r *AuditRepo) ListRecent(ctx context.Context, limit int) ([]*domain.AuditEntry, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, actor_id, action, target_kind, target_id,
		       before_data, after_data, metadata, created_at
		FROM audit_log
		ORDER BY created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*domain.AuditEntry, 0, limit)
	for rows.Next() {
		var e domain.AuditEntry
		if err := rows.Scan(
			&e.ID, &e.ActorID, &e.Action, &e.TargetKind, &e.TargetID,
			&e.Before, &e.After, &e.Metadata, &e.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

func (r *AuditRepo) ListByActor(ctx context.Context, actorID string, limit int) ([]*domain.AuditEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, actor_id, action, target_kind, target_id,
		       before_data, after_data, metadata, created_at
		FROM audit_log
		WHERE actor_id = $1
		ORDER BY created_at DESC LIMIT $2`,
		actorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*domain.AuditEntry, 0, limit)
	for rows.Next() {
		var e domain.AuditEntry
		if err := rows.Scan(
			&e.ID, &e.ActorID, &e.Action, &e.TargetKind, &e.TargetID,
			&e.Before, &e.After, &e.Metadata, &e.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

// === scan helpers ===

func scanReport(row interface {
	Scan(...any) error
}) (*domain.Report, error) {
	var rep domain.Report
	var kind, reason, status string
	var resAction *string
	if err := row.Scan(
		&rep.ID, &rep.ReporterID, &kind, &rep.TargetID, &reason, &rep.Body,
		&status, &resAction, &rep.ResolvedAt, &rep.ResolvedBy, &rep.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	rep.TargetKind = domain.ReportTargetKind(kind)
	rep.Reason = domain.ReportReason(reason)
	rep.Status = domain.ReportStatus(status)
	if resAction != nil {
		ra := domain.ResolutionAction(*resAction)
		rep.ResolutionAction = &ra
	}
	return &rep, nil
}

func nilIfEmpty(b []byte) []byte {
	if len(b) == 0 {
		return nil
	}
	return b
}
