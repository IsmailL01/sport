// Posts repository — Phase 8 / D.
//
// Изолирован от stories.go: разные сущности, разные таблицы. Шарят только
// pgxpool через DI.
package postgres

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/runningecosystem/backend/feed/internal/domain"
)

type PostRepo struct {
	pool *pgxpool.Pool
}

func NewPostRepo(pool *pgxpool.Pool) *PostRepo {
	return &PostRepo{pool: pool}
}

const postCols = `id, author_id, kind, body, media_id, session_ref,
       like_count, comment_count, created_at, edited_at, deleted_at`

type CreatePostInput struct {
	AuthorID   string
	Kind       domain.PostKind
	Body       *string
	MediaID    *string
	SessionRef *string
}

func (r *PostRepo) Create(ctx context.Context, in CreatePostInput) (*domain.Post, error) {
	const sql = `
		INSERT INTO posts (author_id, kind, body, media_id, session_ref)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING ` + postCols
	row := r.pool.QueryRow(ctx, sql,
		in.AuthorID, string(in.Kind), in.Body, in.MediaID, in.SessionRef,
	)
	return scanPost(row)
}

func (r *PostRepo) GetByID(ctx context.Context, id string) (*domain.Post, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+postCols+` FROM posts WHERE id = $1 AND deleted_at IS NULL`,
		id)
	return scanPost(row)
}

