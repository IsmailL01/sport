package observability

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

// newTestLogger — same shape как pkg/clientversion/middleware_test.go newLogger():
// buffer-capture handler через JSONHandler wrapped by piiScrubHandler.
// Возвращает logger + buffer для парсинга.
func newTestLogger(t *testing.T, cfg Config) (*slog.Logger, *bytes.Buffer) {
	t.Helper()
	buf := &bytes.Buffer{}
	base := slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug, AddSource: false})
	return slog.New(&piiScrubHandler{inner: base, cfg: cfg}), buf
}

// parseLines — каждая строка buffer'a — JSON object; вернёт срез parsed maps.
func parseLines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimRight(buf.String(), "\n"), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("unmarshal log line %q: %v", line, err)
		}
		out = append(out, m)
	}
	return out
}

// ---------- Tests ----------

func TestSlogHandler_DefaultAttrs(t *testing.T) {
	logger, buf := newTestLogger(t, Config{
		ServiceName: "identity",
		Env:         "prod",
		Version:     "abc123def",
		Level:       slog.LevelInfo,
	})
	logger.InfoContext(context.Background(), "test message")
	lines := parseLines(t, buf)
	if len(lines) != 1 {
		t.Fatalf("expected 1 log line, got %d", len(lines))
	}
	m := lines[0]
	for _, kv := range []struct {
		key, want string
	}{
		{"service", "identity"},
		{"env", "prod"},
		{"version", "abc123def"},
		{"msg", "test message"},
		{"level", "INFO"},
		{"request_id", ""},
	} {
		got, ok := m[kv.key].(string)
		if !ok {
			t.Errorf("missing key %q in log line; line=%+v", kv.key, m)
			continue
		}
		if got != kv.want {
			t.Errorf("attr %q = %q, want %q", kv.key, got, kv.want)
		}
	}
}

func TestSlogHandler_DropsCode(t *testing.T) {
	logger, buf := newTestLogger(t, Config{
		ServiceName: "identity",
		Env:         "prod",
		Version:     "v1",
		Level:       slog.LevelInfo,
	})
	logger.InfoContext(context.Background(), "otp issued",
		"code", "424242",
		"email", "u@example.com",
	)
	lines := parseLines(t, buf)
	if len(lines) != 1 {
		t.Fatalf("expected 1 log line")
	}
	m := lines[0]
	if _, present := m["code"]; present {
		t.Errorf("attr 'code' MUST be absent; line=%+v", m)
	}
	// email hashed
	hash, ok := m["email_hash"].(string)
	if !ok {
		t.Errorf("attr 'email_hash' missing; line=%+v", m)
	}
	if len(hash) != 8 {
		t.Errorf("email_hash length = %d, want 8", len(hash))
	}
	// raw 'email' should NOT appear
	if _, present := m["email"]; present {
		t.Errorf("attr 'email' MUST be absent (hashed instead); line=%+v", m)
	}
}

func TestSlogHandler_HashesEmail(t *testing.T) {
	logger, buf := newTestLogger(t, Config{ServiceName: "x", Env: "dev", Version: "v", Level: slog.LevelInfo})
	logger.InfoContext(context.Background(), "x", "email", "alice@example.com")
	m := parseLines(t, buf)[0]
	wantHash := HashEmail("alice@example.com")
	gotHash, ok := m["email_hash"].(string)
	if !ok || gotHash != wantHash {
		t.Errorf("email_hash = %q (ok=%v), want %q", gotHash, ok, wantHash)
	}
	if _, present := m["email"]; present {
		t.Errorf("plaintext 'email' MUST NOT appear")
	}
}

func TestSlogHandler_DropsAllDenyListKeys(t *testing.T) {
	// Table-driven over all 29 D-12 keys + a few case-mutations.
	cases := append([]string{}, expectedDenyKeys...)
	cases = append(cases, "Code", "PHONE_NUMBER", "DisplayName", "Lat", "Coords", "DM_Content", "Password")
	for _, key := range cases {
		t.Run(key, func(t *testing.T) {
			logger, buf := newTestLogger(t, Config{ServiceName: "x", Env: "dev", Version: "v", Level: slog.LevelInfo})
			logger.InfoContext(context.Background(), "x", key, "SENSITIVE_VALUE")
			m := parseLines(t, buf)[0]
			// neither original-case nor lowercased key should appear
			for _, variant := range []string{key, strings.ToLower(key)} {
				if _, present := m[variant]; present {
					t.Errorf("attr %q present (variant=%q); line=%+v", key, variant, m)
				}
			}
			if strings.Contains(buf.String(), "SENSITIVE_VALUE") {
				t.Errorf("SENSITIVE_VALUE leaked to output; buf=%q", buf.String())
			}
		})
	}
}

func TestSlogHandler_CaseInsensitiveDenyList(t *testing.T) {
	logger, buf := newTestLogger(t, Config{ServiceName: "x", Env: "dev", Version: "v", Level: slog.LevelInfo})
	logger.InfoContext(context.Background(), "x",
		"Code", "1",
		"CODE", "2",
		"PhoneNumber", "3",
		"DISPLAYNAME", "4",
	)
	out := buf.String()
	for _, leak := range []string{"\"1\"", "\"2\"", "\"3\"", "\"4\""} {
		if strings.Contains(out, leak) {
			t.Errorf("denied-key value leaked: %s in %q", leak, out)
		}
	}
}

