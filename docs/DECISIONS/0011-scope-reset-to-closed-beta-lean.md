# ADR-0011: Scope reset to closed-beta lean (was 21-phase enterprise-hardening)

**Status:** Accepted
**Date:** 2026-05-20
**Decider:** Solo dev (Ismail)
**Supersedes scope of:** ROADMAP.md (was 21-phase v1.0 hardening, 2026-05-15..2026-05-20)
**Related:** ADR-0010 (Sentry SaaS + colocation, with PM amendment D-38 deferring Sentry activation)
**Amendments:**
- 2026-05-20 PM — Lean key custody principle (Phase 6 Plan 06-01 Tasks 5-6 rewrite; see §"Amendment 2026-05-20 PM — Lean key custody" below)
- 2026-05-20 PM (later) — Android-first launch (iOS sub-plans deferred from v1.0; see §"Amendment 3 2026-05-20 PM — Android-first launch" below)
- 2026-05-20 PM (latest) — Keystore backup deferred entirely (Plan 06-01 Tasks 5-6 → v1.0.1 backlog; see §"Amendment 4 2026-05-20 PM — Keystore backup deferred" below)

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

---

## Amendment 2026-05-20 PM — Lean key custody (Phase 6 Plan 06-01 Tasks 5-6 rewrite)

**Trigger:** Plan 06-01 as written specified bank-grade Android keystore custody — 2 encrypted-DMG USB sticks at ≥5 km separation + laminated paper recovery cards + 1Password sealed passphrase + 7-step USB placement attestation. The same over-engineering pattern that motivated the original 21-phase retirement, applied recursively to a single plan.

**New principle (governs Phase 6 onwards):**

> **Key custody procedures (Phase 6+) follow the same lean principle as the rest of the closed-beta scope — bank-grade only after public-launch threshold. For 5-10 friend testers, keystore loss is "re-release under new package + ask 10 people to reinstall" inconvenience, not catastrophe. Engineer recovery to that blast radius, not to a hypothetical scale event.**

**Concrete scope cut for Plan 06-01 Tasks 5-6 (was 2 USBs at ≥5 km, now ONE cloud backup):**

| Was (bank-grade) | Now (lean) |
|---|---|
| 2 encrypted-DMG USB sticks (USB-A home + USB-B ≥5 km offsite) | 1 cloud backup of the SOPS-encrypted `mobile-signing.yaml` + age key (iCloud Drive / Google Drive / Dropbox — user picks) |
| Each USB also encrypted at filesystem layer (AES-256 DMG) on top of SOPS encryption (defense-in-depth) | SOPS + age encryption is the encryption layer — cloud provider only sees ciphertext; no additional DMG wrapper |
| 1Password sealed entry holds DMG passphrase | 1Password sealed entry already holds the age key passphrase (Phase 2 D-04) — no new entry needed; one cross-reference note added |
| Laminated paper RECOVERY-CARDs on each USB ($5-10 each at FedEx) | Single printed `RECOVERY-CARD.md` kept with personal documents at home — no lamination |
| 7-step USB placement attestation in 06-01-SUMMARY | 3-line attestation: cloud provider name + cross-device sync verified + RECOVERY-CARD.md printed |

**Why this is acceptable:**

1. **Real blast radius is bounded.** Closed beta = 5-10 friends installed the app. Keystore loss = release a new build under `com.runningecosystem.mobile2` + DM the testers "please reinstall, here's the new link." Annoying, ~30 min of work, not "the app is dead."
2. **SOPS + age encryption is the security envelope, NOT the storage medium.** Cloud providers see SOPS ciphertext — even with full account compromise, attacker has encrypted YAML + needs the age key. Age key lives in `~/.config/sops/age/keys.txt` on the dev workstation, NOT in the cloud backup (only the keystore + provisioning bundle).
3. **Wait — that means we need the age key separately backed up.** Phase 2 D-04 already specified "age private key in 1Password sealed entry per dev." So the age key already has a recovery path: 1Password. The cloud backup of `mobile-signing.yaml` is encrypted by THAT age key. Recovery = 1Password → age key → cloud → SOPS decrypt. Two-factor, but no USBs.
4. **Geographic redundancy delivered by the cloud provider.** Apple/Google/Dropbox all replicate to ≥2 data centers. The user gets ≥5 km separation for free.
5. **The "2 USBs at ≥5 km" requirement was inherited from Phase 2 D-04 which itself was inherited from a "Phase 9 Android keystore strategy" that was designed for the 21-phase scope.** Re-evaluated under the closed-beta lens, it doesn't pass.