// SoftDelete — owner-side delete. Сохраняет ряд для аудита.
func (r *PostRepo) SoftDelete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE posts SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// HomeFeed — глобальная лента всех постов, с приоритетом followees.
//
// Phase M9.7: лента открыта всем (как Twitter — публичная), но
// собственные посты + посты followees показываются раньше, чем
// chronological «глобальный» хвост. Это даёт ленте смысл подписок
// без ограничения видимости.
//
// Сортировка:
//  1. own_or_followee DESC (1 = свой/подписан, 0 = чужой)
//  2. created_at DESC
//  3. id DESC (tiebreaker)
//
// Cursor encodes (own_or_followee, created_at, id) для стабильной пагинации.
// Пока используем простой созданный_at|id cursor — followee-приоритет
// в первом window работает, но на пагинации возможно «увидеть» уже
// показанные followee-посты повторно если они старее cursor'а. Для MVP
// допустимо: на load-more новые followee-посты выводятся в верх.
//
// userID нужен и для iLiked subquery, и для own_or_followee rank.
func (r *PostRepo) HomeFeed(
	ctx context.Context,
	userID string,
	cursor string,
	limit int,
) ([]*domain.PostWithViewerState, string, error) {
	cursorTime, cursorID, err := parseFeedCursor(cursor)
	if err != nil {
		return nil, "", err
	}

	var args []any
	var b strings.Builder
	b.WriteString(`
		SELECT ` + postCols + `,
		  EXISTS (SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1)
		FROM posts p
		WHERE p.deleted_at IS NULL`)
	args = append(args, userID)

	if !cursorTime.IsZero() {
		b.WriteString(` AND (p.created_at, p.id) < ($2::timestamptz, $3::uuid)`)
		args = append(args, cursorTime, cursorID)
	}
	b.WriteString(`
		ORDER BY
		  CASE
		    WHEN p.author_id = $1
		      OR p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)
		    THEN 0 ELSE 1
		  END,
		  p.created_at DESC, p.id DESC
		LIMIT $` + itoa(len(args)+1))
	args = append(args, limit+1)

	rows, err := r.pool.Query(ctx, b.String(), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	out := make([]*domain.PostWithViewerState, 0, limit)
	for rows.Next() {
		var p domain.PostWithViewerState
		var kind string
		if err := rows.Scan(
			&p.ID, &p.AuthorID, &kind, &p.Body, &p.MediaID, &p.SessionRef,
			&p.LikeCount, &p.CommentCount, &p.CreatedAt, &p.EditedAt, &p.DeletedAt,
			&p.ILiked,
		); err != nil {
			return nil, "", err
		}
		p.Kind = domain.PostKind(kind)
		out = append(out, &p)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	// Compute next cursor (если есть лишняя строка).
	var nextCursor string
	if len(out) > limit {
		last := out[limit-1]
		nextCursor = last.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
		out = out[:limit]
	}
	return out, nextCursor, nil
}

// === Likes ===

// AddLike — idempotent. Возвращает (added=true) если строка вставлена впервые.
func (r *PostRepo) AddLike(ctx context.Context, postID, userID string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, postID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// RemoveLike — idempotent.
func (r *PostRepo) RemoveLike(ctx context.Context, postID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, postID, userID)
	return err
}

// === Comments ===

func (r *PostRepo) CreateComment(ctx context.Context, postID, authorID, body string) (*domain.PostComment, error) {
	const sql = `
		INSERT INTO post_comments (post_id, author_id, body)
		VALUES ($1, $2, $3)
		RETURNING id, post_id, author_id, body, created_at, deleted_at`
	row := r.pool.QueryRow(ctx, sql, postID, authorID, body)
	return scanComment(row)
}

func (r *PostRepo) ListComments(
	ctx context.Context, postID string, cursor string, limit int,
) ([]*domain.PostComment, string, error) {
	cursorTime, cursorID, err := parseFeedCursor(cursor)
	if err != nil {
		return nil, "", err
	}
	var args []any
	var b strings.Builder
	b.WriteString(`
		SELECT id, post_id, author_id, body, created_at, deleted_at
		FROM post_comments
		WHERE post_id = $1 AND deleted_at IS NULL`)
	args = append(args, postID)
	if !cursorTime.IsZero() {
		b.WriteString(` AND (created_at, id) < ($2::timestamptz, $3::uuid)`)
		args = append(args, cursorTime, cursorID)
	}
	b.WriteString(`
		ORDER BY created_at DESC, id DESC
		LIMIT $` + itoa(len(args)+1))
	args = append(args, limit+1)

	rows, err := r.pool.Query(ctx, b.String(), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	out := make([]*domain.PostComment, 0, limit)
	for rows.Next() {
		c, err := scanComment(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	var nextCursor string
	if len(out) > limit {
		last := out[limit-1]
		nextCursor = last.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
		out = out[:limit]
	}
	return out, nextCursor, nil
}

func (r *PostRepo) GetComment(ctx context.Context, id string) (*domain.PostComment, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, post_id, author_id, body, created_at, deleted_at
		FROM post_comments WHERE id = $1 AND deleted_at IS NULL`, id)
	return scanComment(row)
}

func (r *PostRepo) SoftDeleteComment(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE post_comments SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
		id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// === scan helpers ===

type rowScanner interface {
	Scan(dest ...any) error
}

func scanPost(row rowScanner) (*domain.Post, error) {
	var p domain.Post
	var kind string
	err := row.Scan(
		&p.ID, &p.AuthorID, &kind, &p.Body, &p.MediaID, &p.SessionRef,
		&p.LikeCount, &p.CommentCount, &p.CreatedAt, &p.EditedAt, &p.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	p.Kind = domain.PostKind(kind)
	return &p, nil
}

func scanComment(row rowScanner) (*domain.PostComment, error) {
	var c domain.PostComment
	err := row.Scan(&c.ID, &c.PostID, &c.AuthorID, &c.Body, &c.CreatedAt, &c.DeletedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func parseFeedCursor(cursor string) (time.Time, string, error) {
	if cursor == "" {
		return time.Time{}, "", nil
	}
	idx := strings.LastIndex(cursor, "|")
	if idx <= 0 || idx == len(cursor)-1 {
		return time.Time{}, "", domain.ErrInvalidArg
	}
	t, err := time.Parse(time.RFC3339Nano, cursor[:idx])
	if err != nil {
		return time.Time{}, "", domain.ErrInvalidArg
	}
	return t, cursor[idx+1:], nil
}

// itoa — мини-helper для построения placeholders без impotr-ить strconv
// (pgx требует $N синтаксис в строках).
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
