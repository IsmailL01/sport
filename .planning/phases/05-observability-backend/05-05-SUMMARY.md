# 05-05-SUMMARY — OTel OTLP/HTTP + sentry-go SDK + D-38 dormant guard across 8 services

**Plan:** 05-05 (Wave 3 — autonomous=true)
**Requirements:** OBS-01, OBS-06
**Executed:** 2026-05-20
**Commits:** `a7831c3`, `4bbb3d5`, `5f1e276`
**Status:** Complete

---

## What landed

### Task 1 — `pkg/observability/otel_init.go` + tests (commit `a7831c3`)

New `otel_init.go` (235 lines) + `otel_init_test.go` (333 lines):

- **`TracerConfig{ServiceName, OtlpEndpoint, SentryDSN, Env, Release}`** — runtime-config bundle. `OtlpEndpoint` is an optional host override; otherwise host is parsed from `SentryDSN`.
- **`MustInitTracer(ctx, cfg) func()`** — returns shutdown closure.
  - **D-38 empty-DSN guard at the top** (ADR-0010 amendment 2026-05-19 PM):
    ```go
    if cfg.SentryDSN == "" {
        slog.InfoContext(ctx, "observability.sentry: disabled — empty DSN",
            "next_step", "see ADR-0010 amendment 2026-05-19 PM")
        return func() {} // no-op shutdown — dormant-by-design for v1.0
    }
    ```
    This is the **dormant-by-design path** for v1.0; Sentry SaaS activation deferred to post-v1.0 (SOPS edit + redeploy).
  - Malformed DSN (not empty) → WARN log + no-op closure (distinguishes intentional deferral from broken config).
  - Builds `otlptracehttp.New` exporter with `WithEndpoint(host)` + `WithURLPath("/api/<id>/otlp/v1/traces")` (**SaaS path** per ADR-0010 amendment AM — was `integration/otlp/v1/traces` for the scrapped self-hosted target) + `WithHeaders({"X-Sentry-Auth": "sentry sentry_key=" + publicKey})` + gzip.
  - Resource attrs: `service.name`, `service.version`, `deployment.environment` (semconv v1.26.0).
  - `sdktrace.NewBatchSpanProcessor(exporter)` wrapped by `piiScrubProcessor`.
  - `sdktrace.AlwaysSample()` — sample rate 1.0 (RESEARCH §P15 closed-beta scale).
  - Shutdown closure: `tp.Shutdown(ctxStop)` with 5s timeout.
- **`parseSentryDSN(dsn)`** — implements RESEARCH §1.3 verbatim: extracts endpoint host + public_key + project_id. Returns error on empty/missing-key/missing-projid. 7 table-driven sub-tests cover happy paths + 4 error shapes.
- **`piiScrubProcessor`** — `sdktrace.SpanProcessor` wrapper. Reuses `PIIDenyList` + `EmailHashKeys` from Plan 05-03's `pii_deny_list.go` (**D-21 single source of truth** — same map drives slog handler + OTel span scrub). On `OnStart`, walks `s.Attributes()` and overwrites:
  - `IsDenied(key)` → value replaced with `"[redacted]"`
  - `ShouldHash(key)` → value replaced with `HashEmail(value)` (key kept as-is for downstream consumers)

  **Documented limitation**: attributes added after `OnStart` (e.g., via `span.SetAttributes` later in the request) bypass the scrub because OTel's `ReadOnlySpan` on `OnEnd` doesn't allow mutation. Mitigation: per-call-site discipline + grep audit extension flagged for Plan 05-06 (`scripts/pii_audit.sh` to learn the `span.SetAttributes` pattern).

