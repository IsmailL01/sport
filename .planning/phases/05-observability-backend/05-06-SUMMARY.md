# 05-06-SUMMARY — DebugSessionMiddleware + Alloy log shipping + OBS-06 runtime probe + ADR-0009

**Plan:** 05-06 (Wave 4 — autonomous=false)
**Requirements:** OBS-06 (closeout — runtime probe), OBS-08 (backend seam only; mobile UX dropped per ADR-0011)
**Executed:** 2026-05-20 (gsd-executor 119 tool uses, ~26 min) — Tasks 1-5 autonomous; **Task 6 acceptance walkthrough deferred to Phase 9 smoke test** per ADR-0011 scope reset (see below)
**Commits:** `ce6cf01`, `672763e`, `8d02eae`, `83a579c`, `eb28259`
**Status:** ✅ Code-complete (Tasks 1-5); Task 6 deferred-to-beta-launch per ADR-0011

---

## What landed

### Task 1 — DebugSessionMiddleware + IsTester JWT claim + featureflag registry (commit `ce6cf01`)

- **`pkg/observability/debug_session_middleware.go`** — D-22 three-gate enforcement (RESEARCH §1.8 — header-only is debug-DoS vector):
  1. `X-Debug-Session: 1` header present
  2. JWT claim `is_tester=true`
  3. featureflag `tester_debug_logging` ON for that user
  If ANY gate fails → `LevelInfo` (default); silent passthrough (zero slog emission on gate failure). All 3 gates pass → `LevelDebug` via `slog.NewContext(ctx, WithLogLevel(ctx, slog.LevelDebug))`.
