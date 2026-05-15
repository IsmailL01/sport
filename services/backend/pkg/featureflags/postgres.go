// Postgres implementation of Store API.
// Phase 1 / REL-03.
package featureflags

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// IsEnabled — main read path.  TTL-cached + singleflight на cache miss.
//
// Семантика:
//
//   - userID = 0 → anonymous; возвращаем только enabled_bool (без rollout).
//   - userID > 0 → enabled_bool && Rollout(userID, name, rollout_percent).
//   - flag не существует в БД → false (fail-safe; кешируется как negative entry).
//   - pool == nil или query err → false (fail-closed) + warn-log.
func (s *Store) IsEnabled(ctx context.Context, userID int64, name string) bool {
	if s == nil {
		return false
	}
	if s.pool == nil {
		// Fail-closed: misconfigured store или pool down.
		s.warn("nil pool", "flag", name)
		return false
	}

	// 1) Cache lookup.
	if cf, fresh := s.cacheGet(name); fresh {
		return resolveEnabled(cf, userID, name)
	}

	// 2) Cache miss → fetch через singleflight (concurrent calls coalesce).
	v, err, _ := s.sf.Do(name, func() (any, error) {
		return s.fetchOne(ctx, name)
	})
	if err != nil {
		// Query error.  Логируем и fail-closed.  Не кешируем — следующая попытка
		// может succeed.
		s.warn("fetch failed", "flag", name, "err", err)
		return false
	}
	cf, ok := v.(cachedFlag)
	if !ok {
		return false
	}
	return resolveEnabled(cf, userID, name)
}

// resolveEnabled применяет per-user rollout к cached entry.
func resolveEnabled(cf cachedFlag, userID int64, name string) bool {
	if cf.missing {
		return false
	}
	if !cf.enabled {
		return false
	}
	// Anonymous → skip rollout.
	if userID == 0 {
		return true
	}
	// percent=100 (или >=100 fast-path) → all-in.
	if cf.percent >= 100 {
		return true
	}
	if cf.percent <= 0 {
		// Enabled но 0% rollout означает: feature off for all users but
		// будет flipped on dev's machine via direct DB или прямой flip.
		// Семантика: enabled_bool=true && rollout_percent=0 → false для всех
		// пользователей (rollout=0 фильтрует всех).  См. CONTEXT D-12.
		return false
	}
	return Rollout(userID, name, cf.percent)
}

// fetchOne читает одну запись и обновляет cache.  Caller passes through
// singleflight чтобы concurrent миссы не дублировали query.
func (s *Store) fetchOne(ctx context.Context, name string) (cachedFlag, error) {
	const q = `SELECT enabled_bool, rollout_percent FROM featureflags WHERE flag_name = $1`
	var enabled bool
	var percent int
	err := s.pool.QueryRow(ctx, q, name).Scan(&enabled, &percent)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Negative cache: не существует.  Кешируем чтобы не молотить DB.
			s.cacheSetMissing(name)
			cf, _ := s.cacheGet(name)
			return cf, nil
		}
		return cachedFlag{}, err
	}
	s.cacheSet(name, enabled, percent)
	cf, _ := s.cacheGet(name)
	return cf, nil
}

// Set — admin write.  Validates percent, UPDATE row, инвалидирует cache.
// Возвращает err если row не существует.
func (s *Store) Set(ctx context.Context, name string, enabled bool, percent int, actorID string) error {
	if s == nil || s.pool == nil {
		return errors.New("featureflags: store not initialized")
	}
	if percent < 0 || percent > 100 {
		return fmt.Errorf("featureflags: percent %d out of range [0,100]", percent)
	}
	if name == "" {
		return errors.New("featureflags: empty flag name")
	}
	const q = `UPDATE featureflags
		SET enabled_bool = $2, rollout_percent = $3, updated_at = NOW(), updated_by_user_id = $4
		WHERE flag_name = $1`
	var actorArg any
	if actorID == "" {
		actorArg = nil
	} else {
		actorArg = actorID
	}
	tag, err := s.pool.Exec(ctx, q, name, enabled, percent, actorArg)
	if err != nil {
		return fmt.Errorf("featureflags: UPDATE: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("featureflags: flag %q does not exist", name)
	}
	// Invalidate cache entry; следующий IsEnabled / List вернёт свежее значение.
	s.cacheDelete(name)
	return nil
}

// List — admin read.  Возвращает все ряды в алфавитном порядке flag_name.
func (s *Store) List(ctx context.Context) ([]Flag, error) {
	if s == nil || s.pool == nil {
		return nil, errors.New("featureflags: store not initialized")
	}
	const q = `SELECT flag_name, enabled_bool, rollout_percent,
	                  COALESCE(description, ''),
	                  updated_at,
	                  updated_by_user_id::text
	           FROM featureflags
	           ORDER BY flag_name`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("featureflags: query: %w", err)
	}
	defer rows.Close()

	var out []Flag
	for rows.Next() {
		var f Flag
		var updatedBy *string
		if err := rows.Scan(&f.Name, &f.Enabled, &f.RolloutPercent, &f.Description, &f.UpdatedAt, &updatedBy); err != nil {
			return nil, fmt.Errorf("featureflags: scan: %w", err)
		}
		f.UpdatedByUserID = updatedBy
		out = append(out, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("featureflags: rows: %w", err)
	}
	return out, nil
}

// warn — internal slog wrapper.  Безопасен при nil-logger.
func (s *Store) warn(msg string, kv ...any) {
	if s == nil || s.log == nil {
		return
	}
	args := append([]any{}, kv...)
	s.log.Warn("featureflags: "+msg, args...)
}