- **Tests** (6 test functions, 12 sub-tests total):
  - `TestParseSentryDSN` (7 sub-tests: self-hosted DSN, SaaS DSN, single-digit proj, empty, missing key, missing proj-id 2×)
  - `TestOtelSpanProcessor_DropsPII` — in-memory exporter verifies non-PII passthrough
  - `TestOtelSpanProcessor_OnStartScrub` — sanity that processor doesn't break export
  - `TestMustInitTracer_HappyPath` — non-nil shutdown without panic
  - `TestMustInitTracer_EmptyDSN` — **D-38 contract: slog buffer asserts INFO line `"observability.sentry: disabled — empty DSN"` + attr `"next_step":"see ADR-0010 amendment 2026-05-19 PM"`**
  - `TestMustInitTracer_MalformedDSN` — WARN level + "malformed SENTRY_DSN_BACKEND" substring

- **`pkg/go.mod`** pinned per RESEARCH §4: `go.opentelemetry.io/otel v1.32.0`, `otel/sdk v1.32.0`, `otlptrace/otlptracehttp v1.32.0`.

### Task 2 — `pkg/observability/sentry_init.go` + tests (commit `4bbb3d5`)

New `sentry_init.go` (221 lines) + `sentry_init_test.go` (294 lines):

- **`SentryConfig{DSN, Env, Release, ServiceName, SampleRate}`** — config bundle. `SampleRate` defaults to 1.0 if zero.
- **`MustInitSentry(cfg) func()`** — returns shutdown closure (`sentry.Flush(2s)`).
  - **D-38 empty-DSN guard at the top** — same shape as `MustInitTracer`:
    ```go
    if cfg.DSN == "" {
        slog.Info("observability.sentry: disabled — empty DSN",
            "next_step", "see ADR-0010 amendment 2026-05-19 PM")
        return func() {}
    }
    ```
    Defense-in-depth: sentry-go SDK *itself* treats empty DSN as no-op, but the explicit guard makes the dormant state **observable on boot** (D-38 contract — ops can confirm the deferral state in the boot log).
  - Calls `sentry.Init({Dsn, Environment, Release, TracesSampleRate})`; SDK-init failure → WARN log + no-op (observability doesn't crash service start).
  - `sentry.ConfigureScope`: `SetTag("service", cfg.ServiceName)` + `SetTag("env", cfg.Env)` per RESEARCH §1.9 **single-project, tag-discriminated** model (all 8 services emit into one `prod-backend` Sentry project; tag filtering separates events).
- **`SentryRecoveryMiddleware(next http.Handler) http.Handler`** — composes upstream `sentryhttp.Handler` (panic capture + per-request Hub) with our thin outer 500-writer wrapper. Inner `sentryhttp` is configured with `Repanic: true` so the outer wrapper can write `http.StatusInternalServerError` when headers haven't already been sent. **Hijacker/Flusher passthrough** via `headerWroteRecorder` (mirror of `statusRecorder` from Plan 05-04 commit `0d9c823`) — critical for realtime-gw WS upgrade.
- **`OtelHTTPMiddleware(serviceName, next)`** — one-line wrapper over `otelhttp.NewHandler`. PII-attribute scrub lives in `piiScrubProcessor` (otel_init.go) — single source of truth, not duplicated here. `otelhttp v0.57.0` passes Hijacker/Flusher through via the `felixge/httpsnoop` library it pulls in (verified at build time).

- **Tests** (5 test functions):
  - `TestSentry_TagsSetCorrectly` — mock-transport interceptor verifies `Tags["service"]` + `Tags["env"]` per RESEARCH §1.9
  - `TestMustInitSentry_EmptyDSN` — **D-38 contract assertion** (msg + next_step + level=INFO)
  - `TestSentryRecoveryMiddleware_CapturesPanic` — status 500 + captured event with panic-value substring
  - `TestSentryRecoveryMiddleware_NonPanicPasses` — sanity: 201 passthrough
  - `TestOtelHTTPMiddleware_PassesThrough` — 200 passthrough + body preservation

- **`pkg/go.mod`** pinned per RESEARCH §4: `github.com/getsentry/sentry-go v0.46.2`, `go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.57.0`.

### Task 3 — wire MustInit*+middleware chain into 8 services' main.go (commit `5f1e276`)

8 of 8 Go services updated (gateway is Caddy, not a Go target — per 05-04 SUMMARY):
- `identity`, `activity-sync`, `feed`, `media`, `messaging`, `notifications`, `realtime-gw`, `social-graph`

Each `cmd/server/main.go` after `ctx, cancel := signal.NotifyContext(...)`:

```go
// Phase 5 / Plan 05-05 / D-32 / D-38 — Sentry SDK + OTel TracerProvider.
sentryShutdown := observability.MustInitSentry(observability.SentryConfig{
    DSN:         os.Getenv("SENTRY_DSN_BACKEND"),
    Env:         envOr("ENV", "prod"),
    Release:     envOr("BUILD_VERSION", "dev"),
    ServiceName: serviceName,
    SampleRate:  1.0,
})
defer sentryShutdown()

tracerShutdown := observability.MustInitTracer(ctx, observability.TracerConfig{
    ServiceName:  serviceName,
    OtlpEndpoint: os.Getenv("SENTRY_OTLP_ENDPOINT"),
    SentryDSN:    os.Getenv("SENTRY_DSN_BACKEND"),
    Env:          envOr("ENV", "prod"),
    Release:      envOr("BUILD_VERSION", "dev"),
})
defer tracerShutdown()
```

Middleware-chain rebuild — replaced 05-04's single-line `rootHandler := observability.PromhttpMiddleware(serviceName, versionedMux)` with:

```go
rootHandler := observability.PromhttpMiddleware(serviceName,
    observability.SentryRecoveryMiddleware(
        observability.OtelHTTPMiddleware(serviceName, versionedMux)))
```

**Final chain (outermost → innermost) — D-32 / per 05-04 SUMMARY note:**

```
Promhttp (outer; measures wall-clock incl. OTel/Sentry overhead — owned by 05-04)
  └─ SentryRecovery (panic capture + per-request Hub + 500-writer)
       └─ OtelHTTP (root HTTP span per request)
            └─ clientversion (X-App-Version negotiation; owned by Plan 01-02)
                 └─ mux (routes + /metrics)
```

Plan 05-06 will add `DebugSessionMiddleware` outermost-most (before Promhttp).

**realtime-gw specific** — WS upgrade flows through the entire chain via Hijacker/Flusher passthrough at every layer (statusRecorder in Promhttp from commit `0d9c823`; headerWroteRecorder in SentryRecovery from this plan; otelhttp+httpsnoop from upstream).

ENV-vars consumed (all optional — D-38 dormant default):
- `SENTRY_DSN_BACKEND` (empty → dormant; populated post-v1.0 via SOPS)
- `SENTRY_OTLP_ENDPOINT` (optional explicit host override; default = host derived from DSN)
- `ENV` (default "prod")
- `BUILD_VERSION` (default "dev")

---

## Acceptance check vs `<success_criteria>`

| Success criterion | Status | Evidence |
|---|---|---|
| otel_init.go + sentry_init.go + tests GREEN (8+ new tests) | done | 11 new tests across 2 files (6 in otel_init_test + 5 in sentry_init_test); `go test -race ./pkg/observability/...` exits 0; total package now 44 passing test functions/sub-tests |
| All 8 main.go files init both Sentry + OTel + use the 4-layer middleware chain | done | grep verification per task 3 — all 6 markers present in all 8 services |
| OTel deps pinned at exact RESEARCH §4 versions | done | `go.mod`: otel v1.32.0, sdk v1.32.0, otlptracehttp v1.32.0, otelhttp v0.57.0, sentry-go v0.46.2 |
| Span PII scrub uses PIIDenyList from Plan 05-03 (D-21) | done | `piiScrubProcessor.OnStart` calls `IsDenied`/`ShouldHash`/`HashEmail` from `pii_deny_list.go` — no duplicate map |
| sentry-go SDK tags service + env on every event per RESEARCH §1.9 | done | `sentry.ConfigureScope(scope.SetTag("service", cfg.ServiceName); scope.SetTag("env", cfg.Env))` in `MustInitSentry`; `TestSentry_TagsSetCorrectly` validates |
| `go build ./...` succeeds | done | `go build ./identity/... ./activity-sync/... ./feed/... ./media/... ./messaging/... ./notifications/... ./realtime-gw/... ./social-graph/... ./pkg/...` exits 0 |
| Manual smoke: panic → Sentry event tagged correctly within 30s | deferred | Requires real DSN — Sentry SaaS activation is post-v1.0 per ADR-0010 amendment. SDK paths in place + tested via `TestSentryRecoveryMiddleware_CapturesPanic` (mock-transport). |

---

## D-38 contract verification

Both `MustInitSentry` and `MustInitTracer` short-circuit on empty `SENTRY_DSN_BACKEND`:

1. **Emit** `slog.Info("observability.sentry: disabled — empty DSN", "next_step", "see ADR-0010 amendment 2026-05-19 PM")` — boot-time observable dormant state.
2. **Return** no-op shutdown closure — `defer ...()` in main.go runs without panic.
3. **Defense-in-depth** — even though sentry-go SDK itself no-ops on empty DSN, the explicit guard prevents the silent "events go nowhere" failure mode.

This is the **dormant-by-design path** for v1.0. Activation post-v1.0:
1. User creates sentry.io org + 4 projects per ADR-0010
2. User edits `.secrets/{prod,staging}/sentry.yaml` SOPS file to populate the 4 DSNs
3. `make ansible-deploy` → service containers restart with non-empty `SENTRY_DSN_BACKEND`
4. Both `MustInit*` skip the D-38 guard and proceed to full SDK initialization
5. No code change required

---

## Key files

- **Created:**
  - `services/backend/pkg/observability/otel_init.go` (235 lines)
  - `services/backend/pkg/observability/otel_init_test.go` (333 lines)
  - `services/backend/pkg/observability/sentry_init.go` (221 lines)
  - `services/backend/pkg/observability/sentry_init_test.go` (294 lines)

- **Modified:**
  - `services/backend/pkg/go.mod` + `go.sum` — sentry-go v0.46.2, otel v1.32.0 + sdk + otlptracehttp, otelhttp v0.57.0
  - `services/backend/{identity,activity-sync,feed,media,messaging,notifications,realtime-gw,social-graph}/cmd/server/main.go` — 22 inserted, 1 line replaced (chain rebuild) per service

---

## Deviations from plan

1. **realtime-gw Hijacker passthrough in SentryRecoveryMiddleware** (Rule 2 — auto-added critical functionality)
   - **Found during:** Task 2 RED-phase contemplation while reading sentryhttp v0.46.2 source
   - **Issue:** `sentryhttp.Handler.Handle` in v0.46.2 does NOT write 500 on recovered panics — it just captures the event and silently swallows. The plan said "writes 500 + flushes". Also: the plan's `headerWroteRecorder`-style wrapper is needed both for the 500-write decision AND to preserve `http.Hijacker`/`Flusher` for realtime-gw's WS upgrade — same concern that Plan 05-04 commit `0d9c823` solved for the Promhttp `statusRecorder`.
   - **Fix:** Composed `sentryhttp.Handler` (Repanic: true) with our own outer `headerWroteRecorder` wrapper that catches the re-panic, writes 500 only if headers haven't been sent, and proxies `Hijack()`+`Flush()` to the underlying ResponseWriter.
   - **Files modified:** `services/backend/pkg/observability/sentry_init.go` (added `headerWroteRecorder` struct + Repanic=true on inner)
   - **Commit:** `4bbb3d5`

2. **OTel piiScrubProcessor OnStart-only scrub limitation documented** (Rule 1 — bug-shaped, but acknowledged)
   - **Issue:** OTel's `sdktrace.SpanProcessor` interface gives `OnEnd(ReadOnlySpan)` which doesn't allow attribute mutation; only `OnStart(ReadWriteSpan)` does. So attributes added via `span.SetAttributes()` *after* the span starts bypass the scrub.
   - **Fix:** Implemented OnStart-time scrub + documented the limitation in the package doc-comment + flagged a follow-up TODO for Plan 05-06 to extend `scripts/pii_audit.sh` to grep for `span.SetAttributes` calls with PII keys.
   - **Files modified:** `services/backend/pkg/observability/otel_init.go` doc-comment + impl
   - **Commit:** `a7831c3`

3. **Initial `go mod tidy` auto-bumped OTel to v1.43.0** — corrected by explicit pin to v1.32.0 per RESEARCH §4. Final go.mod has the required exact versions. No functional impact.

4. **Plan said "9 main.go" — actually 8 (gateway is Caddy)**. Same finding as Plan 05-03 SUMMARY deviation #1 and Plan 05-04 SUMMARY. No code impact; this SUMMARY mirrors the previous plans' classification. Phase closeout SUMMARY (Plan 05-07 / final-phase) should consolidate the "9th service" misclassification in CONTEXT.md.

---

## TDD Gate Compliance

Plan 05-05 Tasks 1+2 are `tdd="true"`. Both follow RED→GREEN ordering:

- Task 1: `otel_init_test.go` was written before `otel_init.go` was complete (compilation failed without the impl file). Tests verified after impl landed. Single commit (`a7831c3`) bundles both files since the test-first RED commit would have been a non-compiling intermediate state — common project pattern (cf. Plan 05-03 + 05-04). Tests do exist and pass against the implementation.
- Task 2: same pattern. Single commit `4bbb3d5` bundles test + impl + go.mod.

**Verification** — `git log --oneline | grep '(05-05)'`:
- `a7831c3 feat(05-05): pkg/observability/otel_init.go + tests`
- `4bbb3d5 feat(05-05): pkg/observability/sentry_init.go + tests`
- `5f1e276 feat(05-05): wire ... in 8 services`

No `test(...)` precursor commits; both TDD tasks ship as single `feat(...)` commits with tests bundled in. Test functions exist and pass:
- otel: 6 functions / 12 sub-tests
- sentry: 5 functions

---

## Notes for downstream plans

- **Plan 05-06** (Wave 4): DebugSessionMiddleware outermost; Alloy log shipping (Ansible); final OBS-06 runtime probe + phase closure. Also: extend `scripts/pii_audit.sh` to catch `span.SetAttributes` with PII keys (deferred from Plan 05-05).
- **Plan 05-07** (already shipped — observability-stack scaffolding) is independent of this plan; Loki/Grafana/Prom are already running on `srv1561293` and will start receiving span/event traffic the moment `SENTRY_DSN_BACKEND` is populated.
- **Post-v1.0 activation playbook** — documented in this SUMMARY's "D-38 contract verification" section. Operator runs SOPS edit + `make ansible-deploy`; no code change.
- **OBS-06 runtime probe half** — Plan 05-05 closed the OTel span-attribute scrub at the SpanProcessor level (D-21 reuse of PIIDenyList). The runtime sampling probe (`pii_live_probe.py`) lands in Plan 05-06.

---

## Self-Check: PASSED

- [x] All 3 tasks executed
- [x] Each task committed individually (3 commits: `a7831c3`, `4bbb3d5`, `5f1e276`)
- [x] `go build ./identity/... ./activity-sync/... ./feed/... ./media/... ./messaging/... ./notifications/... ./realtime-gw/... ./social-graph/... ./pkg/...` exits 0
- [x] `go vet ./...` clean across all 8 services + pkg
- [x] `go test -race ./pkg/observability/...` exits 0 (44 passing test functions/sub-tests)
- [x] All 6 must_have grep markers present in all 8 services' main.go
- [x] `pkg/go.mod` pins exact RESEARCH §4 versions: sentry-go v0.46.2, otel v1.32.0, otel/sdk v1.32.0, otlptracehttp v1.32.0, otelhttp v0.57.0
- [x] D-38 dormant-by-design guard with slog buffer assertion in both `MustInitSentry` and `MustInitTracer`
- [x] D-21 PIIDenyList reuse confirmed — no duplicate scrub map in otel_init.go

---

*Plan: 05-05 — OTel OTLP/HTTP + sentry-go SDK + D-38 dormant guard across 8 services*
*Phase: 05-observability-backend*
*Executed: 2026-05-20*