**v1.0.1 backlog entry:** `PROD-LAUNCH-PREP` (Bank-grade key custody — 2 USBs at ≥5 km + lamination + 1Password DMG entry; gated on beta passing >50 users — same trigger as ADR-0011 re-expansion §1). Tracked in ROADMAP.md `v1.0.1 Backlog`.

**Files affected by this amendment:**

- `.planning/phases/06-release-signing/06-CONTEXT.md` — D-07 + D-15 partially superseded (new "Post-CONTEXT amendments" section added)
- `.planning/phases/06-release-signing/06-01-PLAN.md` — Tasks 5 + 6 rewritten; `must_haves` adjusted; `files_modified` updated
- `.planning/phases/06-release-signing/06-VALIDATION.md` — per-task verification map for Tasks 5-6 updated to match new acceptance gates
- `.planning/ROADMAP.md` — new `PROD-LAUNCH-PREP` row in v1.0.1 backlog
- `.planning/STATE.md` — `stopped_at` updated to reflect scope-cut amendment

**Files NOT touched by this amendment:** keystore generation procedure (RAM disk / PKCS12 / RSA 4096 / 100-year validity) stays as-is. SOPS slot structure stays as-is. SHA-256 fingerprint capture for D-19 Mapbox restriction stays as-is. `docs/SECRETS.md` recovery section stays — but its scenario (a) "USB restore" wording softens to "cloud download + age key from 1Password" (a one-line copy-edit).

**Re-expansion trigger for THIS amendment:** Beta passes 50 users → revisit `PROD-LAUNCH-PREP` from v1.0.1 backlog, apply the bank-grade procedure THEN. The current `mobile-signing.yaml` can be re-backed-up to 2 USBs at that point without re-generating any keys (same SOPS file, just additional copies).

---

## Amendment 3 2026-05-20 PM — Android-first launch (iOS deferred)

**Trigger:** Plan 06-02 (iOS Apple Developer enrollment) sits on a 2-7+ week external SLA per RESEARCH §1 (2026 degraded enrollment review time). Plans 07-02 (EAS iOS production) + 07-03 iOS-SLC portion + 08-02 (TestFlight) + 09-02 iOS testers all depend on Apple credentials. The dependency chain means iOS work blocks the whole launch on an external review queue the dev has no way to accelerate.

Android side has zero external blockers: Plan 06-01 generates the keystore locally, Plan 07-01 builds via EAS Android, Plan 08-01 ships via Caddy + Storage Box self-hosted manifest, Plan 09 invites Android testers. Whole Android critical path is ~3-5 weeks of solo dev work, no external review wait.

**Decision:** Ship Android-only for the first closed-beta wave. iOS deferred until Android beta stabilizes OR explicit user decision to start iOS work.

**Concrete sub-plan deferrals (artifacts STAY on disk; scope flags in ROADMAP + REQUIREMENTS only):**

| Sub-plan | Was | Now |
|---|---|---|
| `06-02-PLAN.md` (iOS Apple Dev enrollment + cert + provisioning + ASC API key) | Wave 2 of Phase 6, autonomous=false, `expected_pause_max: "7 weeks"` | DEFERRED. Plan file stays on disk unchanged. ROADMAP + REQUIREMENTS flag `SIGN-02` as deferred. Phase 6 closes on Plan 06-01 completion only. |
| `07-02-PLAN.md` (EAS iOS production profile + Hermes + bitcode off + staging↔prod + iOS 16+) | Wave 1 of Phase 7 | DEFERRED. ROADMAP + REQUIREMENTS flag `BUILD-02` as deferred. Phase 7 closes on Plan 07-01 + 07-03-Android-portion only. |
| `07-03-PLAN.md` iOS SLC portion | Mixed into 07-03 alongside Android foreground service | iOS SLC portion DROPPED from v1.0. STAB-01 rewritten Android-only (foreground service notification, MIUI + One UI mitigations, 1h pocket-walk on Pixel only). 07-03 stays single-plan but Android-scoped. |
| `08-02-PLAN.md` (iOS TestFlight CI workflow + auto-bump + internal group seed) | Wave 1 of Phase 8 | DEFERRED. ROADMAP + REQUIREMENTS flag `DIST-02` as deferred. Phase 8 closes on Plan 08-01 only. |
| Phase 9 tester mix | "5-10 friends across Android + iOS via TestFlight + Caddy manifest" | "5-10 Android friends via Caddy manifest URL." LAUNCH-02 rewritten Android-only. |

