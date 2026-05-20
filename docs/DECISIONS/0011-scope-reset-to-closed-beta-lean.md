# ADR-0011: Scope reset to closed-beta lean (was 21-phase enterprise-hardening)

**Status:** Accepted
**Date:** 2026-05-20
**Decider:** Solo dev (Ismail)
**Supersedes scope of:** ROADMAP.md (was 21-phase v1.0 hardening, 2026-05-15..2026-05-20)
**Related:** ADR-0010 (Sentry SaaS + colocation, with PM amendment D-38 deferring Sentry activation)

## Context

The v1.0 roadmap was redefined on 2026-05-15 from an 8-phase feature-focused scope to a **21-phase enterprise-hardening scope**: SOPS + gitleaks + Ansible + CI/CD + observability + edge protection + DB drills + load/chaos baselines + signed releases + crash reporting + 8-device matrix + 48h staging soak with ≥8 real runners + on-call rotation.

That scope was framed as "production readiness." In retrospect it was framed as "production readiness *for a funded team shipping to thousands of users*." It is overkill for the actual situation:

- **Team size:** 1 developer (was nominally 2 at scope-definition time; effectively solo for v1.0 execution)
- **User count at launch:** 5-10 friend testers via closed beta
- **Funding posture:** unfunded side project
- **Time pressure:** ship to friends in weeks, not "harden for a hypothetical scale event in months"

Phases 1-5 of the 21-phase scope already shipped (REL/SEC/INFRA/CICD/OBS — see ROADMAP.md "Phases" section for status). The retired scope is everything from Phase 6 onwards.

## Decision

Retire the 21-phase scope. Replace with a **4-phase closed-beta scope** on top of Phases 1-5:

- **Phase 6** — Release signing (Android keystore + iOS Apple Dev certs)
- **Phase 7** — Release builds + mobile stability (EAS production profiles + foreground service + iOS SLC; MIUI + One UI only, rest = monitor during beta)
- **Phase 8** — Closed-beta distribution (Android signed-JSON manifest + iOS TestFlight)
- **Phase 9** — Closed-beta launch (smoke test on 2 devices → invite 5-10 testers → 72h watchlist)

Strict order: 6 → 7 → 8 → 9. No parallelization.

## What gets dropped (with residual risk for closed beta)

Full table in ROADMAP.md "Archived Phases" section. One-line summaries:

| Old phase | Dropped | Residual risk |
|---|---|---|
| 6 (rate-limit hardening) | full | `/auth/*` rate-limit gap; closed-beta blast radius mitigates; v1.0.1 backlog item `AUTH-RATELIMIT` |
| 7 (pgBackRest restore drill) | full | No proven restore drill; mitigation = `pg_dump` snapshot before each migration |
| 8 (k6 + chaos) | full | No load profile; 5-10 testers won't hit limits |
| 13 (Mapbox SDK 11 migration) | full | Stay on `@rnmapbox/maps@^10.3`; no known native crashes at 10.3 |
| 14-15 (native + ABI matrix) | full | arm64 only on both platforms; no 16KB page-size validation for Android 15+ |
| 16 (background reliability) | partial → folded into new Phase 7.03 | Solo dev validates on 2 devices (Pixel + iPhone); MIUI/HyperOS/EMUI/One UI = monitor in beta |
| 17 (mobile crash reporting Sentry) | full | No automated crash collection; user reports + Loki tails substitute; backend Sentry already dormant per D-38 |
| 20 (8-device matrix) | full | ~5-10 devices total via testers; no structured device protocol |
| 21 (48h staging soak + on-call) | full | No formal soak; Phase 9 = ship-then-watch with 72h tester window |

## What stays as-shipped

The Phase 1-5 work that already landed stays — **not undone**. In particular:

