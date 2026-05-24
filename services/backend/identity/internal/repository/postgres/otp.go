// OTP repo — passwordless email login codes. Phase 8 / M4.
package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OtpCode — row из auth_otp_codes.
type OtpCode struct {
	ID        string
	Email     string
	Code      string
	ExpiresAt time.Time
	UsedAt    *time.Time
	Attempts  int
	CreatedAt time.Time
}

type OtpRepo struct {
	pool *pgxpool.Pool
}

func NewOtpRepo(pool *pgxpool.Pool) *OtpRepo { return &OtpRepo{pool: pool} }

// ErrOtpNotFound — нет active кода для email.
var ErrOtpNotFound = errors.New("otp not found")

// Create — выпустить новый код. Возвращает row.
func (r *OtpRepo) Create(
	ctx context.Context, email, code string, expiresAt time.Time,
) (*OtpCode, error) {
	const sql = `
		INSERT INTO auth_otp_codes (email, code, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, email, code, expires_at, used_at, attempts, created_at`
	row := r.pool.QueryRow(ctx, sql, email, code, expiresAt)
	return scanOtp(row)
}

// GetActive — самый свежий не-used, не-expired код для email.
// Возвращает ErrOtpNotFound если нет такого.
func (r *OtpRepo) GetActive(ctx context.Context, email string) (*OtpCode, error) {
	const sql = `
		SELECT id, email, code, expires_at, used_at, attempts, created_at
		FROM auth_otp_codes
		WHERE email = $1 AND used_at IS NULL AND expires_at > now()
		ORDER BY created_at DESC
		LIMIT 1`
	row := r.pool.QueryRow(ctx, sql, email)
	return scanOtp(row)
}

// MarkUsed — пометить код использованным (after successful match).
func (r *OtpRepo) MarkUsed(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE auth_otp_codes SET used_at = now() WHERE id = $1`, id)
	return err
}

// BumpAttempts — инкремент при неверном code submit. Возвращает новое значение.
func (r *OtpRepo) BumpAttempts(ctx context.Context, id string) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`UPDATE auth_otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
		id).Scan(&n)
	return n, err
}

// CleanupExpired — best-effort hard-delete expired+used > 1d (cron).
// Возвращает delete count.
func (r *OtpRepo) CleanupExpired(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM auth_otp_codes
		WHERE expires_at < now() - interval '1 day'
		   OR (used_at IS NOT NULL AND used_at < now() - interval '1 day')`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanOtp(row rowScanner) (*OtpCode, error) {
	var c OtpCode
	var usedAt *time.Time
	err := row.Scan(&c.ID, &c.Email, &c.Code, &c.ExpiresAt, &usedAt, &c.Attempts, &c.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrOtpNotFound
		}
		return nil, err
	}
	c.UsedAt = usedAt
	return &c, nil
}
