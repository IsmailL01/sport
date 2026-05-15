// Package featureflags — Postgres-backed boolean + percentage rollout flags.
// Phase 1 / REL-03.
//
// Source-of-truth: table `featureflags` (migration 0021_featureflags.up.sql).
// Каждый сервис держит 30-second in-memory cache + singleflight чтобы
// предотвратить thundering herd на cache miss. Cross-service invalidation —
// best-effort через TTL expiry (принимаем 30s lag для kill-switch флагов).
//
// Usage:
//
//	store := featureflags.NewPostgresStore(pool, 30*time.Second)
//	on := store.IsEnabled(ctx, userID, "strava_oauth_enabled")
//
// Per-user rollout: FNV-1a(userID || 0x00 || flagName) % 100 < rollout_percent.
// Deterministic — тот же (user, flag) возвращает тот же bucket across
// сервисами. 0x00 separator byte критичен: без него (uid=1, flag="0foo")
// коллизирует с (uid=10, flag="foo"). См. rollout.go.
//
// API mirror'ит pkg/audit (querier interface), pkg/ratelimit (Decision
// shape).  Subpackage внутри github.com/runningecosystem/backend/pkg.
package featureflags

import (
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/singleflight"
)

// Flag — public DTO. Mirror'ит схему featureflags table + admin DTO.
type Flag struct {
	Name            string
	Enabled         bool
	RolloutPercent  int
	Description     string
	UpdatedAt       time.Time
	UpdatedByUserID *string // UUID; nil если ещё ни разу не обновлялся.
}

// Store — read-through cache over Postgres-backed featureflags table.
//
// Concurrency: cache использует sync.Map; singleflight coalesces concurrent
// cache-miss fetches (см. RESEARCH §Pattern 7).  Все методы безопасны для
// concurrent use.
type Store struct {
	pool *pgxpool.Pool
	ttl  time.Duration
	// cache: map[string]cachedFlag.
	cache sync.Map
	// sf: coalesces concurrent fetches on cache-miss per flag name.
	sf  singleflight.Group
	log *slog.Logger
}

// cachedFlag — value stored в cache.
type cachedFlag struct {
	enabled   bool
	percent   int
	fetchedAt time.Time
	// missing=true означает, что флага нет в БД — кешируем negative result
	// чтобы не молотить DB на каждый запрос. Per-RESEARCH §Pattern 7 negative
	// cache на тот же TTL.
	missing bool
}

// NewPostgresStore — конструктор. ttl рекомендуется 30s для prod
// (CONTEXT D-11; D-13 — отдельный 5min mobile TTL).
func NewPostgresStore(pool *pgxpool.Pool, ttl time.Duration) *Store {
	return &Store{
		pool: pool,
		ttl:  ttl,
		log:  slog.Default(),
	}
}
