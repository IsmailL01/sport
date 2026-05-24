# Phase 5 — Plan Check Report 2 (Re-Check After Revision)

**Checked:** 2026-05-19
**Plans verified:** 7 (05-01 through 05-07) across 4 waves
**Prior report:** `05-PLAN-CHECK.md` (4 BLOCKERs + 6 HIGH + 4 MEDIUM + 4 LOW)
**Scope of this re-check:** Verify B1/B2/B3/B4 closure + DAG consistency + no new BLOCKERs introduced

---

## 1. Verdict

**PASS-WITH-NITS** — All 4 prior BLOCKERs are closed by Plan 05-07's revision; the dependency DAG is acyclic and wave-numbers are internally consistent. Three carry-forward NITs remain (one L3 explicitly addressed by 05-07; H1 + H5 still open by deferral, not silent drop). No new BLOCKERs introduced. Plans are ready for execution.

---

## 2. Closure Status of Prior BLOCKERs

| BLOCKER | Closed by | Task / Mechanism | Status |
|---------|-----------|------------------|--------|
| **B1** — No plan deploys Loki + Grafana + Prometheus on sentry VPS | 05-07 Task 1 | `infra/ansible/roles/observability-stack/` with docker-compose.yml.j2 (grafana/loki:3.2.0 + prom/prometheus:v2.55.0 + grafana/grafana:11.3.0 all bound to 127.0.0.1) + `observability-stack.service` systemd unit + provisioning configs + dashboard sync from `services/backend/observability/dashboards/` → `/etc/grafana/provisioning/dashboards/`; site.yml gets a 4th play; 3 smoke probes (tasks 10-12) gate first-run | **CLOSED** |
| **B2** — UFW rule `allow 3100/tcp from <prod-vps-ip>/32` never created | 05-07 Task 2 (path b — Caddy-level allowlist) | Caddy `@allowed_loki { remote_ip {{ loki_push_allowed_source }} }` matcher returns 403 for any source other than prod VPS; net security posture identical to UFW rule; D-28 OS-level rule superseded; deviation documented in 05-07-SUMMARY's "For Phase 5 closeout" handoff note (CONTEXT.md D-28 text updated at SUMMARY-time, not during plan execution) | **CLOSED** |
| **B3** — 05-06 Loki push URL contradiction (:3100 vs Caddy :443) | 05-07 Task 2 (Caddy handler) + 05-07-SUMMARY handoff note | 05-07 adds `handle_path /loki/* { reverse_proxy 127.0.0.1:3100 }` block to 05-01's `caddy.j2` — the Caddy-fronted :443 path now exists; 05-06's `loki.write` URL `https://{{ sentry_caddy_host }}/loki/api/v1/push` (no :3100) resolves correctly; 05-07-SUMMARY `<output>` block explicitly instructs 05-06 executor: "Alloy `loki.write` URL stays `https://{{ sentry_caddy_host }}/loki/api/v1/push` (NO :3100 port — Caddy handler in 05-07 owns it)"; 05-06 must_haves.truth #3 + key_links text drifts from reality, but the handoff note is unambiguous | **CLOSED** (with a HIGH-severity nit — see §4 H7 below) |
| **B4** — D-26 alert rule set never codified | 05-07 Task 3 (Grafana) + 05-07 Task 4 (Sentry) | Task 3 ships 3 Jinja2 templates: `grafana-alerting-contact-points.yml.j2` (Telegram contact point with SOPS-decrypted token), `grafana-alerting-rules.yml.j2` (6 PromQL rules: `5xx_rate_over_5pct`, `jwt_validation_failure_spike`, `nats_consumer_lag_gt_1000`, `http_p99_over_2x_baseline`, `db_p99_over_500ms`, `external_api_error_rate_over_10pct`), `grafana-alerting-silences.yml.j2` (night-mute-msk 21:00-04:00 UTC = 00:00-07:00 MSK); routing policy mutes `severity=warning` during that window. Task 4 codifies 2 Sentry alert rules via `sentry-cli alerts create` (`new-issue-immediate` + `issue-affecting-100-users-1h`) and deprecates 05-02 Task 3.10 smoke rule | **CLOSED** |

---

## 3. Wave-Graph DAG Check

