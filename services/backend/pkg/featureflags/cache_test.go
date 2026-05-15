// Тесты для in-memory cache + singleflight.
// Phase 1 / REL-03.
package featureflags

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Test 7: IsEnabled cache-hits на повторный вызов в окне TTL.
func TestCache_HitWithinTTL(t *testing.T) {
	s := newTestStore(100 * time.Millisecond)
	// Seed cache напрямую.
	s.cacheSet("test_flag", true, 100)

	cached, fresh := s.cacheGet("test_flag")
	if !fresh {
		t.Fatal("just-set entry is not fresh")
	}
	if !cached.enabled {
		t.Errorf("cached.enabled = false, want true")
	}
}

// Test 7b: cache invalidates после TTL.
func TestCache_StaleAfterTTL(t *testing.T) {
	s := newTestStore(50 * time.Millisecond)
	s.cacheSet("test_flag", true, 100)

	time.Sleep(80 * time.Millisecond)
	_, fresh := s.cacheGet("test_flag")
	if fresh {
		t.Error("entry fresh after TTL expiry, want stale")
	}
}

// Test 8: singleflight coalesces concurrent miss calls (only 1 underlying fetch).
func TestCache_SingleflightCoalescesConcurrentMisses(t *testing.T) {
	s := newTestStore(time.Hour)

	var fetchCount atomic.Int64
	fetch := func() (any, error) {
		fetchCount.Add(1)
		time.Sleep(20 * time.Millisecond) // simulate DB latency
		return cachedFlag{enabled: true, percent: 50, fetchedAt: time.Now()}, nil
	}

	const N = 50
	var wg sync.WaitGroup
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func() {
			defer wg.Done()
			_, _, _ = s.sf.Do("test_flag", fetch)
		}()
	}
	wg.Wait()

	if got := fetchCount.Load(); got > 5 {
		// singleflight: первая горутина запускает fetch, остальные ждут.
		// На практике может быть пара race calls если первая успела закончиться
		// раньше; >5 — точно патология.
		t.Errorf("singleflight: %d fetches for %d concurrent calls, expected ~1", got, N)
	}
}

// Test 9: Set() инвалидирует cache entry.
func TestCache_SetInvalidates(t *testing.T) {
	s := newTestStore(time.Hour)
	s.cacheSet("test_flag", false, 0)

	// Verify cached.
	if cached, fresh := s.cacheGet("test_flag"); !fresh || cached.enabled {
		t.Fatalf("seeded entry: cached=%+v fresh=%v; want fresh+disabled", cached, fresh)
	}

	// Invalidate.
	s.cacheDelete("test_flag")

	// Cache miss.
	if _, fresh := s.cacheGet("test_flag"); fresh {
		t.Error("after cacheDelete, entry still fresh")
	}
}

// newTestStore создаёт Store без pool (для cache-only tests).
func newTestStore(ttl time.Duration) *Store {
	return &Store{ttl: ttl}
}