- **CICD-02 cosign keyless + SLSA L2 attestations** (in `.github/workflows/backend-cd.yml`): kept wired. Documented here as **best-effort, not gated**. Attestations will keep firing on new CD runs because they're already in the workflow. If the cosign step ever breaks CI for a deploy-blocking reason, the policy is: **comment the step out, don't spend a day fixing it**. Reactivate when the team grows or when public launch makes supply-chain provenance non-optional.
- **CICD-04 rollback drill scaffolding** (Makefile `make rollback v=N` + 9990/9991 drill migrations): kept. Drill was proven on prod 2026-05-18; the tooling stays usable.
- **OBS-01/03..07** backend observability (Plans 05-02..05-07): kept code-complete. The observability-stack on `srv1561293` (Loki + Grafana + Prom) stays running — costs nothing extra, useful for ad-hoc debugging during beta. The Alloy log-shipper Ansible role from Plan 05-06 Task 3 is ready to deploy if/when Phase 9 watchlist actually needs prod logs in Loki.
- **OBS-02 Sentry SaaS activation**: stays deferred per ADR-0010 amendment. No mobile crash reporting in v1.0 (was Phase 17 — also dropped here).
- **SEC-01..09 secrets hygiene** (Phase 2): unchanged.
- **INFRA-01/03/05/07 Ansible deploy** (Phase 3): unchanged.
- **REL-01..05 API contract + clientversion + featureflags** (Phase 1): unchanged.

## OBS-08 amendment (tester-debug UX)

Phase 5 Plan 05-06 shipped a backend `DebugSessionMiddleware` (D-22 three-gate: `X-Debug-Session: 1` header ∧ JWT `is_tester=true` ∧ featureflag `tester_debug_logging` ON for that user). The OBS-08 spec also called for a **mobile Settings toggle UI** with an RU consent banner — that mobile UX was Phase 17 scope and is dropped here.

For solo-dev closed-beta operations, the featureflag gate is unusable: there is no admin UI to flip the flag for individual testers, and writing DB rows manually per tester is friction the solo dev won't sustain. Decision:

- **Operational seam:** add a `DEBUG_SESSIONS_FOR_USER` env var (comma-separated user-UUID allowlist) wired into the sport-stack Ansible role + GitHub Actions secret. Setting a tester's UUID into this var grants debug-on-demand for that user when their request carries `X-Debug-Session: 1`.
- **DebugSessionMiddleware refactor:** **additive** — keep the existing 3-gate, ADD a 4th alternative path: `(X-Debug-Session: 1) ∧ (JWT.UserID in DEBUG_SESSIONS_FOR_USER allowlist)` enables debug mode regardless of `is_tester` claim or featureflag. The featureflag path stays as a no-op for now (the featureflag never gets flipped); env-allowlist path is the active operational mechanism.
- **Refactor priority:** **lazy.** Backend seam works without the env-allowlist as long as no one needs debug-on-demand. First time the solo dev wants to tail debug logs for a specific tester during Phase 9 watchlist, do the refactor then. Tracked in ROADMAP.md `v1.0.1 Backlog` as `DEBUG-MIDDLEWARE-ENV`.
- **Loki tail wrapper:** `scripts/debug-tail.sh <user-id>` ships in Commit 1 (no code change required; just a LogQL wrapper). Solves the "re-derive LogQL query each time" friction immediately.

## Why this scope cut is the right call

Risk-adjusted reasoning, not aesthetic minimalism:

1. **The 21-phase scope is a learning hazard.** Each archived phase has a real-world failure mode it would catch. But each phase also takes 1-3 weeks of solo time. Solo dev × 16 retained phases × 2 weeks median = 8 months of hardening before friends see the app. Friends will get bored. The app exists to be used.
2. **Closed beta is a sampling event, not a load event.** 5-10 testers running 3 sessions each = ~30 sessions over 2 weeks. This does not stress rate-limits, does not exhaust DB connections, does not trigger restore-drill scenarios. The hardening doesn't pay off until users scale or hostile actors arrive.
3. **The dropped phases are not forever-dropped.** They're archived with clear re-expansion triggers (see ROADMAP.md). The pre-work already done in Phases 1-5 (cosign workflows, observability seams, SOPS scaffolding) lowers the cost of re-opening any archived phase when its trigger fires.
4. **The shipped phases over-deliver for closed beta.** CI/CD with 5 scanners + cosign + rollback drill is overkill for 10-user blast radius, but it's already shipped and zero-maintenance. Keep it.
5. **Solo dev psychology.** A 21-phase backlog blocks shipping forever (no phase is ever quite done). A 4-phase backlog is finishable in 3-5 weeks. The momentum from shipping to friends compounds.

