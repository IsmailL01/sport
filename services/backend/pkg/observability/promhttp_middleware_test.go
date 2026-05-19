// promhttp_middleware_test.go — table-driven tests для status classification +
// route extraction + cardinality enforcement. Phase 5 / OBS-05 / D-17 / D-19 /
// Pitfall #6.
package observability

import (
	"bufio"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

// stubNext — handler-helper для tests. Если writeHeaderCode > 0, делает явный
// WriteHeader; иначе оставляет implicit 200.
func stubNext(writeHeaderCode int, body string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if writeHeaderCode > 0 {
			w.WriteHeader(writeHeaderCode)
		}
		if body != "" {
			_, _ = io.WriteString(w, body)
		}
	})
}

// findHistogramSample ищет первый sample в http_request_duration_seconds
// который имеет точно matching label values.
func findHistogramSample(t *testing.T, wantLabels map[string]string) *dto.Metric {
	t.Helper()
	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}
	for _, mf := range families {
		if mf.GetName() != "http_request_duration_seconds" {
			continue
		}
		for _, m := range mf.Metric {
			match := true
			labels := make(map[string]string, len(m.Label))
			for _, lp := range m.Label {
				labels[lp.GetName()] = lp.GetValue()
			}
			for k, v := range wantLabels {
				if labels[k] != v {
					match = false
					break
				}
			}
			if match {
				return m
			}
		}
	}
	return nil
}

// findCounterSample — same shape для http_requests_total.
func findCounterSample(t *testing.T, wantLabels map[string]string) *dto.Metric {
	t.Helper()
	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}
	for _, mf := range families {
		if mf.GetName() != "http_requests_total" {
			continue
		}
		for _, m := range mf.Metric {
			labels := make(map[string]string, len(m.Label))
			for _, lp := range m.Label {
				labels[lp.GetName()] = lp.GetValue()
			}
			match := true
			for k, v := range wantLabels {
				if labels[k] != v {
					match = false
					break
				}
			}
			if match {
				return m
			}
		}
	}
	return nil
}

// TestPromhttpMiddleware_RecordsDuration — single request through middleware
// produces histogram sample + counter sample со ожидаемыми labels.
func TestPromhttpMiddleware_RecordsDuration(t *testing.T) {
	h := PromhttpMiddleware("svc-records", stubNext(http.StatusOK, "ok"))

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	// r.Pattern не set (нет mux) → extractRouteTemplate fallback: "/x".
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: got %d, want 200", rec.Code)
	}

	want := map[string]string{
		"service": "svc-records",
		"method":  "GET",
		"route":   "/x",
		"status":  "2xx",
	}
	sample := findHistogramSample(t, want)
	if sample == nil {
		t.Fatalf("no histogram sample with labels %v", want)
	}
	if sample.Histogram.GetSampleCount() < 1 {
		t.Errorf("histogram sample count = %d, want >=1", sample.Histogram.GetSampleCount())
	}
	if sample.Histogram.GetSampleSum() <= 0 {
		t.Errorf("histogram sample sum = %v, want >0 (must have observed real duration)", sample.Histogram.GetSampleSum())
	}

	counter := findCounterSample(t, want)
	if counter == nil {
		t.Fatalf("no counter sample with labels %v", want)
	}
	if counter.Counter.GetValue() < 1 {
		t.Errorf("counter value = %v, want >=1", counter.Counter.GetValue())
	}
}

// TestPromhttpMiddleware_StatusClassification — каждый HTTP status code
// классифицируется в правильный 2xx/3xx/4xx/5xx/other bucket.
func TestPromhttpMiddleware_StatusClassification(t *testing.T) {
	cases := []struct {
		name       string
		statusCode int
		wantClass  string
	}{
		{"200_OK", http.StatusOK, "2xx"},
		{"201_Created", http.StatusCreated, "2xx"},
		{"301_MovedPermanently", http.StatusMovedPermanently, "3xx"},
		{"404_NotFound", http.StatusNotFound, "4xx"},
		{"503_ServiceUnavailable", http.StatusServiceUnavailable, "5xx"},
		{"102_Processing_is_other", http.StatusProcessing, "other"},
	}

	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Unique service name per case — иначе counters суммируются и
			// trivial "got 1" не различает classes.
			svc := "svc-class-" + tc.name
			route := "/c" + string(rune('0'+i))
			h := PromhttpMiddleware(svc, stubNext(tc.statusCode, ""))

			req := httptest.NewRequest(http.MethodGet, route, nil)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			want := map[string]string{
				"service": svc,
				"method":  "GET",
				"route":   route,
				"status":  tc.wantClass,
			}
			if findHistogramSample(t, want) == nil {
				t.Fatalf("status %d did not produce sample with class %q (labels=%v)", tc.statusCode, tc.wantClass, want)
			}
		})
	}
}

