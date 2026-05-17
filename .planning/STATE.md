---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Closure
status: completed
stopped_at: Phase 3 COMPLETE 2026-05-17 — all 4 active INFRA-* acceptance green (02/04 deferred v1.1; 06 moved Phase 5). sport-stack.service active, 13 containers, INFRA-07 baseline 66.5s. Ready для Phase 4 (CI/CD).
last_updated: "2026-05-17T11:34:12.505Z"
last_activity: 2026-05-17 -- Phase 03 marked complete
progress:
  total_phases: 21
  completed_phases: 2
  total_plans: 6
  completed_plans: 10
  percent: 10
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-15 — milestone v1.0 redefined)
See: `.planning/MILESTONES.md` (milestone history + per-milestone phase progress)

**Milestone:** v1.0 Production Readiness — IN PROGRESS, **REDEFINED 2026-05-15** as 21-phase hardening scope. Earlier 8-phase feature scope superseded. Feature work (privacy zones, segments, coaching, premium, GDPR) slides to v1.1+. Target close: tagged `v1.0-rc.1` after 48h staging soak with ≥8 real runners.
**Core value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.
**Current focus:** Phase 4 — CI/CD pipeline (Phase 3 closed 2026-05-17)

**Brownfield note:** Codebase remains at Phase 8 / M10 code-complete on `feat/cursona-redesign` (35 commits of pre-v1.0 territory-core refactors landed under the superseded scope — kept as-is in git history; planning artifacts archived to `.planning/phases/_archive/pre-v1.0-territory-refactors/`). Pixel + iPhone field-test acceptance criteria inherited by new Phase 16 (CONTEXT skeleton seeded).

## Current Position

Phase: **4 of 21** (CI/CD pipeline) — `backend` workstream — next, ready to plan
Last completed: Phase 3 (Infrastructure as Code) — 3 plans across 3 waves, 2026-05-17. Pivoted mid-execution from Hetzner Cloud to provider-agnostic VPS (5→3 plans). Sport-stack systemd umbrella deployed на 148.253.214.156, 13 containers, INFRA-07 baseline 66.5s real (target <60min). UFW + key-only SSH защита.
Status: Phase 3 complete; Phase 4 awaiting `/gsd-discuss-phase 4` then `/gsd-plan-phase 4`.

Progress: [▓▓░░░░░░░░] ~11% of new v1.0 scope (REL-01..05 + SEC-01..09 all delivered or partial; 14-of-96 REQ-IDs complete — SEC-01 still partial pending Phase 4 CI wiring; everything else in SEC-* closed)
**Pre-v1.0 baseline:** 35 commits of territory-core refactors already on `feat/cursona-redesign` from the superseded scope (SessionManager, tracker hooks, closure feedback, offline region picker bounds fix, adaptive sampling + SLC, ESLint v9 + token-secret guard). These kept as-is; field-test validation moves to Phase 16.

**Next phase (open):** Phase 3 (Infrastructure as Code) — `backend` workstream. Phase 2 → Phase 3 strict no-parallelization gate is **NOW LIFTED**. Ansible playbooks + Terraform-for-cloud-resources for dev/staging/prod environments; consumes SOPS-decrypted env files from Phase 2.

## Performance Metrics

**Velocity:**

- Total v1.0 hardening plans completed: 7 (Plans 01-01..03 + 02-01..04)
- Pre-v1.0 baseline (superseded scope): 10 plans (9 code-complete + 1 deferred-aware) executed 2026-05-14, ~25-35 min per plan; commits remain on `feat/cursona-redesign`

**By Phase:**

| Phase | Plans | Total       | Avg/Plan |
|-------|-------|-------------|----------|
| 1     | 3/3   | ~3.5h total | ~70 min  |
| 2     | 4/4   | ~122 min total (~2h) | ~30 min |

Plan 01-03 actual: ~75 min (single executor pass, 5 commits, 33 new tests).
Plan 02-01 actual: ~12 min (single executor pass, 3 commits, 14 created files, Pitfall 1 round-trip smoke green for dev/staging/prod).
Plan 02-02 actual: ~10 min (per 02-02-SUMMARY metrics).
Plan 02-03 actual: ~5 min (single executor pass, 3 commits 28acb2d..ac2ebd5; 6 created files + 2 modified; full-history scan ZERO findings).
Plan 02-04 actual: ~95 min spread across 2 sessions (Task 2 docs ~25 min prior session; Tasks 1+3+4 SOPS-write side + closeout ~70 min this session including prefix-mismatch halt + macOS sops age-key path diagnosis).