| Plan | Wave | depends_on | Implied wave (max(deps)+1) | Consistent? |
|------|------|------------|----------------------------|-------------|
| 05-01 | 1 | `[]` | 1 | ✓ |
| 05-02 | 2 | `[05-01]` | 2 | ✓ |
| 05-03 | 2 | `[05-01]` | 2 | ✓ |
| 05-07 | 2 | `[05-01]` | 2 | ✓ |
| 05-04 | 3 | `[05-03, 05-07]` | 3 | ✓ |
| 05-05 | 3 | `[05-02, 05-03]` | 3 | ✓ |
| 05-06 | 4 | `[05-04, 05-05, 05-07]` | 4 | ✓ |

**Cycle check:** DFS from each node terminates without revisiting; no back-edges. **No cycle.**

**Wave-2 sibling sequence concern (raised in spec):** 05-07 Task 3 + Task 4 read `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `SENTRY_AUTH_TOKEN` from `.secrets/prod/sentry.yaml` — slot populated by 05-02. 05-07's frontmatter declares `depends_on: [05-01]` only, but the SOPS slot dependency is real. Plan 05-07 `<objective>` block addresses this explicitly: "Both plans tolerate either order via Ansible `delegate_to: localhost` SOPS-decrypt with `ignore_errors: true` on first run — Task 1's smoke probe is the only blocking gate, and it runs after the SOPS slot is populated." Combined with 05-07 Task 1 step 2 (`ignore_errors: true + when: lookup(...) != ''`), this is acceptable Wave-2 parallel-with-sequence-via-SOPS-write-order — NOT a missing depends_on edge. PASS.

**DAG result:** valid acyclic, internally consistent.

---

## 4. New Issues (Introduced by Revision)

### HIGH

**H7. [task_completeness] 05-06 must_haves still text-references `https://sentry.<sentry-ip>.sslip.io:3100/loki/api/v1/push` (port 3100) while 05-07 Task 2's actual Caddy edit drops the port.**
- 05-06 frontmatter `must_haves.truths[2]`: "Alloy shipper… ships Docker container stdout to https://sentry.<sentry-ip>.sslip.io**:3100**/loki/api/v1/push (port 3100 UFW-restricted…)"
- 05-06 `key_links[1].via`: "loki.write.sentry_vps endpoint posts to https://{{ sentry_caddy_host }}**:3100**/loki/api/v1/push"
- 05-06's own `<objective>` block also says "Loki on sentry VPS at port 3100 (UFW-restricted)"
- 05-07-SUMMARY handoff note instructs the 05-06 executor to use `https://{{ sentry_caddy_host }}/loki/api/v1/push` (no :3100). 05-06's `depends_on: [..., 05-07]` and the inline comment "see 05-07-SUMMARY.md" carry the correction, but the executor must read the SUMMARY before reading 05-06's frontmatter to avoid acting on the stale text.
- **Disposition:** WARNING — execution can proceed because (a) the depends_on edge forces 05-07 SUMMARY to exist before 05-06 runs, (b) the comment on the depends_on line explicitly points to 05-07-SUMMARY, (c) 05-06 `<objective>` will be reread by the executor. The drift is documented, not silent.
- **Fix recommendation:** During 05-06 execution, the executor edits must_haves.truths[2] + key_links[1].via to drop `:3100` before running the Ansible play. Capture in 05-06-SUMMARY as a corrective edit. Alternatively, a one-line revision to 05-06-PLAN.md frontmatter now would eliminate the drift. Either path is acceptable.

### LOW

**L5. [scope_sanity] 05-07 has 6 tasks (Task 1 through Task 6).** Threshold review:
- Tasks: 6 (threshold: warning at 4, blocker at 5+)
- Files modified: 19 (12 NEW Ansible role files + 1 EDIT caddy.j2 + 1 MODIFY site.yml + 2 SOPS slots + 2 new Python scripts + 1 docs append)
- Line count: 885 (largest plan in phase, exceeds the prior champion 05-06 @ 660)
- Justification for acceptance: 05-07 was authored as a single revision-plan to close all 4 BLOCKERs cohesively; splitting it would mean inserting an additional wave or shuffling existing depends_on. The trade-off is acceptable given the revision context, but execution should anticipate ~3 hours of focused work.
- **Disposition:** LOW (info only — borderline scope, accepted in context).

**L6. [verification_derivation] 05-07 Task 4 step 17 ("Deprecate 05-02 smoke webhook rule") uses fuzzy matching — `sentry-cli` is queried for rule named `smoke-webhook` OR `An event is seen` (the 05-02 Task 3.10 wording is not strictly normative).** If the operator's 05-02 execution used a different rule name, the deprecation step is a no-op. Mitigation: the 2 new rules cover both immediate + batch paths, so even if the smoke rule lingers it's redundant, not harmful.

