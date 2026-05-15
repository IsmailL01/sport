// Тесты публичного API Store (IsEnabled / Set / List).
// Phase 1 / REL-03.
//
// Postgres-impl-тесты используют PG_TEST_URL env. Если она не выставлена —
// skip (CI без containers). См. RESEARCH.md §Pitfalls #1.
package featureflags

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Test 10: IsEnabled возвращает false для отсутствующего флага (fail-safe).
func TestIsEnabled_UnknownFlag_FailsSafe(t *testing.T) {
	pool := mustTestPool(t)
	defer pool.Close()
	mustResetSchema(t, pool)

	s := NewPostgresStore(pool, time.Second)
	got := s.IsEnabled(context.Background(), 1, "no_such_flag")
	if got {
		t.Errorf("IsEnabled(unknown_flag) = true, want false (fail-safe)")
	}
}

// Test 11: IsEnabled returns false если Postgres pool nil / down (graceful).
func TestIsEnabled_PostgresDown_FailsClosed(t *testing.T) {
	// Nil pool — закрытый или down.
	s := &Store{pool: nil, ttl: time.Second}
	got := s.IsEnabled(context.Background(), 1, "any_flag")
	if got {
		t.Errorf("IsEnabled with nil pool = true, want false (fail-closed)")
	}
}

// Test 12: Set() обновляет updated_at и updated_by_user_id.
func TestSet_UpdatesAuditColumns(t *testing.T) {
	pool := mustTestPool(t)
	defer pool.Close()
	mustResetSchema(t, pool)

	// Seed одну запись.
	_, err := pool.Exec(context.Background(),
		`INSERT INTO featureflags(flag_name, description) VALUES ('test_flag', 'test')`)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Read pre-update.
	var beforeAt time.Time
	if err := pool.QueryRow(context.Background(),
		`SELECT updated_at FROM featureflags WHERE flag_name='test_flag'`).Scan(&beforeAt); err != nil {
		t.Fatalf("read before: %v", err)
	}

	// Set с актором (используем гарантированно валидный UUID, который
	// добавлен в users в mustResetSchema).
	s := NewPostgresStore(pool, time.Second)
	actorID := testActorUUID
	time.Sleep(10 * time.Millisecond) // чтобы updated_at сдвинулся
	if err := s.Set(context.Background(), "test_flag", true, 50, actorID); err != nil {
		t.Fatalf("Set: %v", err)
	}

	// Read after.
	var afterAt time.Time
	var enabled bool
	var percent int
	var updatedBy *string
	if err := pool.QueryRow(context.Background(),
		`SELECT enabled_bool, rollout_percent, updated_at, updated_by_user_id::text FROM featureflags WHERE flag_name='test_flag'`).
		Scan(&enabled, &percent, &afterAt, &updatedBy); err != nil {
		t.Fatalf("read after: %v", err)
	}

	if !enabled {
		t.Error("after Set(enabled=true): enabled_bool = false")
	}
	if percent != 50 {
		t.Errorf("after Set(percent=50): rollout_percent = %d", percent)
	}
	if !afterAt.After(beforeAt) {
		t.Errorf("updated_at not advanced: before=%v after=%v", beforeAt, afterAt)
	}
	if updatedBy == nil || *updatedBy != actorID {
		t.Errorf("updated_by_user_id = %v, want %s", updatedBy, actorID)
	}
}

// Test 12b: Set() unknown flag → error.
func TestSet_UnknownFlag_Error(t *testing.T) {
	pool := mustTestPool(t)
	defer pool.Close()
	mustResetSchema(t, pool)

	s := NewPostgresStore(pool, time.Second)
	err := s.Set(context.Background(), "nonexistent_flag", true, 50, testActorUUID)
	if err == nil {
		t.Error("Set(unknown) = nil err, want error")
	}
}

// Test (cache hit avoids DB): второй call в окне TTL должен hit cache.
func TestIsEnabled_CacheHit_NoSecondQuery(t *testing.T) {
	pool := mustTestPool(t)
	defer pool.Close()
	mustResetSchema(t, pool)

	_, err := pool.Exec(context.Background(),
		`INSERT INTO featureflags(flag_name, enabled_bool, rollout_percent) VALUES ('hit_test', true, 100)`)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	s := NewPostgresStore(pool, time.Hour)
	// First call — populates cache.
	if !s.IsEnabled(context.Background(), 1, "hit_test") {
		t.Fatal("first IsEnabled = false; want true")
	}
	// Удалим row напрямую — если cache работает, IsEnabled всё ещё true.
	if _, err := pool.Exec(context.Background(), `DELETE FROM featureflags WHERE flag_name='hit_test'`); err != nil {
		t.Fatalf("delete: %v", err)
	}
	// Second call — cache should still serve true.
	if !s.IsEnabled(context.Background(), 1, "hit_test") {
		t.Error("second IsEnabled = false after row deletion; cache not serving")
	}
}