**Recent Trend:**

- Last activity: 2026-05-16 — **Phase 2 closed**. Plan 02-04 Mapbox token rotation: ADR-0006 verdict A (commit `58b15eb`), SOPS-write + smoke HTTP 200 (commit `881f912`), Incident Log complete + SUMMARY (commit `d6fe1f3`). Old tokens revoked at dashboard by user.
- 2026-05-16 — Plan 02-04 Task 2 docs (prior session): ADR-0006 + sops-edit RUNBOOK + 10-playbook SECRETS.md extension (commits a67beb0..ccc39c1).
- 2026-05-16 — Plan 02-03 scanners + pre-commit shipped (SEC-08 closed; SEC-01 partial pending Phase 4 CI; commits 28acb2d..ac2ebd5).
- 2026-05-15 — Plan 02-01 SOPS+age scaffold shipped (SEC-02 substrate; commits 5e73162..04f44b8).
- 2026-05-15 — Plan 02-02 envRequire + DEV_MODE shipped (SEC-05/06/09; 8 services migrated, 10 new test cases).
- 2026-05-15 — Plan 01-03 Feature Flags end-to-end shipped (REL-03); Phase 1 code-complete.
- 2026-05-15 — Plan 01-02 Version Negotiation (REL-02) shipped (8 services + mobile X-Client-Version).
- 2026-05-15 — Plan 01-01 API Contract + ADR-0007 (REL-01/04/05) shipped.
- 2026-05-15 — v1.0 scope redefined; planning artifacts rewritten atomically.

*Updated after each plan completion.*

## Accumulated Context

### Decisions

Full decision log in `docs/DECISIONS/` (ADRs) and `.planning/PROJECT.md` §Key Decisions.

Recent / load-bearing decisions affecting current work:

- **ADR-0001**: Expo RN over Flutter — locked; Flutter archived.
- **ADR-0002**: Guest mode deferred.
- **ADR-0003**: OAuth Google + Apple via `AuthProvider` interface — stub-safe; backend exchange endpoints pending (in v1.0 Phase 11/12 for Strava only per HEALTH-04).
- **ADR-0004**: Feed/Stories backend do-nothing.
- **ADR-0005**: Phase 1 (old scope) field-test outcomes — Code Closeout, Deferred Validation (2026-05-14). **Now relocated**: field-test acceptance gating moved into new Phase 16 (`.planning/phases/16-background-reliability-in-release/16-CONTEXT.md`); ADR-0005 still tracks the eventual `Accepted (closed)` flip after Phase 21 soak.
- **2026-05-15 — Milestone v1.0 redefinition**: 8-phase feature scope superseded by 21-phase hardening scope. Workstream tags `shared` | `backend` | `android` | `ios` | `mobile-shared`. Phase 2 → Phase 3 strict sequencing (SOPS-first). Mapbox 11.x migration inserted as Phase 13 (between mobile build config and native+ABI), gated on debug-build regression of all old Phase 1 tracker features. HEALTH-04 (Strava read-only OAuth) pulled into v1.0 as standalone REQ-ID with split impl (Phase 11+12) and validation (Phase 21).
- **ADR-0006**: Mapbox token incident reset (Phase 2 / 2026-05-16). Treated-as-compromise full reset; new sk. (build/CI) + pk. (runtime) with iOS Bundle ID + Android SHA-256 restrictions per verdict A; SOPS-only canonical storage. Single-token strategy chosen for v1.0 (per-env split deferred v1.1 per §Сценарии пересмотра).
- **ADR-0007**: v1.0 Release Contract (Phase 1 / 2026-05-15) — locks mobile↔backend wire contract + version negotiation policy.
- **Future ADRs scheduled in v1.0:**
  - `0008-mapbox-sdk-11-migration.md` — Phase 13: documents `@rnmapbox/maps` 10.x→11.x breaking changes and resolution

### Pending Todos

[Carry-forward from pre-v1.0 baseline — relocated into v1.0 phases]

**Old Phase 1 (superseded scope) user actions — now part of new Phase 2 + Phase 16:**

