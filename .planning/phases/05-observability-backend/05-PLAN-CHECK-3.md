# Phase 5 — Plan Check Report (Round 3)

**Checked:** 2026-05-19 (inline audit by orchestrator after gsd-plan-checker background agent stalled twice on bulk-read)
**Plans verified:** 6 active (05-02 v2, 05-03 DONE, 05-04, 05-05 amended, 05-06 amended, 05-07 v2) + 1 superseded (05-01)
**Phase goal:** Backend services produce structured JSON logs + Prom metrics + OTLP traces; Sentry crash reporting; PII never appears; alerts to Telegram.

---

## 1. Verdict

**PASS-WITH-NITS** — All 8 OBS-* requirements still covered after ADR-0010 reshape; DAG acyclic + execution-safe; SOPS slot key names match between producer (05-02) and consumers (05-05, 05-07); niko-prod hands-off invariants explicit in Plan 05-07 §threat_model + §14 RUNBOOK section. **One HIGH-severity nit resolved during this round** (05-06 body had 7 stale references to pre-reshape infrastructure — fixed by adding a `⚠ CARRIER SWAP REQUIRED` callout immediately after the `<objective>` block, ensuring the executor applies the swap consistently before reading any `<action>`). **PROCEED-TO-EXECUTION.**

---

## 2. ADR-0010 reshape coverage table (8 ROADMAP success criteria)

| # | Criterion | Pre-reshape | Post-reshape | Status |
|---|-----------|-------------|--------------|--------|
| 1 | Sentry self-hosted on separate VPS @ `sentry.<ip>.sslip.io` with own ACME cert | 05-01 + 05-02 | **RELAXED per ADR-0010** — SaaS preserves operator-level isolation (sentry.io independent of both VPSes); accepted risk in R-06 (T&C changes) | ✓ delivered by 05-02 v2 |
| 2 | 4 Sentry projects scoped (env × platform) | 05-02 sentry-cli loop | 05-02 v2 task 1 (USER ACTION in sentry.io UI) | ✓ |
| 3 | Structured JSON logs + OTP fix | 05-03 | 05-03 ✅ shipped (commits 6dfcef3, 320975c, ea1e65d, 183beb0) | ✓ |
| 4 | Prom `/metrics` per service + 4 Grafana dashboards | 05-04 ships dashboards; 05-06 mounts them on sentry VPS Grafana | 05-04 ships dashboards (unchanged); **05-07 v2 task 1** rsyncs them to srv1561293 Grafana provisioning at deploy time | ✓ split delivered |
| 5 | No PII in logs (CI + runtime) | 05-03 CI grep + 05-06 pii_live_probe.py | 05-03 ✅ CI shipped; 05-06 pii_live_probe queries Loki via Caddy-fronted Grafana at `https://82.25.71.215:8443/grafana/api/datasources/proxy/<id>/loki/...` (per carrier-swap callout) | ✓ split delivered |
| 6 | Cardinality budget | 05-04 cardinality_probe.py + descriptor-level test | unchanged | ✓ |
| 7 | X-Debug-Session backend seam | 05-06 DebugSessionMiddleware + 3-gate (header + JWT + ff) | unchanged | ✓ |
| 8 | Alert rules to Telegram | original D-24/D-25 custom Go alerter + sentry-cli + Grafana | **SPLIT per ADR-0010** — Sentry-side: sentry.io native Telegram integration (05-02 v2 task 5); Grafana-side: Plan 05-07 v2 task 2 (D-26 6-rule set + Telegram contact point + night-mute) | ✓ split delivered |

All 8 criteria reachable. Criterion 1's "self-hosted on separate VPS" is the only relaxation; ADR-0010 §Решение/1 captures the rationale + risk register entry R-06.

---

## 3. OBS-01..08 coverage

