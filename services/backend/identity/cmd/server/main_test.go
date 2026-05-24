package main

import (
	"os"
	"testing"
)

// TestEnvRequire_ExitsOnMissing — проверяет, что envRequire завершает процесс
// (через exitFunc-стаб), если переменная окружения отсутствует или пустая.
// Phase 2 / SEC-09: fail-fast при отсутствии секрета.
func TestEnvRequire_ExitsOnMissing(t *testing.T) {
	t.Helper()

	cases := []struct {
		name     string
		setEnv   bool
		value    string
		wantExit bool
	}{
		{name: "missing var → exit", setEnv: false, value: "", wantExit: true},
		{name: "empty value → exit", setEnv: true, value: "", wantExit: true},
		{name: "non-empty → no exit", setEnv: true, value: "hello", wantExit: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			const key = "TEST_ENV_REQUIRE_KEY"

			// Cleanup
			t.Cleanup(func() { os.Unsetenv(key) })

			if tc.setEnv {
				os.Setenv(key, tc.value)
			} else {
				os.Unsetenv(key)
			}

			// Swap exitFunc to a recording stub for this test.
			origExit := exitFunc
			exitCalled := false
			exitCode := 0
			exitFunc = func(code int) {
				exitCalled = true
				exitCode = code
				// Don't actually exit; panic to abort envRequire flow if needed.
				panic("test-exit")
			}
			t.Cleanup(func() { exitFunc = origExit })

			defer func() {
				_ = recover() // swallow panic from stub
				if exitCalled != tc.wantExit {
					t.Errorf("exitCalled = %v, want %v", exitCalled, tc.wantExit)
				}
				if tc.wantExit && exitCode != 1 {
					t.Errorf("exitCode = %d, want 1", exitCode)
				}
			}()

			v := envRequire(key)
			if !tc.wantExit && v != tc.value {
				t.Errorf("envRequire = %q, want %q", v, tc.value)
			}
		})
	}
}

// TestIsLocalDBURL_Localhost — все 4 локальных префикса должны вернуть true.
// Phase 2 / SEC-05: prod-detection guard для IDENTITY_DEV_MODE.
func TestIsLocalDBURL_Localhost(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{name: "localhost", url: "postgres://re:pw@localhost:5432/db"},
		{name: "127.0.0.1", url: "postgres://re:pw@127.0.0.1:5432/db"},
		{name: "host.docker.internal", url: "postgres://re:pw@host.docker.internal:5432/db"},
		{name: "docker-network postgres", url: "postgres://re:pw@postgres:5432/db"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !isLocalDBURL(tc.url) {
				t.Errorf("isLocalDBURL(%q) = false, want true", tc.url)
			}
		})
	}
}

// TestIsLocalDBURL_NonLocal — production-like URLs должны вернуть false.
func TestIsLocalDBURL_NonLocal(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{name: "hetzner cloud", url: "postgres://re:pw@prod-host.hetzner.cloud:5432/db"},
		{name: "staging example", url: "postgres://re:pw@db.staging.example.com:5432/db"},
		{name: "numeric non-local", url: "postgres://re:pw@198.51.100.10:5432/db"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if isLocalDBURL(tc.url) {
				t.Errorf("isLocalDBURL(%q) = true, want false", tc.url)
			}
		})
	}
}

// TestIsLocalDBURL_EdgeCases — крайние случаи + документированные false-positives.
// Per RESEARCH §Assumption A2: substring-match — sober conservative direction.
func TestIsLocalDBURL_EdgeCases(t *testing.T) {
	t.Run("empty string → false", func(t *testing.T) {
		if isLocalDBURL("") {
			t.Error("isLocalDBURL(\"\") should be false")
		}
	})

	t.Run("localhost as db-name suffix → true (documented false-positive)", func(t *testing.T) {
		// Conservative safe direction: substring match can produce false-positives
		// (e.g. URL contains "localhost" anywhere); acceptable per RESEARCH §Assumption A2 —
		// errs toward allowing dev-mode rather than refusing legitimate dev setup.
		url := "postgres://re:pw@prod/localhost_db"
		if !isLocalDBURL(url) {
			t.Errorf("isLocalDBURL(%q) = false, want true (substring-match by design)", url)
		}
	})
}
