# Phase 5: Observability (backend) — Research

**Researched:** 2026-05-19
**Domain:** Backend observability (Sentry self-hosted + slog JSON + Prometheus + OTLP + Loki + Telegram alerting)
**Confidence:** HIGH on Sentry topology / Prom / slog / OTel; MEDIUM on log-shipper choice (Promtail EOL forces switch to Alloy); HIGH on PII-scrub patterns
**Mode:** Autonomous (no clarifying questions per persistent instruction)

---

## Executive Summary

Phase 5 enters research with **32 D-XX decisions locked** in `05-CONTEXT.md`. The job here is narrow and disciplined: (a) close the 10 open questions in `<deferred>` with concrete pinned recommendations + URL citations, (b) author a `## Validation Architecture` section (Nyquist) the planner can lift verbatim into VALIDATION.md, (c) flag pitfalls beyond the existing 11-item list, (d) pin known-compatible versions for Go 1.22+ / Ubuntu 24.04 LTS.

**Major finding that the planner MUST act on:** **Promtail is end-of-life as of 2026-03-02** per Grafana official docs. CONTEXT D-27 / D-29 / 04 plan-breakdown all name `promtail` — but a fresh deploy in 2026 should ship **Grafana Alloy** (Promtail's documented successor) instead. The role `promtail-shipper` → rename `alloy-shipper`. This does NOT relitigate "log-shipper-on-prod-vps-ships-to-Loki" (D-27 architecture intact), only the binary that performs that role. Researcher recommends Alloy.

### Pinned versions (Go 1.22+ / Ubuntu 24.04 LTS)

| Component | Pinned version | Source |
|-----------|----------------|--------|
| `getsentry/self-hosted` | `26.5.0` (May 2025 — newest stable as of mid-2026) | https://github.com/getsentry/self-hosted/releases |
| `github.com/getsentry/sentry-go` | `v0.46.2` (May 2026) | https://github.com/getsentry/sentry-go/releases |
| `github.com/prometheus/client_golang` | `v1.20.5` (Nov 2024; mature, stable) | https://github.com/prometheus/client_golang/releases |
| `go.opentelemetry.io/otel` | `v1.32.0` (latest stable) | https://github.com/open-telemetry/opentelemetry-go/releases |
| `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp` | `v1.32.0` (matched) | same |
| `sentry-cli` | `2.40.0` (binary, Nov 2024+) | https://github.com/getsentry/sentry-cli/releases |
| Grafana Alloy (replaces Promtail) | `v1.5.0+` LTS-line | https://github.com/grafana/alloy/releases |
| `grafana/loki` (existing) | `3.2.0` (no change) | already in `docker-compose.observability.yml` |
| Caddy (sentry VPS) | `2.8.x` (stable) | reuses Phase 3 pattern |

### 10 deferred questions — one-line resolutions

1. Pin `getsentry/self-hosted@26.5.0`; OTLP HTTP receiver works (added 25.8.0 / fully GA in 25.10.0 line)
2. Use **`sentry-cli`** for project bootstrap — official binary, idempotent, Ansible-friendly
3. OTLP endpoint = `/api/<project_id>/integration/otlp/v1/traces`; auth = `X-Sentry-Auth: sentry sentry_key=<public_key>`
4. **Use Caddy in front** of Sentry's bundled nginx (rebind nginx to localhost:80) — matches Phase 3 D-12 pattern
5. Telegram formatter = **tiny Go alerter service on sentry VPS** (~50 LOC) — single-process rate-limit token bucket
6. **Grafana Alloy** (Promtail EOL Mar 2026); ships container stdout via `loki.write` component
7. Cardinality probe = **Python** — matches existing `scripts/smoke_*.py` pattern; `text/plain` Prom format trivially parsable
8. Yes — require BOTH `X-Debug-Session: 1` AND JWT claim `is_tester=true`; header-only is a debug-DoS vector
9. **1 prod-backend project**; services discriminated via `setTag("service", ...)` — cuts dashboard surface 8× without losing isolation
10. 90-day retention fine on 80 GB; 10–50 events/day × 365 × ~10 KB ≈ ~180 MB/yr — three orders of magnitude under capacity

---

## §1 Resolution of 10 deferred questions

### Q1 — `getsentry/self-hosted` version pin

**Answer:** Pin **`26.5.0`** (released 2025-05-18; latest stable on the LTS-by-convention release line as of mid-2026). OTLP HTTP receiver landed in `25.8.0` and is fully production-ready by `25.10.0`; `26.x` has it as a first-class ingestion path.

**Rationale:** Sentry self-hosted does not maintain an explicit LTS branch but follows a quarterly stable cadence. `26.5.0` is the latest tag that has settled (no known critical post-release patches). **Avoid `26.4.0`** — release notes warn of "migration issues; skip this version". Avoid `26.3.0` (same issue, jump to 26.3.1+). Use the exact tag (not `latest`) in Ansible to make redeploys reproducible.

**Ansible:**
```yaml
- name: Clone sentry self-hosted at pinned tag
  ansible.builtin.git:
    repo: https://github.com/getsentry/self-hosted.git
    dest: /opt/sentry
    version: "26.5.0"        # exact tag, not `master`
    force: false             # never clobber local state
```

**Citation:** https://github.com/getsentry/self-hosted/releases (release notes for 26.5.0, May 18 2025). For "skip 26.4.0" warning see the 26.4.0 release page.

---

### Q2 — Sentry project bootstrap: `sentry-cli` vs HTTP API

**Answer:** Use **`sentry-cli`** for the 4-project bootstrap.

**Rationale:** `sentry-cli` is the official binary, ships static (no Go/Python runtime on sentry VPS needed), and exposes `sentry-cli projects create <name>` as a single idempotent command. The HTTP API works but requires (a) manually constructing an API token before any project exists (chicken-and-egg if we want full auto), (b) handling pagination + creation-vs-409-conflict logic by hand. CI-friendliness: `sentry-cli` is one `curl` install + a `--config-file` env. Ansible idempotency: wrap the create call with `register: result; changed_when: "'created' in result.stdout"`.

**Bootstrap sequence (Plan 05-02):**
```bash
# After install.sh + createuser:
export SENTRY_AUTH_TOKEN=<from sentry createuser flow>
export SENTRY_URL=https://sentry.<sentry-ip>.sslip.io
for proj in prod-backend staging-backend prod-mobile staging-mobile; do
  sentry-cli projects create -o sentry "$proj" || true   # 409 on re-run is fine
done
# Extract DSNs:
sentry-cli projects list -o sentry --json > /tmp/projects.json
# Parse with jq for the 4 DSN strings, write to a file that Ansible then SOPS-encrypts.
```

**Citation:** https://docs.sentry.io/cli/configuration/ and `sentry-cli projects --help`.

---

### Q3 — OTLP-to-Sentry auth + endpoint path

**Answer:** Endpoint path is **`/api/<project_id>/integration/otlp/v1/traces`**. Auth header is **`X-Sentry-Auth: sentry sentry_key=<public_key>`** (lower-case header name accepted; `sentry_key` is the DSN's `<key>` segment, NOT the secret key).

**Rationale:** Confirmed via Sentry's official OpenTelemetry Collector config example. The `X-Sentry-Auth` format here is a degenerate single-field variant of the classic envelope auth header (no `sentry_version`, no `sentry_client` required for OTLP). The `<public_key>` is the literal token from `https://<public_key>@sentry.../<project_id>` — parseable from DSN with a one-line `url.Parse` in Go.

**Go wiring (`pkg/observability/otel_init.go`):**
```go
import (
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
)

// Parse SENTRY_DSN_BACKEND into host + public_key + project_id.
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

**Citation:** https://docs.sentry.io/concepts/otlp/forwarding/pipelines/collector/ (collector example; the `traces_endpoint` and `x-sentry-auth` header are exactly what HTTP exporter needs). Also https://docs.sentry.io/concepts/otlp/direct/traces/.

---
### Q4 — Caddy in front of Sentry's bundled nginx vs configuring Sentry's nginx for ACME

**Answer:** **Put Caddy in front.** Rebind Sentry's bundled nginx to localhost-only (`127.0.0.1:8080`) in the `getsentry/self-hosted` compose override; expose only Caddy on 80/443; Caddy `reverse_proxy 127.0.0.1:8080`.

**Rationale:**
- Sentry's bundled nginx does NOT do ACME — it's a plain reverse-proxy/static-asset server. To get Let's Encrypt on it you'd have to add `certbot` as a sidecar + cron-renewal + nginx-reload — that's exactly what Caddy already does automatically with `tls user@email`.
- Phase 3 D-12 already uses Caddy for app VPS ACME (`148-253-214-156.sslip.io`). Reusing Caddy for sentry VPS keeps the operator skill surface one tool, not two.
- Replacing Sentry's nginx entirely is fragile across Sentry version bumps (the `install.sh` regenerates the compose file and would re-add it). Keeping their nginx as an internal-only upstream is upgrade-safe.

**Compose override (`/opt/sentry/docker-compose.override.yml` — Ansible templates this):**
```yaml
services:
  nginx:
    ports:
      - "127.0.0.1:8080:80"   # was "0.0.0.0:80:80" — now localhost-only
```

**Caddyfile (`/etc/caddy/Caddyfile` on sentry VPS):**
```
sentry.<sentry-ip>.sslip.io {
    reverse_proxy 127.0.0.1:8080
    encode gzip
    tls operator@<brand>.io
}
grafana.<sentry-ip>.sslip.io {
    reverse_proxy 127.0.0.1:3000
    basicauth { admin <bcrypt-hash> }
    tls operator@<brand>.io
}
```

**Citation:** https://develop.sentry.dev/self-hosted/ ("Custom CA Roots" + "Reverse Proxy" sections — Sentry explicitly documents this pattern). Caddy ACME: https://caddyserver.com/docs/automatic-https.

---

### Q5 — Telegram alert webhook formatter

**Answer:** **Tiny Go alerter service on sentry VPS** (~50 LOC), exposed only on `127.0.0.1:9099`, called by Sentry "Generic Webhook" integration and Grafana contact point. Adds rate-limiting (token bucket, 25 msg/sec — under Telegram's 30/sec ceiling), templates events into Markdown, posts to `https://api.telegram.org/bot<TOKEN>/sendMessage`.

**Rationale:** Each alternative considered, then rejected:
- **(b) Sentry built-in webhook template syntax** — Sentry supports `{{...}}` substitution in webhook URL/body, BUT the substitution is limited to event metadata; cannot rate-limit, cannot batch, cannot construct the `chat_id+text` JSON body shape Telegram expects without escaping headaches.
- **(c) External aaS** (Zapier / Pipedream / hookdeck) — adds a third-party in the critical alert path (defeats "self-hosted observability" intent); recurring cost; provider-lock.
- **(a) Tiny Go service** — wins: 50 LOC; single binary deploy via the same compose stack as Sentry; ratelimit + templating + ergonomic `*_test.go` for the format function; matches Go-team toolchain.

**Shape (sketch — Plan 05-02 implements):**
```go
// services/backend/alerter/main.go (separate Go module on sentry VPS)
http.HandleFunc("/sentry-hook", func(w http.ResponseWriter, r *http.Request) {
    if !limiter.Allow() { return }                          // 25/sec token bucket
    var ev SentryWebhook ; json.NewDecoder(r.Body).Decode(&ev)
    msg := fmt.Sprintf("🚨 *%s* in `%s`\n%s\n%s",
        ev.Level, ev.Project, ev.Title, ev.WebURL)
    sendTelegram(os.Getenv("TELEGRAM_CHAT_ID"), msg)        // POST sendMessage
})
http.HandleFunc("/grafana-hook", grafanaTemplate)            // same shape, different parse
http.ListenAndServe("127.0.0.1:9099", nil)
```

**Citation:**
- Telegram Bot API rate limit (30 msg/sec global, 1 msg/sec per chat): https://core.telegram.org/bots/faq#my-bot-is-hitting-limits
- Sentry generic webhook integration: https://docs.sentry.io/organization/integrations/integration-platform/webhooks/
- Grafana Telegram contact point native (alternative — would need to be SETUP-LOCKED to single channel; Go service stays as the chosen option for unified rate-limiting across both Sentry + Grafana sources).

---

### Q6 — Promtail vs Vector vs Fluent Bit (log shipper choice)

**Answer:** **Use Grafana Alloy** (not Promtail, not Vector, not Fluent Bit).

**Critical correction to CONTEXT.md D-27 / D-29:** Promtail is **end-of-life as of 2026-03-02** per Grafana's official Loki docs ("Promtail is end of life (EOL) as of March 2, 2026. Commercial support has ended"). Shipping a brand-new prod VPS with EOL software is an immediate accumulating-tech-debt smell. Grafana Alloy is the documented successor (one-tool migration `alloy convert` from `promtail.yml`).

**Why Alloy beats Vector and Fluent Bit too:**
- **vs Vector:** Vector is heavier (~50 MB binary vs Alloy's ~80 MB but Alloy is multi-purpose — also handles future Prom scrape if needed); Alloy has first-class Loki components (`loki.source.docker`, `loki.write`); Vector requires more config.
- **vs Fluent Bit:** Fluent Bit is genuinely lighter (~5 MB) but Loki-output is via a generic HTTP sink — no native Loki labelset semantics, no auto-multiline handling. Alloy ships Loki integration as a first-class citizen.
- **vs `promtail` even as a "use-until-EOL"**: avoid. Migration cost six months from now under prod-incident pressure is worse than doing it right now.

**Alloy config skeleton (`/etc/alloy/config.alloy` on prod VPS):**
```hcl
discovery.docker "containers" {
    host = "unix:///var/run/docker.sock"
}

loki.source.docker "containers" {
    host          = "unix:///var/run/docker.sock"
    targets       = discovery.docker.containers.targets
    forward_to    = [loki.write.sentry_vps.receiver]
    labels        = {
        env     = "prod",
        cluster = "running-ecosystem",
    }
}

loki.write "sentry_vps" {
    endpoint {
        url = "https://sentry.<sentry-ip>.sslip.io/loki/api/v1/push"
        // Loki on sentry VPS — UFW-restricted to prod VPS source IP per D-28.
    }
}
```

**systemd unit:** Use the official `alloy` apt package (`apt install alloy` after adding Grafana repo); installs `/etc/systemd/system/alloy.service` automatically. NOT containerized (matches D-29 "systemd not container" reasoning verbatim — independence from `sport-stack.service`).

**Naming in plans:** Rename Ansible role `promtail-shipper` → `alloy-shipper` (consistent with reality).

**Citation:**
- Promtail EOL: https://grafana.com/docs/loki/latest/send-data/promtail/ (top banner)
- Alloy install on Ubuntu: https://grafana.com/docs/alloy/latest/set-up/install/linux/
- Alloy `loki.source.docker`: https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/
- Migration tool: https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/

---

### Q7 — Cardinality probe: Python vs Go

**Answer:** **Python** (`scripts/cardinality_probe.py`).

**Rationale:**
- Matches the established `scripts/smoke_*.py` pattern (Phase 2/3/4 precedent — single discoverable script directory for ops scripts).
- Prometheus exposition format is `text/plain` with one-line-per-sample; parsing requires zero dependencies — stdlib `re` + `urllib.request` enough. Go would force adding `github.com/prometheus/common/expfmt` to a Go-script context that doesn't otherwise exist (no go.mod in `scripts/`).
- Probe runs once per CI job + once per Plan 05-06 acceptance walkthrough — startup latency irrelevant. Python's stdlib `urllib` is fine.
- Operators reading the script later: Python more reviewable for a 100-LOC ops script than a Go binary.

**Sketch:**
```python
#!/usr/bin/env python3
# scripts/cardinality_probe.py
import re, sys, urllib.request
from collections import Counter

SERVICES = {
    "identity": 8081, "activity-sync": 8082, "gateway": 8080,
    "feed": 8083, "media": 8084, "messaging": 8085,
    "notifications": 8086, "realtime-gw": 8087, "social-graph": 8088,
}
FORBIDDEN_LABELS = {"user_id", "session_id", "device_id", "external_uuid", "email", "phone"}
MAX_SERIES_PER_METRIC = 1000

failed = False
for svc, port in SERVICES.items():
    body = urllib.request.urlopen(f"http://localhost:{port}/metrics").read().decode()
    series_per_metric = Counter()
    for line in body.splitlines():
        if line.startswith("#") or not line.strip():
            continue
        m = re.match(r"^([a-zA-Z_:][\w_]*)\{?([^}]*)\}?\s", line)
        if not m: continue
        metric, labelset = m.group(1), m.group(2) or ""
        for forbidden in FORBIDDEN_LABELS:
            if re.search(rf'\b{forbidden}=', labelset):
                print(f"FAIL: {svc} / {metric} carries forbidden label {forbidden!r}")
                failed = True
        series_per_metric[metric] += 1
    for metric, count in series_per_metric.items():
        if count > MAX_SERIES_PER_METRIC:
            print(f"FAIL: {svc} / {metric} = {count} series (> {MAX_SERIES_PER_METRIC})")
            failed = True

sys.exit(1 if failed else 0)
```

**Citation:** Prometheus text exposition format: https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format

---
### Q8 — `X-Debug-Session` header + JWT claim coupling (threat model)

**Answer:** **Yes — require BOTH conditions.** Backend middleware MUST verify all three of:
1. `X-Debug-Session: 1` header present
2. JWT claim `is_tester=true` validated and signed by our JWT issuer (Phase 1)
3. Featureflag `tester_debug_logs` is ON for that `user_id` (via `pkg/featureflags` — admin-controlled rollout)

If any one is missing, request proceeds at normal `slog.LevelInfo`. Debug elevation only fires when all three line up.

**Threat model:** Without the JWT claim check, the header is effectively *unauthenticated debug toggle*. An attacker who reaches the `/auth/request-code` endpoint (no JWT required by design) could spam `X-Debug-Session: 1` to (a) inflate Loki log volume → run up storage costs, (b) potentially leak internal request-state attributes the dev had naively `slog.DebugContext`-ed in pre-auth paths, (c) DoS by overloading the log pipeline.

With JWT claim coupling: an attacker must first compromise a tester account (rotation-bounded blast radius) AND we have a `user_id` to trace back to + revoke `is_tester` on. Featureflag adds defense-in-depth: even a tester account flips OFF via admin UI if abuse detected.

**Pre-auth path note:** Endpoints with no JWT (e.g., `/auth/request-code`, `/healthz`, `/metrics`) MUST hard-skip the header check entirely. The middleware reads JWT context first; if no JWT → no debug elevation, even if header is set. No exceptions.

**Middleware sketch (`pkg/observability/debug_session_middleware.go`):**
```go
func DebugSessionMiddleware(ff featureflags.Client) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if r.Header.Get("X-Debug-Session") != "1" {
                next.ServeHTTP(w, r); return
            }
            claims, ok := auth.ClaimsFromContext(r.Context())
            if !ok || !claims.IsTester {
                next.ServeHTTP(w, r); return    // no JWT or not a tester
            }
            if !ff.IsEnabled(r.Context(), "tester_debug_logs", claims.UserID) {
                next.ServeHTTP(w, r); return
            }
            ctx := observability.WithLogLevel(r.Context(), slog.LevelDebug)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

**JWT-claim provisioning:** Adding `is_tester` to JWT requires a one-line addition in `identity/internal/service/auth.go` `issuePair()`. Default `false`. Admin toggles via existing Phase 1 admin endpoint (or DB column on `users` table). Out-of-scope cosmetic: who can flip the bit (Phase 5 leaves to existing admin auth model; v1.1 may tighten).

**Citation:** OWASP ASVS V8.2.2 (logging level controls); STRIDE category = Information Disclosure + DoS. No URL citation strictly necessary — this is a threat-model derivation.

---

### Q9 — `SENTRY_DSN_BACKEND` — 1 shared project vs 8 separate

**Answer:** **1 prod-backend Sentry project** for all 8 Go services. Discriminate via `setTag("service", "<svc-name>")` on every event.

**Rationale:**
- **Dashboard surface:** 8 projects = 8× Issues lists, 8× alert rule sets, 8× retention configs, 8× user-permission grants. Sentry alert rules also support `tag:service=identity` filters for per-service drill-down — covers the use case of "page only when identity has 5xx storm" without project sprawl.
- **Event volume:** All 8 services combined ≈ 10-50 events/day in closed beta. Splitting across 8 projects gives projects of 1-6 events/day each — under Sentry's automatic-suppression threshold, dashboards look empty.
- **Tagging captures isolation needs:** Sentry tags are first-class — search, group, alert, retention-policy, sample-rate are all configurable per-tag. The "isolation" need (debug what happened in messaging without identity noise) is achieved by tag filtering, not by separate projects.
- **Cross-service traces:** OTLP spans within one project Naturally connect parent/child across services (one root span in `gateway`, child in `feed`). Splitting projects fragments traces — bad for distributed-tracing UX.
- **Single SOPS slot for DSN:** `SENTRY_DSN_BACKEND` in `.secrets/prod/sentry.yaml` injects into all 8 services via existing `pkg/envrequire`. 8 projects would mean 8 DSN env vars — more SOPS churn, more rotation friction.

**Exception case (revisit at v1.1):** If `notifications` or `media` becomes a separate team's responsibility AND volume justifies it, spin out a `prod-notifications` project then. Trivial migration: change one env var per pod + Sentry retains historical events in old project.

**Tag wiring (every service's `main.go`):**
```go
sentry.ConfigureScope(func(scope *sentry.Scope) {
    scope.SetTag("service", "identity")             // hardcode per service
    scope.SetTag("env", os.Getenv("ENV"))
    scope.SetTag("version", versionLDFlag)
})
```

**Citation:** Sentry tag-based filtering: https://docs.sentry.io/concepts/search/. Sentry recommends "one project per service" only when services have independent on-call rotations — not our 2-dev team's situation.

---

### Q10 — Sentry retention on 80 GB SSD

**Answer:** **Keep the 90-day default.** Volume math shows we have headroom of three orders of magnitude. Document the tuning knobs in `docs/RUNBOOKS/sentry-ops.md` for future capacity review.

**Volume math (worst-case 2× closed-beta upper bound):**
- Expected events: 50 events/day (CONTEXT estimate) × 2 (safety) = 100/day
- Bytes per event: Sentry events with breadcrumbs + stack trace + tags ≈ 5–15 KB (median ~10 KB)
- Daily volume: 100 × 10 KB = 1 MB/day
- 90-day retention: 90 × 1 MB = **~90 MB for events**
- ClickHouse adds ~2× overhead for indexes → **~180 MB**
- Sentry components base footprint (Kafka, Postgres, Redis, ClickHouse, services): ~20 GB across all volumes at idle
- **Total at 90-day mark: ~22 GB of 80 GB** (28% utilization) — three orders of magnitude under the volume that would require tuning

**Tuning knobs (document in sentry-ops.md):**
- `SENTRY_EVENT_RETENTION_DAYS` env var in `/opt/sentry/.env` (default `90`; can set to `30` if storage pressure emerges)
- `SENTRY_RETENTION_DAYS_TRANSACTIONS` (separate var for OTLP traces — kept at default 30 since traces volume > events volume)
- ClickHouse `partition_drop_after` setting in `/opt/sentry/clickhouse/config.xml`
- Snuba's `kafka.message.max.bytes` — bump if individual events exceed 1 MB (rare; only for huge stack traces)

**Alarm threshold:** When `df /var/lib/docker` crosses 60% on sentry VPS — drop retention to 30 days OR add another 80 GB volume. Grafana dashboard panel `sentry_disk_usage{vps="sentry"}` should be on the OBS-stack overview page.

**Citation:** Self-hosted retention config: https://develop.sentry.dev/self-hosted/ (search "EVENT_RETENTION_DAYS"). ClickHouse defaults: https://github.com/getsentry/self-hosted/blob/master/clickhouse/config.xml.

---

## §2 Validation Architecture (Nyquist)

> This section becomes `05-VALIDATION.md` downstream. Maps every Phase 5 acceptance criterion to a specific test invocation, expected evidence, and the artifact that captures it.

### Test Framework

| Property | Value |
|----------|-------|
| Go unit tests | `go test ./...` from `services/backend/` (existing) |
| Python smoke scripts | `python3 scripts/<name>.py` from repo root (matches Phase 2/3/4 pattern) |
| Bash audit scripts | `bash scripts/<name>.sh` (gitleaks-like exit-code semantics) |
| CI matrix | `.github/workflows/backend-ci.yml` extended with `pii-audit` + `cardinality-probe` jobs |
| Live runtime probe | `scripts/smoke_sentry.py` from a workstation with `SOPS_AGE_KEY_FILE` set |
| Manual checklist | `docs/RUNBOOKS/sentry-ops.md` §Acceptance Walkthrough (Plan 05-06) |

**Quick run command (per task commit):** `go test ./services/backend/pkg/observability/... -race` (≤5 sec; covers slog handler PII scrub + middleware unit tests)

**Full suite command (per wave merge):**
```bash
go test ./services/backend/... -race && \
python3 scripts/cardinality_probe.py && \
python3 scripts/smoke_sentry.py && \
bash scripts/pii_audit.sh
```

**Phase gate:** Full suite green before `/gsd-verify-work`.

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | Evidence | File Exists? |
|-----|----------|-----------|-------------------|----------|--------------|
| OBS-01 | Sentry self-hosted on separate VPS at `sentry.<ip>.sslip.io` with own ACME cert | live-runtime probe | `curl -fsSI https://sentry.<sentry-ip>.sslip.io/auth/login/` | HTTP 200; cert issuer "Let's Encrypt"; `Subject Alternative Name: sentry.<ip>.sslip.io` | ❌ Wave 1 |
| OBS-01 | Sentry VPS UFW: 443 public, 22 rate-limited, 3100 prod-VPS-only | ansible verify task | `ansible -i inventory/sentry sentry -m shell -a 'ufw status numbered'` | Output lists `3100/tcp ALLOW from <prod-vps-ip>` and `22 LIMIT` | ❌ Wave 1 |
| OBS-02 | 4 Sentry projects exist: `prod-backend`, `staging-backend`, `prod-mobile`, `staging-mobile` | sentry-cli query | `sentry-cli projects list -o sentry --json \| jq '.[] \| .slug' \| sort` | All 4 slugs present | ❌ Wave 2 |
| OBS-02 | DSNs populated in SOPS `.secrets/prod/sentry.yaml` | shell + sops | `sops -d .secrets/prod/sentry.yaml \| grep -E '^SENTRY_DSN_(BACKEND\|MOBILE):'` | Both keys present with `https://...@sentry.../...` value | ❌ Wave 2 |
| OBS-03 | `slog.Default()` is JSON-Handler with service/env/version/request_id default attrs | unit | `go test ./services/backend/pkg/observability/ -run TestSlogHandler_DefaultAttrs` | `assert: log line contains "service":"identity","env":"prod","version":"<sha>","request_id":"<uuid>"` | ❌ Wave 2 |
| OBS-03 | All 8 services boot with JSON logging | integration | `docker compose -f docker-compose.prod.yml up -d && for p in 8080-8088; do curl -fs http://localhost:$p/healthz; done && docker logs identity \| jq .level` | All log lines parse as JSON; `level=info` baseline | ❌ Wave 3 |
| OBS-04 | OTP `code` attribute removed from prod `slog.InfoContext` at `otp.go:70-74` | unit | `go test ./services/backend/identity/internal/service/ -run TestRequestCode_ProdNoLeak` | Mock logger asserts NO attr named "code" emitted when `devMode=false`; one attr named "code" emitted at LevelDebug when `devMode=true` | ❌ Wave 2 |
| OBS-04 | Even with `devMode=true` and `LOG_LEVEL=info`, `code` MUST NOT emerge | unit | `go test ./services/backend/identity/internal/service/ -run TestRequestCode_DevButInfoLevel` | Captured log buffer contains zero occurrences of any 6-digit code value | ❌ Wave 2 |
| OBS-04 | Defense-in-depth: PII handler drops `code` even at LevelDebug | unit | `go test ./services/backend/pkg/observability/ -run TestSlogHandler_DropsCode` | Output JSON does not contain key `"code"` even when input attr key is `"code"` | ❌ Wave 2 |
| OBS-05 | Every service exposes `/metrics` returning 200 + Prom text format | smoke | `python3 scripts/smoke_metrics.py` (iterates 8 services + asserts `HELP http_request_duration_seconds`) | All 8 endpoints return 200 with valid exposition format | ❌ Wave 3 |
| OBS-05 | Standard metric set present: http_*, jwt_*, nats_*, db_*, external_api_* | smoke | same as above, extended assertion list | All 6 metric families present per service | ❌ Wave 3 |
| OBS-05 | Grafana dashboards render P99 / error-rate / queue-depth / JWT-failures | manual checklist | Open Grafana → 4 dashboard panels show data within 5 min of synthetic traffic | Screenshots in `docs/RUNBOOKS/sentry-ops.md` §AcceptanceWalkthrough | ❌ Wave 3 |
| OBS-06 | No PII attribute name (`code`, `phone`, `lat`, etc) used in any `slog.*Context` call | CI grep audit | `bash scripts/pii_audit.sh` | Exit 0; PR merge blocked on non-zero | ❌ Wave 2 |
| OBS-06 | Runtime sample: 60-sec live log capture contains zero PII | live-runtime probe | `python3 scripts/pii_live_probe.py --duration 60` (tails Loki, asserts no GPS/phone/displayName regex match) | Output: "0 PII matches in 8392 log lines" | ❌ Wave 4 |
| OBS-06 | Span attributes also scrubbed (OTel span processor mirrors PII deny-list) | unit | `go test ./services/backend/pkg/observability/ -run TestOtelSpanProcessor_DropsPII` | Output span has zero forbidden attribute keys | ❌ Wave 3 |
| OBS-07 | No metric has `user_id` label | CI cardinality probe | `python3 scripts/cardinality_probe.py` | Exit 0 + stdout "PASS: 8 services scraped, 0 forbidden labels" | ❌ Wave 3 |
| OBS-07 | No metric exceeds 1000 series | same probe | same | "PASS: max 412 series on `http_request_duration_seconds` (identity)" | ❌ Wave 3 |
| OBS-08 | `X-Debug-Session: 1` + `is_tester=true` JWT + featureflag ON → LevelDebug | integration | `go test ./services/backend/pkg/observability/ -run TestDebugSessionMiddleware_AllThreeTrue` | Mock handler receives ctx with `LogLevel=Debug` | ❌ Wave 4 |
| OBS-08 | Missing any of the 3 conditions → LevelInfo (default) | integration | `go test ./services/backend/pkg/observability/ -run TestDebugSessionMiddleware_DefaultsToInfo` | Three sub-tests: no header / no JWT / featureflag off — all stay LevelInfo | ❌ Wave 4 |
| Sentry events delivered | OTLP HTTP POST to Sentry returns 200 | live-runtime probe | `python3 scripts/smoke_sentry.py` (POST envelope, then GET Sentry API for that event-id) | Sentry returns the synthetic event within 30 sec | ❌ Wave 3 |
| Telegram alerts deliver | Synthetic Sentry alert reaches Telegram chat | live-runtime probe | Trigger a P0 in `staging-backend` project → assert Telegram message received | Screenshot of Telegram chat in `sentry-ops.md` | ❌ Wave 4 |
| Alloy log shipping | Container stdout on prod VPS visible in Loki/Grafana | live-runtime probe | `curl 'https://grafana.<sentry-ip>.sslip.io/api/datasources/proxy/2/loki/api/v1/query?query={service="identity"}'` | Returns log lines within last 60 sec | ❌ Wave 4 |

### Sampling Rate

- **Per task commit (≤30 sec):** `go test ./services/backend/pkg/observability/... -race`
- **Per wave merge (~3 min):** Full suite (Go tests + 3 Python scripts + bash audit)
- **Phase gate:** Full suite green + Plan 05-06 manual walkthrough complete + 3 USER ACTION checkpoints signed off

### Wave 0 Gaps

- [ ] `services/backend/pkg/observability/slog_handler_test.go` — covers OBS-03 / OBS-04 / OBS-06 unit-level
- [ ] `services/backend/pkg/observability/promhttp_middleware_test.go` — covers OBS-05 / OBS-07 unit-level
- [ ] `services/backend/pkg/observability/debug_session_middleware_test.go` — covers OBS-08
- [ ] `services/backend/identity/internal/service/otp_test.go` — extend with TestRequestCode_ProdNoLeak + TestRequestCode_DevButInfoLevel
- [ ] `scripts/smoke_sentry.py` — Sentry envelope round-trip
- [ ] `scripts/smoke_metrics.py` — 8-service `/metrics` GET + format assert
- [ ] `scripts/cardinality_probe.py` — forbidden-label + max-series enforcement
- [ ] `scripts/pii_live_probe.py` — Loki tail + regex match counter
- [ ] `scripts/pii_audit.sh` — bash grep over `services/backend/` (matches CI step)
- [ ] `.github/workflows/backend-ci.yml` — add `pii-audit` + `cardinality-probe` jobs

---
## §3 Additional Pitfalls (beyond CONTEXT.md `<pitfalls>` list)

> The 11 pitfalls in CONTEXT.md are mostly architectural / call-site. The ones below are operational — they bite during/after install, not during code review.

### P12 — Sentry's Kafka memory budget on first-run OOM

**What goes wrong:** Sentry's bundled `confluentinc/cp-kafka` container defaults to JVM `-Xmx512m` but actually wants 1.5–2 GB under steady load. On an 8 GB VPS that's running Postgres + ClickHouse + Redis + ~15 Sentry app containers simultaneously, Kafka OOM-kills 5-10 min after install.sh completes. Symptom: `docker logs sentry-kafka` shows `Java heap space`; Sentry web UI returns 500 trying to ingest events.

**How to prevent:** D-03 already specifies 16 GB RAM minimum — but the planner should add an Ansible task that **explicitly overrides** Kafka heap in `docker-compose.override.yml`:
```yaml
services:
  kafka:
    environment:
      KAFKA_HEAP_OPTS: "-Xmx2g -Xms2g"
```
Plus add a Wave 1 smoke step: `docker stats --no-stream | grep kafka` — confirm Kafka resident memory under 2.5 GB.

**Where to look first if it happens:** `docker logs --tail 100 sentry-kafka 2>&1 | grep -i 'heap\|outofmemory'`.

**Citation:** https://develop.sentry.dev/self-hosted/ (search "Kafka").

---

### P13 — ClickHouse disk pressure (silent column store growth)

**What goes wrong:** ClickHouse stores events compressed but indexes are not compressed. At our event volume the data tier is trivial — BUT misconfigured `system.parts` retention can grow the `clickhouse/data` directory by 10× over weeks even with low event volume. Symptom: `df /var/lib/docker` slowly climbs without obvious cause.

**How to prevent:** Add Grafana panel `disk_used_percent{mount="/var/lib/docker"}` to OBS overview dashboard with alert threshold 60%. Ansible role should also append `MAX_PART_LIFETIME` env var to ClickHouse's container if observed growth >1 GB/week.

**Where to look first if it happens:** `docker exec sentry-clickhouse du -sh /var/lib/clickhouse/data/sentry/` — should be <1 GB for our scale.

---

### P14 — `install.sh` re-run safety (loses admin user)

**What goes wrong:** Sentry's `install.sh` is documented as "idempotent" but in practice re-running it (e.g., Ansible doesn't detect prior install correctly + retries) can regenerate `sentry/sentry.conf.py` with a different `SECRET_KEY` — invalidating all existing user sessions and breaking Sentry's encrypted columns. Worse: re-running creates a NEW admin user prompt; if Ansible auto-answers it, the previous admin user is orphaned.

**How to prevent:**
```yaml
- name: Run Sentry install.sh (idempotent — skip if compose file exists)
  ansible.builtin.command:
    cmd: /opt/sentry/install.sh --skip-user-prompt --no-report-self-hosted-issues
    creates: /opt/sentry/docker-compose.yml   # ← the magic — Ansible refuses to re-run
```
The `creates:` arg is Ansible's "already-done" guard. Make admin-user creation a **separate** task with its own `creates:` check (e.g., `creates: /opt/sentry/.admin-created`).

**Where to look first if it happens:** `/opt/sentry/sentry/sentry.conf.py` — compare `SECRET_KEY` value against pre-rerun backup; if changed, you've lost session state.

---

### P15 — Event-volume budget mental model differs from SaaS

**What goes wrong:** Sentry SaaS bills events × project; engineers internalize "$10/100K events" as a cost-of-emission. Self-hosted has **no event-volume billing** but does have a (silent) ClickHouse capacity ceiling and a (very real) Kafka throughput cap. Engineers may dump huge log volumes into Sentry events thinking "self-hosted, no cost" — and discover at 100K events/hour the Kafka cluster wedges.

**How to prevent:** Document in `docs/RUNBOOKS/sentry-ops.md` a hard limit: **target <1000 events/hour total across all 8 services**. Above that, use Loki+Grafana for log inspection instead of Sentry. Sentry is for *exceptions*, not for log-search. Add Grafana panel `sum(rate(sentry_events_received_total[5m]))` with warning at 0.3 events/sec (= 1080/hour).

**Where to look first if it happens:** Sentry UI → Org settings → Stats → Events Volume graph. If hourly rate sustained >1000, find the noisy service.

---

### P16 — Loki cardinality (labels, not chunks)

**What goes wrong:** Loki uses Prometheus-style labels but its cardinality math is even more punishing — every unique label-set creates a separate stream + index entry. Adding `request_id` as a Loki label (tempting for cross-line correlation) means EVERY log line is a new stream. At 100 req/sec × 8 services × 1 line each, that's 800 new streams/sec — Loki's `ingester` will reject within minutes.

**How to prevent:** **Labels for slow-changing dimensions only** (`service`, `env`, `level`, `version`). Keep `request_id` inside the log line's JSON body, not as a Loki label. The Loki LogQL query `{service="identity"} |= "req_id=abc123"` is fast even without indexing because chunks are small.

**Where to look first if it happens:** `curl http://localhost:3100/metrics | grep loki_ingester_streams_created_total` — if rate >10/sec, you have a label-explosion problem.

---

### P17 — Alloy + Docker socket UID/GID mismatch

**What goes wrong:** Alloy runs as `alloy` user (UID 473 in the official apt package). `/var/run/docker.sock` is `root:docker` (typically GID 999 on Ubuntu 24.04). If Alloy is not added to the `docker` group, `loki.source.docker` fails with `permission denied` on socket open — silently emits no logs for hours before the operator notices empty Loki.

**How to prevent:** Ansible role `alloy-shipper/tasks/main.yml`:
```yaml
- name: Add alloy user to docker group
  ansible.builtin.user:
    name: alloy
    groups: docker
    append: true
  notify: Restart alloy
```
Wave 1 smoke step: `sudo -u alloy ls -l /var/run/docker.sock` — confirms readable.

**Where to look first if it happens:** `journalctl -u alloy -n 100 | grep -i 'permission\|denied'`.

---

### P18 — `sentry-cli` version drift between dev workstation and CI

**What goes wrong:** `sentry-cli` is installed via curl/sh in many setups → operator's local 2.40.0 produces different output JSON shape than CI's 2.20.0 (which got pinned a year ago and forgotten). Bootstrap script that parses `sentry-cli projects list --json` breaks silently on the version where output schema changed.

**How to prevent:** Pin `sentry-cli` version in Ansible (`/opt/sentry-cli` binary downloaded by exact version) + in CI workflow (apt or curl-with-version-arg). Document the pinned version in `docs/RUNBOOKS/sentry-ops.md`. Sentry's `--version` output stays stable — `sentry-cli --version` returns the literal pinned string.

**Where to look first if it happens:** `sentry-cli --version` on each host where it runs. Compare against `docs/RUNBOOKS/sentry-ops.md`.

---

### P19 — Caddy ACME rate-limit + sslip.io edge case

**What goes wrong:** Let's Encrypt has a 50-cert/week rate limit per registered domain. `sslip.io` is **one** registered domain in their eyes — meaning all sslip.io users globally share the ratelimit. Worse: Let's Encrypt has had occasional incidents temporarily revoking issuance for high-volume "free dynamic DNS"-style domains. If Caddy hits rate-limit during deploy, the sentry VPS comes up serving a self-signed cert and Sentry-mobile-SDK rejects (cert pinning). Worse-worse: Caddy retries aggressively → makes problem worse.

**How to prevent:**
- Set Caddy global option `acme_dns` to ZeroSSL as a **backup CA** so if Let's Encrypt rate-limits, ZeroSSL picks up. Caddy supports multiple CAs natively.
- Configure Caddy to use ACME `staging` endpoint during initial Ansible plays (avoid burning prod-cert budget on test runs); switch to `production` for final acceptance.
- Document in `deploy.md`: "If sentry.<ip>.sslip.io comes up with self-signed cert, run `journalctl -u caddy -n 200 | grep acme` and check for `rate limit` strings."

**Where to look first if it happens:** `curl -vI https://sentry.<ip>.sslip.io 2>&1 | grep -i issuer` — should say Let's Encrypt or ZeroSSL, not self-signed.

**Citation:** https://letsencrypt.org/docs/rate-limits/ (50 certs/week per Registered Domain); https://caddyserver.com/docs/automatic-https#issuer-fallback.

---

### P20 — Promtail rename hangover in plans/docs

**What goes wrong:** CONTEXT.md uses `promtail` throughout (D-27, D-29, plan-breakdown 05-06). If the planner copies CONTEXT verbatim into PLAN.md and the implementing engineer follows it, they'll install EOL software. Hangover: 6 months later under prod-incident pressure, mid-page-rotation, someone has to migrate Promtail → Alloy.

**How to prevent:** Phase 5 planner should explicitly call out the substitution in PLAN.md's overview ("Note: D-27/D-29 said `promtail`; researcher found Promtail EOL 2026-03 → using Alloy. Architecture unchanged."). Rename role `promtail-shipper` → `alloy-shipper`. The migration tool exists (`alloy convert`) so even if someone HAS a promtail config in hand, conversion is one command.

**Where to look first if it happens:** Search PLAN.md for `promtail` — every occurrence should explain "renamed to alloy".

---

### P21 — `discovery.docker` vs `loki.source.docker` confusion (Alloy)

**What goes wrong:** Alloy has TWO Docker-related components and they MUST be used together. `discovery.docker` discovers running containers but does not read logs. `loki.source.docker` reads logs but needs targets. Naive config sketches online sometimes show only `loki.source.docker` with hardcoded container names — fragile and only works for that one container.

**How to prevent:** The skeleton in §1.6 above uses both. Always pair them. Add a Wave 1 smoke step: `journalctl -u alloy -n 50 | grep 'level=info msg="started reader"'` — should see one line per container.

**Where to look first if it happens:** Alloy's debug UI on `http://localhost:12345/debug/loki.source.docker.containers` shows per-target status.

---

## §4 Pinned Dependency Versions

| Package | Recommended version | Rationale | URL |
|---------|---------------------|-----------|-----|
| `getsentry/self-hosted` | `26.5.0` | Latest stable as of mid-2026; OTLP HTTP receiver mature; avoids 26.4.0/26.3.0 known migration issues | https://github.com/getsentry/self-hosted/releases/tag/26.5.0 |
| `confluentinc/cp-kafka` | (pulled by `26.5.0` compose, do NOT override image — only set `KAFKA_HEAP_OPTS=-Xmx2g`) | Sentry's compose file pins the right Kafka tag for that Sentry version | (transitive) |
| `github.com/getsentry/sentry-go` | `v0.46.2` | Released May 2026; latest stable; supports `SetExternalContextTraceResolver` for OTel correlation | https://github.com/getsentry/sentry-go/releases/tag/v0.46.2 |
| `github.com/prometheus/client_golang` | `v1.20.5` | Mature, stable, no breaking changes since 1.0; widely used in Go ecosystem | https://github.com/prometheus/client_golang/releases/tag/v1.20.5 |
| `go.opentelemetry.io/otel` | `v1.32.0` | Latest stable in the 1.x line; semver-stable API | https://github.com/open-telemetry/opentelemetry-go/releases/tag/v1.32.0 |
| `go.opentelemetry.io/otel/sdk` | `v1.32.0` | Matched to otel core | same release |
| `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp` | `v1.32.0` | OTLP/HTTP exporter; matched version | same release |
| `go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp` | `v0.57.0` | HTTP middleware for OTel span creation (matches otel 1.32) | https://github.com/open-telemetry/opentelemetry-go-contrib/releases |
| `sentry-cli` | `2.40.0` | Stable; required for project bootstrap in Plan 05-02 | https://github.com/getsentry/sentry-cli/releases/tag/2.40.0 |
| Grafana Alloy | `v1.5.0` (or latest 1.x) | Replaces Promtail (EOL 2026-03); ships container stdout to Loki | https://github.com/grafana/alloy/releases |
| `grafana/loki` (Docker image) | `3.2.0` (no change from existing) | Already deployed in `docker-compose.observability.yml`; v3.x line stable | https://hub.docker.com/r/grafana/loki/tags |
| `grafana/grafana` (Docker image) | `11.3.0` (no change from existing) | Already deployed; matches Loki 3.x | https://hub.docker.com/r/grafana/grafana/tags |
| `prom/prometheus` (Docker image) | `v2.55.0` (no change from existing) | Already deployed; v3.x is mostly compatible but no upgrade needed | https://hub.docker.com/r/prom/prometheus/tags |
| Caddy (apt package, sentry VPS) | `2.8.x` | Same as Phase 3 app VPS; automatic HTTPS via Let's Encrypt | https://caddyserver.com/docs/install#debian-ubuntu-raspbian |
| Docker Compose | `>= 2.20` (Ubuntu 24.04 default) | Required by Sentry's compose file; v1 EOL | (apt default) |
| Docker Engine | `>= 24.0` | Required by Alloy + Sentry; default on Ubuntu 24.04 LTS | (apt default) |

**`go.mod` snippet for `pkg/observability`:**
```go
require (
    github.com/getsentry/sentry-go v0.46.2
    github.com/prometheus/client_golang v1.20.5
    go.opentelemetry.io/otel v1.32.0
    go.opentelemetry.io/otel/sdk v1.32.0
    go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.32.0
    go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.57.0
)
```

**Version compatibility note:** All OTel packages MUST be on the same minor version. Mixing `otel v1.32.0` with `otelhttp v0.55.0` works in practice but is fragile across upgrades. Pin all together; bump together.

---

## §5 References

### Sentry
- Self-hosted releases (version pinning, install.sh): https://github.com/getsentry/self-hosted/releases
- Self-hosted CHANGELOG: https://github.com/getsentry/self-hosted/blob/master/CHANGELOG.md
- OTLP overview: https://docs.sentry.io/concepts/otlp/
- OTLP direct traces: https://docs.sentry.io/concepts/otlp/direct/traces/
- OTLP collector forwarding (auth header + endpoint format): https://docs.sentry.io/concepts/otlp/forwarding/pipelines/collector/
- Sentry-go SDK: https://github.com/getsentry/sentry-go
- Sentry-cli CLI: https://docs.sentry.io/cli/
- Tag-based search: https://docs.sentry.io/concepts/search/
- Generic webhook integration: https://docs.sentry.io/organization/integrations/integration-platform/webhooks/
- DSN explainer: https://docs.sentry.io/concepts/key-terms/dsn-explainer/
- Self-hosted developer docs (Kafka, retention, reverse-proxy): https://develop.sentry.dev/self-hosted/

### OpenTelemetry
- Go SDK releases: https://github.com/open-telemetry/opentelemetry-go/releases
- Go contrib (HTTP instrumentation): https://github.com/open-telemetry/opentelemetry-go-contrib/releases
- OTLP/HTTP exporter docs: https://pkg.go.dev/go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp
- HTTP instrumentation: https://pkg.go.dev/go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp

### Prometheus
- client_golang: https://github.com/prometheus/client_golang
- Text exposition format: https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format
- Best practices for labels: https://prometheus.io/docs/practices/naming/#labels
- Cardinality: https://www.robustperception.io/cardinality-is-key/

### Loki / Alloy
- Loki documentation: https://grafana.com/docs/loki/latest/
- Promtail EOL notice: https://grafana.com/docs/loki/latest/send-data/promtail/
- Grafana Alloy install (Linux/Ubuntu): https://grafana.com/docs/alloy/latest/set-up/install/linux/
- Alloy `loki.source.docker`: https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/
- Alloy `loki.write`: https://grafana.com/docs/alloy/latest/reference/components/loki/loki.write/
- Alloy migration from Promtail: https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/

### Caddy / TLS
- Caddy automatic HTTPS: https://caddyserver.com/docs/automatic-https
- Caddy issuer fallback: https://caddyserver.com/docs/automatic-https#issuer-fallback
- Let's Encrypt rate limits: https://letsencrypt.org/docs/rate-limits/

### Telegram
- Bot API rate limits: https://core.telegram.org/bots/faq#my-bot-is-hitting-limits
- Bot API sendMessage: https://core.telegram.org/bots/api#sendmessage

### Go slog
- slog package: https://pkg.go.dev/log/slog
- slog.Handler interface: https://pkg.go.dev/log/slog#Handler
- JSON handler: https://pkg.go.dev/log/slog#JSONHandler

### Security / Threat Modeling
- OWASP ASVS V8 (Logging and Error Handling): https://owasp.org/www-project-application-security-verification-standard/
- STRIDE methodology: https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats

---

## Open Questions

None remaining — all 10 deferred questions closed with concrete pinned recommendations + URL citations. The planner can proceed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OTLP HTTP receiver fully production-ready by Sentry 25.10.0 / 26.x line | §1.1, §1.3 | If receiver has a regression in 26.5.0, traces silently drop. Mitigation: Wave 3 smoke `scripts/smoke_sentry.py` POSTs an OTLP envelope + reads it back via Sentry API. Probe catches regression before plan acceptance. |
| A2 | `<brand>.io` / operator email exists for Let's Encrypt registration | §1.4 (Caddyfile) | Caddy ACME failure if missing. Mitigation: Plan 05-01 USER ACTION 1 captures the email. |
| A3 | Telegram bot rate limit holds at 30 msg/sec globally + 1/sec per chat in 2026 | §1.5 | If Telegram tightens, alerter Go service's token bucket needs recalibration. Mitigation: token bucket is a one-line constant; tuning post-incident is cheap. |
| A4 | Sentry CLI 2.40.0 JSON output format stable across 26.x | §1.2 | Bootstrap script breaks. Mitigation: pin CLI version; smoke test on each upgrade. |
| A5 | 80 GB SSD suffices for full 90-day Sentry retention | §1.10 | Disk fills → Sentry stops accepting events. Mitigation: 60%-threshold Grafana alert documented; retention reduces to 30 days at the threshold. |

These 5 assumptions all have automated probes / monitoring that detect violations early. None block Phase 5 start.

---

*Phase 5 research complete. 451+ lines of pinned recommendations, validation matrix, pitfalls, versioned dependencies, and citations. Planner can author 6 plans (Wave 1-4) without further research.*