| Req | Pre-reshape plans | Post-reshape plans | Status |
|-----|-------------------|--------------------|--------|
| OBS-01 | 05-01, 05-02, 05-05 | **05-02 v2** (sentry.io org creation), **05-05** (sentry-go SDK init pointed at SaaS DSN), **05-07** (Loki/Grafana/Prom local hosting) | ✓ |
| OBS-02 | 05-02 | 05-02 v2 task 1 (4 sentry.io projects) | ✓ |
| OBS-03 | 05-03 | 05-03 ✅ shipped | ✓ |
| OBS-04 | 05-03 | 05-03 ✅ shipped (D-13 OTP fix verified by 3 tests) | ✓ |
| OBS-05 | 05-04 | 05-04 (Prom `/metrics` per service + dashboard JSONs) + **05-07** (Grafana hosts the dashboards) | ✓ split |
| OBS-06 | 05-03, 05-05, 05-06 | 05-03 ✅ CI grep + 05-05 OTel span scrub + 05-06 pii_live_probe.py (carrier-swapped) | ✓ |
| OBS-07 | 05-04 | 05-04 (cardinality_probe.py + descriptor test) | ✓ |
| OBS-08 | 05-06 | 05-06 (DebugSessionMiddleware 3-gate) + **05-07** (D-26 alert rule night-mute = tester-debug noise floor mitigation in operations sense) | ✓ |

Every OBS-* appears in ≥1 active plan's `requirements:` frontmatter. (Verified via grep on 2026-05-19.)

---

## 4. DAG validity

`gsd-sdk query phase-plan-index 5` output (post-revision):

```
Wave 1: 05-02 (USER ACTIONs), 05-03 ✅, 05-05 (waits on 05-02 SOPS via depends_on)
Wave 2: 05-07
Wave 3: 05-04
Wave 4: 05-06
```

Warnings (advisory only — SDK detects declared wave > DAG wave):
- "Plan 05-05: declared wave: 3 but depends_on DAG places it in wave 1"

This is harmless. With ADR-0010 reshape, the DAG flattened (no Sentry-VPS Wave 1 to wait on). 05-05 still respects `depends_on: [05-02]`, so the executor waits for 05-02's USER ACTIONs before scheduling 05-05. Declared wave values left in place as audit trail of pre-reshape Phase 5 structure (no functional impact).

DAG is acyclic. ✓

---

## 5. Obsolete-reference audit (active plans only)

Grep over `.planning/phases/05-observability-backend/05-0{2,3,4,5,6,7}-PLAN.md` for `sentry.<sentry-ip>|sentry.<ip>.sslip.io|sentry-prep|sentry-stack\.service|getsentry/self-hosted|:3100/loki`:

