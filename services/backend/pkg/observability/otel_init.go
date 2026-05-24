// otel_init.go — OpenTelemetry tracer-provider bootstrap для backend сервисов.
// Phase 5 / OBS-01 production seam + OBS-06 span scrub / D-20 / D-21 / D-32 / D-38.
//
// Конструкция (D-32):
//   - MustInitTracer(ctx, TracerConfig) → func() shutdown closure.
//   - Если DSN пустой → D-38 graceful no-op (slog.Info + return func(){}).
//     Это **dormant-by-design path для v1.0** — Sentry SaaS activation deferred
//     post-v1.0 per ADR-0010 amendment 2026-05-19 PM.
//   - Если DSN валидный — parse'им endpoint + public_key + project_id per
//     RESEARCH §1.3, строим otlptracehttp.Exporter с правильным `X-Sentry-Auth`
//     header + URL path.
//   - **AMENDED 2026-05-19 per ADR-0010**: URL path = `/api/<id>/otlp/v1/traces`
//     (SaaS), NOT `/api/<id>/integration/otlp/v1/traces` (self-hosted, scrapped).
//   - Sample rate 1.0 (RESEARCH §P15 closed-beta scale; пересмотреть в v1.1 если
//     volume cross threshold).
//   - Resource attributes: service.name / service.version / deployment.environment.
//
// PII strip (D-21 — single source of truth):
//   - piiScrubProcessor wraps inner BatchSpanProcessor. На OnStart walk'аем
//     ReadWriteSpan.Attributes; для любого attr key которого ∈ PIIDenyList →
//     overwrite через s.SetAttributes(Key="[redacted]"). EmailHashKeys keys
//     hash'аются через HashEmail (consistent с slog_handler).
//   - **Ограничение**: атрибуты, добавленные через span.SetAttributes() POSLE
//     OnStart, не пройдут через scrub (ReadOnlySpan на OnEnd не позволяет
//     mutation). Mitigation: per-call-site discipline + grep audit (TODO Plan
//     05-06 — extend scripts/pii_audit.sh с span.SetAttributes pattern).
package observability

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// TracerConfig — runtime-конфиг для MustInitTracer. Собирается из ENV в main.go.
type TracerConfig struct {
	// ServiceName — e.g., "identity", "feed", "messaging". Hardcoded per-service.
	// Эмитится как Resource attribute service.name + используется в OTLP exporter
	// labels.
	ServiceName string

	// OtlpEndpoint — опциональный override OTLP endpoint host. Пустая строка →
	// parse'им host из SentryDSN (стандартный путь). Этот override используется
	// для тестов / private OTel collector переадресации.
	OtlpEndpoint string

	// SentryDSN — Sentry DSN (format: https://<public_key>@<host>/<project_id>).
	// Пустая строка → D-38 dormant no-op path (см. amendment ADR-0010 2026-05-19 PM).
	SentryDSN string

	// Env — "prod" | "staging" | "dev".
	Env string

	// Release — git SHA / build ID. Эмитится как service.version Resource attr.
	Release string
}

// parseSentryDSN extracts endpoint host + public_key + project_id из DSN.
// Implements RESEARCH §1.3 verbatim. Format ожидается:
//
//	https://<public_key>@<host>[:<port>]/<project_id>
//
// На malformed/empty input возвращает ("","","", error).
func parseSentryDSN(dsn string) (endpoint, publicKey, projectID string, err error) {
	if dsn == "" {
		return "", "", "", errors.New("empty DSN")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		return "", "", "", fmt.Errorf("parse DSN: %w", err)
	}
	if u.Host == "" {
		return "", "", "", errors.New("DSN missing host")
	}
	publicKey = u.User.Username()
	if publicKey == "" {
		return "", "", "", errors.New("DSN missing public_key (user component)")
	}
	projectID = strings.TrimPrefix(u.Path, "/")
	if projectID == "" {
		return "", "", "", errors.New("DSN missing project_id (path component)")
	}
	return u.Host, publicKey, projectID, nil
}

// piiScrubProcessor — SpanProcessor middleware который walk'ает span attributes
// и dropит/hash'ит per PIIDenyList + EmailHashKeys (D-21 — same source of
// truth as slog_handler).
//
// Реализация: на OnStart перебираем s.Attributes() и для каждого denied key
// перезаписываем значение на "[redacted]" через s.SetAttributes. Для
// EmailHashKeys заменяем на hashed twin. Post-OnStart изменения атрибутов
// proходят НЕ scrubbed (см. TODO в Plan 05-06).
type piiScrubProcessor struct {
	inner sdktrace.SpanProcessor
}