**Re-expansion trigger for THIS amendment:**

Revisit deferred iOS sub-plans when **either** condition fires:

1. **Android beta stabilizes.** "Stable" is TBD by user-report signal — concretely: ≥3 consecutive weeks of closed-beta usage with no P0 reports from any tester; or user explicitly decides "Android side is in good enough shape, time to start iOS." No formal NFR gate.
2. **Explicit user decision to start iOS work.** E.g., a tester asks for iOS specifically OR user wants to test iOS personally OR business case shifts.

When re-triggered:
- Move `06-02-PLAN.md`, `07-02-PLAN.md`, `08-02-PLAN.md` back from "deferred" to "active" in ROADMAP + REQUIREMENTS.
- Restore iOS SLC portion to STAB-01 OR create a new STAB-02 for iOS-only stability. STAB-01 stays Android-only; iOS gets its own ID.
- Restore iOS testers to LAUNCH-02 OR create LAUNCH-03 for iOS-specific watchlist.
- Start Apple Developer Program enrollment on the day of re-trigger (the 2-7 week clock starts then).

**What this amendment does NOT change:**

- Phase count stays at 9 (1-5 done + 6-9 active). Just narrows scope within phases 6-9.
- `.secrets/prod/mobile-signing.yaml` SOPS slot structure stays the same — the YAML schema reserves an `ios:` block that stays empty for now, populated when iOS work activates. No re-keying.
- ADR-0011 Amendment 2026-05-20 PM (lean key custody) still applies — when iOS work activates, iOS cert + .p12 + provisioning + ASC API key add to the same cloud backup, same RECOVERY-CARD.md.
- Phase 1-5 work (API contract, secrets, infra, CI/CD, observability) ships as-is — none of it was iOS-specific anyway.
- `apps/mobile-rn/app.json` keeps the `ios:` block (bundle ID, NSLocationWhenInUseUsageDescription, etc.) — Expo RN supports building one or both platforms from the same config. Removing iOS config now would be churn.

**Updated milestone description:**

`PROJECT.md` milestone changes from "Closed-beta release in 4 lean phases" to **"Android closed-beta release in 4 lean phases (iOS deferred to post-Android-beta milestone — see ADR-0011 Amendment 3)"**.

**Files affected by Amendment 3:**

- `.planning/ROADMAP.md` — Phase 6/7/8/9 sub-plan flags; STAB-01 + LAUNCH-02 wording
- `.planning/REQUIREMENTS.md` — SIGN-02 / BUILD-02 / DIST-02 flagged deferred; STAB-01 + LAUNCH-02 rewritten Android-only
- `.planning/PROJECT.md` — milestone description updated
- `.planning/STATE.md` — `stopped_at` reflects scope adjustment
- `.planning/phases/06-release-signing/06-VALIDATION.md` — 06-02-* rows marked deferred (already covered by Amendment 2 PM work as well)

**Files NOT touched by Amendment 3:**

- `06-02-PLAN.md`, `06-CONTEXT.md`, `06-RESEARCH.md`, `06-PATTERNS.md`, `06-PLAN-CHECK.md` — stay as-written; reactivation = un-flag in ROADMAP/REQUIREMENTS, no plan content edits.
- Phase 7/8/9 plan files do not exist yet (only ROADMAP entries) — when those phases plan, the planner reads the deferred flags from ROADMAP/REQUIREMENTS and skips iOS scope.

---

## Amendment 4 2026-05-20 PM — Keystore backup deferred (single SOPS copy on dev workstation = sufficient)