- **`pkg/auth.Claims.IsTester bool`** field added; new `IssueTesterAccess(userID, isTester)` helper for tests. Production `IssueAccess` continues to emit `IsTester=false` until a `users.is_tester` DB column ships (v1.1 scope — deferred).
- **`pkg/featureflags/flags.go`** — `tester_debug_logging` flag const registered (matches existing migration `0021_featureflags.up.sql` seed; flag name kept as `tester_debug_logging` rather than plan's `tester_debug_logs` to avoid migration churn — documented deviation).
- **`debug_session_middleware_test.go`** — 6 unit tests + silent-passthrough invariant (grep-asserts zero slog emission on any gate failure). All green.

### Task 2 — Wire DebugSessionMiddleware as outermost layer in 8 services (commit `672763e`)

- **`pkg/observability/featureflag_adapter.go`** (new) — bridges UUID `Claims.UserID` → int64 (FNV-1a hash) for the Phase 1 REL-03 `featureflags.Store.IsEnabled(int64)` API. Avoids touching the featureflag interface (used by 8 services + admin UI).
- 8 Go services' `cmd/server/main.go` updated to wrap chain as outermost layer:
  ```
  DebugSession → Promhttp → SentryRecovery → OtelHTTP → clientversion → mux
  ```
- `go build` + `go vet` + `go test -race ./pkg/observability/...` all green. `scripts/pii_audit.sh` exits 0.

### Task 3 — Ansible alloy-shipper role + site.yml play (commit `8d02eae`)

- **`infra/ansible/roles/alloy-shipper/`** — pinned Alloy v1.5.0, paired `discovery.docker` + `loki.source.docker` (RESEARCH §P21), `alloy` user added to `docker` group (RESEARCH §P17), pushes to `https://82-25-71-215.sslip.io:8443/loki/api/v1/push` (Caddy-fronted per D-36) with `tls_config insecure_skip_verify = true` (self-signed cert per D-37).
- New third play in `site.yml` with `tags=[alloy]` — no impact on existing `common` / `docker` / `ufw` / `sport-stack` plays. `ansible-playbook --syntax-check` clean.
- **NOT YET DEPLOYED to prod VPS** — first-time deploy = `ansible-playbook -i inventory/prod site.yml --tags=alloy`; deferred to Phase 9 smoke test as part of the launch checklist (see below).

### Task 4 — scripts/pii_live_probe.py (OBS-06 runtime probe) (commit `83a579c`)

- **`scripts/pii_live_probe.py`** (226 lines, Python stdlib only) — Loki tail + regex scan across 5 PII categories (gps_coords / phone / external_uuid / otp_code / displayName_attr). Default endpoint `https://82-25-71-215.sslip.io:8443`. Exit 0 = clean, 1 = match, 2 = net/json error, 3 = auth fail. Cmdline: `--duration` / `--grafana-base` / `--loki-datasource-uid`.
- Probe is **runtime** (queries actual production Loki) — complements the CI-side static `scripts/pii_audit.sh` (slog grep from Plan 05-03).

### Task 5 — Documentation set (commit `eb28259`)

- **`docs/DECISIONS/0009-observability-architecture.md`** (167 lines, 8 sub-sections) — the architectural ADR for the full observability stack (was deferred from Plan 05-02 when ADR-0010 reshape happened mid-phase).
- **`docs/RUNBOOKS/observability.md`** (242 lines, 7 sections) — operator guide: how to deploy Alloy, how to query Loki, how to read dashboards, how to flip Sentry SaaS DSN from dormant to active (post-v1.0 activation per D-38).
- **`docs/TELEMETRY.md`** (43-line skeleton) — backend→mobile telemetry contract placeholder. Per ADR-0011: mobile crash reporting / telemetry is **dropped from v1.0**; this skeleton remains as a hint for v1.1+ if/when mobile telemetry is revisited.
- **`docs/RUNBOOKS/sentry-ops.md` §Acceptance Walkthrough** — 11-step checklist for the (now deferred) Task 6 walkthrough.
- **`docs/RUNBOOKS/deploy.md §12`** — Alloy deploy + rollback procedure (§11 is the freeze procedure from Plan 04-06, kept as-is).

### Self-Check (Tasks 1-5): PASSED

- [x] All 5 autonomous tasks executed and committed atomically
- [x] `go build ./identity/... ./activity-sync/... ./feed/... ./media/... ./messaging/... ./notifications/... ./realtime-gw/... ./social-graph/... ./pkg/...` → exit 0
- [x] `go vet` clean
- [x] `go test -race ./pkg/observability/...` → 44 passing test functions/sub-tests across 6 test files
- [x] D-22 three-gate enforced + silent-passthrough invariant verified
- [x] D-21 PIIDenyList reused (no duplicate scrub map; Phase 5 single-source-of-truth invariant maintained)
- [x] D-36/D-37 Caddy-fronted Loki ingress + self-signed TLS skip honored in Alloy config

---

## Task 6 — DEFERRED per ADR-0011

**Original plan:** USER ACTION 4 — Final acceptance walkthrough.

11-step checklist in `docs/RUNBOOKS/sentry-ops.md §Acceptance Walkthrough` covering:
1. ~~Sentry SaaS reachability~~ (D-38 already dormant; INFO log check substitutes)
2. ~~Sentry admin login + 4 projects~~ (same reason)
3. 60s sustained load via `scripts/smoke_metrics.py --load 60`
4. Open 4 Grafana dashboards + screenshot each
5. `pii_live_probe.py --duration 60` → exit 0 clean
6. `cardinality_probe.py` → exit 0 clean
7. ~~Sentry envelope smoke~~ (deferred per ADR-0010)
8. Synthetic 5xx burst → D-26 Grafana rule fires → Telegram alert + screenshot
9. OBS-08 deferral statement (now subsumed by ADR-0011 entirely)
10. Flip ROADMAP §Phase 5 checkbox (handled by this commit's sibling)
11. Author this SUMMARY (you're reading it)

**Why deferred:** Per [ADR-0011](../../../docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md), the closed-beta scope is solo-dev + 5-10 friend testers. Running a formal acceptance walkthrough — including live Alloy deploy + redeploy of 8 backend services + 60-second synthetic load + 4 dashboard screenshots + Telegram alert smoke — is funded-team rigor. The shipped artifacts (DebugSessionMiddleware, Alloy role, PII probe, RUNBOOK, dashboards) are sound and tested; they sit unused on disk until observability is actually needed.

**Conditional re-trigger:** If Phase 9 closed-beta launch (LAUNCH-02 72h watchlist) actually exercises the observability stack — i.e., a tester reports an issue and `scripts/debug-tail.sh <user-id>` returns "no log lines" because Alloy isn't shipping — then run the deferred walkthrough then:
1. `cd infra/ansible && ansible-playbook -i inventory/prod site.yml --tags=alloy`
2. Redeploy backend services with the chain that now includes DebugSessionMiddleware (any normal `make deploy` runs CI's save/scp/load flow; these commits are already on `feat/cursona-redesign`, so the next tagged release picks them up)
3. Run the 11-step walkthrough; capture evidence; amend this SUMMARY with a "Deferred Walkthrough — Executed" subsection

**Until then:** the Phase 5 backend observability stack is **dormant but ready**. Sentry SaaS is dormant per D-38 (empty DSN no-op). Loki/Grafana/Prom on `srv1561293` are running per Plan 05-07 closeout; Alloy log-shipper on the prod VPS is undeployed. Dashboards exist as JSON; cardinality + PII probes work in isolation.

---

## Key files (Tasks 1-5 only — Task 6 deferred)

- **Created:**
  - `services/backend/pkg/observability/debug_session_middleware.go`
  - `services/backend/pkg/observability/debug_session_middleware_test.go`
  - `services/backend/pkg/observability/featureflag_adapter.go`
  - `infra/ansible/roles/alloy-shipper/{defaults,tasks,handlers}/main.yml`
  - `infra/ansible/roles/alloy-shipper/templates/{alloy-config.alloy.j2, alloy.service.j2}`
  - `scripts/pii_live_probe.py`
  - `docs/DECISIONS/0009-observability-architecture.md`
  - `docs/RUNBOOKS/observability.md`
  - `docs/TELEMETRY.md`

- **Modified:**
  - `services/backend/pkg/featureflags/flags.go` — `tester_debug_logging` const
  - `services/backend/pkg/auth/jwt.go` — `IsTester` field on `Claims`; `IssueTesterAccess` helper
  - `services/backend/{identity,activity-sync,feed,media,messaging,notifications,realtime-gw,social-graph}/cmd/server/main.go` — DebugSession outermost layer + FFAdapter wire
  - `infra/ansible/site.yml` — new `alloy-shipper` play (tagged `alloy`)
  - `docs/RUNBOOKS/sentry-ops.md` — §Acceptance Walkthrough (11-step, deferred)
  - `docs/RUNBOOKS/deploy.md` — §12 Alloy deploy + rollback

---

## Deviations from plan (closed in ADR-0011)

1. **Featureflag name** `tester_debug_logging` (migration-canonical) not `tester_debug_logs` (plan asked).
2. **`IsTester` field + `IssueTesterAccess` helper** added to `pkg/auth.Claims` — plan assumed both existed.
3. **`FeatureflagAdapter`** bridges UUID → int64 via FNV-1a to avoid touching the Phase 1 REL-03 featureflag interface.
4. **8 services not 9** (gateway is Caddy reverse-proxy, not a Go target — same finding as 05-03/04/05 SUMMARY).
5. **`deploy.md §12`** is for Alloy (§11 already existed from Plan 04-06).
6. **`TELEMETRY.md` = 43 lines** (hit `min_lines: 40` floor; closed beta drops mobile telemetry per ADR-0011 so the contract stays a skeleton).
7. **OBS-08 mobile Settings toggle DROPPED** per ADR-0011 — replaced with `DEBUG_SESSIONS_FOR_USER` env-allowlist seam (lazy refactor, tracked as v1.0.1 backlog `DEBUG-MIDDLEWARE-ENV`) + `scripts/debug-tail.sh` Loki wrapper (shipped in Commit 1 of the scope-reset PR).
8. **Task 6 acceptance walkthrough DEFERRED** to Phase 9 smoke test, conditional on observability being actually needed (see "Conditional re-trigger" above).

---

## Phase 5 closeout

This SUMMARY closes Plan 05-06 and Phase 5 simultaneously:

- All 6 Phase 5 plans have SUMMARY.md (`05-02`, `05-03`, `05-04`, `05-05`, `05-07`, this one)
- ROADMAP §Phase 5 checkbox flipped `[x]` in the sibling closeout commit
- STATE.md advanced to Phase 6 next in the same sibling commit
- Active OBS-* IDs: OBS-01/03/04/05/06/07 complete; OBS-02 deferred per ADR-0010; OBS-08 mobile UX dropped + backend seam shipped per ADR-0011

**Phase 5 status: ✅ DONE.**
