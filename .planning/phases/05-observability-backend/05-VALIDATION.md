---
phase: 5
slug: observability-backend
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-19
source: 05-RESEARCH.md §2 Validation Architecture
---

# Phase 5 — Validation Strategy

> Per-phase validation contract derived from `05-RESEARCH.md §2`. Maps every OBS-01..08 acceptance criterion to a specific test invocation + evidence shape. Read alongside `05-CONTEXT.md` (locked decisions) and `05-RESEARCH.md` (10 deferred questions resolved + version pins).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Go unit tests** | `go test ./...` from `services/backend/` (existing harness) |
| **Python smoke scripts** | `python3 scripts/<name>.py` from repo root (matches Phase 2/3/4 pattern) |
| **Bash audit scripts** | `bash scripts/<name>.sh` (gitleaks-like exit-code semantics) |
| **CI matrix** | `.github/workflows/backend-ci.yml` extended with `pii-audit` + `cardinality-probe` jobs |
| **Live runtime probes** | `scripts/smoke_sentry.py`, `scripts/pii_live_probe.py` (need `SOPS_AGE_KEY_FILE` set) |
| **Manual checklist** | `docs/RUNBOOKS/sentry-ops.md §Acceptance Walkthrough` (created by Plan 05-06) |
| **Quick run command** | `go test ./services/backend/pkg/observability/... -race` |
| **Full suite command** | `go test ./services/backend/... -race && python3 scripts/cardinality_probe.py && python3 scripts/smoke_sentry.py && bash scripts/pii_audit.sh` |
| **Estimated runtime** | quick ≤5 s, full ~3 min |

---

## Sampling Rate

- **After every task commit (≤30 s feedback latency):** Run `go test ./services/backend/pkg/observability/... -race`
- **After every plan wave (≤3 min):** Run full suite (Go tests + 3 Python scripts + bash audit)
- **Before `/gsd-verify-work`:** Full suite must be green + Plan 05-06 manual walkthrough complete + 3 USER ACTION checkpoints signed off (VPS provisioning, Telegram bot creation + DSN extraction, final acceptance walkthrough)
- **Max feedback latency:** 30 s (per-task), 3 min (per-wave)

---

## Per-Requirement Verification Map

> Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · 🅦 Wave-0 (test file does not yet exist)