**Trigger:** Plan 06-01 Task 5 dispatch (resume after Tasks 0-4 already shipped) reached a workstation-state checkpoint: iCloud Drive not configured, OneDrive daemon dormant, Dropbox stale >1 year. Picking a cloud provider became a real architectural decision rather than a one-line `cp` operation. Re-evaluating against the closed-beta blast radius the same way Amendment 2 did:

> **Keystore loss for closed beta = re-release under new package name + DM the 5-10 testers to reinstall. ~30 minutes of recovery work. The keystore is NOT a load-bearing production asset for a 5-10-tester closed beta — it's load-bearing only when (a) shipping to Google Play Store, OR (b) the tester base outgrows DM-everyone, OR (c) reputation/trust depends on continuity of installs.**

**New principle (governs Phase 6 onwards; extends Amendment 2 PM):**

> **Keystore custody for closed beta = SINGLE SOPS-encrypted copy on the dev workstation is sufficient. No cloud backup, no USB ceremony, no off-site replica.** The SOPS+age envelope on disk (`~/.config/sops/age/keys.txt` for the age private key + `.secrets/prod/mobile-signing.yaml` for the keystore bytes) is the only copy until one of the re-expansion triggers below fires.

**Concrete scope cut for Plan 06-01 (was Tasks 0-7, now Tasks 0-4 only):**

| Was (Amendment 2 PM — cloud backup) | Now (Amendment 4 PM — no backup) |
|---|---|
| Task 5: cloud-sync SOPS bundle + age key to user-chosen cloud (iCloud/Drive/Dropbox) + write `RECOVERY-CARD.md` heredoc + `cloud-backup-log.txt` heredoc | **DEFERRED to v1.0.1 backlog (`KEYSTORE-CLOUD-BACKUP`).** Task 5 not executed in v1.0. |
| Task 6 (USER ACTION): cross-device sync verification on phone + print + place `RECOVERY-CARD.md` at home | **DEFERRED to v1.0.1 backlog.** Task 6 not executed in v1.0. |
| Task 7: write 06-01-SUMMARY + closeout commit (closes Plan 06-01 + Phase 6) | **PROMOTED to immediate closeout.** Write 06-01-SUMMARY now reflecting Tasks 0-4 done + 5-6 deferred. |
| `SIGN-01` clause "2 offline physical backups in separate physical locations" | REWRITTEN to "single SOPS-encrypted copy on dev workstation; backup deferred to `KEYSTORE-CLOUD-BACKUP` v1.0.1 backlog." |

**Why this is acceptable (extending Amendment 2 PM reasoning):**

1. **Real blast radius is bounded.** 5-10 testers + DM-everyone-on-Telegram reinstall workflow = 30-minute recovery from keystore loss. Compare to: ~10 minutes of cloud-provider setup + ongoing sync-app maintenance × every phase that touches mobile-signing.yaml.
2. **SOPS+age envelope on disk is itself secure.** Workstation backup (Time Machine / dev workstation rebuild) covers the disk-loss scenario incidentally — Time Machine is encrypted at rest, age key + SOPS-encrypted YAML both restore.
3. **The cloud-backup proposal was a "what if dev workstation dies" hedge.** Probability of dev workstation total loss before closed-beta wraps in ~3-5 weeks is low. If it happens: regenerate keystore (15 min) + re-release under new package name + DM testers (~30 min). Total: ~45 min vs cloud setup tax of ~30 min upfront + ongoing.
4. **Promotion triggers exist.** If the project crosses any of the 3 thresholds below, the cloud backup work moves from "deferred" to "do now" via v1.0.1 `KEYSTORE-CLOUD-BACKUP`. Until then, single SOPS copy on workstation is correct.
5. **The keystore is regenerable, not unique.** This is materially different from, e.g., the SOPS age key (which IS load-bearing and IS backed up to 1Password sealed entry per Phase 2 D-04). Losing the keystore = re-release. Losing the age key = lose access to ALL `.secrets/**/*.yaml` files across the project. The age key keeps its Phase 2 D-04 backup; the keystore doesn't need its own.