1. ☑ **Mapbox dashboard rotation** — **DONE 2026-05-16** (Phase 2 / Plan 02-04). 3 old tokens (`dev-public` / `prod-public` / `server-secret`) deleted in Mapbox dashboard by user. New tokens in SOPS `.secrets/{prod,staging,dev}/mapbox.yaml`. ADR-0006 written.
2. ☐ **Field test execution** (Pixel → iPhone → Chinese-Android × T1/T2/T6/T7/T8/T9) — folded into new Phase 16 BG-01..08; acceptance criteria preserved in `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md`
3. ☐ **Flip ADR-0005** to `Accepted (closed)` with measured NFR values — folded into new Phase 21 E2E-07

**Phase 2 follow-ups (not blocking Phase 3 — see 02-04-SUMMARY §Pending follow-ups):**

4. ☐ Clean up orphan `MAPBOX_PUBLIC_TOKEN`/`MAPBOX_SECRET_TOKEN` placeholders in `.secrets/<env>/mapbox.yaml` (02-01 schema; nothing reads them; pure hygiene)
5. ☐ **Verify first-pair tokens** (token-ids `…meb6` and `…v4g4`) from Task 3 first-paste attempt — if real, delete at Mapbox dashboard
6. ☐ Add `~/.envrc` (direnv) or shell-rc snippet to auto-export `SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt` on macOS (sops default search path is `~/Library/Application Support/sops/age/keys.txt`, key lives at XDG path)
7. ☐ EAS env-var wiring for `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` — Phase 3 (Deploy Automation) responsibility, or manual `eas secret:create` for v1.0 closed-beta
8. ☐ DEV_B age pubkey — `.sops.yaml` TODO; run `sops updatekeys .secrets/*.yaml` once provided
9. ☐ v1.1: per-env pk. split for Mapbox runtime token (single-token strategy is current v1.0 simplification — see ADR-0006 §Сценарии пересмотра)

### Blockers/Concerns

[Issues that affect future work — see `.planning/codebase/CONCERNS.md` for full list]

**P0 items distributed across new v1.0 phases per user redline:**

- ☑ `IDENTITY_DEV_MODE=true` default → **CLOSED** in Phase 2 SEC-05 (Plan 02-02, commit `27ad27f`)
- ☐ Missing `/auth/*` rate-limit → **Phase 6 EDGE-01** (edge protection)
- ☐ OTP unconditional log → **Phase 5 OBS-04** (observability — no PII in logs)
- ☐ R18 missing `user_id` on `personal_records`/`sessions` → **Phase 7 DB-03** (zero-downtime migration; backfill strategy LOUDLY DEFERRED to `/gsd-discuss-phase 7` for agent DB inspection)

**Active branch:** `feat/cursona-redesign` IS the v1.0 line. Merge to `main` no longer a separate phase — handled in Phase 21 E2E acceptance when `v1.0-rc.1` is tagged.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Reference |
|----------|------|--------|-----------|
| Features | HEALTH-01/02/03/05/06/07/08/09/10 (HealthKit/HealthConnect/Strava write/Garmin/FIT/Sensor Sync) | v1.1 | REQUIREMENTS.md §Deferred from v1.0 |
| Features | SOCIAL-01..03 (segments/leaderboards/zone-wars) | v1.2 | REQUIREMENTS.md §Deferred from v1.0 |
| Features | SOCIAL-05..06 (privacy zones, visibility) | v1.1 | REQUIREMENTS.md §Deferred from v1.0 |
| Features | COACH-01..06 (coaching & plans) | v1.3 | REQUIREMENTS.md §Deferred from v1.0 |
| Features | PREMIUM-01..06 (Stripe/RevenueCat/tiers/marketplace) | v1.4 | REQUIREMENTS.md §Deferred from v1.0 |
| Compliance | XCUT-01..06 (GDPR consent/export/RTBF/pen-test/bug-bounty) | v1.5 (public launch gate) | REQUIREMENTS.md §Deferred from v1.0 |
| i18n | XCUT-05 (RU + EN scaffolding) | v1.1 — **do not pre-wire in v1.0 code** | User redline |
| Auth | Guest mode | Deferred per ADR-0002 | — |
| Map | Mapbox Studio custom style | `outdoors-v12` fine for closed beta | — |
| Backend | Feed/Stories endpoint deprecation | Do-nothing per ADR-0004 | — |
| Platform | Web client (athlete-facing) | Out of scope | — |
| Platform | Watch native apps (Garmin IQ / watchOS) | HealthKit/Health Connect strategy | — |
| Distribution | Public TestFlight + Play Store submission | Closed beta uses internal TestFlight + self-hosted Android channel | — |
| Distribution | Hardware HSM for Android keystore | v1.1 upgrade if/when public Play Store; closed beta uses encrypted file + 2 offline backups | User decision |
| Infra | Multi-region geographic expansion | v2.0 | User decision |

