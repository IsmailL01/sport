// featureflag_adapter.go — Phase 5 / Plan 05-06 / OBS-08.
//
// Адаптер между:
//   • DebugSessionMiddleware.FeatureFlagChecker (UUID string userID)
//   • featureflags.Store.IsEnabled(ctx, int64 userID, name) (Phase 1 schema)
//
// featureflags.Store был спроектирован под int64 user IDs (legacy Phase 1
// schema decision), но Claims.UserID — UUID string (users.id UUID PRIMARY
// KEY). Конверсия через FNV-1a hash (тот же алгоритм, что используется
// внутри pkg/featureflags для per-user rollout bucket — deterministic, no
// extra DB round-trip).
//
// Why hash to int64 instead of changing Store API: featureflags.Store.IsEnabled
// is consumed by 8 services + admin UI; изменение signature — separate
// refactor ticket (Phase 1 REL-03 territory). Adapter keeps Plan 05-06
// surface-area minimal.
package observability

import (
	"context"
	"hash/fnv"
	"math"
)

// FeatureflagStore — narrowed interface для существующего pkg/featureflags.Store.
// Объявлен в observability package чтобы избежать import cycle (featureflags
// → audit → permissions ... ничего не импортирует observability — clean DAG).
type FeatureflagStore interface {
	IsEnabled(ctx context.Context, userID int64, flagName string) bool
}

// NewFeatureflagAdapter создаёт FeatureFlagChecker, который проверяет
// `tester_debug_logging` flag через предоставленный Store. Конвертирует UUID
// string userID → int64 через FNV-1a hash (consistent с Phase 1 rollout
// bucketing).
//
// Nil-safety: если store == nil → adapter возвращает false для всех запросов
// (fail-closed — gate stays denied).
func NewFeatureflagAdapter(store FeatureflagStore) FeatureFlagChecker {
	return &featureflagAdapter{store: store}
}

type featureflagAdapter struct {
	store FeatureflagStore
}

const testerDebugLoggingFlagName = "tester_debug_logging"

func (a *featureflagAdapter) IsTesterDebugEnabled(ctx context.Context, userUUID string) bool {
	if a == nil || a.store == nil || userUUID == "" {
		return false
	}
	return a.store.IsEnabled(ctx, hashUUIDToInt64(userUUID), testerDebugLoggingFlagName)
}

// hashUUIDToInt64 — deterministic FNV-1a 64-bit hash of UUID string. Used to
// bridge UUID-string userID space (Claims.UserID) к int64 userID space
// (featureflags.Store API). Same algorithm family as pkg/featureflags/rollout.go.
//
// math.MaxInt64 cap — featureflags.Store.IsEnabled takes int64; FNV produces
// uint64; cap к positive-int64 range избегает overflow к negative bucket.
func hashUUIDToInt64(uuid string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(uuid))
	v := h.Sum64()
	if v > math.MaxInt64 {
		v &= math.MaxInt64
	}
	return int64(v)
}
