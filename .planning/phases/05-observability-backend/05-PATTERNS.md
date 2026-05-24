# Phase 5 — Pattern Map

> Closest existing analogs for new Phase 5 files. Each entry: target file → analog → code excerpt → what to copy / what to adapt. Substitute `promtail` → `alloy` per RESEARCH §1.6 (Promtail EOL 2026-03-02).

**Mapped:** 2026-05-19
**Files analyzed:** 38 (32 NEW, 6 MODIFY across Go / Ansible / Python / Bash / SOPS / CI / docs)
**Analogs found:** 32 strong / 38 total. Six (Grafana dashboards, TELEMETRY.md skeleton) have no existing analog — flagged as "no analog" with research/upstream guidance.

---

## Go: services/backend/pkg/observability/

### `pkg/observability/slog_handler.go` (NEW)

**Analog:** `services/backend/pkg/clientversion/clientversion.go` (package layout) + `services/backend/identity/cmd/server/main.go:52` (existing JSONHandler bootstrap call)

**Package-init excerpt** (`clientversion.go:1-24`):
```go
// Package clientversion — HTTP middleware для проверки заголовка X-Client-Version.
// Phase 1 / REL-02 (см. .planning/phases/01-release-contract-and-version-baseline/).
//
// Pattern parallel'ит pkg/ratelimit и pkg/permissions:
//   - subpackage внутри github.com/runningecosystem/backend/pkg (без отдельного go.mod);
//   - shared library, mounted каждым сервисом из cmd/server/main.go;
//   - graceful-degrade by default — не валим production-трафик из-за infra-сбоя.
package clientversion

import (
    "context"
    "log/slog"
)
```

**Current JSON-handler call to replace** (`identity/cmd/server/main.go:52-53`):
```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
slog.SetDefault(logger)
```

**Copy:** package-comment shape (header per-Phase reference; "subpackage inside .../pkg"); `loggerOrDefault` fallback idiom (`middleware.go:88-93`); `slog.NewJSONHandler(os.Stdout, ...)` baseline call.

**Adapt:** Wrap `slog.JSONHandler` with a `Handler` struct exposing `Handle(ctx, record) error` that walks `record.Attrs`, drops PII-deny-list keys (D-12), hashes `email` → `email_hash` SHA-256-first-8. Add default attrs (`service`, `env`, `version`, `request_id`) via `Handler.WithAttrs`. Constructor signature per D-10: `NewSlogJSONHandler(Config{ServiceName, Env, Version, Level}) *slog.Logger`.

---

### `pkg/observability/pii_deny_list.go` (NEW)

**Analog:** `services/backend/pkg/clientversion/clientversion.go:46-54` (package-level `type ... struct{}` + literal constants).

**Excerpt** (existing pattern for package-level config tables):
```go
// Policy — runtime-конфиг middleware. Каждый сервис собирает Policy в main.go
type Policy struct {
    MinSupported string
    ForceUpdateURLAndroid string
    ForceUpdateURLiOS string
    SkipPaths []string
}
```

**Copy:** "package-level shared constant table" idiom; lowercase exported `map[string]struct{}` for fast lookup; package doc-comment header.

**Adapt:** Export a `var PIIDenyList = map[string]struct{}{...}` keyed lowercase, populated per D-12 (keys: `code`, `otp_code`, `otp`, `phone`, `phone_number`, `phoneNumber`, `tel`, `displayName`, `display_name`, `external_uuid`, `strava_external_id`, `garmin_external_id`, `lat`, `lon`, `latitude`, `longitude`, `coords`, `gps`, `location`, `dm_content`, `message_body`, `body`, `content`, `mapbox_token`, `strava_token`, `jwt`, `access_token`, `refresh_token`, `password`). Single source of truth — imported by both slog handler (D-10) and OTel span processor (D-21).

---

### `pkg/observability/promhttp_middleware.go` (NEW)

**Analog:** `services/backend/pkg/clientversion/middleware.go:27-75` (textbook `Middleware(next http.Handler, policy, log) http.Handler` shape).

**Excerpt** (`middleware.go:25-45`):
```go
// Middleware — внешний wrap для outermost http.Handler сервиса.
// Передавайте *slog.Logger сервиса; nil → slog.Default().
func Middleware(next http.Handler, p Policy, log *slog.Logger) http.Handler {
    log = loggerOrDefault(log)

    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 1. Skip-paths bypass.
        if matchesSkipPath(r.URL.Path, p.SkipPaths) {
            next.ServeHTTP(w, r)
            return
        }
        // ...
    })
}
```

**Copy:** Signature shape `Middleware(next http.Handler, ...) http.Handler`; skip-paths handling (also relevant for `/metrics` self-exclusion); `loggerOrDefault` fallback; `http.HandlerFunc` closure return.

**Adapt:** Replace policy-comparison body with `prometheus/client_golang` instrumentation: wrap `w` in a status-capturing `httpsnoop`-style proxy, `time.Now()` at entry, `WithLabelValues(method, route_template, status_class).Observe(elapsed.Seconds())` at exit. Histogram buckets per D-17 = `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`. **Route label** = templated path from `mux` (`/users/{id}`), NOT raw `r.URL.Path` — Pitfall #6 in CONTEXT.

---

### `pkg/observability/debug_session_middleware.go` (NEW)

**Analog:** `services/backend/pkg/clientversion/middleware.go:30-75` (header parsing + early-bypass + context-attach pattern) + `services/backend/pkg/featureflags/featureflags.go:70-76` (constructor signature `(pool, ttl) *Store` — observability middleware will take `featureflags.Client` instead of `Policy`).

