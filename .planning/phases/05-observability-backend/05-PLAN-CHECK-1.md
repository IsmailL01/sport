# Phase 5 — Plan Check Report

**Checked:** 2026-05-19
**Plans verified:** 6 (05-01 through 05-06) across 4 waves
**Phase goal:** Backend services produce structured JSON logs + Prom metrics + OTLP traces; Sentry self-hosted on separate VPS; PII never appears; alerts to Telegram.

---

## 1. Verdict

**FAIL** — One BLOCKING gap (no plan deploys Loki / Grafana / Prometheus to the sentry VPS; criteria 4 + the Alloy→Loki shipping leg cannot succeed) and one BLOCKING contradiction (3100 UFW rule is "deferred to 05-06" but 05-06 never adds it). Phase 5 cannot deliver success criteria 4, 5 (runtime sample), or 8 as written. Revision required before execution.

---

## 2. Goal-Backward Coverage (8 ROADMAP success criteria)

| # | Criterion | Delivering plan(s) | Gating acceptance criteria | Status |
|---|-----------|--------------------|----------------------------|--------|
| 1 | Sentry self-hosted on separate VPS @ `sentry.<sentry-ip>.sslip.io` with own ACME cert | 05-01 (VPS + Caddy + ACME), 05-02 (install.sh + admin + 4 projects) | 05-01 Task 3 curl smoke + cert issuer check; 05-02 Task 3 admin login + smoke_sentry.py | ✓ |
| 2 | 4 Sentry projects scoped: staging-mobile / prod-mobile / staging-backend / prod-backend | 05-02 (sentry-cli loop creates all 4) | 05-02 Task 3 step 3.7 `sentry-cli projects list` + step 3.8 DSN extraction → SOPS | ✓ |
| 3 | Structured JSON logs (slog); OTP codes never logged in prod | 05-03 (slog_handler + D-13 OTP fix + 9 services wired) | 05-03 Task 2 TDD tests + Task 3 grep self-check | ✓ |
| 4 | Prom `/metrics` per service + 4 Grafana dashboards (P99 / error-rate / queue-depth / JWT-failures) | 05-04 ships `/metrics` + dashboard JSONs; **NO PLAN deploys Grafana / Prometheus to sentry VPS** | 05-04 Task 3 dashboard JSON existence; 05-06 Task 6 step 4 manual screenshot | ✗ |
| 5 | No GPS / phone / displayName / DM / external_uuid in logs (CI grep + runtime sample) | 05-03 (CI grep via pii_audit.sh) + 05-06 (pii_live_probe.py runtime); **runtime probe target Loki not deployed** | 05-03 Task 3 CI gate; 05-06 Task 4 + Task 6 step 5 | ✗ |
| 6 | Cardinality budget — no per-user_id labels; bucketed cohorts | 05-04 (cardinality_probe.py + descriptor-level test in metrics_test.go + CI gate) | 05-04 Task 1 TDD `TestHTTPRequestDuration_LabelKeys` + Task 3 CI cardinality-probe job | ✓ |
| 7 | Tester-mode debug logging opt-in per session (backend seam only; mobile UX = Phase 17) | 05-06 (DebugSessionMiddleware + tester_debug_logs featureflag + 3-gate enforcement) | 05-06 Task 1 TDD 5 tests + Task 2 9-service wire + 05-06 SUMMARY flags Phase 17 split | ✓ |
| 8 | Alert rules wired to Telegram bot webhook (not PagerDuty per D-24) | 05-02 (alerter Go service + USER ACTION 3 Telegram alert smoke); **alert rule beyond manual Task 3.10 is incomplete** | 05-02 Task 3 step 3.10/3.11 (manual one-rule setup); D-26 critical/warning thresholds NOT codified | ⚠ |

---

## 3. OBS-* Requirement Coverage

