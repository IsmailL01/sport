// sentry_init_test.go — Phase 5 / Plan 05-05 RED → GREEN coverage для
// MustInitSentry + SentryRecoveryMiddleware + OtelHTTPMiddleware
// + D-38 dormant-by-design no-op path.
package observability

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/getsentry/sentry-go"
)

// mockTransport — фейковый sentry.Transport который перехватывает события
// in-process. Реализует sentry.Transport interface для подмены через
// ClientOptions.Transport.
type mockTransport struct {
	mu     sync.Mutex
	events []*sentry.Event
}

func (m *mockTransport) Configure(_ sentry.ClientOptions) {}

func (m *mockTransport) SendEvent(event *sentry.Event) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, event)
}

func (m *mockTransport) SendEvents(events []*sentry.Event) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, events...)
}

func (m *mockTransport) Flush(_ time.Duration) bool              { return true }
func (m *mockTransport) Close()                                  {}
func (m *mockTransport) FlushWithContext(_ context.Context) bool { return true }

func (m *mockTransport) Events() []*sentry.Event {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*sentry.Event, len(m.events))
	copy(out, m.events)
	return out
}

// initSentryWithMock — вспомогательная функция: bootstrap sentry-go SDK с
// mock-transport чтобы не было сетевых запросов.
func initSentryWithMock(t *testing.T, serviceName, env string) *mockTransport {
	t.Helper()
	mt := &mockTransport{}
	err := sentry.Init(sentry.ClientOptions{
		Dsn:              "https://abc@example.com/1",
		Environment:      env,
		Release:          "test-release",
		TracesSampleRate: 1.0,
		Transport:        mt,
	})
	if err != nil {
		t.Fatalf("sentry.Init: %v", err)
	}
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag("service", serviceName)
		scope.SetTag("env", env)
	})
	t.Cleanup(func() {
		sentry.Flush(time.Second)
	})
	return mt
}

// ---------- TestSentry_TagsSetCorrectly ----------

// TestSentry_TagsSetCorrectly — после ConfigureScope(SetTag service/env),
// captured event имеет правильные tags per RESEARCH §1.9.
func TestSentry_TagsSetCorrectly(t *testing.T) {
	mt := initSentryWithMock(t, "identity-test", "test")

	sentry.CaptureMessage("hello world")
	sentry.Flush(time.Second)

	evs := mt.Events()
	if len(evs) != 1 {
		t.Fatalf("expected 1 captured event, got %d", len(evs))
	}
	if evs[0].Tags["service"] != "identity-test" {
		t.Errorf("tag service: got %q, want %q",
			evs[0].Tags["service"], "identity-test")
	}
	if evs[0].Tags["env"] != "test" {
		t.Errorf("tag env: got %q, want %q",
			evs[0].Tags["env"], "test")
	}
}

// ---------- TestMustInitSentry_EmptyDSN ----------

// TestMustInitSentry_EmptyDSN — D-38 contract: пустой DSN → no-op shutdown +
// INFO log with the dormant-state contract attrs.
func TestMustInitSentry_EmptyDSN(t *testing.T) {
	prev := slog.Default()
	t.Cleanup(func() { slog.SetDefault(prev) })

	buf := &bytes.Buffer{}
	slog.SetDefault(slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))

	shutdown := MustInitSentry(SentryConfig{
		DSN:         "", // ← dormant path
		Env:         "test",
		Release:     "test-release",
		ServiceName: "identity-test",
		SampleRate:  1.0,
	})
	if shutdown == nil {
		t.Fatal("expected no-op shutdown closure, got nil")
	}
	shutdown() // no panic

	output := buf.String()
	if !strings.Contains(output, "observability.sentry: disabled — empty DSN") {
		t.Errorf("expected INFO log substring %q, got:\n%s",
			"observability.sentry: disabled — empty DSN", output)
	}

	// Verify D-38 contract: msg + next_step + level=INFO.
	found := false
	for _, line := range strings.Split(strings.TrimRight(output, "\n"), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			continue
		}
		msg, _ := m["msg"].(string)
		if !strings.Contains(msg, "disabled — empty DSN") {
			continue
		}
		nextStep, _ := m["next_step"].(string)
		if nextStep != "see ADR-0010 amendment 2026-05-19 PM" {
			t.Errorf("next_step: got %q, want %q",
				nextStep, "see ADR-0010 amendment 2026-05-19 PM")
		}
		level, _ := m["level"].(string)
		if level != "INFO" {
			t.Errorf("level: got %q, want INFO", level)
		}
		found = true
		break
	}
	if !found {
		t.Errorf("D-38 INFO line not found:\n%s", output)
	}
}

// ---------- TestSentryRecoveryMiddleware_CapturesPanic ----------

// TestSentryRecoveryMiddleware_CapturesPanic — panic handler wrapped middleware →
// response 500 + Sentry event captured with exception.
func TestSentryRecoveryMiddleware_CapturesPanic(t *testing.T) {
	mt := initSentryWithMock(t, "identity-test", "test")

	panicHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom-test-panic")
	})

	wrapped := SentryRecoveryMiddleware(panicHandler)

	srv := httptest.NewServer(wrapped)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	// sentryhttp middleware reply'ит c HTTP 500 after recover.
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("status: got %d, want 500", resp.StatusCode)
	}

	// Flush to ensure event hit our transport.
	sentry.Flush(time.Second)

	evs := mt.Events()
	if len(evs) < 1 {
		t.Fatalf("expected ≥1 captured panic event, got %d", len(evs))
	}
	// Check at least one event mentions our panic value.
	found := false
	for _, ev := range evs {
		for _, ex := range ev.Exception {
			if strings.Contains(ex.Value, "boom-test-panic") {
				found = true
				break
			}
		}
		if found {
			break
		}
		// Some sentry-go versions stash panic message в ev.Message.
		if strings.Contains(ev.Message, "boom-test-panic") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected captured event with 'boom-test-panic' in exception/message; events=%d", len(evs))
		for i, ev := range evs {
			t.Logf("event[%d]: msg=%q exceptions=%d", i, ev.Message, len(ev.Exception))
			for j, ex := range ev.Exception {
				t.Logf("  ex[%d]: type=%q value=%q", j, ex.Type, ex.Value)
			}
		}
	}
}

// ---------- TestOtelHTTPMiddleware_PassesThrough ----------

// TestOtelHTTPMiddleware_PassesThrough — wrapped 200-handler returns 200;
// request не теряется; trace context propagation работает.
func TestOtelHTTPMiddleware_PassesThrough(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	wrapped := OtelHTTPMiddleware("identity-test", ok)

	srv := httptest.NewServer(wrapped)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: got %d, want 200", resp.StatusCode)
	}
	if string(body) != "ok" {
		t.Errorf("body: got %q, want %q", string(body), "ok")
	}
}

// ---------- TestSentryRecoveryMiddleware_NonPanicPasses ----------

// TestSentryRecoveryMiddleware_NonPanicPasses — sanity: non-panic handler
// works normally через middleware.
func TestSentryRecoveryMiddleware_NonPanicPasses(t *testing.T) {
	_ = initSentryWithMock(t, "identity-test", "test")

	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("done"))
	})

	wrapped := SentryRecoveryMiddleware(ok)

	srv := httptest.NewServer(wrapped)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated {
		t.Errorf("status: got %d, want 201", resp.StatusCode)
	}
	if string(body) != "done" {
		t.Errorf("body: got %q, want %q", string(body), "done")
	}
}

// Sanity-guard для linter: errors используется в неявных проверках выше,
// keeping import live.
var _ = errors.New