// Test: anonymous userID=0 — берёт enabled_bool без rollout.
func TestIsEnabled_AnonymousUser_GlobalOnly(t *testing.T) {
	pool := mustTestPool(t)
	defer pool.Close()
	mustResetSchema(t, pool)

	// flag enabled global=true, percent=0 → user-based rollout вернул бы false,
	// но anon должен брать только global. Anon → true.
	_, err := pool.Exec(context.Background(),
		`INSERT INTO featureflags(flag_name, enabled_bool, rollout_percent) VALUES ('anon_test', true, 0)`)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	s := NewPostgresStore(pool, time.Hour)
	if !s.IsEnabled(context.Background(), 0, "anon_test") {
		t.Error("anonymous IsEnabled with global=true, percent=0 returned false; want true")
	}
}

// Test: List() returns rows.
func TestList(t *testing.T) {
	pool := mustTestPool(t)
	defer pool.Close()
	mustResetSchema(t, pool)

	_, err := pool.Exec(context.Background(),
		`INSERT INTO featureflags(flag_name, description, enabled_bool, rollout_percent)
		 VALUES ('a', 'A', true, 10), ('b', 'B', false, 0)`)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	s := NewPostgresStore(pool, time.Hour)
	flags, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(flags) != 2 {
		t.Fatalf("List len = %d, want 2", len(flags))
	}
}

// === Test helpers ===

const testActorUUID = "00000000-0000-0000-0000-000000000001"

func mustTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("PG_TEST_URL")
	if url == "" {
		t.Skip("PG_TEST_URL not set; skipping Postgres-impl tests (см. RESEARCH §Pitfall 1)")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect test DB: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		t.Fatalf("ping test DB: %v", err)
	}
	return pool
}

// mustResetSchema поднимает минимальную схему: extensions, users, featureflags.
// Используется в тестах когда они запускаются на чистой ephemeral DB.
func mustResetSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()

	// Best-effort drop в обратном порядке зависимостей.
	_, _ = pool.Exec(ctx, `DROP TABLE IF EXISTS featureflags CASCADE`)

	// Гарантируем что extensions + users существуют (тестовая DB может быть пустой).
	_, err := pool.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS citext`)
	if err != nil {
		t.Fatalf("CREATE EXTENSION citext: %v", err)
	}
	_, err = pool.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS pgcrypto`)
	if err != nil {
		t.Fatalf("CREATE EXTENSION pgcrypto: %v", err)
	}

	// users — minimal subset; CREATE IF NOT EXISTS чтобы не сломать
	// существующую миграционную схему.
	_, err = pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS users (
			id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			email         CITEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			display_name  TEXT,
			locale        TEXT NOT NULL DEFAULT 'en',
			timezone      TEXT NOT NULL DEFAULT 'UTC',
			created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	if err != nil {
		t.Fatalf("CREATE TABLE users: %v", err)
	}

	// Гарантируем существование test actor user.
	_, err = pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash)
		VALUES ($1, 'test-actor@example.com', 'x')
		ON CONFLICT (id) DO NOTHING`, testActorUUID)
	if err != nil {
		t.Fatalf("seed test actor user: %v", err)
	}

	// featureflags.
	_, err = pool.Exec(ctx, `
		CREATE TABLE featureflags (
			flag_name          TEXT PRIMARY KEY,
			enabled_bool       BOOLEAN NOT NULL DEFAULT false,
			rollout_percent    INTEGER NOT NULL DEFAULT 0
			                   CHECK (rollout_percent BETWEEN 0 AND 100),
			description        TEXT,
			updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_by_user_id UUID REFERENCES users(id)
		)`)
	if err != nil {
		t.Fatalf("CREATE TABLE featureflags: %v", err)
	}
}

// Ensure unused import doesn't trip the compiler в no-PG_TEST_URL builds.
var _ = errors.New