| Req | Plans claiming it (frontmatter) | Tasks delivering | Status |
|-----|--------------------------------|------------------|--------|
| OBS-01 | 05-01, 05-02, 05-05 | 05-01 T0-T3 (VPS + Caddy + UFW), 05-02 T1-T4 (install + projects + alerter), 05-05 T2-T3 (sentry-go SDK production use) | ✓ |
| OBS-02 | 05-02 | 05-02 T3 step 3.7 sentry-cli loop + step 3.8 DSN→SOPS | ✓ |
| OBS-03 | 05-03 | 05-03 T1 (slog_handler + tests) + T3 (9-service wire) | ✓ |
| OBS-04 | 05-03 | 05-03 T2 (D-13 OTP fix + 3 TDD tests) | ✓ |
| OBS-05 | 05-04 | 05-04 T1 (metrics.go + promhttp middleware) + T2 (9-service /metrics wire) + T3 (3 dashboard JSONs) | ⚠ (dashboards exist as JSON, but Grafana on sentry VPS never deployed → criterion 4 manual step in 05-06 Task 6 step 4 has no Grafana to open) |
| OBS-06 | 05-03, 05-05, 05-06 | 05-03 T1 (PIIDenyList drop in slog) + 05-05 T1 (PIIDenyList drop in OTel span) + 05-06 T4 (pii_live_probe.py runtime) | ⚠ (runtime probe queries Loki via Grafana; both undeployed) |
| OBS-07 | 05-04 | 05-04 T1 (descriptor-level test) + T2 (cardinality_probe.py) + T3 (CI gate) | ✓ |
| OBS-08 | 05-06 | 05-06 T1 (DebugSessionMiddleware + 3-gate test matrix) + T2 (9-service wire) + closeout flags Phase 17 split | ✓ |

All 8 OBS-* IDs appear in some plan's `requirements:` frontmatter. OBS-05 + OBS-06 ship code/scripts but the infrastructure they observe (Grafana + Loki) is never stood up.

---

## 4. Issues Found

### BLOCKER (must fix before execution)

**B1. [requirement_coverage] No plan deploys Loki + Grafana + Prometheus on the sentry VPS.**
- Plan 05-02 installs only `getsentry/self-hosted@26.5.0`, whose bundled compose ships kafka/postgres/clickhouse/redis/snuba/symbolicator — **NOT Loki, NOT Grafana, NOT external Prometheus**. CONTEXT.md `<code_context>` line 327-329 lists `loki.yml` + `grafana-datasources.yml` + `prometheus.yml` as Phase-0 dev artifacts in `services/backend/observability/`, but no Phase 5 task lifts them to the sentry VPS.
- Downstream consequences:
  - 05-04 Task 3 done-clause says "Plan 05-06 will auto-provision the dashboards onto sentry VPS Grafana" — 05-06 has zero Grafana install tasks.
  - 05-04 Task 2 step 2.2 ships `prometheus.yml.j2` and says "Plan 05-06's Ansible role renders this for the sentry VPS" — 05-06 only ships `alloy-shipper`, no `prometheus-stack` role.
  - 05-06 must_haves.truth #3 says Alloy ships to "https://sentry.<sentry-ip>.sslip.io:3100/loki/api/v1/push" but no Loki listens there.
  - 05-06 Task 6 step 4 (acceptance walkthrough) asks user to open `https://grafana.<sentry-ip>.sslip.io` — Caddy serves this hostname with basicauth per Plan 05-01 caddy.j2, but reverse-proxies to `127.0.0.1:3000` which has no process.
  - ROADMAP success criteria 4 ("Grafana dashboards render"), 5 (runtime PII sample via Loki), and Plan 05-06's own pii_live_probe + manual screenshot tasks cannot succeed.
- **Fix:** Add a new plan (or extend 05-02) with an `observability-stack` Ansible role that brings up Loki + Grafana + Prometheus as a docker-compose stack on the sentry VPS — separate `observability-stack.service` systemd unit. Provision Grafana basicauth password into the SOPS sentry.yaml slot. Auto-provision dashboards from `services/backend/observability/dashboards/*.json` via Grafana provisioning sidecar. Render `prometheus.yml.j2` into the stack's mount. Re-target 05-06 Task 6 step 4 against the real Grafana.