**Excerpt** (`clientversion/middleware.go:36-47`):
```go
return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    // 1. Skip-paths bypass.
    if matchesSkipPath(r.URL.Path, p.SkipPaths) {
        next.ServeHTTP(w, r); return
    }
    header := r.Header.Get("X-Client-Version")
    if strings.TrimSpace(header) == "" {
        log.WarnContext(r.Context(),
            "clientversion: missing header",
            "path", r.URL.Path,
        )
        next.ServeHTTP(w, r); return
    }
    // ...
})
```

**Copy:** Header-read + early-return graceful-pass; `Middleware(next, dep, log)` signature; context-attach via `ctxKey{}` private struct pattern (`clientversion.go:56-83`).

**Adapt:** Per RESEARCH §1.8 — require **all three** gates: header `X-Debug-Session: 1` AND JWT claim `is_tester=true` (read via `auth.ClaimsFromContext`) AND `ff.IsEnabled(ctx, "tester_debug_logs", userID)`. If all pass, `ctx = observability.WithLogLevel(r.Context(), slog.LevelDebug)`; missing any → silent pass-through at `LevelInfo`. Pre-auth paths (`/healthz`, `/metrics`, `/auth/request-code`) hard-skip (no JWT in context).

---

### `pkg/observability/sentry_init.go` (NEW)

**Analog:** `services/backend/identity/cmd/server/main.go:78-93` (init-and-defer-cleanup idiom for `pgxpool`, `auth.NewSigner`) — Sentry SDK init mirrors `pgxpool.New` shape.

**Excerpt** (`identity/cmd/server/main.go:78-93`):
```go
signer, err := auth.NewSigner(jwtSecret)
if err != nil {
    return fmt.Errorf("init signer: %w", err)
}

ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
defer cancel()

pool, err := pgxpool.New(ctx, dbURL)
if err != nil {
    return fmt.Errorf("connect db: %w", err)
}
defer pool.Close()
if err := pool.Ping(ctx); err != nil {
    return fmt.Errorf("ping db: %w", err)
}
logger.Info("db connected", "url", redactPassword(dbURL))
```

**Copy:** `Must*` panic-on-fatal-init idiom for non-recoverable bootstrap; `defer cleanup()` registration immediately after init; structured-log "ready" line after successful init.

**Adapt:** Per RESEARCH §1.9 (1 prod-backend Sentry project, per-service tag) and §4 (pin `github.com/getsentry/sentry-go v0.46.2`): `MustInitSentry(SentryConfig{DSN, Env, Release, SampleRate}) func()` returns a cleanup closure. After `sentry.Init(...)`, call `sentry.ConfigureScope(func(scope) { scope.SetTag("service", cfg.ServiceName); scope.SetTag("env", ...) })`. Return a `func()` that calls `sentry.Flush(2 * time.Second)` for graceful shutdown.

---

### `pkg/observability/otel_init.go` (NEW)

**Analog:** Same as `sentry_init.go` (`identity/cmd/server/main.go:78-93`) — bootstrap idiom; RESEARCH §1.3 supplies the concrete `otlptracehttp` wiring.

**Code to wire (from RESEARCH §1.3 — copy verbatim):**
```go
import "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"

dsn, _ := url.Parse(os.Getenv("SENTRY_DSN_BACKEND"))
publicKey := dsn.User.Username()
projectID := strings.TrimPrefix(dsn.Path, "/")
endpoint := dsn.Host  // e.g., sentry.85-239-149-26.sslip.io

exporter, _ := otlptracehttp.New(ctx,
    otlptracehttp.WithEndpoint(endpoint),
    otlptracehttp.WithURLPath("/api/"+projectID+"/integration/otlp/v1/traces"),
    otlptracehttp.WithHeaders(map[string]string{
        "X-Sentry-Auth": "sentry sentry_key=" + publicKey,
    }),
    otlptracehttp.WithCompression(otlptracehttp.GzipCompression),
)
```

**Copy:** `Must*` init shape from `identity/cmd/server/main.go`; return shutdown closure; defer-on-caller pattern. Wrap `TracerProvider` with a `SpanProcessor` that mirrors the slog-handler scrub: reject Attrs whose Key matches `pii_deny_list.PIIDenyList` (D-21).

**Adapt:** Pin versions per RESEARCH §4 — `go.opentelemetry.io/otel v1.32.0` + `otelhttp v0.57.0`. NEVER mix minor versions (RESEARCH compatibility note).

---

### `pkg/observability/metrics.go` (NEW)

**Analog:** `services/backend/pkg/clientversion/clientversion.go:46-63` (package-level `var` / `type` declarations; immutable config table) — closest match for "package-level metric definitions".

**Excerpt** (existing package-level public type declarations):
```go
type upgradeRequiredBody struct {
    Error                 string `json:"error"`
    MinVersion            string `json:"min_version"`
    ForceUpdateURLAndroid string `json:"force_update_url_android"`
    ForceUpdateURLiOS     string `json:"force_update_url_ios"`
}

type ctxKey struct{}
```

**Copy:** Package-level `var` declarations style; doc-comment per declared symbol; namespaced naming (`http_*`, `jwt_*` mirrors `clientversion: ...` log-key namespace).