**v1.0.1 backlog entry:** `KEYSTORE-CLOUD-BACKUP` — promote keystore backup (was Plan 06-01 Tasks 5+6) when ANY of:
1. **Google Play Store submission begins.** Play Store enforces signed-by-same-key for all updates forever; recovery from keystore loss = re-publish as a NEW app (loses ratings, install base, listing history). At Play Store scale, keystore loss IS catastrophic, justifying the backup ceremony.
2. **Tester base passes 50 users.** DM-everyone-reinstall doesn't scale; needs a recovery path that doesn't depend on manually coordinating with each tester.
3. **Explicit decision to start treating the keystore as a production asset.** E.g., business case shifts, project incorporates, third-party (investor / partner) needs continuity assurance.

Promotion path: re-run the lean cloud-backup variant of Tasks 5+6 (preserved in `06-01-PLAN.md` body) OR if Play Store submission triggered it, escalate to the original bank-grade 2-USB variant (preserved in git history at commit 406cf3a) per `PROD-LAUNCH-PREP` v1.0.1 backlog entry.

**Files affected by Amendment 4:**

- `.planning/phases/06-release-signing/06-CONTEXT.md` — D-07 (was already partially superseded by Amendment 2 PM) + D-15(a) (was already softened) now **fully superseded**. Post-CONTEXT amendment block extended.
- `.planning/phases/06-release-signing/06-01-PLAN.md` — Tasks 5 + 6 marked DEFERRED inline (frontmatter + task-level notices). `must_haves.truths` trimmed to remove backup clauses. Plan content not deleted (preserves audit + makes promotion trivial).
- `.planning/phases/06-release-signing/06-VALIDATION.md` — 06-01-05 + 06-01-06 rows marked deferred (matches the 06-02-* pattern from Amendment 3).
- `.planning/phases/06-release-signing/06-01-SUMMARY.md` — NEW. Closeout SUMMARY for Plan 06-01: Tasks 0-4 done, Tasks 5-6 deferred.
- `.planning/ROADMAP.md` — Phase 6 row `[ ]` → `[x]` with deferral note. v1.0.1 backlog gains `KEYSTORE-CLOUD-BACKUP` row.
- `.planning/REQUIREMENTS.md` — SIGN-01 clause "2 offline physical backups" rewritten to "single SOPS copy on dev workstation; backup deferred". Trace table SIGN-01 = Complete.
- `.planning/PROJECT.md` — Phase 6 row `[x]` DONE.
- `.planning/STATE.md` — Phase 6 CLOSED; Phase 7 = next.

**Files NOT touched by Amendment 4:**

- `06-02-PLAN.md`, `06-CONTEXT.md` body (only amendment block appended), `06-RESEARCH.md`, `06-PATTERNS.md`, `06-PLAN-CHECK.md` — stay as-written.
- The cloud-backup variant of Tasks 5+6 in `06-01-PLAN.md` body — stays in the file as preserved-but-deferred content. Promotion = un-flag the deferral notices, no rewrite needed.

**Re-expansion trigger for THIS amendment:** any of the 3 `KEYSTORE-CLOUD-BACKUP` v1.0.1 backlog triggers (Play Store submission / >50 users / explicit production-asset decision). At that point, re-execute Plan 06-01 Tasks 5+6 (their bodies are preserved in `06-01-PLAN.md` from Amendment 2 PM).

---

## Amendment 5 2026-05-24 — Phase 8 distribution-pipeline parked behind feature gate (closed-beta scope reduced to manual sideload)

**Trigger:** Plan 08-01 code shipped end-to-end (commits `44c033f` → `a271f63` + codebase-map refresh `ac76df0`): Ed25519 manifest signing, `release-distribute.sh` + Go signer/verifier, `android-release.yml` extension with bundletool + MinIO + manifest publish, mobile `src/update/*` module with verifier + force-update + banner UI + `useUpdateCheckOnForeground` hook + Settings "Проверить обновления" button. The pipeline is operational on the workflow + mobile sides but requires a self-hosted MinIO endpoint to actually distribute — and standing up that backend has been re-scoped out of the closed-beta phase. The dev's day-to-day install path is now: `./gradlew assembleDebug` on BlueStacks for dev-loop + manual `adb install` of EAS-signed universal APK on Pixel for pocket-walk validation. No manifest, no signed-URL flow.

Re-evaluating against the closed-beta blast radius the same way Amendments 2 + 4 did:

