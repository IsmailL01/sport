// Package postgres — pgx-репозитории social-graph.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/social-graph/internal/domain"
)

type ProfileRepo struct {
	pool *pgxpool.Pool
}

func NewProfileRepo(pool *pgxpool.Pool) *ProfileRepo {
	return &ProfileRepo{pool: pool}
}

const profileCols = `user_id, username, display_name, bio, avatar_media_id,
		privacy, global_role, banned_until, last_seen_at, created_at, updated_at`

// GetByID — найти профиль по user_id. ErrProfileNotFound если нет.
func (r *ProfileRepo) GetByID(ctx context.Context, userID string) (*domain.Profile, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+profileCols+` FROM profiles WHERE user_id = $1`, userID)
	return scanProfile(row)
}

// GetByUsername — найти по username (case-insensitive через CITEXT).
func (r *ProfileRepo) GetByUsername(ctx context.Context, username string) (*domain.Profile, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+profileCols+` FROM profiles WHERE username = $1`, username)
	return scanProfile(row)
}

// EnsureExists — INSERT default profile если ещё нет (lazy creation на первом GET).
// Берёт display_name из users.display_name как seed.
func (r *ProfileRepo) EnsureExists(ctx context.Context, userID string) error {
	const sql = `
		INSERT INTO profiles (user_id, display_name, privacy, global_role)
		SELECT u.id, u.display_name, 'public', 'user'
		FROM users u WHERE u.id = $1
		ON CONFLICT (user_id) DO NOTHING`
	_, err := r.pool.Exec(ctx, sql, userID)
	return err
}

// Patch — обновить редактируемые поля профиля. Игнорирует nil-значения.
type ProfilePatch struct {
	Username      *string
	DisplayName   *string
	Bio           *string
	AvatarMediaID *string
	Privacy       *string
}

func (r *ProfileRepo) Patch(ctx context.Context, userID string, p ProfilePatch) (*domain.Profile, error) {
	const sql = `
		UPDATE profiles SET
		  username        = COALESCE($2, username),
		  display_name    = COALESCE($3, display_name),
		  bio             = COALESCE($4, bio),
		  avatar_media_id = COALESCE($5::uuid, avatar_media_id),
		  privacy         = COALESCE($6, privacy),
		  updated_at      = now()
		WHERE user_id = $1
		RETURNING ` + profileCols
	row := r.pool.QueryRow(ctx, sql,
		userID, p.Username, p.DisplayName, p.Bio, p.AvatarMediaID, p.Privacy,
	)
	prof, err := scanProfile(row)
	if err != nil {
		// 23505 = unique_violation (username)
		var pgErr interface{ SQLState() string }
		if errors.As(err, &pgErr) && pgErr.SQLState() == "23505" {
			return nil, domain.ErrUsernameTaken
		}
		return nil, err
	}
	return prof, nil
}

// SearchByQuery — trigram-поиск по username + display_name. Возвращает до limit профилей.
func (r *ProfileRepo) SearchByQuery(ctx context.Context, query string, limit int) ([]*domain.Profile, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	const sql = `
		SELECT ` + profileCols + ` FROM profiles
		WHERE username % $1 OR display_name % $1
		ORDER BY GREATEST(
		  COALESCE(similarity(username::text, $1), 0),
		  COALESCE(similarity(display_name, $1), 0)
		) DESC
		LIMIT $2`
	rows, err := r.pool.Query(ctx, sql, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Profile
	for rows.Next() {
		p, err := scanProfile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// BulkGet — пакетная выборка профилей (для feed/chat hydrate-by-id).
func (r *ProfileRepo) BulkGet(ctx context.Context, ids []string) ([]*domain.Profile, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := r.pool.Query(ctx, `SELECT `+profileCols+` FROM profiles WHERE user_id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*domain.Profile
	for rows.Next() {
		p, err := scanProfile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

type scannable interface {
	Scan(dest ...any) error
}

func scanProfile(row scannable) (*domain.Profile, error) {
	var p domain.Profile
	var bannedUntil, lastSeenAt *time.Time
	if err := row.Scan(
		&p.UserID, &p.Username, &p.DisplayName, &p.Bio, &p.AvatarMediaID,
		&p.Privacy, &p.GlobalRole, &bannedUntil, &lastSeenAt,
		&p.CreatedAt, &p.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrProfileNotFound
		}
		return nil, err
	}
	p.BannedUntil = bannedUntil
	p.LastSeenAt = lastSeenAt
	return &p, nil
}
