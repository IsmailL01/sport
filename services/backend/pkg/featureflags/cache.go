// Cache helpers — in-memory sync.Map с TTL + singleflight coordination.
// Phase 1 / REL-03.
//
// Pattern source: RESEARCH §Pattern 7 (Postgres flag store + 30s cache +
// singleflight). Negative caching включён: missing flag тоже cache-able на
// тот же TTL — иначе каждый запрос к unknown flag бьёт DB.
package featureflags

import "time"

// cacheGet возвращает запись и флаг fresh (TTL ещё не истёк).
// missing flag тоже валидный cached entry: caller увидит cached.missing=true.
func (s *Store) cacheGet(name string) (cachedFlag, bool) {
	v, ok := s.cache.Load(name)
	if !ok {
		return cachedFlag{}, false
	}
	cf, ok := v.(cachedFlag)
	if !ok {
		return cachedFlag{}, false
	}
	if time.Since(cf.fetchedAt) > s.ttl {
		return cf, false
	}
	return cf, true
}

// cacheSet записывает found flag (missing=false).
func (s *Store) cacheSet(name string, enabled bool, percent int) {
	s.cache.Store(name, cachedFlag{
		enabled:   enabled,
		percent:   percent,
		fetchedAt: time.Now(),
		missing:   false,
	})
}

// cacheSetMissing записывает negative-cache entry — flag не существует в БД.
func (s *Store) cacheSetMissing(name string) {
	s.cache.Store(name, cachedFlag{
		fetchedAt: time.Now(),
		missing:   true,
	})
}

// cacheDelete инвалидирует entry (например, после Set()).
func (s *Store) cacheDelete(name string) {
	s.cache.Delete(name)
}