## Session Continuity

Last session: 2026-05-17 — Phase 3 Wave 1 (Plan 03-01) executor ran Ansible against `root@148.253.214.156`; playbook reported `ok=24 changed=5 failed=0` over 50s — but post-restart **sshd wedged** on the VPS. TCP/22 accepts connections but no SSH banner; Caddy on 443 unaffected (VPS itself alive). Cause: drop-in `infra/ansible/roles/common/files/sshd_config_overrides` re-declared `Subsystem sftp` which Ubuntu 24.04's main config already declares — OpenSSH refuses duplicate Subsystem entries → service fails to restart. Source fixed in commit `2605c3a` (line removed + inline incident comment for future maintainers). User must recover SSH via out-of-band console (provider-side VNC/KVM-over-web) before any further Ansible runs can land.

Earlier in same session: Phase 3 PIVOTED per user input "у меня не Hetzner а обычный vps сервер". 21 D-XX decisions classified SUPERSEDED/KEPT; new D-22..D-26 added. Pre-pivot 5-plan scaffold reverted to 3-plan post-pivot set (Ansible-only, prod-only). Plan-checker iteration 2 PASSED.

**Pivot commit sequence** (in order, on `feat/cursona-redesign`):

- `00bcb39` revert(03) — Plan 03-01 superseded; deleted `infra/terraform/`, 3 SOPS hetzner.yaml slots, .gitignore Terraform section, 03-01-SUMMARY
- `c16e9bb` — 3 old plan deletes (03-02, 03-03a, 03-04 old IDs)
- `9cf1c63` — CONTEXT + RESEARCH pivot banners + new 03-01-PLAN.md (Ansible scaffold)
- `9e4fefe` — ROADMAP + REQUIREMENTS + VALIDATION + PATTERNS pivot
- `6f3d5a1` — 03-02-PLAN.md (sport-stack) + 03-03-PLAN.md (cutover + provider-agnostic RUNBOOK)
- `af0be2e` — plan-checker iter 2 fixes (B1 + W1)

**Coverage gates (final post-pivot):**

- Requirements: 4/4 active INFRA-* covered in plan frontmatter (INFRA-01: 03-01p + 03-02 + 03-03; INFRA-03 + INFRA-05: 03-01; INFRA-07: 03-02 + 03-03). INFRA-02 + INFRA-04 deferred v1.1, INFRA-06 moved to Phase 5.
- Decisions: 16 in-scope D-XX cited (D-03/04/12/13/14/15/16/17/19/20/21 KEPT; D-22/23/24/25/26 NEW). SUPERSEDED D-01/02/05/06/09/10/11/etc. excluded by design.
- All 5 prior plan-checker fixes preserved across pivot: B3 (programmatic `awk '/^real/'` verdict from `/usr/bin/time -p`), B4 (explicit `docker compose down --remove-orphans` step 3.5 before Ansible UP), W3 (HOME-explicit SOPS env construct, no `expanduser`), W4 (negative-grep ROADMAP for stale Object Storage wording), W5 (sed-fill + `! grep -q '<fill'` for deploy.md §9 placeholders).

Stopped at: Wave 1 Plan 03-01 — sshd wedge HALT on prod VPS, awaiting out-of-band console recovery by user.
Resume file: `.planning/phases/03-infrastructure-as-code/03-01-SUMMARY.md` (full HALT recovery procedure in §Carry-forward items + §Deviations).

**User-action checkpoint (Wave 1 sshd recovery) — required to unblock further Ansible runs:**