**Adapt:** Declare standard Prom metrics per D-17 using `promauto.NewHistogramVec / NewCounterVec / NewGaugeVec`:
- `http_request_duration_seconds{method, route, status}` Histogram, buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`
- `http_requests_total{method, route, status}` Counter
- `jwt_validation_total{result}` Counter (`result` ∈ `ok|expired|invalid|missing`)
- `nats_consumer_pending{stream, consumer}` Gauge
- `db_query_duration_seconds{operation}` Histogram
- `external_api_duration_seconds{provider}` Histogram (`provider` ∈ `mapbox|strava|expo_push`)
**Cardinality budget:** NO `user_id`/`session_id`/`device_id`/`external_uuid`/`email`/`phone` labels — enforced by `scripts/cardinality_probe.py` (D-18).

---

## Go: per-service MODIFY

### `services/backend/identity/internal/service/otp.go` (MODIFY — D-13 OTP fix at lines 70-74)

**Analog:** `otp.go:111` and `otp.go:124` (existing `if devMode { slog.WarnContext(...) }` guarded calls — established precedent for dev-only log paths).

**Excerpt** (`otp.go:104-125` — existing dev-gated calls):
```go
otp, err := s.otps.GetActive(ctx, email)
if err != nil {
    if errors.Is(err, postgres.ErrOtpNotFound) {
        if devMode {
            // Dev-bypass: no active OTP row → accept anyway.
            slog.WarnContext(ctx, "otp dev-bypass: no active code, accepting", "email", email)
        } else {
            return nil, nil, false, domain.ErrInvalidCredentials
        }
    } // ...
}
if otp != nil {
    if subtle.ConstantTimeCompare([]byte(otp.Code), []byte(code)) != 1 {
        if devMode {
            slog.WarnContext(ctx, "otp dev-bypass: wrong code accepted", "email", email)
```

**Current bug** (`otp.go:70-74`):
```go
slog.InfoContext(ctx, "otp issued",
    "email", email,
    // Dev-mode logging only. В production не логируем code.
    "code", code,
)
```

**Copy:** The `if devMode { slog.WarnContext(...) }` gating pattern from lines 111 + 124.

**Adapt per D-13 fix:**
```go
slog.InfoContext(ctx, "otp issued", "email", email)  // code attr dropped from prod path
if devMode {
    slog.DebugContext(ctx, "otp dev-mode echo", "email", email, "code", code)
    // DebugContext only emits at LOG_LEVEL=debug; even if accidentally promoted to prod,
    // the slog_handler's PII deny-list drops `code` attr — defense-in-depth.
}
```

---

### 8× `services/backend/<service>/cmd/server/main.go` (MODIFY — bootstrap observability per D-32)

**Analog:** `services/backend/identity/cmd/server/main.go` (canonical bootstrap; the other 7 services follow the same shape — read identity to capture the template).

**Excerpt** (`identity/cmd/server/main.go:51-120` — current bootstrap; D-32 replaces line 52 and inserts new middleware stanza near line 120):
```go
func run() error {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
    slog.SetDefault(logger)
    // ...
    flagStore := featureflags.NewPostgresStore(pool, 30*time.Second)
    // ...
    // === Outermost middleware stanza (Plan 01-02 / REL-02) ===
    versionPolicy := clientversion.Policy{
        MinSupported:          envOr("CLIENT_MIN_VERSION", "1.0.0"),
        SkipPaths:             []string{"/healthz", "/metrics"},
    }
    versionedMux := clientversion.Middleware(h.Routes(), versionPolicy, logger)

    srv := &http.Server{Addr: addr, Handler: versionedMux, ...}
```

**Copy:** Service-name constant convention (`addr := envOr("IDENTITY_HTTP_ADDR", ":8081")`); `envOr`/`envRequire` helpers (lines 147-164); `flagStore := featureflags.NewPostgresStore(pool, 30*time.Second)` already in place for `tester_debug_logs` gate (D-22); `versionedMux` outermost-wrap pattern.

**Adapt per D-32:** Replace line 52 with `logger := observability.NewSlogJSONHandler(...)`. Add 3 init calls + 1 cleanup deferral after `flagStore` init. Replace `versionedMux` final wrap with the 4-layer chain:
```go
rootHandler := observability.PromhttpMiddleware(serviceName,
    observability.DebugSessionMiddleware(flagStore,
        observability.SentryRecoveryMiddleware(
            observability.OtelHTTPMiddleware(versionedMux))))
mux.Handle("/metrics", promhttp.Handler())  // NOT wrapped — internal-only
```

**8 services to modify** (same pattern verbatim, per-service port + service-name string vary):
- `identity` (:8081), `activity-sync` (:8082), `feed` (:8083), `media` (:8084), `messaging` (:8085), `notifications` (:8086), `realtime-gw` (:8087), `social-graph` (:8088), and `gateway` if a 9th port exists.

---

## Go: tests (NEW)

### `pkg/observability/slog_handler_test.go` + `promhttp_middleware_test.go` + `debug_session_middleware_test.go` + `otel_init_test.go` (NEW)

**Analog:** `services/backend/pkg/clientversion/middleware_test.go` (closest match — table-driven HTTP-handler tests with log buffer assertion).

**Excerpt** (`middleware_test.go:33-58`):
```go
func newLogger() (*slog.Logger, *bytes.Buffer) {
    buf := &bytes.Buffer{}
    return slog.New(slog.NewTextHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})), buf
}

func runRequest(t *testing.T, policy Policy, headerValue, path string) (*httptest.ResponseRecorder, int32, *bytes.Buffer) {
    t.Helper()
    logger, buf := newLogger()
    next := &stubNext{}
    h := Middleware(next, policy, logger)
    req := httptest.NewRequest(http.MethodGet, path, nil)
    if headerValue != "<unset>" {
        req.Header.Set("X-Client-Version", headerValue)
    }
    rec := httptest.NewRecorder()
    h.ServeHTTP(rec, req)
    return rec, next.calls.Load(), buf
}

// Test 7: missing header → next handler called, response 200 (graceful pass-through).
func TestMiddleware_MissingHeader_GracefulPass(t *testing.T) {
    t.Parallel()
    rec, calls, logBuf := runRequest(t, newTestPolicy(), "<unset>", "/api/foo")
    if rec.Code != http.StatusOK {
        t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
    }
```

**Copy:** `t.Parallel()` per test (already best practice); `newLogger()`-with-buffer assertion idiom; `stubNext` handler-spy with `atomic.Int32` counter; `runRequest` test helper; numbered/named tests with comment headers.

**Adapt:** Per RESEARCH §2 Wave 0 Gaps test list:
- `slog_handler_test.go` — `TestSlogHandler_DefaultAttrs` (service/env/version/request_id default), `TestSlogHandler_DropsCode` (PII deny-list scrub), `TestSlogHandler_HashesEmail` (SHA-256 first-8)
- `promhttp_middleware_test.go` — verify `http_request_duration_seconds` observed; route-template label; no `user_id` label appears
- `debug_session_middleware_test.go` — three-condition matrix `TestDebugSessionMiddleware_AllThreeTrue` + `..._DefaultsToInfo` (3 sub-tests)
- `otel_init_test.go` — `TestOtelSpanProcessor_DropsPII` (span-attr scrub)

Also extend `identity/internal/service/otp_test.go` with `TestRequestCode_ProdNoLeak` (no `code` attr at info level) + `TestRequestCode_DevButInfoLevel` (defense-in-depth).

---

## Ansible: infra/ansible/

### `inventory/sentry/hosts.yml` (NEW)

**Analog:** `infra/ansible/inventory/prod/hosts.yml` (verbatim shape).

**Excerpt** (`prod/hosts.yml:1-21`):
```yaml
---
# Production inventory — existing VPS at 148.253.214.156 (provider-agnostic per D-25).
#
# Bootstrap-vs-steady-state SSH user:
#   - Wave 1 first run: `ansible_user: root` (deploy user не существует ещё).
#   - Wave 1 second run + Wave 2+: SWITCH `ansible_user: deploy` ниже.
all:
  children:
    app_servers:
      hosts:
        prod-app-01:
          ansible_host: 148.253.214.156
          # ansible_user: root          # SUPERSEDED — bootstrap done
          ansible_user: deploy          # steady-state user; sudo NOPASSWD per D-20
          ansible_python_interpreter: /usr/bin/python3
```

**Copy:** Bootstrap-vs-steady-state comment block (re-applies to fresh sentry VPS — same root → deploy switchover); host-key naming (`sentry-vps-01`); `ansible_python_interpreter` declaration.

**Adapt:** Change `app_servers` group → `sentry_servers`; `prod-app-01` → `sentry-vps-01`; `ansible_host` placeholder → `<sentry-ip>` (USER ACTION 1 fills this in per Plan 05-01 Task 0).

---

### `group_vars/sentry.yml` (NEW)

**Analog:** `infra/ansible/group_vars/all.yml` (closest — only existing group_vars file).

**Excerpt** (`all.yml:1-27`):
```yaml
---
deploy_user: deploy
deploy_group: deploy

dev_ssh_pubkeys:
  dev_a: "ssh-ed25519 AAAA... vps-access"

dev_admin_ips:
  - "91.92.33.145/32"

caddy_acme_email: "hummetzadeismail8@gmail.com"
```

**Copy:** Top-of-file `---` + comment-header convention; `caddy_acme_email` declaration (reused on sentry VPS for ACME); `dev_admin_ips` (sentry VPS UFW rate-limited per D-24-REVISED).

**Adapt:** Add sentry-specific vars:
```yaml
sentry_caddy_host: "sentry.<sentry-ip>.sslip.io"
sentry_grafana_host: "grafana.<sentry-ip>.sslip.io"
sentry_admin_email: "{{ caddy_acme_email }}"   # reuse
sentry_self_hosted_version: "26.5.0"           # RESEARCH §1.1 pin
sentry_install_dir: /opt/sentry
sentry_service_name: sentry-stack.service
loki_push_allowed_source: "148.253.214.156/32" # prod VPS only per D-28
sentry_sops_groups:
  - sentry
```

---

### `roles/sentry-prep/tasks/main.yml` (NEW)

**Analog:** `infra/ansible/roles/sport-stack/tasks/main.yml` (closest — "stack-orchestration role with systemd unit + SOPS env + smoke probe").

**Excerpt** (`sport-stack/tasks/main.yml:60-103` — install + enable + smoke pattern):
```yaml
- name: "Install sport-stack.service systemd unit"
  ansible.builtin.template:
    src: sport-stack.service.j2
    dest: "/etc/systemd/system/{{ sport_service_name }}"
    owner: root
    group: root
    mode: '0644'
  register: sport_unit_install
  notify:
    - reload systemd
  tags: [sport-stack]

- name: "Flush handlers — apply systemd unit install before enable"
  ansible.builtin.meta: flush_handlers
  tags: [sport-stack]

- name: "Enable + start sport-stack.service"
  ansible.builtin.systemd:
    name: "{{ sport_service_name }}"
    enabled: true
    state: started
  when: not ansible_check_mode
  tags: [sport-stack]
```

**Copy:** Idempotent task ordering (`flush_handlers` between template + enable); `when: not ansible_check_mode` guard; `register` + `notify` reload-systemd pattern; SOPS-decrypt subtask import (`decrypt_sops.yml`); smoke-probe terminal task.

**Adapt:** Per D-30 + RESEARCH P14 (`install.sh` re-run safety):
1. `ansible.builtin.git: repo=...self-hosted dest=/opt/sentry version=26.5.0 force=false` (RESEARCH §1.1)
2. SOPS-decrypt `sentry.yaml` → template `/opt/sentry/.env` (delegate_to: localhost pattern from `sport-stack/tasks/decrypt_sops.yml:21-37`)
3. Template `/opt/sentry/docker-compose.override.yml` (rebind nginx to `127.0.0.1:8080`, set `KAFKA_HEAP_OPTS=-Xmx2g`)
4. `ansible.builtin.command: cmd=/opt/sentry/install.sh --skip-user-prompt --no-report-self-hosted-issues  creates=/opt/sentry/docker-compose.yml` (idempotent — RESEARCH P14)
5. Template `sentry-stack.service` systemd unit; enable + start
6. `sentry-cli projects create` loop (4 projects, `failed_when: result.rc not in [0, 4]` to allow 409)
7. Smoke: `curl -fsSI https://{{ sentry_caddy_host }}/auth/login/`

---

### `roles/sentry-prep/templates/.env.j2` + `caddy.j2` (NEW)

**Analog:** `infra/ansible/roles/sport-stack/templates/sport.env.j2` (`.env.j2` shape) + `sport-stack/templates/sport-stack.service.j2` (Jinja2 template idiom with `{# … #}` header).

**Excerpt** (`sport.env.j2`):
```jinja
{# /run/sport.env — generated by Ansible sport-stack role; NEVER committed; tmpfs-resident.
   Source: SOPS-decrypted dict (sport_env_merged) merged from sport_sops_groups. #}
{% for key, value in sport_env_merged.items() | sort %}
{{ key }}={{ value }}
{% endfor %}
CADDY_ACME_EMAIL={{ caddy_acme_email }}
```

**Copy:** `{# ... #}` Jinja header with provenance comment; iterate-sorted-items pattern; explicit non-secret vars appended after SOPS dict.

**Adapt:**
- `.env.j2`: emit `SENTRY_ADMIN_PASSWORD=`, `SENTRY_DSN_BACKEND=` (post-bootstrap), telegram creds — all from SOPS-decrypted `sentry_secrets_sentry` dict.
- `caddy.j2`: render RESEARCH §1.4 Caddyfile snippet — two virtual-hosts (`sentry.<ip>.sslip.io` → `127.0.0.1:8080`; `grafana.<ip>.sslip.io` → `127.0.0.1:3000` with `basicauth`); `tls {{ sentry_admin_email }}`.

---

### `roles/alloy-shipper/tasks/main.yml` (NEW — was `promtail-shipper`)

**Analog:** `infra/ansible/roles/common/tasks/main.yml:57-60` (apt-install + base-package pattern) — closest match for "install a systemd-managed binary from apt".

**Excerpt** (`common/tasks/main.yml:57-60`):
```yaml
- name: Apt update + base packages
  ansible.builtin.apt:
    name: "{{ common_packages }}"
    update_cache: true
```

**Copy:** `ansible.builtin.apt` install task; group-membership pattern (`common` role adds users to groups; mirror for `alloy` user added to `docker` group per RESEARCH P17).

**Adapt:** Per RESEARCH §1.6 + §P17:
1. Add Grafana apt repo + GPG key (mirror `common/tasks/main.yml:15-55` legacy-docker.gpg heal block for safe key install)
2. `apt: name=alloy state=present`
3. `user: name=alloy groups=docker append=true notify=Restart alloy` (P17 fix)
4. Template `/etc/alloy/config.alloy` from `alloy-config.alloy.j2`
5. `systemd: name=alloy enabled=true state=started`

**Naming substitution note (RESEARCH P20):** CONTEXT.md said `promtail-shipper` — Promtail EOL 2026-03-02. Rename role + all references to `alloy-shipper`.

---

### `roles/alloy-shipper/templates/alloy-config.alloy.j2` (NEW — was `promtail-config.yml.j2`)

**Analog:** No exact analog — `sport-stack/templates/` has no app-config template (only systemd unit + dotenv). Closest analog: the Jinja2-header style from `sport.env.j2`.

**Copy:** `{# ... #}` Jinja header with provenance comment.

**Adapt:** Use RESEARCH §1.6 verbatim Alloy HCL skeleton:
```hcl
discovery.docker "containers" {
    host = "unix:///var/run/docker.sock"
}
loki.source.docker "containers" {
    host          = "unix:///var/run/docker.sock"
    targets       = discovery.docker.containers.targets
    forward_to    = [loki.write.sentry_vps.receiver]
    labels        = { env = "{{ env_name }}", cluster = "running-ecosystem" }
}
loki.write "sentry_vps" {
    endpoint { url = "https://{{ sentry_caddy_host }}/loki/api/v1/push" }
}
```
Pair `discovery.docker` + `loki.source.docker` (RESEARCH P21 — they must be used together; never hardcode container names).

---

### `site.yml` (MODIFY — add sentry play + alloy play)

**Analog:** `infra/ansible/site.yml` (itself before modification).

**Excerpt** (current `site.yml:1-17`):
```yaml
---
- name: Bootstrap base packages + SSH hardening + UFW
  hosts: app_servers
  become: true
  gather_facts: true
  roles:
    - common
    - docker
    - ufw

- name: Deploy sport-stack to app servers
  hosts: app_servers
  become: true
  roles:
    - sport-stack
  tags: [deploy]
```

**Copy:** Two-play structure (bootstrap + deploy); `become: true` + `gather_facts`; tag pattern.

**Adapt:** Append three plays:
```yaml
- name: Bootstrap sentry VPS (reuse common + docker + ufw)
  hosts: sentry_servers
  become: true
  gather_facts: true
  roles:
    - common
    - docker
    - ufw    # different ufw_allowed list; supplied via group_vars/sentry.yml

- name: Deploy Sentry self-hosted stack
  hosts: sentry_servers
  become: true
  roles: [sentry-prep]
  tags: [sentry]

- name: Deploy Alloy log shipper to prod VPS (ships container stdout to Loki on sentry VPS)
  hosts: app_servers
  become: true
  roles: [alloy-shipper]
  tags: [alloy]
```

---

## Python smoke / Bash audit scripts

### `scripts/smoke_sentry.py` + `scripts/smoke_metrics.py` + `scripts/cardinality_probe.py` + `scripts/pii_live_probe.py` (NEW)

**Analog:** `services/backend/scripts/smoke_otp.py` (Phase 3/4 precedent for smoke-script idiom).

**Excerpt** (`smoke_otp.py:17-65` — request idiom + assertion helper):
```python
import json, os, sys, urllib.error, urllib.request, uuid

BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")

def req(method, path, *, token=None, body=None):
    url = BASE + path
    h = {"Accept": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read()) if "application/json" in resp.headers.get("Content-Type", "") else resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def must(s, expect, name, body=None):
    if s != expect:
        print(f"❌ {name}: expected {expect}, got {s}: {body}")
        sys.exit(1)
    print(f"✓ {name} → {s}")
```

**Copy:** stdlib-only (`urllib.request` + `json`; no requests/httpx dep); `BASE` env-overridable URL; `req()` helper with `(status, body)` tuple return; `must()` assertion with checkmark; `sys.exit(1)` on first failure; `🎉 ... passed.` terminal print.

**Adapt:** Per RESEARCH §2 + §1.7:
- `smoke_sentry.py`: POST synthetic envelope to `<DSN>/api/<project_id>/envelope/`; assert 200; wait 30s; GET via Sentry API; assert event retrievable.
- `smoke_metrics.py`: iterate `SERVICES = {"identity": 8081, ...}` (RESEARCH §1.7 table); GET `/metrics`; assert HTTP 200 + body contains `HELP http_request_duration_seconds`.
- `cardinality_probe.py`: per RESEARCH §1.7 verbatim sketch — regex-parse Prom exposition format; assert no forbidden labels (`user_id`, `session_id`, `device_id`, `external_uuid`, `email`, `phone`); assert `series_per_metric <= 1000`.
- `pii_live_probe.py`: tail Loki via `https://grafana.<sentry-ip>.sslip.io/api/datasources/proxy/2/loki/api/v1/query_range`; assert zero regex-matches for GPS / phone / displayName.

---

### `scripts/pii_audit.sh` (NEW)

**Analog:** `scripts/setup-branch-protection.sh` (closest bash script in the project — top-of-file boilerplate + `set -euo pipefail` + idempotent design).

**Excerpt** (`setup-branch-protection.sh:1-23`):
```bash
#!/usr/bin/env bash
# scripts/setup-branch-protection.sh
# Phase 4 / CICD-06 — branch protection setup for main.
#
# Idempotent: re-run is safe; gh api PUT overwrites existing config.
# Usage: ./scripts/setup-branch-protection.sh [<repo>] [<branch>]
#   defaults: repo=IsmailL01/sport branch=main

set -euo pipefail

REPO="${1:-IsmailL01/sport}"
BRANCH="${2:-main}"

command -v gh >/dev/null 2>&1 || { echo "gh CLI not installed. brew install gh"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq not installed. brew install jq"; exit 1; }
```

**Copy:** Shebang `#!/usr/bin/env bash`; `set -euo pipefail`; phase-anchored header comment with `# Phase N / REQ-ID`; idempotent re-run note; tool-availability check pattern (`command -v ... || exit 1`).

**Adapt:** Per D-14 (CI grep audit gate):
```bash
#!/usr/bin/env bash
# scripts/pii_audit.sh — Phase 5 / OBS-06 grep audit for PII attribute leaks.
# Idempotent: re-run is safe; pure read-only.
set -euo pipefail

if grep -rnE 'slog\.\w+Context\([^)]*"(code|phone|displayName|external_uuid|coords|lat|lon|latitude|longitude|dm_content|mapbox_token|strava_token|jwt|password)"' \
    --include='*.go' --exclude='*_test.go' services/backend/; then
    echo "❌ PII attribute leak detected in slog call"; exit 1
fi
echo "✓ PII grep audit clean"
```

---

## SOPS / secrets (.secrets/)

### `.secrets/prod/sentry.yaml` + `.secrets/staging/sentry.yaml` (NEW)

**Analog:** `.secrets/prod/mapbox.yaml` (closest — small focused SOPS slot with `KEY: ENC[...]` lines + age recipient block).

**Excerpt** (`prod/mapbox.yaml:4-7`):
```yaml
MAPBOX_PUBLIC_TOKEN: ENC[AES256_GCM,data:...,type:str]
MAPBOX_SECRET_TOKEN: ENC[AES256_GCM,data:...,type:str]
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: ENC[AES256_GCM,data:...,type:str]
MAPBOX_DOWNLOADS_TOKEN: ENC[AES256_GCM,data:...,type:str]
sops:
    age:
        - enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
            ...
            -----END AGE ENCRYPTED FILE-----
          recipient: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
```

**Copy:** SOPS YAML shape with `KEY: ENC[...]` lines; age recipient block (same `age1ph7d4a62...` recipient as existing slots).

**Adapt:** Per D-07:
```yaml
SENTRY_DSN_BACKEND: ENC[...]
SENTRY_DSN_MOBILE: ENC[...]
SENTRY_DSN_BACKEND_STAGING: ENC[...]
SENTRY_DSN_MOBILE_STAGING: ENC[...]
SENTRY_ADMIN_PASSWORD: ENC[...]
SENTRY_AUTH_TOKEN: ENC[...]
TELEGRAM_BOT_TOKEN: ENC[...]
TELEGRAM_CHAT_ID: ENC[...]
```
Create via `sops --age age1ph7d4a62... -e plaintext.yaml > .secrets/prod/sentry.yaml` (per `docs/RUNBOOKS/sops-edit.md` workflow). Add `sentry` to `sport_sops_groups` in `group_vars/sentry.yml`.

---

## CI (.github/workflows/)

### `backend-ci.yml` (MODIFY — add `pii-audit` + `cardinality-probe` jobs)

**Analog:** `.github/workflows/backend-ci.yml` itself (the existing job blocks `test`, `lint`, `gosec` define the shape to mirror).

**Excerpt** (`backend-ci.yml:34-56` — existing `test` job structure):
```yaml
jobs:
  test:
    name: Test (Go 1.25)
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        service: [pkg, identity, activity-sync, ...]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
      - name: Test ${{ matrix.service }}
        working-directory: services/backend/${{ matrix.service }}
        run: |
          go mod download
          go test -race -coverprofile=coverage.out ./...
```

**Copy:** Job-`name:` em-dash verbatim contract (matches `scripts/setup-branch-protection.sh` job-list — D-14 audit job must be added to that list); `actions/checkout@v4` + `actions/setup-go@v5` step pattern; `working-directory` declaration.

**Adapt:** Per D-14 + D-18, add two new jobs (extend, do NOT replace):
```yaml
  pii-audit:
    name: PII Audit (slog grep)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run PII grep audit
        run: bash scripts/pii_audit.sh

  cardinality-probe:
    name: Cardinality Probe (Prom labels)
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.25" }
      - name: Boot services + probe
        run: |
          docker compose -f services/backend/docker-compose.prod.yml up -d
          sleep 15
          python3 scripts/cardinality_probe.py
```
**MUST also extend** `scripts/setup-branch-protection.sh` required-status-checks list with `"PII Audit (slog grep)"` + `"Cardinality Probe (Prom labels)"`.

---

## Docs (docs/)

### `docs/RUNBOOKS/sentry-ops.md` + `docs/RUNBOOKS/observability.md` (NEW)

**Analog:** `docs/RUNBOOKS/sops-edit.md` (closest — operational runbook with numbered sections + `bash` code blocks + Russian/English mix).

**Excerpt** (`sops-edit.md:1-29`):
```markdown
# SOPS Edit / Decrypt / Rotate Workflow

Краткий справочник для команды по работе с SOPS-зашифрованными `.secrets/**/*.yaml`.

> ⚠️ **Пререквизиты** — см. §1 «Environment Setup» ниже.

> 📌 **Версии (pinned, Phase 2 / SEC-02):**
> - `sops` v3.13.0
> - `age` v1.3.1
> - `.sops.yaml` recipient list — см. файл в корне репо.

## 1. Environment Setup

**Когда запускать:** один раз на новом dev-workstation после `git clone`. Идемпотентно — повторный запуск не вредит.

### Шаг 1.1. Установить tools

```bash
brew install sops age
sops --version    # ожидается: sops 3.13.0
```
```

**Copy:** H1 title + opening blurb in Russian; pinned-versions admonition block; numbered H2 sections with H3 sub-steps; bash code blocks with version-expectation comments; idempotency note.

**Adapt:**
- `sentry-ops.md` — admin user creation, Sentry CLI bootstrap (RESEARCH §1.2), Telegram bot setup (USER ACTION 2), retention tuning (RESEARCH §1.10 knobs), backup procedure, P12-P21 pitfall reference appendix.
- `observability.md` — slog usage conventions, metric naming rules, PII deny-list (D-12), cardinality budget rules (D-18), how to add new metrics safely.

---

### `docs/RUNBOOKS/deploy.md` §11 + §12 (MODIFY — add sentry-stack deploy + rollback)

**Analog:** `docs/RUNBOOKS/deploy.md` itself §5 (existing routine deploy) + §6 (rollback). Read these sections to mirror tone + step structure.

**Excerpt** (`deploy.md:1-39`):
```markdown
# Deploy RUNBOOK — Running Ecosystem v1.0

> **Provider-agnostic.** Этот RUNBOOK подходит для любого SSH-accessible Linux VPS.
>
> **Scope:** Phase 3 v1.0 hardening deliverable. Sentry separate-VPS — Phase 5.

## 1. Dev workstation setup (one-time)
...
```

**Copy:** §-numbered structure; `> **Bold-label.**` admonition pattern; "Provider-agnostic" framing; per-section H2 + H3 sub-steps.

**Adapt:** Add `§11 Sentry-stack deploy` (analog: existing §5 routine deploy, swap `sport-stack` → `sentry-stack`; reference `ansible-playbook -i inventory/sentry site.yml --tags sentry`) and `§12 Sentry-stack rollback` (analog: existing §6, separate Make target `make sentry-rollback`).

---

### `docs/DECISIONS/0009-observability-architecture.md` (NEW ADR)

**Analog:** `docs/DECISIONS/0007-v1.0-release-contract.md` (closest — multi-section ADR rolling up several related decisions into one document).

**Excerpt** (`0007-v1.0-release-contract.md:1-32`):
```markdown
# ADR-0007: v1.0 Release Contract

**Дата:** 2026-05-15
**Статус:** Accepted
**Контекст:** Phase 1 / REL-01..05 (милестон v1.0 Production Readiness)
**Решение:** OpenAPI 3.1.0 hand-written YAML как контракт mobile↔backend; `X-Client-Version` HTTP header + HTTP 426 force-update; Postgres-backed `pkg/featureflags`.

## Контекст

Phase 1 redefined-milestone v1.0 — это **shared design contract**...

Канонические требования:

- [.planning/REQUIREMENTS.md](../../.planning/REQUIREMENTS.md) §Phase 1
- [.planning/ROADMAP.md](../../.planning/ROADMAP.md) §Phase 1
...

## Решение

Три тесно связанных архитектурных sub-decision'а зашиты в один ADR

### §1 API Contract Format
**Принято:** OpenAPI 3.1.0 hand-written YAML
```

**Copy:** Front-matter (Дата / Статус / Контекст / Решение); first-paragraph one-liner; Канонические требования cross-link block; numbered §-sections per sub-decision with bold **Принято:** lead-in.

**Adapt:** ADR-0009 sub-sections per RESEARCH executive summary:
- §1 Sentry self-host topology (D-01..D-05)
- §2 slog choice (D-09..D-12)
- §3 OTLP-to-Sentry (D-20..D-21 + RESEARCH §1.3)
- §4 Telegram alerting (D-24..D-26 + RESEARCH §1.5)
- §5 Isolation redline (1 prod-backend project; per-service tag — RESEARCH §1.9)

---

### `docs/TELEMETRY.md` (NEW skeleton — Phase 17 consumes)

**Analog:** No direct existing analog. Closest format match: `docs/DECISIONS/0007-v1.0-release-contract.md` front-matter (for ADR-like opener) but content shape diverges.

**No-analog handling:** Ship a minimal skeleton — single section "Opt-in Telemetry Event Allowlist" with placeholder table (`event_name | description | PII risk | consent required`). Document that Phase 17 mobile-side will populate. Reference D-12 PII deny-list as the master ruleset.

---

## Grafana dashboards (services/backend/observability/dashboards/)

### `backend-overview.json` + `nats-jetstream.json` + `db-performance.json` (NEW)

**No analog in this codebase.** `services/backend/observability/` contains only `prometheus.yml` + `loki.yml` + `grafana-datasources.yml` — no dashboard JSONs exist yet.

**Suggested pattern from upstream:**
1. **`backend-overview.json`** — start from Grafana community dashboard ID **`14114`** ("Go Processes") + adapt panels to query `http_request_duration_seconds` quantile + `http_requests_total` error-rate. Per D-17 metric set.
2. **`nats-jetstream.json`** — start from Grafana community dashboard ID **`15938`** ("NATS JetStream Dashboard"); replace JetStream-exporter datasource with our `nats_consumer_pending` Prom metric.
3. **`db-performance.json`** — start from Grafana community dashboard ID **`12273`** ("PostgreSQL Database") + add `db_query_duration_seconds` P99 panel per service.

**Authoring approach:** Edit dashboards live in Grafana, then "Share → Export → Save to file" → commit JSON. Tag every panel with `datasource: ${DS_PROMETHEUS}` for portability. Reference RESEARCH §5 Grafana docs for panel-as-JSON spec.

---

## Shared Patterns

### Logger pattern (applies to: all 8 services' main.go)
**Source:** `services/backend/identity/cmd/server/main.go:52-53`
```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
slog.SetDefault(logger)
```
Replace with `observability.NewSlogJSONHandler(...)` per D-32. Apply to all 8 services.

### Middleware-chain pattern (applies to: all 8 services' main.go)
**Source:** `services/backend/identity/cmd/server/main.go:111-124`
```go
// Outermost middleware stanza (Plan 01-02 / REL-02)
versionPolicy := clientversion.Policy{
    SkipPaths: []string{"/healthz", "/metrics"},
}
versionedMux := clientversion.Middleware(h.Routes(), versionPolicy, logger)
```
Wrap with 4 additional observability layers per D-32 (Promhttp → DebugSession → SentryRecovery → OtelHTTP, outermost-first).

### Env-var pattern (applies to: all observability initialization)
**Source:** `services/backend/identity/cmd/server/main.go:147-164`
```go
func envOr(key, def string) string {
    if v := os.Getenv(key); v != "" { return v }
    return def
}
func envRequire(key string) string {
    v := os.Getenv(key)
    if v == "" {
        slog.Error("required env var missing", "key", key)
        exitFunc(1)
    }
    return v
}
```
Reuse `envOr` for `LOG_LEVEL`, `SENTRY_OTLP_ENDPOINT`, `ENV`; `envRequire` for `SENTRY_DSN_BACKEND` (per D-32).

### SOPS-decrypt pattern (applies to: sentry-prep role)
**Source:** `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml:21-37`
```yaml
- name: "Decrypt SOPS groups on controller"
  delegate_to: localhost
  become: false
  environment:
    SOPS_AGE_KEY_FILE: "{{ lookup('env', 'SOPS_AGE_KEY_FILE') | default(lookup('env', 'HOME') + '/.config/sops/age/keys.txt', true) }}"
  community.sops.load_vars:
    file: "{{ playbook_dir }}/../../.secrets/{{ env_name }}/{{ item }}.yaml"
    name: "sport_secrets_{{ item }}"
  loop: "{{ sport_sops_groups }}"
  no_log: true
```
Apply verbatim for `sentry.yaml` SOPS slot — `delegate_to: localhost`, `no_log: true`, age-key env construct.

### UFW pattern (applies to: sentry VPS bootstrap)
**Source:** `infra/ansible/roles/ufw/tasks/main.yml:8-50`
Critical ordering: default policies → SSH allow first → public allows → explicit denies → enable last. Reuse the same role; override `ufw_allowed_tcp_public` via `group_vars/sentry.yml` to `[443]` and add a `loki_push_allowed_source` rule for port 3100 from `<prod-vps-ip>/32` only (D-28).

---

## No Analog Found

Files with no close match in the codebase — planner should follow RESEARCH.md or external doc URLs:

| File | Role | Data Flow | Fallback Pattern Source |
|------|------|-----------|-------------------------|
| `services/backend/observability/dashboards/*.json` | grafana-dashboard | data-display | Grafana community IDs 14114 / 15938 / 12273 (see "Grafana dashboards" section above) |
| `docs/TELEMETRY.md` | docs-skeleton | reference | Minimal scaffold; Phase 17 populates |
| `services/backend/alerter/main.go` (RESEARCH §1.5 — only if planner adopts the Telegram-alerter Go service option) | service | event-driven | RESEARCH §1.5 sketch (50-LOC standalone) |

---

## Metadata

**Analog search scope:** `services/backend/pkg/`, `services/backend/identity/`, `services/backend/scripts/`, `infra/ansible/`, `.secrets/`, `.github/workflows/`, `docs/RUNBOOKS/`, `docs/DECISIONS/`, `scripts/`
**Files scanned:** ~40 files across 9 directories
**Pattern extraction date:** 2026-05-19
**Confidence:** HIGH on Go middleware / slog / Ansible role / SOPS / Python smoke patterns; MEDIUM on Grafana dashboards (no internal analog); HIGH on ADR / RUNBOOK shape.
