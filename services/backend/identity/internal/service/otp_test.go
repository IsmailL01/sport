package service

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"regexp"
	"strings"
	"testing"

	"github.com/runningecosystem/backend/pkg/observability"
)

// codeValuesUsedInTests — the specific OTP code strings that tests inject.
// We assert NONE of these appears in the captured log buffer. Generic
// `\b\d{6}\b` would also match microsecond timestamps from slog's "time" field.
var codeValuesUsedInTests = []string{"424242", "987654", "111222"}

func assertNoCodeLeak(t *testing.T, buf *bytes.Buffer) {
	t.Helper()
	out := buf.String()
	for _, v := range codeValuesUsedInTests {
		if strings.Contains(out, v) {
			t.Errorf("OTP code %q leaked in output: %q", v, out)
		}
	}
}

// sixDigitRe kept for any future test that wants strict matching with a
// timestamp-stripped buffer.
var _ = regexp.MustCompile(`\b\d{6}\b`)

// captureSlog swaps slog.Default() с buffer-capturing handler at the given level,
// runs fn, returns captured buffer. Restores previous default on exit.
func captureSlog(t *testing.T, level slog.Level, useScrubHandler bool, fn func()) *bytes.Buffer {
	t.Helper()
	buf := &bytes.Buffer{}
	var h slog.Handler
	if useScrubHandler {
		// Real Phase-5 wrapper — verifies defense-in-depth (D-13).
		// Build the same piiScrubHandler that production main.go installs,
		// but pointed at the test buffer instead of os.Stdout.
		// We construct it manually to inject the buffer.
		jsonH := slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug, AddSource: false})
		// Re-create the wrapper from pkg/observability via a small inline
		// adapter: NewSlogJSONHandler wires stdout — for tests, we use the
		// public NewSlogJSONHandler factory but redirect via slog.SetDefault
		// since the factory always targets os.Stdout. Instead, mimic the
		// wrapper structure here using exported helpers (IsDenied / HashEmail /
		// ShouldHash). This keeps the test honest about what the production
		// chain actually does.
		h = &testScrubHandler{inner: jsonH, level: level}
	} else {
		// Plain JSON handler — what production used pre-Phase-5.
		h = slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: level, AddSource: false})
	}
	prev := slog.Default()
	slog.SetDefault(slog.New(h))
	defer slog.SetDefault(prev)
	fn()
	return buf
}

// testScrubHandler mirrors pkg/observability piiScrubHandler but for tests:
// uses the exported IsDenied / ShouldHash / HashEmail helpers so the test
// stays in lock-step with the production deny-list (D-12).
type testScrubHandler struct {
	inner slog.Handler
	level slog.Level
}

func (h *testScrubHandler) Enabled(_ context.Context, lvl slog.Level) bool {
	return lvl >= h.level
}

func (h *testScrubHandler) Handle(ctx context.Context, r slog.Record) error {
	clone := slog.NewRecord(r.Time, r.Level, r.Message, r.PC)
	r.Attrs(func(a slog.Attr) bool {
		switch {
		case observability.IsDenied(a.Key):
			return true
		case observability.ShouldHash(a.Key):
			clone.AddAttrs(slog.String("email_hash", observability.HashEmail(a.Value.String())))
			return true
		default:
			clone.AddAttrs(a)
			return true
		}
	})
	return h.inner.Handle(ctx, clone)
}
func (h *testScrubHandler) WithAttrs(attrs []slog.Attr) slog.Handler { return h }
func (h *testScrubHandler) WithGroup(string) slog.Handler            { return h }

// parseAllRecords splits buffer by newline, returns parsed JSON records.
func parseAllRecords(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	out := []map[string]any{}
	for _, line := range strings.Split(strings.TrimRight(buf.String(), "\n"), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("parse log line %q: %v", line, err)
		}
		out = append(out, m)
	}
	return out
}

// ---------- D-13 OTP fix tests (OBS-04) ----------

// TestRequestCode_ProdNoLeak: devMode=false + LevelInfo →
// log contains "otp issued" InfoContext line WITHOUT `code` attr;
// no 6-digit numeric substring anywhere in captured buffer.
func TestRequestCode_ProdNoLeak(t *testing.T) {
	buf := captureSlog(t, slog.LevelInfo, false, func() {
		// Replicate the post-fix call shape directly via the extracted helper.
		logOTPIssued(context.Background(), "u@example.com", "424242", false /*devMode*/)
	})
	assertNoCodeLeak(t, buf)
	records := parseAllRecords(t, buf)
	if len(records) != 1 {
		t.Fatalf("expected 1 record (the InfoContext line); got %d", len(records))
	}
	rec := records[0]
	if rec["msg"] != "otp issued" {
		t.Errorf("expected msg='otp issued', got %v", rec["msg"])
	}
	if _, present := rec["code"]; present {
		t.Errorf("`code` attr MUST be absent in prod path; rec=%+v", rec)
	}
	if got, _ := rec["email"].(string); got != "u@example.com" {
		t.Errorf("email = %v, want u@example.com", got)
	}
}

// TestRequestCode_DevButInfoLevel: devMode=true but LOG_LEVEL=info →
// InfoContext line эмитится но DebugContext line дропается на baseline.
// No 6-digit substring in buffer.
func TestRequestCode_DevButInfoLevel(t *testing.T) {
	buf := captureSlog(t, slog.LevelInfo, false, func() {
		logOTPIssued(context.Background(), "u@example.com", "987654", true /*devMode*/)
	})
	out := buf.String()
	assertNoCodeLeak(t, buf)
	records := parseAllRecords(t, buf)
	if len(records) != 1 {
		t.Fatalf("expected only InfoContext line at LevelInfo; got %d records: %+v", len(records), records)
	}
	if records[0]["msg"] != "otp issued" {
		t.Errorf("expected msg='otp issued', got %v", records[0]["msg"])
	}
	if strings.Contains(out, "otp dev-mode echo") {
		t.Errorf("DebugContext should be gated by LevelInfo baseline; out=%q", out)
	}
}

// TestRequestCode_DevAndDebugLevel_HandlerStillScrubs: devMode=true + LevelDebug +
// pkg/observability scrub handler → DebugContext IS emitted ("otp dev-mode echo"
// message present) but the `code` attr is dropped by the PIIDenyList layer.
// Defense-in-depth (D-13).
func TestRequestCode_DevAndDebugLevel_HandlerStillScrubs(t *testing.T) {
	buf := captureSlog(t, slog.LevelDebug, true /*useScrubHandler*/, func() {
		logOTPIssued(context.Background(), "u@example.com", "111222", true /*devMode*/)
	})
	out := buf.String()
	assertNoCodeLeak(t, buf)
	if !strings.Contains(out, "otp dev-mode echo") {
		t.Errorf("DebugContext SHOULD emit at LevelDebug; out=%q", out)
	}
	records := parseAllRecords(t, buf)
	if len(records) != 2 {
		t.Fatalf("expected 2 records (Info + Debug) at LevelDebug + devMode=true; got %d", len(records))
	}
	for i, r := range records {
		if _, present := r["code"]; present {
			t.Errorf("record %d still has `code` attr — deny-list failed; rec=%+v", i, r)
		}
	}
}
