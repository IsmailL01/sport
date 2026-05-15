// Phase 1 / REL-03: per-user deterministic percentage rollout via FNV-1a.
//
// Per RESEARCH §Pattern 4 — FNV-1a 64-bit hash of (userID || 0x00 || flagName)
// % 100 < percent.  0x00 separator byte CRITICAL: без него
// (userID=1, flagName="0foo") и (userID=10, flagName="foo") хешируют
// одинаковый поток байт и коллизируют.  Research-verified pitfall.
//
// Determinism: тот же (uid, flagName, percent) всегда даёт тот же результат —
// клиент в bucket 42 для флага A остаётся в bucket 42 после server-restart.
package featureflags

import (
	"encoding/binary"
	"hash/fnv"
)

// Rollout — детерминированный per-user percentage rollout.
//
//   - percent ≤ 0 → всегда false (зашитый fast-path; пропускает hash).
//   - percent ≥ 100 → всегда true (fast-path).
//   - иначе FNV-1a hash(userID || 0x00 || flagName) % 100 < percent.
//
// userID=0 не запрещён, но обычно caller (Store.IsEnabled) обрабатывает
// anonymous отдельно (skip rollout, just global enabled).
func Rollout(userID int64, flagName string, percent int) bool {
	if percent <= 0 {
		return false
	}
	if percent >= 100 {
		return true
	}
	h := fnv.New64a()
	// BigEndian — стабильное представление int64 в bytes независимо от
	// архитектуры процессора. binary.Write на hash.Hash не возвращает err
	// (Hash.Write не failит), но проверим из педантичности.
	_ = binary.Write(h, binary.BigEndian, userID)
	// Separator byte. См. file header.
	h.Write([]byte{0x00})
	h.Write([]byte(flagName))
	bucket := int(h.Sum64() % 100)
	return bucket < percent
}
