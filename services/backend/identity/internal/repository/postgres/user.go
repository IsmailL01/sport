// Package postgres реализует UserRepo и RefreshTokenRepo через pgx.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/identity/internal/domain"
)

// UserRepo — Postgres-реализация repository.UserRepo.
type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

func (r *UserRepo) Create(ctx context.Context, u *domain.User) error {
	const sql = `
		INSERT INTO users (id, email, password_hash, display_name, locale, timezone, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`
	if u.ID == "" {
		// Дайдим Postgres сгенерировать UUID — но потом надо будет получить его обратно.
		const sqlReturning = `
			INSERT INTO users (email, password_hash, display_name, locale, timezone, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $6)
			RETURNING id, created_at, updated_at`
		row := r.pool.QueryRow(ctx, sqlReturning, u.Email, u.PasswordHash, nullable(u.DisplayName), defaultLocale(u.Locale), defaultTimezone(u.Timezone), now(u.CreatedAt))
		if err := row.Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return mapInsertErr(err)
		}
		return nil
	}
	_, err := r.pool.Exec(ctx, sql, u.ID, u.Email, u.PasswordHash, nullable(u.DisplayName), defaultLocale(u.Locale), defaultTimezone(u.Timezone), now(u.CreatedAt))
	return mapInsertErr(err)
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*domain.User, error) {
	return r.scanOne(ctx, `WHERE id = $1`, id)
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	return r.scanOne(ctx, `WHERE email = $1`, email)
}

func (r *UserRepo) scanOne(ctx context.Context, where string, args ...any) (*domain.User, error) {
	const baseSQL = `
		SELECT id, email, password_hash, COALESCE(display_name, ''), locale, timezone, created_at, updated_at
		FROM users `
	row := r.pool.QueryRow(ctx, baseSQL+where, args...)
	var u domain.User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.Locale, &u.Timezone, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

func mapInsertErr(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		// 23505 = unique_violation. Единственный unique constraint — на email.
		if pgErr.Code == "23505" {
			return domain.ErrEmailAlreadyExists
		}
	}
	return err
}

// Хелперы.

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func defaultLocale(s string) string {
	if s == "" {
		return "en"
	}
	return s
}

func defaultTimezone(s string) string {
	if s == "" {
		return "UTC"
	}
	return s
}

func now(t time.Time) time.Time {
	if t.IsZero() {
		return time.Now().UTC()
	}
	return t.UTC()
}