| Req | Behavior | Test Type | Automated Command | Evidence | Wave | Status |
|-----|----------|-----------|-------------------|----------|------|--------|
| OBS-01 | Sentry self-hosted on separate VPS at `sentry.<ip>.sslip.io` with own ACME cert | live-runtime probe | `curl -fsSI https://sentry.<sentry-ip>.sslip.io/auth/login/` | HTTP 200; cert issuer "Let's Encrypt" or ZeroSSL fallback; `Subject Alternative Name: sentry.<ip>.sslip.io` | 1 | 🅦 ⬜ |
| OBS-01 | Sentry VPS UFW: 443 public, 22 rate-limited, 3100 prod-VPS-only | ansible verify | `ansible -i inventory/sentry sentry -m shell -a 'ufw status numbered'` | Output lists `3100/tcp ALLOW from <prod-vps-ip>` and `22 LIMIT` | 1 | 🅦 ⬜ |
| OBS-02 | 4 Sentry projects exist: `prod-backend`, `staging-backend`, `prod-mobile`, `staging-mobile` | sentry-cli query | `sentry-cli projects list -o sentry --json \| jq -r '.[].slug' \| sort` | All 4 slugs present | 2 | 🅦 ⬜ |
| OBS-02 | DSNs populated in SOPS `.secrets/prod/sentry.yaml` | shell + sops | `sops -d .secrets/prod/sentry.yaml \| grep -E '^SENTRY_DSN_(BACKEND\|MOBILE):'` | Both keys present with `https://...@sentry.../...` value | 2 | 🅦 ⬜ |
| OBS-03 | `slog.Default()` is JSON-Handler with service/env/version/request_id default attrs | unit | `go test ./services/backend/pkg/observability/ -run TestSlogHandler_DefaultAttrs` | Log line JSON contains `"service":"identity","env":"prod","version":"<sha>","request_id":"<uuid>"` | 2 | 🅦 ⬜ |
| OBS-03 | All 8 services boot with JSON logging | integration | `docker compose -f docker-compose.prod.yml up -d && for p in 8080-8088; do curl -fs http://localhost:$p/healthz; done && docker logs identity \| jq .level` | All log lines parse as JSON; `level=info` baseline | 3 | 🅦 ⬜ |
| OBS-04 | OTP `code` attribute removed from prod `slog.InfoContext` at `otp.go:70-74` | unit | `go test ./services/backend/identity/internal/service/ -run TestRequestCode_ProdNoLeak` | Mock logger asserts NO attr `code` when `devMode=false`; one attr `code` at LevelDebug when `devMode=true` | 2 | 🅦 ⬜ |
| OBS-04 | Even with `devMode=true` and `LOG_LEVEL=info`, `code` MUST NOT emit | unit | `go test ./services/backend/identity/internal/service/ -run TestRequestCode_DevButInfoLevel` | Captured log buffer contains zero occurrences of any 6-digit code value | 2 | 🅦 ⬜ |
| OBS-04 | Defense-in-depth: PII handler drops `code` even at LevelDebug | unit | `go test ./services/backend/pkg/observability/ -run TestSlogHandler_DropsCode` | Output JSON does not contain key `"code"` even when input attr key is `"code"` | 2 | 🅦 ⬜ |
| OBS-05 | Every service exposes `/metrics` returning 200 + Prom text format | smoke | `python3 scripts/smoke_metrics.py` | All 8 endpoints return 200 with valid exposition; HELP+TYPE lines for `http_request_duration_seconds` present | 3 | 🅦 ⬜ |
| OBS-05 | Standard metric set present: http_*, jwt_*, nats_*, db_*, external_api_* | smoke | `python3 scripts/smoke_metrics.py --strict` | All 6 metric families present per service | 3 | 🅦 ⬜ |
| OBS-05 | Grafana dashboards render P99 / error-rate / queue-depth / JWT-failures | manual checklist | Open Grafana → 4 dashboard panels show data within 5 min of synthetic traffic | Screenshots in `docs/RUNBOOKS/sentry-ops.md §Acceptance Walkthrough` | 3 | 🅦 ⬜ |
| OBS-06 | No PII attribute name (`code`, `phone`, `lat`, etc) used in any `slog.*Context` call | CI grep audit | `bash scripts/pii_audit.sh` | Exit 0; CI job `pii-audit` blocks PR on non-zero | 2 | 🅦 ⬜ |
| OBS-06 | Runtime sample: 60-sec live log capture contains zero PII | live-runtime probe | `python3 scripts/pii_live_probe.py --duration 60` | Output `0 PII matches in N log lines` | 4 | 🅦 ⬜ |
| OBS-06 | Span attributes also scrubbed (OTel span processor mirrors PII deny-list) | unit | `go test ./services/backend/pkg/observability/ -run TestOtelSpanProcessor_DropsPII` | Output span has zero forbidden attribute keys | 3 | 🅦 ⬜ |
| OBS-07 | No metric has `user_id` label | CI cardinality probe | `python3 scripts/cardinality_probe.py` | Exit 0 + stdout `PASS: 8 services scraped, 0 forbidden labels` | 3 | 🅦 ⬜ |
| OBS-07 | No metric exceeds 1000 series | same probe | same | Stdout includes `max <N> series on <metric> (<service>)`, N≤1000 | 3 | 🅦 ⬜ |
| OBS-08 | `X-Debug-Session: 1` + JWT `is_tester=true` + featureflag ON → LevelDebug | integration | `go test ./services/backend/pkg/observability/ -run TestDebugSessionMiddleware_AllThreeTrue` | Mock handler receives ctx with `LogLevel=Debug` | 4 | 🅦 ⬜ |
| OBS-08 | Missing any of the 3 conditions → LevelInfo (default) | integration | `go test ./services/backend/pkg/observability/ -run TestDebugSessionMiddleware_DefaultsToInfo` | 3 sub-tests (no header / no JWT claim / featureflag off) all stay LevelInfo | 4 | 🅦 ⬜ |
| Sentry | OTLP HTTP POST to Sentry returns 200 + event visible in UI | live-runtime probe | `python3 scripts/smoke_sentry.py` | Sentry returns the synthetic event within 30 s of POST | 3 | 🅦 ⬜ |
| Alerts | Synthetic Sentry alert reaches Telegram chat | live-runtime probe | Trigger P0 in `staging-backend` → assert Telegram message received | Screenshot in `sentry-ops.md` | 4 | 🅦 ⬜ |
| Logs | Alloy log shipping: container stdout on prod VPS visible in Loki/Grafana | live-runtime probe | `curl 'https://grafana.<sentry-ip>.sslip.io/api/datasources/proxy/2/loki/api/v1/query?query={service="identity"}'` | Returns log lines within last 60 s | 4 | 🅦 ⬜ |