// OnStart — sdktrace.SpanProcessor interface. Walk attrs + overwrite PII.
func (p *piiScrubProcessor) OnStart(parent context.Context, s sdktrace.ReadWriteSpan) {
	attrs := s.Attributes()
	overrides := make([]attribute.KeyValue, 0, len(attrs))
	for _, kv := range attrs {
		key := string(kv.Key)
		switch {
		case IsDenied(key):
			overrides = append(overrides, attribute.String(key, "[redacted]"))
		case ShouldHash(key):
			// Замена value на HashEmail; ключ оставляем как есть для совместимости
			// с downstream consumers, которые ожидают "email" — это inconsistent
			// с slog (slog меняет key на "email_hash"), но OTel span attributes
			// часто не позволяют key renaming в OnStart; trade-off в пользу
			// non-breaking key-shape.
			overrides = append(overrides, attribute.String(key, HashEmail(kv.Value.AsString())))
		}
	}
	if len(overrides) > 0 {
		s.SetAttributes(overrides...)
	}
	p.inner.OnStart(parent, s)
}

// OnEnd — delegate к inner; attrs added после OnStart НЕ scrub'аются (см.
// package doc-comment).
func (p *piiScrubProcessor) OnEnd(s sdktrace.ReadOnlySpan) {
	p.inner.OnEnd(s)
}

// Shutdown — delegate.
func (p *piiScrubProcessor) Shutdown(ctx context.Context) error {
	return p.inner.Shutdown(ctx)
}

// ForceFlush — delegate.
func (p *piiScrubProcessor) ForceFlush(ctx context.Context) error {
	return p.inner.ForceFlush(ctx)
}

// MustInitTracer initializes OTel TracerProvider с OTLP/HTTP exporter,
// PII-scrub SpanProcessor + sample rate 1.0. Returns shutdown closure.
//
// D-38 contract: пустой DSN → no-op закрытие + INFO log line. Это
// dormant-by-design path для v1.0 per ADR-0010 amendment 2026-05-19 PM.
// Activation post-v1.0 = SOPS edit к populate DSN + redeploy.
//
// Malformed DSN (НЕ empty) → WARN log + no-op закрытие. Не падаем — observability
// не должна крашить service start.
func MustInitTracer(ctx context.Context, cfg TracerConfig) func() {
	// D-38 dormant-by-design path — empty DSN, Sentry SaaS activation deferred.
	if cfg.SentryDSN == "" {
		slog.InfoContext(ctx, "observability.sentry: disabled — empty DSN",
			"next_step", "see ADR-0010 amendment 2026-05-19 PM")
		return func() {} // no-op shutdown
	}

	endpoint, publicKey, projectID, err := parseSentryDSN(cfg.SentryDSN)
	if err != nil {
		slog.WarnContext(ctx, "otel: malformed SENTRY_DSN_BACKEND; tracing disabled",
			"err", err.Error())
		return func() {} // no-op shutdown — malformed != crash
	}

	// Override endpoint host если OtlpEndpoint set (тестовый seam / private
	// collector forwarding).
	if cfg.OtlpEndpoint != "" {
		endpoint = cfg.OtlpEndpoint
	}

	// SaaS OTLP URL path — AMENDED 2026-05-19 per ADR-0010.
	// Self-hosted (scrapped) was: /api/<id>/integration/otlp/v1/traces
	// SaaS: /api/<id>/otlp/v1/traces (canonical OTLP path).
	urlPath := "/api/" + projectID + "/otlp/v1/traces"

	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint(endpoint),
		otlptracehttp.WithURLPath(urlPath),
		otlptracehttp.WithHeaders(map[string]string{
			"X-Sentry-Auth": "sentry sentry_key=" + publicKey,
		}),
		otlptracehttp.WithCompression(otlptracehttp.GzipCompression),
	)
	if err != nil {
		// MustInitTracer — semantically Must*; но crashing service из-за
		// observability — антипаттерн. Logging + no-op closer.
		slog.ErrorContext(ctx, "otel: failed to build OTLP exporter; tracing disabled",
			"err", err.Error())
		return func() {}
	}

	// Resource attributes per RESEARCH §1.3.
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.Release),
			semconv.DeploymentEnvironment(cfg.Env),
		),
	)
	if err != nil {
		slog.WarnContext(ctx, "otel: resource construction returned error; using partial",
			"err", err.Error())
		// res может быть partial — продолжаем (resource.New возвращает best-effort
		// resource даже на partial errors per upstream contract).
	}

	bsp := sdktrace.NewBatchSpanProcessor(exporter)
	scrub := &piiScrubProcessor{inner: bsp}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSpanProcessor(scrub),
		sdktrace.WithResource(res),
		// Sample rate 1.0 (RESEARCH §P15 — closed beta scale; revisit в v1.1
		// если волюм cross 1000 events/hour ceiling per RESEARCH §P15 ceiling).
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)

	otel.SetTracerProvider(tp)

	return func() {
		ctxStop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := tp.Shutdown(ctxStop); err != nil {
			slog.Warn("otel: TracerProvider shutdown error", "err", err.Error())
		}
	}
}