1. Open prod VPS provider's web console / KVM-over-IP for 148.253.214.156 (whatever your VPS provider exposes — Hetzner Cloud Console "Console" tab, OVH IPMI, DigitalOcean Recovery Console, etc.). Login as root locally.
2. Diagnose: `journalctl -u ssh --no-pager -n 50` + `sshd -t -f /etc/ssh/sshd_config` (should report the duplicate-Subsystem error).
3. Apply fix on the live VPS:
   ```bash
   sed -i '/^Subsystem sftp/d' /etc/ssh/sshd_config.d/99-hardening.conf
   systemctl restart ssh
   systemctl status ssh    # should be active (running)
   ```

4. Verify SSH recovery from dev workstation:
   ```bash
   ssh deploy@148.253.214.156 'echo OK'              # should succeed
   ssh root@148.253.214.156 'echo ROOT_SHOULD_FAIL'  # should fail with Permission denied (D-19 hardening active)
   ```

5. Switchover inventory for subsequent runs:
   - Edit `infra/ansible/inventory/prod/hosts.yml` — set `ansible_user: deploy` (uncomment if commented; replace `root` if still listed)
6. Re-run Ansible to confirm drop-in fix lands cleanly + idempotency:
   ```bash
   cd infra/ansible && ansible-playbook -i inventory/prod --tags=common,docker,ufw site.yml
   # 1st run: changed=1 (drop-in updated) + sshd restart → SHOULD NOT wedge this time
   # 2nd run: changed=0 (idempotent)
   ```

After recovery + idempotency confirmed, Wave 1 is closed and ready to advance.

**Next action:** `/gsd-execute-phase 3 --wave 2` — Plan 03-02 sport-stack role (autonomous=true): SOPS-decrypt via `delegate_to: localhost` + migration play + `sport-stack.service` systemd umbrella + smoke probe + `<60min` INFRA-07 timing measurement on prod VPS. Then Wave 3 (Plan 03-03 prod cutover, autonomous=false).

## Artifacts Created (cumulative)

**From 2026-05-14 GSD init:**

- `.planning/config.json`
- `.planning/codebase/{STACK,INTEGRATIONS,ARCHITECTURE,STRUCTURE,CONVENTIONS,TESTING,CONCERNS}.md`

**Rewritten 2026-05-15 (milestone v1.0 redefinition):**

- `.planning/PROJECT.md` (Current Milestone section)
- `.planning/REQUIREMENTS.md` (full rewrite — 96 v1.0 REQ-IDs + Deferred section)
- `.planning/ROADMAP.md` (full rewrite — 21 phases across 5 workstreams)
- `.planning/MILESTONES.md` (v1.0 entry updated to new scope)
- `.planning/STATE.md` (this file)

**Created 2026-05-15:**

- `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md` (skeleton with inherited Pixel field-test acceptance criteria)

**Archived 2026-05-15:**

- `.planning/phases/_archive/pre-v1.0-territory-refactors/` (was `.planning/phases/01-validate-close-territory-core/` — 14 files: CONTEXT/RESEARCH/PATTERNS/DISCUSSION-LOG + 10 PLAN.md + 10 SUMMARY.md from the superseded scope)

**Future ADRs scheduled (will write as their phases execute):**

- `docs/DECISIONS/0006-mapbox-token-incident.md` (Phase 2)
- `docs/DECISIONS/0007-v1.0-release-contract.md` (Phase 1)
- `docs/DECISIONS/0008-mapbox-sdk-11-migration.md` (Phase 13)

## Source-of-Truth References

- `docs/RUNNING_ECOSYSTEM_TZ.md` — master technical spec (961 lines); §2.4 NFR table is canonical for Phase 16 acceptance numbers
- `docs/DEVELOPMENT_PLAN.md` — canonical pre-v1.0 implementation tasks (P-IDs)
- `STATUS.md` — living per-task status
- `docs/DECISIONS/` — ADR 0001..0005; future 0006/0007/0008 scheduled
- `docs/AUDIT.md`, `docs/REVIEW_ROUNDS_1-3.md` — review outputs feeding `CONCERNS.md`
- `tests/FIELD_PROTOCOL.md` — field-test capture table (541 lines, seeded by pre-v1.0 Plan 09 Task 1; consumed by new Phase 16/20)
- `.planning/phases/_archive/pre-v1.0-territory-refactors/` — superseded scope's planning artifacts, retained for historical reference