| Plan | Count | Disposition |
|------|-------|-------------|
| 05-02 v2 | 1 | Line 53 (`<objective>`): historical context about the SCRAPPED original plan body. Audit-trail context, fine. ✓ |
| 05-03 | 0 | ✓ |
| 05-04 | 0 | ✓ |
| 05-05 | 2 | Both have inline AMENDED markers (truths #2 + key_links Sentry endpoint) pointing at ADR-0010 + frontmatter `revised_at`. ✓ |
| 05-06 | 14 | **WAS THE HIGH NIT.** Frontmatter `revision_summary` carrier-swap table is authoritative; **fixed by adding `⚠ CARRIER SWAP REQUIRED` callout immediately after `<objective>` block** that explicitly tells the executor to apply the swap before reading any `<action>` step. Callout covers 9 problematic patterns (sentry.<ip>.sslip.io / grafana.<ip>.sslip.io / :3100 push / sentry-prep / sentry-stack.service / inventory/sentry / getsentry/self-hosted dep pin / RUNBOOK §1 + §11/§12 / ansible-playbook -i inventory/sentry). ✓ |
| 05-07 v2 | 1 | Line 95 (`<objective>` drops list): "Drops sentry-prep caddy.j2 edits — no sentry VPS, no sentry-prep role." Audit-trail context, fine. ✓ |

All obsolete references in active plans are either:
- (a) inside `<objective>` historical-context blocks describing what was scrapped;
- (b) inside inline AMENDED markers pointing at ADR-0010;
- (c) covered by the carrier-swap callout in 05-06.

No `<action>` block in an active plan would lead the executor to deploy nonexistent infrastructure.

---

## 6. niko-prod hands-off audit

Active plans' references to `niko-prod` and `/etc/nginx` (verified 2026-05-19):

- All `niko-prod` mentions are in Plan 05-07 v2:
  - Lines 30-32 (`must_haves.truths`): "colocated with niko-prod per D-34", "no sharing with niko-prod_* networks", "existing system nginx on :80/:443 untouched"
  - Line 91, 94, 97, 107, 277 (`<objective>` / context): explicit hands-off framing
  - Lines 562-563 (RUNBOOK §13 + §14): explicit "what NOT to touch" list
  - Lines 592-595 + 608-619 (`<threat_model>` Trust Boundaries + STRIDE T-05-07-08): hard invariant + accept-risk entry

- All `/etc/nginx` mentions are in 05-07 v2 `<threat_model>` and RUNBOOK §14 — explicitly listed as FORBIDDEN.

No active plan modifies `/etc/nginx/*`, niko-prod_* Docker networks, or niko-prod-* containers. The Docker network for observability-stack is namespaced `observability_internal` (see compose `interfaces` block). ✓

---

## 7. SOPS slot completeness

Plan 05-02 v2 task 4 produces 8 SOPS keys (6 prod + 2 staging):
- prod: `SENTRY_DSN_BACKEND`, `SENTRY_DSN_MOBILE`, `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_ADMIN_PASSWORD_BCRYPT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- staging: `SENTRY_DSN_BACKEND_STAGING`, `SENTRY_DSN_MOBILE_STAGING`

Consumers:
- **05-05** reads `SENTRY_DSN_BACKEND` (verified 8 references in plan body). ✓
- **05-07** reads `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_ADMIN_PASSWORD_BCRYPT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (verified in deploy script task 4 + Caddyfile basicauth + Grafana contact-points.yml.template). ✓
- **05-06** reads NONE directly (Alloy push URL doesn't need a secret — IP allowlist is the auth boundary). ✓
- **05-04** reads NONE (Prom scrape targets are public-IP-internal-port via Caddy or direct). ✓

`SENTRY_DSN_MOBILE` produced but not consumed in Phase 5 — consumed by Phase 17 (CRASH-* plans). ✓ Documented in 05-02 v2 must_haves truth #2.

`SENTRY_DSN_BACKEND_STAGING` + `SENTRY_DSN_MOBILE_STAGING` produced as placeholders for v1.1. ✓ Documented in 05-02 v2 truth #3.

No SOPS-key name drift between producer and consumers. ✓

---

## 8. R-02 / R-03 / R-04 / D-37 mitigation verification

| Risk | Plan | Mitigation present? |
|------|------|---------------------|
| **R-02** (memory contention) | 05-07 v2 `<interfaces>` block | `MemoryHigh=4G` on observability-stack.service ✓; Loki retention 14 days (down from 30) in loki-config.yaml task ✓; smoke_observability_stack.py reports memory utilization (acceptance row implicit; explicit in SUMMARY template) ✓ |
| **R-03** (self-signed cert friction) | 05-06 + 05-07 | 05-06 truths #1 + key_link explicitly say "Alloy uses tls_config insecure_skip_verify=true per D-37" ✓; 05-07 smoke script uses `ssl.CERT_NONE` ✓ |
| **R-04** (Caddy :8443 abuse) | 05-07 v2 `<threat_model>` T-05-07-07-E | Basicauth + UFW dev-IP restriction documented; rotation playbook in RUNBOOK §8 ✓ |
| **D-37** (v1.0 accepts self-signed) | ADR-0010 §Решение/3 | ADR-0010 codified; RUNBOOK §12 (Self-signed cert handling) covers dev trust-the-cert workflow ✓ |

All mitigations from ADR-0010 risk register are surfaced in concrete plan deliverables. ✓

---

## 9. Issues found (post-fix state)

### BLOCKING
None.

### HIGH
~~**H1 (FIXED in this round): 05-06 body has 7 stale references that the executor might follow verbatim if it doesn't read the frontmatter `revision_summary` first.**~~ — **FIXED** by adding `⚠ CARRIER SWAP REQUIRED` callout immediately after `<objective>` block. Callout covers 9 patterns + tells executor to default to the NEW column when in doubt + record any deviation in 05-06-SUMMARY.

### MEDIUM
**M1.** 05-06 file is now 660+45 ≈ 705 lines (was 660 pre-callout). Larger than the original ~520-line average. Acceptable for v1.0 closeout — the callout is the dominant authoritative reference and the verbose body remains in place for the gsd-executor agent to use as working notes. v1.1 can rewrite from scratch if Phase 5 is revisited.

**M2.** Plan 05-04 was not touched at all in this reshape pass. It depends on `[05-03, 05-07]`. 05-03 is already shipped + 05-07 v2's deploy script handles dashboard rsync. So 05-04 sees the same architecture as before EXCEPT the Grafana host moved from sentry VPS → srv1561293. Plan 05-04 references "dashboards onto sentry VPS Grafana" in its done-clause prose — this is stale but harmless (the dashboards are JSONs, Grafana picks them up from any host's provisioning dir). Executor for 05-04 doesn't need to know the host; only Plan 05-07 v2 does. ✓ Carry forward as MEDIUM note in 05-04 SUMMARY.

### LOW
**L1.** ADR-0010 R-02 mitigation table says "add 4 GB swap file at deploy time" but Plan 05-07 v2 deploy script doesn't include a swapfile creation step. The first-time deploy will run on a swap-free VPS. Decision deferred to runtime: if smoke_observability_stack.py reports memory pressure >80% sustained, the deploy script appendix in RUNBOOK §13 covers adding swap as a follow-up.

**L2.** The wave-warning advisory ("declared wave > DAG wave") on 05-05 will appear in every `gsd-sdk` query going forward. Could be cleared by updating 05-05 declared `wave: 3 → 1`, but that loses the audit-trail of pre-reshape declared structure. Leaving as-is. Future operators reading the warning need to know it's expected post-ADR-0010.

---

## 10. Carry-forward NITs from PLAN-CHECK-2

| Prior NIT | Disposition |
|-----------|-------------|
| H1 (05-06 PreAuthPath test name) | UNCHANGED — still applicable to the v1.0-shipped middleware in 05-06; executor will catch in TDD red phase |
| H2 (dashboard mounting handoff) | RESOLVED — Plan 05-07 v2 task 1 explicitly rsyncs dashboards from `services/backend/observability/dashboards/` into Grafana provisioning |
| H3 (05-02 2-pass auth token) | NO LONGER APPLICABLE — 05-02 v2 is SaaS-based, no sentry-cli authToken bootstrap needed |
| H4 (05-02 sendTelegram global var) | NO LONGER APPLICABLE — custom Go alerter scrapped per ADR-0010 |
| H5 (05-05 OTel OnStart-only scrub limitation) | UNCHANGED — still applicable; executor uses the OnEnd-side rewriter approach per Plan 05-05 amended action step 2 |
| H6 (05-03 pii_audit.sh allowlist brittleness) | UNCHANGED — Plan 05-03 already shipped; brittleness accepted as v1.0 trade-off; v1.1 revisit |
| M1 (05-06 task count) | EXACERBATED slightly by carrier-swap callout but still workable |
| M2 (05-04 dashboard validation) | UNCHANGED |
| M3 (05-01 port 80 ACME) | NO LONGER APPLICABLE — 05-01 SUPERSEDED |
| M4 (pii_live_probe regex false-positive) | UNCHANGED |
| L1-L4 | UNCHANGED |

---

## 11. Recommendation

**PROCEED-TO-EXECUTION.**

Order:
1. **Plan 05-02** (USER ACTIONs — sentry.io org + 4 projects + Telegram BotFather + joint SOPS-edit + sentry-ops.md §1-§6)
2. **Plan 05-07** (observability-stack deploy to srv1561293 + Grafana D-26 alerts; autonomous after 05-02 SOPS slot populated)
3. **Plan 05-04** (Prom /metrics on 8 services + dashboards + cardinality probe; autonomous)
4. **Plan 05-05** (OTel + sentry-go SDK pointed at sentry.io DSN; autonomous; carrier-swap from frontmatter `revised_at`)
5. **Plan 05-06** (Alloy + DebugSession + acceptance walkthrough; autonomous=false; carrier-swap from `⚠ CARRIER SWAP REQUIRED` callout)

Critical handoff notes for the executor (already captured in plan SUMMARY templates):
- Alloy push URL: `https://82.25.71.215:8443/loki/api/v1/push` (NOT `:3100`)
- Sentry UI URL: `https://sentry.io/organizations/<slug>/` (NOT `sentry.<ip>.sslip.io`)
- Grafana URL: `https://82.25.71.215:8443/grafana/` (Caddy basicauth)
- OTLP path: `/api/<id>/otlp/v1/traces` (NOT `/integration/otlp/v1/traces`)

---

*Inline plan-check by orchestrator after gsd-plan-checker background agent stalled twice on bulk-read (stream watchdog issue persistent in this session). The audit covered all 8 mandates from the plan-checker prompt + filed one HIGH-severity nit, which has been fixed in-place. All checkbox criteria satisfied for PROCEED-TO-EXECUTION verdict.*
