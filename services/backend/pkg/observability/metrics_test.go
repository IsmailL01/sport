// metrics_test.go — descriptor-level tests для D-17 / D-18 budget enforcement.
// Phase 5 / OBS-05 / OBS-07.
package observability

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

// TestMetrics_AllD17FamiliesRegistered — после import pkg/observability,
// prometheus.DefaultGatherer.Gather() возвращает MetricFamilies для всех 6
// D-17 metric names.
func TestMetrics_AllD17FamiliesRegistered(t *testing.T) {
	// "Touch" каждый Vec через .WithLabelValues(...) — иначе promauto не
	// эмиттит MetricFamily в Gather() output (только children появляются
	// в /metrics, не сам descriptor пока нет children).
	HTTPRequestDuration.WithLabelValues("test", "GET", "/x", "2xx").Observe(0.001)
	HTTPRequestsTotal.WithLabelValues("test", "GET", "/x", "2xx").Inc()
	JWTValidationTotal.WithLabelValues("test", "ok").Inc()
	NATSConsumerPending.WithLabelValues("test", "stream", "consumer").Set(0)
	DBQueryDuration.WithLabelValues("test", "select").Observe(0.001)
	ExternalAPIDuration.WithLabelValues("test", "mapbox").Observe(0.001)

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}

	got := make(map[string]struct{}, len(families))
	for _, mf := range families {
		got[mf.GetName()] = struct{}{}
	}

	for _, want := range D17MetricNames {
		if _, ok := got[want]; !ok {
			t.Errorf("missing D-17 metric family %q from DefaultGatherer", want)
		}
	}
}

// TestHTTPRequestDuration_BucketsMatchD17 — descriptor's bucket array
// matches the D-17 specification verbatim.
func TestHTTPRequestDuration_BucketsMatchD17(t *testing.T) {
	expected := []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}

	// Touch a child to populate Gather output.
	HTTPRequestDuration.WithLabelValues("bk-test", "GET", "/x", "2xx").Observe(0.001)

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}

	var hMF *dto.MetricFamily
	for _, mf := range families {
		if mf.GetName() == "http_request_duration_seconds" {
			hMF = mf
			break
		}
	}
	if hMF == nil {
		t.Fatalf("http_request_duration_seconds not found in Gather()")
	}
	if len(hMF.Metric) == 0 {
		t.Fatalf("http_request_duration_seconds has no Metric samples")
	}

	hist := hMF.Metric[0].Histogram
	if hist == nil {
		t.Fatalf("first sample is not a Histogram")
	}
	got := make([]float64, 0, len(hist.Bucket))
	for _, b := range hist.Bucket {
		got = append(got, b.GetUpperBound())
	}

	if len(got) != len(expected) {
		t.Fatalf("bucket count mismatch: got %d, want %d (got=%v)", len(got), len(expected), got)
	}
	for i := range expected {
		if got[i] != expected[i] {
			t.Errorf("bucket[%d]: got %v, want %v", i, got[i], expected[i])
		}
	}
}

// TestHTTPRequestDuration_LabelKeys — variable labels are exactly
// [service, method, route, status]; нет forbidden D-18 labels.
func TestHTTPRequestDuration_LabelKeys(t *testing.T) {
	forbidden := []string{"user_id", "session_id", "device_id", "external_uuid", "email", "phone"}
	expected := []string{"service", "method", "route", "status"}

	HTTPRequestDuration.WithLabelValues("lk-test", "GET", "/x", "2xx").Observe(0.001)

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}

	var hMF *dto.MetricFamily
	for _, mf := range families {
		if mf.GetName() == "http_request_duration_seconds" {
			hMF = mf
			break
		}
	}
	if hMF == nil || len(hMF.Metric) == 0 {
		t.Fatalf("http_request_duration_seconds not present in Gather()")
	}

	labelKeys := make(map[string]struct{}, len(hMF.Metric[0].Label))
	got := make([]string, 0, len(hMF.Metric[0].Label))
	for _, lp := range hMF.Metric[0].Label {
		labelKeys[lp.GetName()] = struct{}{}
		got = append(got, lp.GetName())
	}

	// Expected — exact set.
	if len(got) != len(expected) {
		t.Fatalf("label count mismatch: got %v, want %v", got, expected)
	}
	for _, want := range expected {
		if _, ok := labelKeys[want]; !ok {
			t.Errorf("missing required label key %q (got=%v)", want, got)
		}
	}

	// Forbidden — none present (D-18 enforcement at descriptor level).
	for _, bad := range forbidden {
		if _, ok := labelKeys[bad]; ok {
			t.Errorf("D-18 violation: forbidden label %q present on http_request_duration_seconds", bad)
		}
	}
}

// TestJWTValidationTotal_LabelKeys — verifies JWT counter does NOT include
// user_id (per D-18; auth flows are tempting "let me tag who failed" spots).
func TestJWTValidationTotal_LabelKeys(t *testing.T) {
	forbidden := []string{"user_id", "session_id", "device_id", "external_uuid", "email", "phone"}

	JWTValidationTotal.WithLabelValues("jwt-test", "ok").Inc()

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}
	var mf *dto.MetricFamily
	for _, f := range families {
		if f.GetName() == "jwt_validation_total" {
			mf = f
			break
		}
	}
	if mf == nil || len(mf.Metric) == 0 {
		t.Fatalf("jwt_validation_total not in Gather()")
	}
	for _, lp := range mf.Metric[0].Label {
		for _, bad := range forbidden {
			if lp.GetName() == bad {
				t.Errorf("D-18 violation: jwt_validation_total has forbidden label %q", bad)
			}
		}
	}
}