// TestPromhttpMiddleware_RouteTemplateExtraction — если r.Pattern set (Go 1.22+
// ServeMux pattern routing), middleware использует pattern, не raw path.
// Pitfall #6: never raw r.URL.Path.
func TestPromhttpMiddleware_RouteTemplateExtraction(t *testing.T) {
	// Build a Go 1.22+ ServeMux с pattern-based route.
	mux := http.NewServeMux()
	called := false
	mux.HandleFunc("GET /users/{id}", func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	h := PromhttpMiddleware("svc-route", mux)
	req := httptest.NewRequest(http.MethodGet, "/users/abc-123", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if !called {
		t.Fatalf("inner handler не вызван — pattern routing broken")
	}

	// Должны увидеть sample с route="/users/{id}" — NOT "/users/abc-123".
	want := map[string]string{
		"service": "svc-route",
		"method":  "GET",
		"route":   "/users/{id}",
		"status":  "2xx",
	}
	if findHistogramSample(t, want) == nil {
		t.Fatalf("ожидался sample с route='/users/{id}' (extracted template), got missing — Pitfall #6 regression: cardinality будет explode на per-user URLs")
	}

	// Защита от регрессии: НЕ должно быть sample с raw path.
	bad := map[string]string{
		"service": "svc-route",
		"route":   "/users/abc-123",
	}
	if findHistogramSample(t, bad) != nil {
		t.Errorf("Pitfall #6: middleware записал raw r.URL.Path '/users/abc-123' — cardinality будет explode")
	}
}

// TestPromhttpMiddleware_RouteTemplateFallback — если r.Pattern пустой (handler
// не за ServeMux), fallback collapses path до 1-2 segments.
func TestPromhttpMiddleware_RouteTemplateFallback(t *testing.T) {
	cases := []struct {
		path      string
		wantRoute string
	}{
		{"/", "/"},
		{"/healthz", "/healthz"},
		{"/metrics", "/metrics"},
		{"/api", "/api"},
		{"/api/v1", "/api/v1"},
		{"/api/v1/users/123/profile", "/api/v1"},
		{"/users/abc-uuid-456", "/users/abc-uuid-456"}, // 2 segments — наивный fallback
	}
	for i, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			svc := "svc-fb-" + string(rune('a'+i))
			h := PromhttpMiddleware(svc, stubNext(http.StatusOK, ""))
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)

			want := map[string]string{
				"service": svc,
				"route":   tc.wantRoute,
				"status":  "2xx",
			}
			if findHistogramSample(t, want) == nil {
				t.Errorf("path %q: expected route label %q (fallback collapse), missing", tc.path, tc.wantRoute)
			}
		})
	}
}

// TestPromhttpMiddleware_NoUserIDLabel — programmatic descriptor check:
// HistogramVec doesn't accept "user_id" label (compile-time guard via
// fixed label slice; this test asserts runtime invariant via Gather()).
func TestPromhttpMiddleware_NoUserIDLabel(t *testing.T) {
	HTTPRequestDuration.WithLabelValues("nuser", "GET", "/x", "2xx").Observe(0.001)

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}
	forbidden := map[string]struct{}{
		"user_id": {}, "session_id": {}, "device_id": {},
		"external_uuid": {}, "email": {}, "phone": {},
	}
	for _, mf := range families {
		if mf.GetName() != "http_request_duration_seconds" {
			continue
		}
		for _, m := range mf.Metric {
			for _, lp := range m.Label {
				if _, bad := forbidden[lp.GetName()]; bad {
					t.Errorf("D-18 violation: forbidden label %q present on emitted sample", lp.GetName())
				}
			}
		}
	}
}

// TestPromhttpMiddleware_DefaultStatus200WhenNotSet — handler что НЕ зовёт
// WriteHeader (implicit 200 on first Write) корректно записывается как "2xx".
func TestPromhttpMiddleware_DefaultStatus200WhenNotSet(t *testing.T) {
	// Body without explicit WriteHeader.
	h := PromhttpMiddleware("svc-default", stubNext(0, "implicit-200"))

	req := httptest.NewRequest(http.MethodGet, "/d", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("httptest.Recorder default status = %d, want 200", rec.Code)
	}

	want := map[string]string{
		"service": "svc-default",
		"method":  "GET",
		"route":   "/d",
		"status":  "2xx",
	}
	if findHistogramSample(t, want) == nil {
		t.Fatalf("implicit-200 path не записан как 2xx (labels=%v)", want)
	}
}