> **Distribution-pipeline for 5-10 friend testers = manual sideload via DM-with-APK-link. The signed-manifest + signed-URL + Ed25519 verifier + auto-update-banner flow is over-engineered for that audience. It is load-bearing only when (a) tester base outgrows DM-with-link, OR (b) "force minimum version" enforcement becomes operationally necessary (e.g., backend breaking change requires forced upgrade), OR (c) the project transitions to public distribution outside Play Store.**

**New principle (governs Phase 8 onwards; extends Amendments 2 + 4):**

> **Distribution mode for closed beta = manual sideload by solo dev. The Phase 8 code stays in the repo (exercised by jest, type-checked, lint-clean) but is gated off at runtime via feature flags. Re-enabling is a configuration change — set `EXPO_PUBLIC_UPDATE_MANIFEST_URL` in mobile env + `MINIO_RELEASES_ACCESS_KEY` secret in repo settings — not a re-implementation.**

**Concrete scope cut (was Plan 08-01 production-ready, now Plan 08-01 code-complete + runtime-gated):**

| Was (Plan 08-01 as-shipped) | Now (Amendment 5 — gated) |
|---|---|
| Mobile `manifestCheck.ts` fetches from hardcoded `https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json` | Reads `process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL`; empty/unset → early return `{state:'disabled'}` without network fetch (no `manifestUrl` not set → silent skip + `__DEV__` warn) |
| Settings "Проверить обновления" silently fails fetch on tap | Surfaces toast «Проверка обновлений отключена» on `disabled` state so the button doesn't feel broken |
| `android-release.yml` distribute steps (bundletool + .aab download + SOPS decrypt manifest-signing + `release-distribute.sh`) run unconditionally on tag push | All 4 distribute steps gated by job-level `DISTRIBUTE_ENABLED` env, derived from `secrets.MINIO_RELEASES_ACCESS_KEY != ''`. Without the secret, EAS build still produces signed .aab + prints artifact URL in step output for manual sideload |
| Plan 08-01 status: code-shipped, awaiting SUMMARY | Plan 08-01 status: **code-complete, runtime-disabled (gated)**; no SUMMARY yet — the deferred-aware closure pattern (Plan 06-01 Amendment 4 style) is appropriate. Promote to fully closed once the v1.0.1 promotion trigger fires. |

**Why this is acceptable (extending Amendments 2 + 4 reasoning):**

1. **Real blast radius is bounded.** 5-10 testers + DM-with-link reinstall workflow = 5-minute recovery from any "they need to update". The Ed25519-signed manifest pipeline buys us nothing at this scale that DM-link doesn't already buy us.
2. **Code stays upgradable.** jest exercises `manifestCheck.ts`, `manifestSchema.ts`, `manifestSigning.ts`, `useUpdateCheckOnForeground`, `forceUpdate` store, `updateBannerStore`, `updateCheckStore`, `semverLite`, `UpdateBanner` — 638/638 tests green at this commit. Dependency drift (e.g., `@noble/ed25519` v3 API churn already fixed once in `721210f`) will be caught by jest in CI long before re-enabling, not at the worst possible moment when standing up the backend under pressure.
3. **Re-enabling is a config flip, not a rewrite.** Mobile: set `EXPO_PUBLIC_UPDATE_MANIFEST_URL=https://...` in `apps/mobile-rn/.env` (gitignored) or `app.json` `extra` before `eas build`. CI: populate `MINIO_RELEASES_ACCESS_KEY` + `MINIO_RELEASES_SECRET_KEY` repo secrets. The `DISTRIBUTE_ENABLED` env auto-evaluates `true`, distribution steps fire, mobile clients fetch + verify + dispatch normally.
4. **The .aab is still built on tag push.** Gate covers only post-build distribution steps (bundletool extract + manifest sign + MinIO upload). The signed .aab artifact URL still prints in the EAS step output and is downloadable via `curl` for manual sideload — exactly the loop already documented in `.planning/STATE.md` §Pending user-actions (Plan 07-03 Tasks 5+6).
5. **ADR + STATE discipline is preserved.** Phase 8 didn't get reverted, archived, or hidden behind "we'll figure it out later". It's documented as parked, with explicit promotion triggers and a 1-step re-enable recipe. Future-me reading this in 6 months has a clear picture.