**B2. [dependency_correctness] UFW rule `allow 3100/tcp from <prod-vps-ip>/32` is never created by any plan.**
- D-28 + ROADMAP "isolation non-negotiable" + 05-VALIDATION.md row "Sentry VPS UFW: 443 public, 22 rate-limited, **3100 prod-VPS-only**" all require this rule.
- 05-01 Task 3 verify-block explicitly states: "for now — Plan 05-06 adds Loki when it ships Alloy — NO 3100/tcp rule (3100 Loki rule lands when Plan 05-06's Loki container is brought up; record this as deferred OK in sentry-ops.md)."
- 05-06 deploys Alloy on the **prod** VPS, not the sentry VPS — the sentry VPS UFW config is never touched again after 05-01.
- 05-06 must_haves and threat-model both assume the rule exists; no task creates it.
- Same blocking gap as B1 (Loki not deployed) — the receiver port is closed AND the listener is missing. The 3100 UFW rule is unsafe to add until Loki binds it, but Loki is never deployed.
- **Fix:** Couple with B1. The new observability-stack role must (a) deploy Loki listening on internal docker network or 127.0.0.1:3100, (b) add UFW rule for 3100 from `loki_push_allowed_source` (group_vars/sentry.yml already declares this var per 05-01 Task 1), (c) verify via `ssh deploy@<sentry-ip> 'sudo ufw status' | grep 3100`. OR: keep Loki behind Caddy on 443 with allowlist enforced by Caddy `@allowed_loki` matcher — then 3100 UFW rule is unnecessary and D-28 must be revised. Pick one path; eliminate the contradiction.

**B3. [task_completeness] 05-06 Task 3 contradicts itself on Loki push URL (port 3100 vs Caddy :443).**
- 05-06 must_haves.truth #3: pushes to `https://sentry.<sentry-ip>.sslip.io:3100/loki/api/v1/push`.
- 05-06 key_links: same — port 3100 explicit.
- 05-06 Task 3 action `loki.write` template: `https://{{ sentry_caddy_host }}/loki/api/v1/push` (no port = 443 via Caddy).
- 05-06 Task 3 action note: "If Caddy reverse-proxies, we use 443 to the public Caddy and Caddy routes /loki/* to the internal :3100… Default to the Caddy-fronted :443 path."
- Plan 05-01 caddy.j2 has NO `/loki/*` reverse_proxy handler on either sentry-host or grafana-host vhosts — the Caddy-fronted path doesn't exist either.
- Executor cannot resolve "use 3100 directly" vs "use Caddy" without further decision; if it picks Caddy, must also extend 05-01's caddy.j2 (out of scope at execution time).
- **Fix:** Pick one path. Recommend Caddy-fronted :443 (single TLS terminus, no extra UFW rule) and ADD a `handle_path /loki/* { reverse_proxy 127.0.0.1:3100 }` block to 05-01's caddy.j2 (this requires editing 05-01 OR doing it in the new observability-stack plan that owns Loki). Update must_haves.truth #3 and key_links to drop the `:3100` literal.

**B4. [task_completeness] Alert rule scope from D-26 (criticals + warnings, night silencing) is not codified.**
- D-26 enumerates specific alert rules: 5xx >5% over 5m, JWT failure spike >20/min, Sentry P0, NATS lag >1000; warnings with 00:00–07:00 MSK suppression for non-criticals.
- 05-02 Task 3 step 3.10 only configures ONE manual alert in Sentry UI: "An event is seen → Generic Webhook". This is a smoke-test rule, not the D-26 rule set.
- No plan ships YAML/JSON for Sentry alert rules, Grafana alert contact points (Telegram), or the night-silence rule. ROADMAP criterion 8 says "alert rules wired" — singular smoke wire is not the rule set.
- **Fix:** Either (a) add a Task to 05-06 (or new plan) that codifies D-26 rules as `sentry-cli alerts create` invocations + Grafana alert YAML, OR (b) explicitly downgrade D-26 in CONTEXT.md to "Phase 5 ships infrastructure + smoke rule; Phase 5.1 codifies D-26 rule set" and update ROADMAP criterion 8 accordingly. Do not silently treat smoke rule as D-26 satisfaction.

