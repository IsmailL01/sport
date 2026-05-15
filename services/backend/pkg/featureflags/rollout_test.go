// Тесты для Rollout: FNV-1a deterministic per-user rollout.
// Phase 1 / REL-03.
package featureflags

import (
	"testing"
)

// Test 1: percent=0 → всегда false.
func TestRollout_ZeroPercent_AlwaysFalse(t *testing.T) {
	for _, uid := range []int64{1, 42, 1000, 1<<31 - 1} {
		if Rollout(uid, "test_flag", 0) {
			t.Errorf("Rollout(%d, test_flag, 0) = true, want false", uid)
		}
	}
}

// Test 2: percent=100 → всегда true.
func TestRollout_HundredPercent_AlwaysTrue(t *testing.T) {
	for _, uid := range []int64{1, 42, 1000, 1<<31 - 1} {
		if !Rollout(uid, "test_flag", 100) {
			t.Errorf("Rollout(%d, test_flag, 100) = false, want true", uid)
		}
	}
}

// Test 3: detminism — повторный вызов возвращает то же значение.
func TestRollout_Deterministic(t *testing.T) {
	first := Rollout(1, "foo", 50)
	for i := 0; i < 100; i++ {
		got := Rollout(1, "foo", 50)
		if got != first {
			t.Fatalf("Rollout(1, foo, 50) non-deterministic: iter %d = %v, want %v", i, got, first)
		}
	}
}

// Test 4: distribution — 100k synthetic users at 50%, observed rate within ±1%.
func TestRollout_Distribution_50pct(t *testing.T) {
	assertDistributionInBand(t, 50, 1.0)
}

// Test 5a: 10%.
func TestRollout_Distribution_10pct(t *testing.T) {
	assertDistributionInBand(t, 10, 1.0)
}

// Test 5b: 25%.
func TestRollout_Distribution_25pct(t *testing.T) {
	assertDistributionInBand(t, 25, 1.0)
}

// Test 5c: 75%.
func TestRollout_Distribution_75pct(t *testing.T) {
	assertDistributionInBand(t, 75, 1.0)
}

func assertDistributionInBand(t *testing.T, percent int, tolerance float64) {
	t.Helper()
	const N = 100_000
	count := 0
	for uid := int64(1); uid <= N; uid++ {
		if Rollout(uid, "test_flag", percent) {
			count++
		}
	}
	observed := float64(count) / float64(N) * 100.0
	if observed < float64(percent)-tolerance || observed > float64(percent)+tolerance {
		t.Errorf("Rollout %d%%: observed %.3f%% over %d samples, want within ±%.1f%%",
			percent, observed, N, tolerance)
	}
}

// Test 6: 0x00 separator byte — verifies that boundary collision is prevented.
// Without separator: (userID=1, flag="0foo") and (userID=10, flag="foo")
// hash the same input.  С separator: bytes(uid=1) || 0x00 || "0foo" !=
// bytes(uid=10) || 0x00 || "foo".
//
// Утверждаем: hash inputs не совпадают.  Если бы separator-byte не было,
// в редких случаях (userID growth pattern) у нас были бы collisions.
func TestRollout_SeparatorByte_PreventsBoundaryCollision(t *testing.T) {
	// Sample two пары inputs которые без separator-byte хешировались бы
	// одинаково.  С separator они должны давать разные bucket-результаты на
	// по крайней мере некоторых процентах.
	cases := []struct {
		uidA int64
		flA  string
		uidB int64
		flB  string
	}{
		{1, "0foo", 10, "foo"},
		{2, "0bar", 20, "bar"},
		{12, "3rab", 123, "rab"},
	}
	// На каком-нибудь percent в [1, 99] хотя бы один из cases должен дать
	// разные результаты для A vs B — иначе hash коллизирует и separator
	// не работает.
	for _, c := range cases {
		differAtSome := false
		for p := 1; p < 100; p++ {
			a := Rollout(c.uidA, c.flA, p)
			b := Rollout(c.uidB, c.flB, p)
			if a != b {
				differAtSome = true
				break
			}
		}
		if !differAtSome {
			t.Errorf("Rollout(uidA=%d, %q) and Rollout(uidB=%d, %q) appear to collide "+
				"across all percent thresholds — separator byte may be missing",
				c.uidA, c.flA, c.uidB, c.flB)
		}
	}
}

// Test (edge case): negative percent → false.
func TestRollout_NegativePercent_False(t *testing.T) {
	if Rollout(42, "test", -1) {
		t.Error("Rollout(42, test, -1) = true, want false")
	}
}

// Test (edge case): >100 percent → true.
func TestRollout_AbovePercent_True(t *testing.T) {
	if !Rollout(42, "test", 101) {
		t.Error("Rollout(42, test, 101) = false, want true")
	}
}