---

## Wave 0 Requirements (Test Infrastructure)

Files the planner MUST schedule before — or as the first task of — the wave that depends on them. Without these, the corresponding acceptance rows cannot turn green.

- [ ] `services/backend/pkg/observability/slog_handler_test.go` — covers OBS-03 / OBS-04 / OBS-06 unit-level
- [ ] `services/backend/pkg/observability/promhttp_middleware_test.go` — covers OBS-05 / OBS-07 unit-level
- [ ] `services/backend/pkg/observability/debug_session_middleware_test.go` — covers OBS-08
- [ ] `services/backend/pkg/observability/otel_init_test.go` — covers OTel span PII scrub
- [ ] `services/backend/identity/internal/service/otp_test.go` — extend with `TestRequestCode_ProdNoLeak` + `TestRequestCode_DevButInfoLevel`
- [ ] `scripts/smoke_sentry.py` — Sentry envelope round-trip (POST + GET event-id)
- [ ] `scripts/smoke_metrics.py` — iterates 8 services + asserts exposition format
- [ ] `scripts/cardinality_probe.py` — forbidden-label list + max-series enforcement
- [ ] `scripts/pii_live_probe.py` — Loki tail + regex match counter
- [ ] `scripts/pii_audit.sh` — bash grep over `services/backend/` (matches CI step)
- [ ] `.github/workflows/backend-ci.yml` — add `pii-audit` + `cardinality-probe` jobs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sentry web UI accessible + admin user can log in | OBS-01 | Sentry login flow involves CSRF + JS-rendered form; not worth scripting for one-time install | Open `https://sentry.<sentry-ip>.sslip.io/auth/login/`, log in with admin email + SOPS-stored password, see project list |
| 4 Grafana dashboard panels render data within 5 min of synthetic load | OBS-05 | Dashboard rendering is visual; assert by screenshot in RUNBOOK | Open Grafana, navigate to each of 4 dashboards, generate synthetic traffic via `scripts/smoke_metrics.py --load 60`, screenshot panels with non-empty data |
| Telegram alert end-to-end UX | Alerts | Bot creation via BotFather is interactive; chat-ID extraction requires inspecting Telegram API response | See `docs/RUNBOOKS/sentry-ops.md §Telegram Setup` — Plan 05-02 Task 0 (USER ACTION checkpoint 2) |
| RU consent banner copy review | OBS-08 backend seam | Phase 5 ships only backend `X-Debug-Session` + featureflag — the consent banner UI is Phase 17 territory | Phase 5 closeout SUMMARY explicitly flags "OBS-08 mobile UX = Phase 17" so Phase 17 inherits the dependency |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify command or a Wave-0 dependency declared
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers all 🅦 references above
- [ ] No `--watch` / `--no-fail-fast` / silent-skip flags anywhere in commands
- [ ] Per-task feedback latency < 30 s
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 files exist on disk

**Approval:** pending (will flip on `/gsd-verify-work` after Phase 5 execution)

---

*Source: derived from `05-RESEARCH.md §2 Validation Architecture` (2026-05-19)*
*Phase: 05-observability-backend*