---

## 5. Carry-Forward NITs from 05-PLAN-CHECK.md (Status)

| ID | Title | Status in this revision |
|----|-------|------------------------|
| **H1** | 05-06 Task 1 PreAuthPath test name missing from contract regex | OPEN — 05-06 not revised; intentional deferral (B1-B4 were the revision scope) |
| **H2** | 05-04 dashboards not mounted in Grafana provisioning | **CLOSED** — 05-07 Task 1 grafana_provisioning.yml synchronize task copies dashboards from `services/backend/observability/dashboards/` → role files → `/etc/grafana/provisioning/dashboards/` |
| **H3** | 05-02 2-pass SENTRY_AUTH_TOKEN procedure not in must_haves | OPEN — 05-02 not revised; deferred |
| **H4** | 05-02 alerter `sendTelegram` test-override idiom under-specified | OPEN — 05-02 not revised; deferred |
| **H5** | 05-05 OnStart-only span scrub; OnEnd parity not addressed | OPEN — 05-05 not revised; deferred (recorded as known limitation in 05-05 Task 1 TODO) |
| **H6** | 05-03 pii_audit.sh allowlist by exact-message-string is brittle | OPEN — 05-03 not revised; deferred |
| **M1** | 05-06 Task 5 doc-authoring scope risk | OPEN — 05-06 not revised; deferred |
| **M2** | 05-04 dashboard JSON validation = `python3 -m json.tool` only | OPEN — 05-04 not revised; deferred |
| **M3** | 05-01 ufw_allowed_tcp_public = [443] (closes port 80 — ACME HTTP-01 fallback) | OPEN — 05-01 not revised; deferred (ZeroSSL fallback per RESEARCH §P19 covers this) |
| **M4** | 05-06 pii_live_probe.py regex false-positive risk on standalone floats | OPEN — 05-06 not revised; deferred |
| **L1** | 05-05 sentryhttp `Repanic:false` undocumented | OPEN — 05-05 not revised; deferred |
| **L2** | 05-02 admin password generator shell-escape concern | OPEN — 05-02 not revised; deferred |
| **L3** | 05-01 caddy.j2 invalid bcrypt placeholder | **CLOSED** — 05-07 Task 2 replaces `"$2a$14$placeholder.replace.in.plan.05.06"` with `{{ sentry_secrets_sentry.GRAFANA_ADMIN_PASSWORD_BCRYPT }}` rendered from a real htpasswd-generated hash (Task 1 ships the SOPS slot + offline-prep procedure) |
| **L4** | 05-03 EmailHashKeys overkill | OPEN — 05-03 not revised; deferred |

**Summary:** 2 carry-forward NITs CLOSED (H2 + L3); 12 OPEN (intentional deferral — revision scope was strictly B1-B4). No NIT was inadvertently dropped or made worse.

---

## 6. Acceptance Checks on the Revision Plan (05-07)