// TestPromhttpMiddleware_EmptyServiceName — defense in depth: пустой service
// name заменяется на "unknown" (не падаем; не пушим пустую строку как label
// value).
func TestPromhttpMiddleware_EmptyServiceName(t *testing.T) {
	h := PromhttpMiddleware("", stubNext(http.StatusOK, ""))
	req := httptest.NewRequest(http.MethodGet, "/e", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	want := map[string]string{
		"service": "unknown",
		"route":   "/e",
		"status":  "2xx",
	}
	if findHistogramSample(t, want) == nil {
		t.Errorf("empty service name should fallback to 'unknown' (labels=%v)", want)
	}
}

// TestClassifyStatus_TableDriven — unit test для pure helper.
func TestClassifyStatus_TableDriven(t *testing.T) {
	cases := []struct {
		code int
		want string
	}{
		{100, "other"},
		{200, "2xx"},
		{204, "2xx"},
		{299, "2xx"},
		{300, "3xx"},
		{399, "3xx"},
		{400, "4xx"},
		{404, "4xx"},
		{499, "4xx"},
		{500, "5xx"},
		{503, "5xx"},
		{599, "5xx"},
		{600, "other"},
		{0, "other"},
	}
	for _, tc := range cases {
		got := classifyStatus(tc.code)
		if got != tc.want {
			t.Errorf("classifyStatus(%d) = %q, want %q", tc.code, got, tc.want)
		}
	}
}

// TestExtractRouteTemplate_PatternStripsMethod — "GET /users/{id}" → "/users/{id}".
func TestExtractRouteTemplate_PatternStripsMethod(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/users/123", nil)
	r.Pattern = "GET /users/{id}"
	got := extractRouteTemplate(r)
	if got != "/users/{id}" {
		t.Errorf("got %q, want %q", got, "/users/{id}")
	}
}

// TestExtractRouteTemplate_PatternNoMethod — pattern без method prefix
// возвращается as-is.
func TestExtractRouteTemplate_PatternNoMethod(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/foo", nil)
	r.Pattern = "/foo/{bar}"
	got := extractRouteTemplate(r)
	if got != "/foo/{bar}" {
		t.Errorf("got %q, want %q", got, "/foo/{bar}")
	}
}

// hijackableRecorder — minimal http.ResponseWriter+http.Hijacker для unit-теста.
// httptest.ResponseRecorder НЕ implements Hijacker, поэтому реальный
// realtime-gw scenario нужен этот stub.
type hijackableRecorder struct {
	*httptest.ResponseRecorder
	hijackCalled bool
}

func (h *hijackableRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h.hijackCalled = true
	// Возвращаем nil-conn — handler-под-tests не делает реального IO.
	return nil, nil, nil
}

// TestPromhttpMiddleware_HijackPassthrough — статус-обёртка должна passthrough
// Hijack() к underlying ResponseWriter если он его реализует. Критично для
// realtime-gw (coder/websocket делает hijack для перехвата TCP).  Без этого
// passthrough WS upgrade ломается с "Hijacker not implemented".
func TestPromhttpMiddleware_HijackPassthrough(t *testing.T) {
	hijackHandler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Fatalf("middleware wrapper does NOT implement http.Hijacker — WS upgrade would fail")
		}
		_, _, err := hj.Hijack()
		if err != nil {
			t.Fatalf("Hijack() returned error: %v", err)
		}
	})

	h := PromhttpMiddleware("svc-hijack", hijackHandler)

	hr := &hijackableRecorder{ResponseRecorder: httptest.NewRecorder()}
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	h.ServeHTTP(hr, req)

	if !hr.hijackCalled {
		t.Errorf("underlying Hijack() never called — passthrough broken")
	}
}

// TestPromhttpMiddleware_HijackUnsupported — если underlying ResponseWriter
// НЕ implements Hijacker, статус-обёртка возвращает ошибку (не panics).
// httptest.NewRecorder() удобный stub — он не Hijacker.
func TestPromhttpMiddleware_HijackUnsupported(t *testing.T) {
	hijackHandler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Fatalf("wrapper should always implement Hijacker (we return error inside Hijack())")
		}
		_, _, err := hj.Hijack()
		if err == nil {
			t.Errorf("expected error when underlying ResponseWriter doesn't support Hijacker; got nil")
		}
	})

	h := PromhttpMiddleware("svc-no-hijack", hijackHandler)
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rec := httptest.NewRecorder() // NOT a Hijacker
	h.ServeHTTP(rec, req)
}