**v1.0.1 backlog entry:** `DISTRIBUTION-PIPELINE-RE-ENABLE` — promote Phase 8 distribution pipeline from gated to active when ANY of:
1. **Tester base passes ~20 active users.** DM-with-link starts hitting "did everyone update" overhead; signed-manifest auto-update becomes worth the operational complexity.
2. **Forced upgrade becomes operationally needed.** E.g., backend breaking change requires `min_supported_version` enforcement; the `useForceUpdateStore` + `min_supported_version` field exists in code but is inert while gated.
3. **MinIO (or equivalent S3-compatible object store) provisioned on the user's own infra.** Until then, there's no public endpoint to host `manifest.json`. Setting `EXPO_PUBLIC_UPDATE_MANIFEST_URL` to a non-existent URL would result in silent fetch failures + `__DEV__` warns — strictly worse than the current `state:'disabled'` short-circuit.
4. **Transition to broader distribution OUTSIDE Play Store.** E.g., open public beta with a landing page. Play Store has its own update mechanism; this pipeline is for self-hosted distribution.

Promotion path: (a) populate `MINIO_RELEASES_ACCESS_KEY` + `MINIO_RELEASES_SECRET_KEY` repo secrets (CI side automatically flips `DISTRIBUTE_ENABLED` to `true` on next tag push), (b) configure mobile env `EXPO_PUBLIC_UPDATE_MANIFEST_URL` to match MinIO public-read bucket URL, (c) cut a new beta tag — distribution + auto-update fire end-to-end. No code changes required.

**Files affected by Amendment 5:**

- `apps/mobile-rn/src/update/manifestCheck.ts` — `MANIFEST_URL` const → `getManifestUrl()` reading `process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL ?? ''`; new `{state:'disabled'}` early return at top of `checkForUpdate`.
- `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts` — `beforeEach` injects test URL to keep existing 11 dispatch tests passing; new `gated (ADR-0011 Amendment 5)` describe-block with 2 new tests for empty/unset env. 638/638 green.
- `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx` — `handleCheckUpdate` surfaces toast «Проверка обновлений отключена» on `disabled` state.
- `.github/workflows/android-release.yml` — job-level `env.DISTRIBUTE_ENABLED` derived from `secrets.MINIO_RELEASES_ACCESS_KEY != ''`; 4 step-level `if: env.DISTRIBUTE_ENABLED == 'true'` gates (bundletool install + .aab download + manifest-signing decrypt + release distribute).
- `.planning/STATE.md` — Plan 08-01 status row updated to `code-complete, runtime-disabled (gated)`; Performance Metrics timeline gains 2026-05-24 PM entry recording the gate landing.
- `.planning/ROADMAP.md` — v1.0.1 backlog gains `DISTRIBUTION-PIPELINE-RE-ENABLE` entry. (Done as part of this amendment landing commit.)

**Files NOT touched by Amendment 5:**

- `apps/mobile-rn/src/update/manifestSigning.ts`, `manifestSchema.ts`, `updateBannerStore.ts`, `updateCheckStore.ts`, `useUpdateCheckOnForeground.ts`, `UpdateBanner.tsx`, `semverLite.ts` — all stay live + jest-exercised + tsc-clean. No gating at these layers; the single gate at `manifestCheck.ts` entry is enough.
- `scripts/release-distribute.sh`, `scripts/sign-manifest.go`, `scripts/verify-manifest.go` — stay in the repo. They only execute when `release-distribute.sh` is invoked, which only happens inside the gated workflow step. No need to gate or move.
- `.secrets/prod/manifest-signing.yaml` — stays SOPS-encrypted in repo. Ed25519 keypair already generated (commit `af6cb5f`); decrypt step is gated, no risk of accidental decrypt on tag push with gate off.
- `.planning/phases/08-closed-beta-distribution/*` — all planning artifacts (CONTEXT, RESEARCH, PLAN, PLAN-CHECK) stay as-written. Preserves audit trail + makes promotion trivial.

**Re-expansion trigger for THIS amendment:** any of the 4 `DISTRIBUTION-PIPELINE-RE-ENABLE` v1.0.1 backlog triggers above. At that point, re-enable is a 3-step config change (no code rewrite); Plan 08-01 promotes from "code-complete, gated" to "fully closed" via a 08-01-SUMMARY.md write + STATE.md status flip.