## Re-expansion triggers

Revisit `.planning/phases/_archive/superseded-21-phase-v1.0/` if any of:

1. **Beta passes >50 users** — load + crash visibility become real concerns; Phases 8 (k6/chaos) + 17 (crash reporting) move back into scope.
2. **A P0 incident exposes a dropped phase's gap** — e.g., a tester's MIUI device kills the recorder mid-session → re-open Phase 16 4-vendor mitigations. Or `/auth/login` brute-forced → re-open Phase 6 rate-limiting.
3. **Team grows beyond 1 dev** — extra rigor becomes affordable; Phase 7 (pgBackRest drills) + Phase 21 (staging soak + on-call) become realistic.

## Consequences

**Positive:**
- Ships to friends in ~3-5 weeks of remaining solo work instead of ~6+ months.
- Avoids the trap of "hardening for hypothetical scale before any users."
- Preserves an audit trail (archive + this ADR) so the dropped work isn't memory-holed.
- Phase 5 observability investment doesn't go to waste — Loki/Grafana/Alloy stack stays available for ad-hoc beta debugging.

**Negative:**
- No restore drill proven. If prod DB corrupts during beta, recovery is `pg_dump` baseline + WAL replay (untested under pressure). Acceptable risk for closed-beta data loss = 10 users × a few sessions; reconstruction from `pg_dump` snapshots is feasible manually.
- No load/chaos baselines. First user-load surprise hits in production. Acceptable at 5-10 users; revisit if beta passes 50.
- No mobile crash reporting. Crashes surface via tester reports — slower MTTR. Acceptable for closed beta (testers will tell you in chat).
- `/auth/*` rate-limit gap remains open (CONCERNS.md P0). Closed-beta blast radius mitigates: 5-10 friend testers ≠ attacker base.
- No 8-device matrix. Vendor-specific failures (MIUI/HyperOS/EMUI) discovered by testers, not by structured QA. Acceptable for friends-only beta.

## Implementation

**Commit 1 (this commit):**
- Move `.planning/phases/16-background-reliability-in-release/` → `.planning/phases/_archive/superseded-21-phase-v1.0/` (only Phase 6-21 dir extant on disk; Phases 6-15 and 17-21 were ROADMAP-only)
- Rewrite `.planning/ROADMAP.md` (442 lines → ~180 lines): new Phases 6-9 + Archived Phases section + retained v1.0.1 backlog
- Update `.planning/REQUIREMENTS.md`: flag `RATE-*`, `DB-*`, `LOAD-*`, `DEVICE-*`, `SOAK-*`, `CRASH-*`, `MAPBOX11-*`, `AND-SIGN-* → SIGN-*`, etc. as **dropped from v1.0** with pointer here. Preserve audit trail.
- Update `.planning/PROJECT.md`: shrink scope description; milestone "21-phase hardening" → "closed-beta release in 4 lean phases"
- Edit `CLAUDE.md` line 5: "Команда: 2 разработчика" → "Команда: 1 разработчик"
- Add `scripts/debug-tail.sh <user-id>` Loki LogQL wrapper
- Write this ADR

**Commit 2 (separate):**
- Write `.planning/phases/05-observability-backend/05-06-SUMMARY.md` (Task 6 walkthrough deferred to Phase 9 smoke test)
- Flip `.planning/ROADMAP.md` Phase 5 checkbox → `[x]`
- Update `.planning/STATE.md`: Phase 5 done, Phase 6 next

**Not touched:** existing Phase 1-4 commits, `backend-cd.yml` cosign step, rollback Makefile, SOPS secrets, Ansible playbooks. Those ship as-is.