### HIGH (should fix; execution can proceed with risk)

**H1. [task_completeness] 05-06 Task 1 uses TDD type but `<verify>` runs both new test names with one go-test invocation; missing the `TestDebugSessionMiddleware_PreAuthPath` test name in the regex.**
- 05-06 Task 1 behavior contract lists 4 tests + Test 3 PreAuthPath; verify-block regex: `'TestDebugSessionMiddleware|TestFeatureflag_TesterDebugLogs'`. The Task's must_haves.contains says `TestDebugSessionMiddleware_AllThreeTrue`; PATTERNS.md (this plan's source) says the must-have test list includes PreAuthPath but the must_haves.artifacts.contains for `debug_session_middleware_test.go` doesn't include PreAuthPath. Minor — go-test partial-match catches it. Still, missing from contract explicitness.
- **Fix:** Add `TestDebugSessionMiddleware_PreAuthPath` to artifacts.contains + behavior contract done-clause.

**H2. [key_links_planned] 05-04 Task 3 ships dashboard JSONs but neither this plan nor 05-06 mounts them in Grafana provisioning directory.**
- 05-04 Task 3 done: "Plan 05-06 will auto-provision the dashboards onto sentry VPS Grafana." 05-06 has no Grafana provisioning task.
- Fix folded into B1 (new observability-stack plan must include `/etc/grafana/provisioning/dashboards/` mount from `services/backend/observability/dashboards/`).

**H3. [task_completeness] 05-02 Task 3 step 3.4 has chicken-and-egg on SENTRY_AUTH_TOKEN that requires user to detour through Sentry UI, then re-run Ansible, then come back; not a blocker but the runbook (sentry-ops.md §3 in Plan 05-02 Task 4) should explicitly call this out as a 2-pass procedure.**
- 05-02 already mentions the 2-pass nature in step 3.4 prose but the must_haves don't capture "two Ansible passes required" — operator may be surprised mid-execution.
- **Fix:** Add must_haves.truth: "Ansible runs in 2 passes: pass 1 creates admin + leaves projects empty; user creates auth token in UI; pass 2 creates projects."

**H4. [task_completeness] 05-02 Task 2 alerter Go service `sendTelegram` is package-level `var` for testability (per action), but the action prose doesn't define HOW the override happens — test imports the package and re-assigns? PATTERNS.md analog doesn't cover this idiom. Executor will likely default to a test-helper that captures stub calls; works, but spec is loose.**
- **Fix:** Add a one-line example in Task 2 action: `var sendTelegram = realSendTelegram` (where realSendTelegram is the production POST function); tests do `sendTelegram = mockFn; defer func(){ sendTelegram = realSendTelegram }()`.