| Check | Required | Found | Result |
|-------|----------|-------|--------|
| 05-07 EDITS (not creates) 05-01's caddy.j2 | YES | `files_modified` lists `infra/ansible/roles/sentry-prep/templates/caddy.j2` (05-01 path); Task 2 `<action>` literally says "EDIT (not rewrite)" with "Edit 1" / "Edit 2" / "Edit 3" delineations | ✓ |
| 05-07 preserves 05-01 vhost structure | YES | Task 2 explicitly states "Place these blocks ABOVE the existing `reverse_proxy 127.0.0.1:8080` line" and "The placeholder 502 fallback (`@sentry_down`) stays as-is" | ✓ |
| 05-07 fills placeholder bcrypt from SOPS | YES | Task 2 Edit 2 replaces `"$2a$14$placeholder.replace.in.plan.05.06"` with `{{ sentry_secrets_sentry.GRAFANA_ADMIN_PASSWORD_BCRYPT }}`; Task 1 ships the SOPS slot + offline `htpasswd -bnBC 14` procedure | ✓ |
| 05-07 references `loki_push_allowed_source` (declared in 05-01 group_vars/sentry.yml) | YES | Task 2 `<read_first>` calls out the variable + uses it in the Caddy matcher: `@allowed_loki remote_ip {{ loki_push_allowed_source }}` — single source of truth maintained | ✓ |
| 05-04 dashboard paths consistent with 05-07 mount path | YES | 05-04 `files_modified` ships `services/backend/observability/dashboards/{backend-overview,nats-jetstream,db-performance}.json`; 05-07 grafana_provisioning.yml synchronize task `src=../../../services/backend/observability/dashboards/` matches; copy task targets `/etc/grafana/provisioning/dashboards/` | ✓ |
| 05-07 contains STRIDE table + Trust Boundaries | YES | `<threat_model>` block has 8-row Trust Boundaries table + 12-row STRIDE register (T-05-07-S1 through T-05-07-E2); schema matches 05-05/05-06 (CSV columns: Threat ID / Category / Component / Disposition / Mitigation Plan) | ✓ |
| D-28 wording deviation documented | YES | 05-07 Task 6 §observability-stack §7 "D-28 wording update (CONTEXT closeout note)"; 05-07 `<objective>` block "(net security posture identical; CONTEXT closeout flags D-28 wording update)"; 05-07-SUMMARY handoff note "For Phase 5 closeout: D-28 text in 05-CONTEXT.md should be updated…" | ✓ |
| Grafana auto-provisioning from dashboards dir | YES | Task 1 grafana_provisioning.yml step 3 renders `provider.yml` pointing Grafana at `/etc/grafana/provisioning/dashboards/`; Grafana auto-loads on container start via standard provisioning path | ✓ |
| Dashboard JSON list complete | PARTIAL | 05-07 must_haves.truths[4] lists "4 dashboards (backend-overview + nats-jetstream + db-performance + jwt-validation)"; 05-04 frontmatter ships only 3 JSONs (`backend-overview.json`, `nats-jetstream.json`, `db-performance.json`) — `jwt-validation.json` is NOT in 05-04's `files_modified`. **MINOR DRIFT — see L7 below.** | ⚠ |

### LOW (additional)

**L7. [task_completeness] 05-07 must_haves references a 4th dashboard `jwt-validation` that 05-04 does not ship.**
- 05-07 truths #4: "Grafana provisioning loads 4 dashboards (backend-overview + nats-jetstream + db-performance + jwt-validation)"
- 05-04 ships 3 JSONs: `backend-overview.json` (which DOES include a JWT-failures panel per its truths: "Grafana dashboard JSON with 4 panels: P99 latency, error rate, JWT failures, throughput"), `nats-jetstream.json`, `db-performance.json`
- The JWT-failures panel is folded INTO `backend-overview.json` (panel-level, not a separate dashboard file) — so the count drift is cosmetic, not functional. 05-07's synchronize task will copy whatever dashboards exist; if `jwt-validation.json` doesn't exist, Grafana just shows 3 dashboards with JWT failures embedded in backend-overview.
- **Disposition:** LOW (cosmetic drift; verify with executor that "4 dashboards" should be "3 dashboards + JWT panel in backend-overview" — or split JWT panel into its own dashboard during 05-04 execution).
- **Fix:** Either (a) 05-04 executor splits JWT-failures panel into `jwt-validation.json`, OR (b) 05-07 truths #4 updated to "3 dashboards (backend-overview with JWT panel + nats-jetstream + db-performance)". Pick one at execution time.

---

## 7. Recommendation

**PROCEED-TO-EXECUTION** with 4 LOW/HIGH advisory notes for the executor:

1. **H7 (executor action):** During 05-06 execution, drop the `:3100` literal from must_haves.truths[2] + key_links[1].via before running the Ansible play; record correction in 05-06-SUMMARY. (Alternative: revise 05-06-PLAN.md frontmatter now — one-line edit.)
2. **L5 (info):** 05-07 has 6 tasks / 19 files / 885 lines — anticipate ~3-hour focused execution; consider stretching across 2 sessions if context fatigue emerges.
3. **L6 (info):** 05-07 Task 4 step 17 (deprecate 05-02 smoke rule) is fuzzy-match; if 05-02 used a different rule name, the deprecation is a no-op (harmless — new rules supersede regardless).
4. **L7 (executor action):** Decide at execution time whether to (a) split JWT panel into `jwt-validation.json` in 05-04 OR (b) update 05-07 truths #4 to "3 dashboards"; either path is functionally equivalent.

No new BLOCKERs. All 4 prior BLOCKERs verifiably closed. 12 carry-forward NITs intentionally deferred (revision scope was strictly B1-B4); none silently dropped.

**Phase 5 plans are ready for `/gsd-execute-phase 5`.**

---

*Report generated by `/gsd-plan-check` (re-check pass) against 7 plans + CONTEXT + RESEARCH + VALIDATION + PATTERNS + prior 05-PLAN-CHECK. Total review ≤400 lines per orchestrator contract.*