func TestSlogHandler_RequestIDFromContext(t *testing.T) {
	logger, buf := newTestLogger(t, Config{ServiceName: "x", Env: "dev", Version: "v", Level: slog.LevelInfo})
	ctx := WithRequestID(context.Background(), "req-abc-123")
	logger.InfoContext(ctx, "x")
	m := parseLines(t, buf)[0]
	if got := m["request_id"]; got != "req-abc-123" {
		t.Errorf("request_id = %v, want req-abc-123", got)
	}
}

func TestSlogHandler_LevelOverrideFromContext(t *testing.T) {
	// Baseline = Info; ctx-override = Debug; emit Debug → должно эмитнуться.
	logger, buf := newTestLogger(t, Config{
		ServiceName: "x", Env: "dev", Version: "v", Level: slog.LevelInfo,
	})
	ctxBase := context.Background()
	ctxDebug := WithLogLevel(ctxBase, slog.LevelDebug)
	// Without override: Debug дропается.
	logger.DebugContext(ctxBase, "should-not-emit")
	if strings.Contains(buf.String(), "should-not-emit") {
		t.Errorf("Debug emitted at baseline=Info; buf=%q", buf.String())
	}
	// With override: Debug эмитится.
	logger.DebugContext(ctxDebug, "should-emit")
	if !strings.Contains(buf.String(), "should-emit") {
		t.Errorf("Debug NOT emitted despite ctx-override; buf=%q", buf.String())
	}
}

func TestSlogHandler_LogLevelFromContext_ReturnsOk(t *testing.T) {
	lvl, ok := LogLevelFromContext(context.Background())
	if ok {
		t.Errorf("LogLevelFromContext on empty ctx: ok = true, want false")
	}
	if lvl != slog.LevelInfo {
		t.Errorf("default lvl = %v, want LevelInfo (graceful fallback)", lvl)
	}
	ctx := WithLogLevel(context.Background(), slog.LevelWarn)
	lvl, ok = LogLevelFromContext(ctx)
	if !ok || lvl != slog.LevelWarn {
		t.Errorf("after WithLogLevel(Warn): got (%v, %v), want (Warn, true)", lvl, ok)
	}
}

func TestSlogHandler_RequestIDFromContext_ReturnsOk(t *testing.T) {
	_, ok := RequestIDFromContext(context.Background())
	if ok {
		t.Errorf("RequestIDFromContext on empty ctx: ok = true, want false")
	}
	ctx := WithRequestID(context.Background(), "abc")
	rid, ok := RequestIDFromContext(ctx)
	if !ok || rid != "abc" {
		t.Errorf("after WithRequestID('abc'): got (%q, %v), want ('abc', true)", rid, ok)
	}
}

func TestParseLevel(t *testing.T) {
	cases := []struct {
		input string
		want  slog.Level
	}{
		{"info", slog.LevelInfo},
		{"INFO", slog.LevelInfo},
		{"Info", slog.LevelInfo},
		{"debug", slog.LevelDebug},
		{"DEBUG", slog.LevelDebug},
		{"warn", slog.LevelWarn},
		{"warning", slog.LevelWarn},
		{"WARN", slog.LevelWarn},
		{"error", slog.LevelError},
		{"ERROR", slog.LevelError},
		{"", slog.LevelInfo},
		{"garbage", slog.LevelInfo},
		{"   debug   ", slog.LevelDebug}, // trim whitespace
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			if got := ParseLevel(tc.input); got != tc.want {
				t.Errorf("ParseLevel(%q) = %v, want %v", tc.input, got, tc.want)
			}
		})
	}
}

func TestNewSlogJSONHandler_StdoutFactory(t *testing.T) {
	// Smoke test: factory returns non-nil logger with the wrapper chain wired.
	// Output goes to os.Stdout in real use; here мы просто verify тип.
	got := NewSlogJSONHandler(Config{
		ServiceName: "test",
		Env:         "dev",
		Version:     "v0",
		Level:       slog.LevelInfo,
	})
	if got == nil {
		t.Fatal("NewSlogJSONHandler returned nil")
	}
	// Handler should be Enabled at Info but NOT at Debug w/o override.
	h := got.Handler()
	ctx := context.Background()
	if !h.Enabled(ctx, slog.LevelInfo) {
		t.Errorf("handler should be Enabled(Info)=true")
	}
	if h.Enabled(ctx, slog.LevelDebug) {
		t.Errorf("handler should be Enabled(Debug)=false at baseline Info")
	}
}

func TestSlogHandler_WithAttrs_ScrubsPersistentDeniedKeys(t *testing.T) {
	// WithAttrs creates a derived logger with persistent attrs. Denied keys
	// in persistent attrs MUST also be scrubbed.
	logger, buf := newTestLogger(t, Config{ServiceName: "x", Env: "dev", Version: "v", Level: slog.LevelInfo})
	derived := logger.With("code", "SHOULD_DROP", "useful", "OK_VALUE", "email", "u@e.com")
	derived.InfoContext(context.Background(), "msg")
	out := buf.String()
	if strings.Contains(out, "SHOULD_DROP") {
		t.Errorf("denied-key value persisted via WithAttrs; out=%q", out)
	}
	if !strings.Contains(out, "OK_VALUE") {
		t.Errorf("benign attr lost via WithAttrs; out=%q", out)
	}
	if strings.Contains(out, `"email":"u@e.com"`) {
		t.Errorf("raw email persisted via WithAttrs; out=%q", out)
	}
}