**H5. [context_compliance] 05-05 Task 1 piiScrubProcessor implements OnStart-time scrub only; explicitly acknowledges "attrs added after OnStart cannot be rewritten post-OnEnd" — this is a known limitation, but D-21 says span-attr scrub mirrors slog deny-list (which is *always* enforced at emit time). Without an OnEnd-side rewriter or a span-attribute audit script, D-21 parity is degraded — attackers/code that calls `span.SetAttributes(attribute.String("phone", ...))` AFTER OnStart will bypass the scrub.**
- 05-05 Task 1 action also references "follow-up TODO comment referencing the limitation for the audit-script extension in Plan 05-06" — but 05-06 doesn't extend pii_audit.sh with span-attribute coverage.
- **Fix:** Either (a) implement OnEnd-side scrub (sdktrace v1.32 OnEnd takes a ReadOnlySpan which doesn't allow attribute rewriting — would need a wrapping SpanExporter that filters at export time; preferable approach), OR (b) extend 05-06 pii_audit.sh to also grep for `span.SetAttributes` calls with deny-list keys (matches D-14 pattern for slog) — and ADD the corresponding task to 05-06 Task 4's must_haves.

**H6. [task_completeness] 05-03 Task 3 pii_audit.sh has an allowlist filter implemented as `grep -v 'identity/internal/service/otp.go.*DebugContext.*otp dev-mode echo'` — this matches by EXACT message string. If a future engineer changes the log message wording, the allowlist breaks silently (audit returns 0 because no match) OR loudly (audit fails). Brittle.**
- **Fix:** Add a code-comment marker pattern: emit `// pii-audit-allow: otp dev-mode echo (D-13)` on the same line as the legitimate slog call; grep allowlist matches the marker rather than the message text.

### MEDIUM

**M1. [scope_sanity] 05-06 has 6 tasks (including 2 checkpoint tasks) — at top of the warning threshold but 4 implementation tasks + 2 checkpoints is workable; the file is 660 lines (largest of any plan in the set).**
- Tasks 1-4 each touch independent files (middleware, ansible role, script, docs); Task 5 alone modifies 5 doc files for ~700+ lines of authored markdown across ADR + 2 runbooks + deploy.md additions + TELEMETRY skeleton.
- Risk: Task 5 doc authoring fatigues context; ADR-0009 quality may degrade.
- **Fix (optional):** Split Task 5 into 5a (ADR + sentry-ops.md) + 5b (observability.md + deploy.md §11/§12 + TELEMETRY.md). Keeps each task ≤ 150 lines authored.

**M2. [verification_derivation] 05-04 Task 3 dashboard JSONs are hand-authored skeletons but Grafana JSON-schema validation in `<verify>` is just `python3 -m json.tool` (parses) — doesn't validate that panels actually reference correct datasource UIDs or that queries are PromQL-syntactically valid.**
- Risk: dashboards parse but produce errors at render time in 05-06 Task 6 step 4.
- **Fix:** Add `promtool check rules` or a Grafana CLI validation step; alternatively accept manual screenshot verification at 05-06 Task 6.

**M3. [context_compliance] 05-01 Task 1 group_vars/sentry.yml sets `ufw_allowed_tcp_public: [443]` — drops 80. Caddy default ACME prefers HTTP-01 (port 80) before TLS-ALPN-01; explicitly closing 80 forces TLS-ALPN-01 which works but is slower to issue on rate-limit edge cases. RESEARCH §P19 warns about rate-limit fallback; closing 80 makes rate-limit recovery harder (can't redirect cleartext for verification).**
- **Fix:** Add port 80 to `ufw_allowed_tcp_public` with a comment that Caddy issues ACME HTTP-01 challenges over 80 then auto-redirects to 443.

**M4. [task_completeness] 05-06 Task 4 pii_live_probe.py regex `"gps_coords": r"\b-?\d{1,3}\.\d{3,}\b"` has high false-positive risk (any float with 3 decimals).**
- The plan acknowledges this ("accept; the slog handler should never put any float into a log message anyway") — but in practice, JSON-serialized request bodies, response durations (1.234), or any business numeric data with 3+ dp will trip the regex.
- **Fix:** Tighten to require a longitude-like pair pattern: `r"\b-?\d{1,3}\.\d{3,}[,\s]+-?\d{1,3}\.\d{3,}\b"` (lat,lon pair) — drops standalone-float false positives.

### LOW / INFO

**L1.** 05-05 sentry_init.go uses `sentryhttp.New(sentryhttp.Options{Repanic: false})` — the action prose doesn't note that `Repanic: false` means the handler chain absorbs the panic; if any downstream middleware relies on panic propagation (e.g., a chain test that expects a panic to bubble), behavior changes. Low risk but worth a one-line doc-comment in sentry_init.go.

**L2.** 05-02 Task 3 step 3.1 generates admin password offline via `tr -dc 'A-Za-z0-9!@#$%' </dev/urandom | head -c 16` — fine for Linux/macOS but the `#` and `%` in the regex on certain shells need escaping. Pass-manager-generated password is safer + matches Phase 2 SEC-02 discipline.

**L3.** 05-01 Task 2 caddy.j2 placeholder block `"$2a$14$placeholder.replace.in.plan.05.06"` is a bcrypt-shaped string but invalid as a hash; Caddy may refuse to start with malformed basicauth. The Caddyfile reload in Task 3 will hide this until Plan 05-06 tries to populate the real hash. Pre-empt by using a valid-shape "no-one-knows-this" placeholder hash (e.g., `htpasswd -bnBC 14 admin disabled` output) so Caddy parses cleanly.

**L4.** 05-03 Task 1 EmailHashKeys is a `map[string]struct{}` with one entry `{"email"}` — overkill for a single-element check. Could be a `const emailKey = "email"` + direct equality. Not a blocker; matches the deny-list helper shape for consistency.

---

## 5. Strengths

1. **Decision traceability is tight** — every plan's action references specific D-XX IDs (D-13 for OTP fix, D-22/§1.8 for three-gate, D-21 for shared deny-list, D-29 for systemd-not-container, etc.). Plan reviewers can audit decisions deterministically.
2. **Version pins are explicit and consistent** — getsentry/self-hosted 26.5.0, sentry-go 0.46.2, OTel 1.32.0 (same minor for all four packages per RESEARCH §4 compatibility note), client_golang 1.20.5, Alloy 1.5.0, sentry-cli 2.40.0 — every plan that uses each dep restates the pin from RESEARCH §4. No version drift between plans.
3. **Promtail → Alloy substitution is correctly threaded** — 05-06 references P20 + P21 explicitly; role name was renamed `promtail-shipper → alloy-shipper`; CONTEXT.md naming carryover is called out in PR body suggestion. No stray `promtail` references in any plan.
4. **TDD discipline on the cross-cutting package** — 05-03 / 05-04 / 05-05 / 05-06 all use `tdd="true"` with explicit RED → GREEN phases. Test names match VALIDATION.md row expectations verbatim.
5. **Single-source-of-truth for PII deny-list** is preserved (D-21) — Plan 05-03 ships `pii_deny_list.go`; Plan 05-05's OTel SpanProcessor imports `PIIDenyList` rather than duplicating; Plan 05-06's `pii_live_probe.py` is the runtime audit.
6. **Threat models are non-trivial** — every plan ships a STRIDE table mapping threat → mitigation; pre-auth path Test 3 (05-06 Task 1) directly enforces the RESEARCH §1.8 debug-DoS mitigation as a regression-resistant test.

---

## 6. Recommendations (ordered next actions)

1. **Author a new plan 05-07 (or extend 05-02 with a 5th task) — `observability-stack` Ansible role** that deploys Loki + Grafana + Prometheus to the sentry VPS as a separate `observability-stack.service` systemd unit + docker-compose. This unblocks B1 + B2 + H2.
2. **Resolve the Caddy-vs-direct-3100 contradiction in 05-06 (B3)** by editing 05-01's caddy.j2 to add `handle_path /loki/* { reverse_proxy 127.0.0.1:3100 }` on the sentry-host vhost; drop the `:3100` literal from 05-06 must_haves/key_links. Reinforce D-28 as a Caddy-level allowlist matcher (`@allowed { remote_ip <prod-vps-ip> }`) or keep it as UFW rule scoped to docker bridge — pick one.
3. **Codify D-26 alert rules (B4)** — add a Task to 05-06 (or new plan) that uses `sentry-cli alerts create` for the 4 critical rules + Grafana alert YAML for the warning batch + a Sentry/Grafana silence-rule for night hours.
4. **Apply H1-H6 quality fixes** during the same revision pass — these are scoped, file-local edits.
5. **Apply M1-M4 if scope budget permits** — M1 (task split) is the highest-impact.
6. **Re-run plan-check after revision.**

---

*Report generated by `/gsd-plan-check` against 6 plans + CONTEXT + RESEARCH + VALIDATION + PATTERNS. Total review ≤500 lines per orchestrator contract.*
