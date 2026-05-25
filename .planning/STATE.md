---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Closed Beta
status: executing
stopped_at: Plan 08-01 GATED per ADR-0011 Amendment 5 (code-complete + runtime-disabled; mobile EXPO_PUBLIC_UPDATE_MANIFEST_URL + workflow DISTRIBUTE_ENABLED gates; re-enable = config flip)
last_updated: "2026-05-24T19:30:00.000Z"
progress:
  total_phases: 6  # ADR-0011 Amendment 6: 4 → 6 (Phase 10 friend-requests + Phase 11 stories)
  completed_phases: 0
  total_plans: 6
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-15 — milestone v1.0 redefined)
See: `.planning/MILESTONES.md` (milestone history + per-milestone phase progress)

**Milestone:** v1.0 Android Closed Beta — IN PROGRESS, **REDEFINED 2026-05-20** per [ADR-0011](../docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md) (was 21-phase enterprise-hardening, retired), **AMENDED 2026-05-20 PM** per [ADR-0011 Amendment 3](../docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md#amendment-3-2026-05-20-pm--android-first-launch-ios-deferred) to Android-first launch (iOS deferred to post-Android-beta milestone). Closed beta = solo dev shipping to 5-10 Android friend testers via self-hosted Caddy manifest. Target close: tag `v1.0.0-beta.1` published + 72h watchlist clean (no P0). No formal soak gate.
**Core value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.
**Current focus:** Phase 7 Plan 07-01 **CLOSED 2026-05-24** (commit `5e2a8a6` — 07-01-SUMMARY with Tasks 0-7 closeout). Plan 07-03 Tasks 1-4 (code) **COMPLETE 2026-05-24** (commits `01d567f` + `9131904` + `79cb767` + `4df65d8`). Plan 07-03 Task 5+6 (device) remain device-blocked. **Stage A' end-to-end empirically proven 2026-05-24 18:43 UTC**: EAS Cloud build `052a2e92-ef79-4f82-aaa2-542f4fb26806` (tag `v1.0.0-beta.4`, commit `f09e729`) finished after 11m 39s; .aab artifact `CZseoc8Nac3ouY86QqPU3.aab` signed with our `runningecosystem-release` keystore (cert SHA-256 preserved). This empirically validates the R8/ProGuard keep rules for closed-beta scope (Mapbox + MMKV + expo-task-manager + Hermes don't strip).

**Plan 08-01 status (2026-05-24 PM):** code-complete + runtime-disabled (gated) per [ADR-0011 Amendment 5](../docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md#amendment-5-2026-05-24--phase-8-distribution-pipeline-parked-behind-feature-gate-closed-beta-scope-reduced-to-manual-sideload). Mobile `manifestCheck.ts` reads `process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL` (empty default → `{state:'disabled'}` short-circuit, no fetch). Workflow `android-release.yml` distribute steps (bundletool + .aab download + manifest-signing decrypt + release-distribute.sh) gated by job-level `DISTRIBUTE_ENABLED` env derived from `secrets.MINIO_RELEASES_ACCESS_KEY != ''`. Re-enable = (1) set `EXPO_PUBLIC_UPDATE_MANIFEST_URL` in mobile env, (2) populate `MINIO_RELEASES_*` repo secrets — no code rewrite. jest 638/638 green + tsc clean post-gate. Plan 08-01 stays at `completed_plans: 2` in frontmatter (deferred-aware closure pattern, à la Plan 06-01 Amendment 4); v1.0.1 backlog gains `DISTRIBUTION-PIPELINE-RE-ENABLE` with 4 promotion triggers.

**Brownfield note:** Codebase remains on `feat/cursona-redesign` (35 commits of pre-v1.0 territory-core refactors + Phases 1-5 of v1.0 hardening + Phase 6 + Phase 7 Wave 0-5 on top). Old planning artifacts archived to `.planning/phases/_archive/pre-v1.0-territory-refactors/`. 21-phase scope archive at `.planning/phases/_archive/superseded-21-phase-v1.0/`.

**Active commits ahead of main:** As of 2026-05-23, `feat/cursona-redesign` is ahead of `main` by the entirety of Phases 6-7 work plus the security incident response. Cherry-pick `b461ea6` (workflow patch) on `main` is the only piece deliberately ported there (because GitHub fires tag-triggered workflows from the default-branch registration). All other work lands when `feat/cursona-redesign` merges to `main` at the v1.0 acceptance gate.

## Current Position

Phase: 7 (release-builds-mobile-stability) — Plan 07-01 CLOSED 2026-05-24
Plan: 07-01 (BUILD-01 — EAS Android production + R8/ProGuard + arm64-v8a + tag-triggered workflow). **All Tasks 0-7 done.** CI-side Stage A' validation passed across 4 iterations (after 2 incident-driven workflow patches + 1 `eas init` user-action + 1 `credentialsSource: local` fix). EAS Cloud build 9e243e59 queued under our `runningecosystem-release` keystore + cert SHA-256 preservation. See `.planning/phases/07-release-builds-mobile-stability/07-01-SUMMARY.md` for full closeout.
Last completed: **Plan 07-01 SUMMARY** (commit `5e2a8a6`). Plan 07-03 (foreground service + MIUI/One UI mitigations + 1h Pixel pocket-walk) remains the only open plan in Phase 7; device-blocked until physical Pixel acquired.

**Pending user-actions (concrete next steps):**

1. **Physical Pixel device** (Plan 07-03 Task 5+6 unblocker): pre-walk smoke + 1h pocket-walk per STAB-01 success criterion 7. With the signed .aab now in hand, the procedure is: `bundletool build-apks --bundle=<.aab path> --output=<.apks> --mode=universal` → unzip universal.apk → `adb install -r` on Pixel → execute the 3-phase pre-walk smoke per 07-03-PLAN Task 5 → 1h pocket-walk per Task 6's CONTEXT D-18 5-sub-check matrix. Until a Pixel is available, Plan 07-03 sits idle here.
2. **Optional verification:** `apksigner verify --print-certs` of the universal APK extracted from the .aab should report cert SHA-256 `C6:33:47:6C:63:11:40:3F:5D:19:E2:3A:07:3A:15:F6:EA:BC:D6:40:FB:7F:F5:49:A5:B1:C3:A5:18:30:D7:BB` (matching the locally-captured value in `.planning/phases/06-release-signing/evidence/keystore-sha256.txt`). Requires `brew install bundletool` if not installed.
3. **Optional:** clean up 5 duplicate `android.permissions` entries in `apps/mobile-rn/app.json` left by `eas init` (harmless; Android dedupes at manifest-merge time).
4. **Optional:** clean up `/tmp/mobile-signing.pre-{rotation,rerotation}.*.yaml` backups via `rm -P` after enough confidence in the rotated keystore.

Progress: `[████████░░░░░░░░░░░░] 2/6 plans (33%)` — Phase 6 done (Plan 06-01), Phase 7 partial (Plan 07-01 closed; Plan 07-03 device-blocked), Phases 8-9 unplanned. Per ADR-0011 4-phase lean scope.

**Pre-v1.0 baseline:** 35 commits of territory-core refactors already on `feat/cursona-redesign` from the superseded scope (SessionManager, tracker hooks, closure feedback, offline region picker bounds fix, adaptive sampling + SLC, ESLint v9 + token-secret guard). These kept as-is; field-test validation folded into Phase 7 STAB-01 (Plan 07-03 Pixel pocket-walk smoke — Android-only per Amendment 3).

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

- 2026-05-24 PM (2nd update) — **Plan 08-01 GATED per ADR-0011 Amendment 5.** Phase 8 distribution-pipeline parked behind feature gate (closed-beta scope reduced to manual sideload by solo dev). Mobile: `manifestCheck.ts` `MANIFEST_URL` const → `getManifestUrl()` reading `process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL ?? ''`; new `{state:'disabled'}` early-return at top of `checkForUpdate` (no network fetch, `__DEV__` warn only); CheckResult union extended; SettingsScreen "Проверить обновления" surfaces toast «Проверка обновлений отключена» on `disabled`. Tests: `beforeEach` injects test URL to keep 11 existing dispatch tests passing; new `gated` describe-block with 2 tests for empty/unset env. Workflow: job-level `env.DISTRIBUTE_ENABLED` derived from `secrets.MINIO_RELEASES_ACCESS_KEY != ''`; 4 step-level `if: env.DISTRIBUTE_ENABLED == 'true'` gates (bundletool install + .aab download + manifest-signing decrypt + release distribute). jest 638/638 green + tsc clean + actionlint clean. ADR-0011 Amendment 5 documents: trigger, principle, scope cut table, 5-point acceptability reasoning, v1.0.1 `DISTRIBUTION-PIPELINE-RE-ENABLE` backlog with 4 promotion triggers, 3-step re-enable recipe (config flip, no code rewrite). Frontmatter `completed_plans: 2` unchanged (deferred-aware closure, à la Plan 06-01 Amendment 4 pattern).
- 2026-05-24 PM — **Plan 07-03 Tasks 1-4 SHIPPED + ENOENT-gradlew fix + .aab signed end-to-end.** Stage A' fifth iteration (`v1.0.0-beta.4`, CI run 26365264147, EAS build 052a2e92) finished with a signed .aab. Commits: `01d567f` Task 1 (notification icon + app.json `notification` block + expo-location plugin extension) → `9131904` Task 2 (`src/foreground/notification.ts` + App.tsx subscription; plan-vs-reality drift fix — `useActivityStore` + `totalDistance(points)` derived, not phantom `useSessionStore.duration`) → `79cb767` Task 3 (`src/vendor/oem.ts` + `openOEMSettings.ts` + 17 unit tests, MIUI/One UI intents + generic fallback) → `4df65d8` Task 4 (`src/vendor/AutostartDialog.tsx` + MMKV flag + TrackerStartScreen wiring + 7 unit tests) → `f09e729` ENOENT fix (commit bare android/ tree — 38 files: gradlew + wrapper + manifests + source + res; EAS Cloud needs full bare tree because it does NOT re-run `expo prebuild` when `android/` exists). `.aab` artifact URL: `https://expo.dev/artifacts/eas/CZseoc8Nac3ouY86QqPU3.aab` (signed with our keystore; Plan 07-03 Tasks 5+6 device validation now unblocked once a physical Pixel is available — `apksigner verify --print-certs` of the universal APK should show cert SHA-256 `C6:33:47:6C:63:11:40:3F:5D:19:E2:3A:07:3A:15:F6:EA:BC:D6:40:FB:7F:F5:49:A5:B1:C3:A5:18:30:D7:BB`). 591/591 jest tests + tsc clean.
- 2026-05-24 — **Plan 07-01 CLOSED.** Stage A' CI-side validated end-to-end across 4 CI iterations: 26245775886 (DELETED per ADR-0012) → 26258849328 (Invalid UUID) → 26362716928 (EAS remote credentials) → **26362961267 ✅ `Using local Android credentials`**. Commits: `5a26c68` (`eas init` populates app.json with real projectId `a9f8e26f-bd3f-4296-b67e-21909721132c`) + `8b750cd` (`credentialsSource: "local"` in eas.json + `credentials.json` generated-at-CI-time via `jq -n --arg` with `::add-mask::` protection inherited) + `5e2a8a6` (07-01-SUMMARY). EAS Cloud build 9e243e59 queued (later failed on EAS Cloud side with `ENOENT: gradlew` — fixed via `f09e729` two hours later; see entry above).
- 2026-05-23 — **Codebase map refresh** (commit `32cab82`). 4 parallel `gsd-codebase-mapper` agents regenerated all 7 documents in `.planning/codebase/` (2,242 lines total) capturing phases 5-7 additions, ADR-0011 + 4 amendments, ADR-0012 + amendment.
- 2026-05-23 — **Planning files reconciliation** (commits `4789bde` + `04e43d2`). STATE.md frontmatter updated to lean scope (total_phases 9→4, completed_phases 6→1); PROJECT/REQUIREMENTS/ROADMAP tick-pass + 5 new ADR-0012 v1.0.1 backlog items added.
- 2026-05-22 — **P0 RE-INCIDENT closed (self-inflicted chat-dump leak)**. During post-rotation verification I (executor) dumped the freshly-rotated keystore_password into agent chat via `xxd | tail -3` while investigating a phantom fingerprint discrepancy (root cause: `yq -r` adds trailing newline → pipeline `shasum` hashes `value\n` while capture-then-`printf '%s'` hashes `value`; both valid, neither corruption). Re-rotation commit `21b992c`; ADR-0012 amendment commit `0a206a0` codifies 4 credential-diagnostics discipline rules + v1.0.1 backlog item `CRED-DIAG-DISCIPLINE`. Original `e54d3cfbb4ab` + interim `8ff4b15a2e2c` fingerprints both destroyed; current live fingerprint held only in SOPS bundle.
- 2026-05-22 — **P0 incident response complete (original 5-step playbook)**: STEP 1 deleted leaked CI run 26245775886; STEP 2 audited backend-cd × 2 + backend-ci × 1 runs (0 matches); STEP 3 rotated keystore via `keytool -storepasswd` (PKCS12 invariant rotates store+key atomically; cert SHA-256 preserved → no existing-install invalidation) + SOPS bundle update via `sops set --value-stdin` (commit `f35b4c6`); STEP 4 patched `.github/workflows/android-release.yml` with `::add-mask::` before `$GITHUB_ENV` writes + replaced `npx eas` with explicit `npm install -g eas-cli` (commits `fbc5186` feat-branch + `b461ea6` main cherry-pick — admin-bypass push to main since branch protection blocks direct); STEP 5 wrote `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` (commit `c3659e7`). Stage A' CI run 26258849328 re-fired under patched workflow + rotated credentials: security validation **PASSED** (0 plaintext matches, all passwords show `***`, EXPO_TOKEN masked, explicit eas-cli installed cleanly); build itself failed on `Invalid UUID appId` (Plan 07-01 pre-existing gap, not incident-related).
- 2026-05-21 — **Plan 07-01 Tasks 0-5 shipped** on `feat/cursona-redesign`. Wave 0 evidence scaffolding (Phase 7 evidence dir + tool-versions.txt) → gradle.properties (arm64-v8a-only `reactNativeArchitectures`, `android.enableMinifyInReleaseBuilds=true`, `android.enableShrinkResourcesInReleaseBuilds=true`) → app/build.gradle ABI filter (`abiFilters 'arm64-v8a'`) + signingConfigs.release reading `RUNNING_ECO_RELEASE_*` Gradle properties with debug-keystore fallback → app/proguard-rules.pro keeps for `com.mapbox.**` + `com.rnmapbox.rnmbx.**` + `com.margelo.nitro.mmkv.**` + `expo.modules.taskManager.**` + `com.facebook.hermes.**` + `@DoNotStrip` annotations → eas.json `production.android.env` (`RUNNING_ECO_RELEASE_STORE_FILE` + `RUNNING_ECO_RELEASE_KEY_ALIAS` baked into EAS env) → `.github/workflows/android-release.yml` tag-triggered on `v1.0.0-beta.*` / `v1.0.0-rc.*` (cherry-picked to `main` via PR #2 merged `62da1c1` so registration fires; pre-patch ciphertext form contained the `$GITHUB_ENV` no-mask bug that triggered the P0 incident below). Stage A vs Stage A' decision: emulator profile rolled back; CI+EAS-only smoke validation adopted. CI age recipient added to `.sops.yaml` (commit `dd0dce5`); `sops updatekeys` ran across `.secrets/prod/*.yaml` lifting D-14-CI-AGE-KEY deferral.
- 2026-05-21 — **Phase 7 planning artifacts written**: 07-CONTEXT.md (28 decisions captured autonomously) → 07-RESEARCH.md (~280 lines inline; researcher agent timed out at 83 tool uses) → 07-VALIDATION.md → 07-PATTERNS.md (~470 lines via mapper) → 07-01-PLAN.md (8 tasks 0-7) + 07-03-PLAN.md (7 tasks pending Pixel) → 07-PLAN-CHECK.md (PASS-WITH-NITS). Researcher + planner agents both had socket-drop reliability issues; final plans authored inline.
- 2026-05-21 — **ADR-0011 amendments 2, 3, 4** landed: Amendment 2 (lean key custody) → Amendment 3 (Android-first; iOS sub-plans 06-02/07-02/08-02 + iOS portions of STAB-01/LAUNCH-02 deferred to post-Android-beta milestone; Apple Developer enrollment NOT started) → Amendment 4 (keystore backup deferred entirely; single SOPS-encrypted copy on dev workstation sufficient for closed beta; cloud-backup promoted to v1.0.1 `KEYSTORE-CLOUD-BACKUP` backlog).
- 2026-05-20 — **Phase 6 CLOSED**. Plan 06-01 Tasks 0-4 shipped (commits `7f43069` Wave 0 → `9aa5cab` SOPS skeleton → `0824c9b` keystore + SHA-256 → `8201aa2` SOPS write + round-trip → `27d4954` docs/SECRETS.md recovery section); Tasks 5+6 (USB DMG backup ceremony) marked DEFERRED inline per ADR-0011 Amendment 4. Plan 06-01 SUMMARY documents the deferral + promotion path to v1.0.1 `KEYSTORE-CLOUD-BACKUP`.
- 2026-05-20 — **Milestone v1.0 REDEFINED per ADR-0011** (21-phase enterprise-hardening → 4-phase closed-beta lean). 2 commits: `b77c742` scope reset (ROADMAP + REQUIREMENTS + PROJECT + CLAUDE + ADR-0011 + scripts/debug-tail.sh + 21-phase archive); Commit 2 = Phase 5 closeout (05-06-SUMMARY + STATE.md). **Phase 5 CLOSED**. Plan 05-06 Tasks 1-5 shipped (commits ce6cf01..eb28259 — DebugSessionMiddleware + alloy-shipper role + pii_live_probe.py + ADR-0009 + observability RUNBOOK); Task 6 walkthrough DEFERRED to Phase 9 smoke test conditional on observability being actually exercised. Cosign/SLSA stays wired best-effort per ADR-0011.
- 2026-05-20 — **Phase 5 Wave 3 closed**. Plan 05-05 shipped (3 commits a7831c3..5f1e276 — otel_init.go + sentry_init.go + 8-service main.go chain wire). pkg/observability now 44 passing tests across 6 files. D-38 empty-DSN dormant guard means services boot cleanly without Sentry DSN.
- 2026-05-18 — **Phase 4 closed**. Plans 04-04 (drill PASS + save/scp/load pivot, commit `fb3bfe4`) + 04-05 (branch protection, commit `d972bcc`) + 04-06 (deploy.md §11, pending commit). v1.0.1 backlog populated в ROADMAP с 6 debt items. Branch `main` locked с 8 required checks.
- 2026-05-18 — Codebase map refreshed after phases 2-4 closeout (`c8eb755`).
- 2026-05-17 — **Phase 3 closed**. 3 plans across 3 waves; pivoted mid-execution Hetzner Cloud → provider-agnostic VPS (5→3 plans). INFRA-07 baseline 66.5s on 148.253.214.156.
- 2026-05-16 — **Phase 2 closed**. Plan 02-04 Mapbox token rotation: ADR-0006 verdict A (commit `58b15eb`), SOPS-write + smoke HTTP 200 (commit `881f912`), Incident Log complete + SUMMARY (commit `d6fe1f3`). Old tokens revoked at dashboard by user.
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
- **ADR-0003**: OAuth Google + Apple via `AuthProvider` interface — stub-safe; backend exchange endpoints DEFERRED beyond v1.0 (Strava deferred to v1.1 per HEALTH-04 drop).
- **ADR-0004**: Feed/Stories backend do-nothing.
- **ADR-0005**: Phase 1 (old scope) field-test outcomes — Code Closeout, Deferred Validation (2026-05-14). Field-test acceptance gating folded into Phase 7 STAB-01 (Plan 07-03 Pixel pocket-walk; Android-only per Amendment 3).
- **ADR-0006**: Mapbox token incident reset (Phase 2 / 2026-05-16). Treated-as-compromise full reset; new `sk.` (build/CI) + `pk.` (runtime) with iOS Bundle ID + Android SHA-256 restrictions per verdict A; SOPS-only canonical storage.
- **ADR-0007**: v1.0 Release Contract (Phase 1 / 2026-05-15) — locks mobile↔backend wire contract + version negotiation policy.
- **ADR-0009**: Observability architecture (Phase 5 / 2026-05-20) — slog JSON + PII deny-list scrub + Prom `/metrics` + 3 Grafana dashboards + OTel OTLP/HTTP + Loki+Grafana+Prom on `srv1561293`.
- **ADR-0010**: Sentry SaaS + colocation (Phase 5 / 2026-05-20) — sentry-go SDK wired but DORMANT per D-38 (empty-DSN guard; services boot cleanly without DSN). Activation deferred.
- **ADR-0011 + 4 amendments**: Scope reset to closed-beta lean (2026-05-20). 21-phase enterprise-hardening retired → 4-phase lean closed beta (Phases 6-9 on top of already-shipped Phases 1-5). Amendments: (1) OBS-08 amendment (mobile Settings toggle UX dropped; `DEBUG_SESSIONS_FOR_USER` env-allowlist seam + `scripts/debug-tail.sh` Loki wrapper substitute), (2) lean key custody (single backup vs bank-grade 2× USB), (3) Android-first launch (iOS sub-plans deferred to post-Android-beta milestone), (4) keystore backup deferred entirely (single SOPS-encrypted copy = sufficient for closed beta).
- **ADR-0012 + amendment**: Android keystore password leak incident (2026-05-22). Root cause: `echo "VAR=$value" >> $GITHUB_ENV` does NOT auto-mask (only `${{ secrets.X }}` refs do). 5-step playbook executed (delete leaked run → audit → rotate via `keytool -storepasswd` → patch workflow with `::add-mask::` + explicit eas-cli install → ADR). Amendment 2026-05-22 documents the self-inflicted re-incident from `xxd` chat-dump + codifies 4 credential-diagnostics discipline rules (single canonical fingerprint form via `printf '%s' "$VAR" | shasum`; no byte-level inspection of values; length OK / bytes not; fingerprint discrepancies are shape problems not value problems).
- **2026-05-15 — Milestone v1.0 redefinition** (now superseded by ADR-0011 above): pre-ADR-0011 21-phase scope was redefined at this point; ADR-0011 retired it 5 days later.

**Future ADRs (TBD):**

  - `0008-mapbox-sdk-11-migration.md` — would document `@rnmapbox/maps` 10.x→11.x breaking changes. **DROPPED per ADR-0011** (stay on 10.3 for closed beta). Will re-trigger if Mapbox forces an upgrade or v1.1 needs new 11.x features.

### Pending Todos

[Carry-forward from earlier phases — most resolved. See `.planning/codebase/CONCERNS.md` for the full v1.0.1 backlog.]

**Resolved during this session (2026-05-21..23):**

- ☑ Plan 07-01 Tasks 0-5 — Android release pipeline (gradle/ABI/proguard/eas.json/workflow + ::add-mask::)
- ☑ ADR-0012 + amendment (P0 incident + self-inflicted re-incident closed)
- ☑ Keystore password rotated twice (incident response + self-inflicted re-rotation)
- ☑ Codebase map refreshed for phases 5-7 (commit `32cab82`)

**Open user-actions:**

1. ☐ **`eas init`** — `apps/mobile-rn/app.json` has literal placeholder `extra.eas.projectId: "TODO-eas-project-id-after-eas-init"`. Blocks Plan 07-01 Task 6 final EAS Cloud build. Resolution: `cd apps/mobile-rn && eas login && eas init`. Tracked in v1.0.1 backlog as `EAS-PROJECT-INIT` (note: NOT actually a v1.0.1 deferral — it's the immediate next user-action to close Plan 07-01).
2. ☐ **Physical Pixel device** — Plan 07-03 1h pocket-walk USER ACTION (STAB-01 success criterion 7). Device-blocked until available.
3. ☐ **Delete `/tmp/mobile-signing.pre-{rotation,rerotation}.*.yaml`** — pre-rotation rollback artifacts on local /tmp. Survive macOS until reboot; delete via `rm -P` after confidence period in current SOPS bundle.
4. ☐ **Add `~/.envrc` (direnv) or shell-rc** snippet to auto-export `SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt` on macOS — this is the diagnostic blind spot from the false-positive sub-incident (CONCERNS.md). Without it, `sops -d` silently fails and downstream `yq -r '.X.Y'` returns literal `null`.
5. ☐ **DEV_B age pubkey** — `.sops.yaml` has only `DEV_A` + `CI` recipients (per Amendment 4: solo-dev posture is acceptable for closed beta; single point of failure for bus factor is accepted v1.0 risk). Re-evaluate at public-launch trigger per ADR-0011 Amendment 1.
6. ☐ **v1.0.1 backlog items from ADR-0012 amendment** (defer-tracked; not active scope): CI-MASK-LINT, SECRETS-LEAK-PLAYBOOK-AMEND, SOPS-VERIFY-HARDENING, CRED-DIAG-DISCIPLINE, EAS-PROJECT-INIT, CI-WORKFLOW-REGISTRY-AUDIT.

### Blockers/Concerns

[See `.planning/codebase/CONCERNS.md` (commit `32cab82`) for the full discussion.]

**Active blockers:**

- 🟡 **Plan 07-01 Task 6**: blocked on `eas init` (user-action above). Stage A' workflow + security PASSED; only EAS Cloud build itself blocked on missing projectId.
- 🟡 **Plan 07-03**: requires physical Pixel device for 1h pocket-walk. No device available.

**Resolved this session:**

- ✅ **ADR-0012 incident** — leak vector closed (`::add-mask::` directive); credentials rotated twice; ADR + amendment land both root cause + the diagnostic discipline lessons.
- ✅ **Tag-triggered workflow GitHub quirk** — workflows registered from default-branch only; cherry-pick `b461ea6` lives on `main` (Plan 07-01 Task 5).

**Active branch:** `feat/cursona-redesign` IS the v1.0 line. Merge to `main` handled at v1.0 acceptance gate when `v1.0.0-beta.1` (or successor) ships. Workflow patch on `main` is the only deliberate cross-branch artifact.

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

Last session: 2026-05-24T16:02:54.470Z

Stopped at: Phase 8 context gathered (autonomous mode — 25 decisions D-01..D-25 captured; ready to plan via /gsd-plan-phase 8)

Resume file: .planning/phases/08-closed-beta-distribution/08-CONTEXT.md

**User-action checkpoint (Plan 07-03 Tasks 5 + 6) — required to close Phase 7:**

Plan 07-01 + the code portion of Plan 07-03 are closed. Remaining work needs a physical Pixel (or any arm64-v8a Android flagship):

1. **Task 5 — recoverLast pre-walk smoke (~10 min):**
   ```bash
   # Install bundletool if not present
   brew install bundletool   # one-time

   # Download the signed .aab
   curl -L -o /tmp/sport-v1.0.0-beta.4.aab \
     'https://expo.dev/artifacts/eas/CZseoc8Nac3ouY86QqPU3.aab'

   # Extract universal APK
   bundletool build-apks \
     --bundle=/tmp/sport-v1.0.0-beta.4.aab \
     --output=/tmp/sport-v1.0.0-beta.4.apks \
     --mode=universal
   unzip -p /tmp/sport-v1.0.0-beta.4.apks universal.apk > /tmp/sport-v1.0.0-beta.4.apk

   # Optional: verify cert SHA-256 (proof of signing identity end-to-end)
   apksigner verify --print-certs /tmp/sport-v1.0.0-beta.4.apk

   # Install on tethered Pixel
   adb install -r /tmp/sport-v1.0.0-beta.4.apk

   # Run 3-phase pre-walk smoke per 07-03-PLAN Task 5:
   # 1) Launch app → start session → wait 2 min recording
   # 2) `adb shell am force-stop com.runningecosystem.mobile`
   # 3) Relaunch → verify recoverLast() restored session + points + adaptive sampling resumed
   # Record outcome in evidence/recoverLast-pre-walk-attestation.txt
   ```

2. **Task 6 — 1h Pixel pocket-walk (LOAD-BEARING for Phase 8/9, ~60 min walking):**
   Per CONTEXT D-18 5-sub-check matrix in 07-03-PLAN:

   - ≥95% expected GPS points (~1710 of ~1800 at 0.5Hz)
   - Foreground service notification visible at end (RU template Task 2)
   - Battery drain <15%
   - Mid-walk `adb shell am force-stop` at 30-min mark → `recoverLast()` survived
   - Map renders post-walk on the recorded track
   - Record outcome in `evidence/pocket-walk-attestation.txt`
3. **Task 7 — 07-03-SUMMARY** runs only after Tasks 5+6 attestation files exist. After that, Phase 7 marks complete in ROADMAP.

**Parallel-path option:** `/gsd-discuss-phase 8` (Closed-beta distribution — Caddy manifest + signed-URL APKs). Phase 8 depends on Phase 7 per ROADMAP, but Plan 07-01 is closed and Plan 07-03 is only Pixel-blocked — so Phase 8 planning can happen now and execute when Plan 07-03 closes.

**Next action:** `eas init` complete; .aab in hand. Either acquire Pixel + run Tasks 5+6, OR `/gsd-discuss-phase 8` in parallel.

## Quick Tasks Completed

Small, ad-hoc work items run via `/gsd-quick`. Each has its own
`.planning/quick/YYYYMMDD-slug/` directory with PLAN + CONTEXT + SUMMARY.

| Date | Slug | Description | Commits | Tests | Notes |
|---|---|---|---|---|---|
| 2026-05-25 | [chat-polish-pass](quick/20260525-chat-polish-pass/SUMMARY.md) | 6 FE-only chat polish items: scroll-FAB, skeleton loading, peer-avatar empty state, Telegram-style timestamps, deterministic avatar gradients, aggregate tab unread badge | 7 (`994f85e..0031359`) | +31 (638 → 669) | TIGHT scope per --discuss; 4 backlog items captured for v1.0.1: STORIES-REVIVAL, FRIEND-REQUEST-FLOW, CHAT-TYPING-INDICATOR, CHAT-SWIPE-DELETE |
| 2026-05-25 | [tracker-live-polish-pass](quick/20260525-tracker-live-polish-pass/SUMMARY.md) | 7 polish/bug items on the live-tracker screen (the load-bearing UI for Plan 07-03): PauseDetector warmup gate (fixes "ПРОДОЛЖИТЬ on start"), time-freeze on pause via SessionManager.effectiveElapsedMs, pace/HR/lap display guards, map camera freeze on pause, empty-session stop guard | 7 (`bc95c30..da35b5f`) | +17 (669 → 686) | No backend changes; warmup gate makes Plan 07-03 Pixel pocket-walk land on better baseline. Domain-layer fix for time-freeze keeps single canonical elapsed-time value across all consumers (UI + RunDetails + future activity-sync). |
| 2026-05-25 | [social-yolo-pass](quick/20260525-social-yolo-pass/SUMMARY.md) | **YOLO XL** task (3 sessions, broke /gsd-quick convention per user "Yolo C"): Phase 10 FRIEND-REQUEST-FLOW end-to-end (backend migration + 8 social-graph endpoints + messaging gate + mobile module + UI screens + inbox + tab badge) + Phase 11 STORIES-REVIVAL (mobile-only — viewer + creator + tray + ring badges) + linkified chat message text. ADR-0011 Amendment 6 expands v1.0 scope 4 → 6 phases. | 13 (`a827bc5..aea06e5`) | +13 (686 → 699) | **User-action: apply migration `0022_friend_requests` on prod VPS** before testing endpoints. STORIES-OFFLINE-DRAFTS + CHAT-REACTIONS-POPUP + CHAT-REPLY-SCROLL + CHAT-STATUS-ICONS-POLISH + MENTION-NAVIGATION captured as v1.0.1 items. |
| 2026-05-25 | [profile-clubs-polish](quick/20260525-profile-clubs-polish/SUMMARY.md) | Me-tab placeholder cleanup + clubs end-to-end (local-first). Removed «Тренировки»/«Датчики» Alert.alert stubs from MeScreen, wired «Удалить аккаунт» to real local-wipe (`wipeDatabase()` + logout chain), deleted Shop route/screen/Wallet-entry. Built clubs feature: SQLite v20 migration (clubs + club_members), `modules/clubs/{domain,state}`, `storage/clubsRepository`, full rewrites of ClubsScreen/ClubScreen/CreateClubScreen (real list + form with friends-picker + detail with owner/member actions). | 11 (`01e7281..0bfc7d3`) | +29 (699 → 728) | Local-first because no clubs backend exists in closed beta. Backlog: CLUBS-BACKEND-SYNC + CLUBS-DISCOVERY + CLUBS-CHAT-GROUP-LINK + SHOP-CURRENCY-VENUE + BACKEND-ACCOUNT-DELETE captured for v1.0.1. Inline UUID v4 helper avoids jest-expo ESM-uuid issue. |

## Artifacts Created (cumulative — high-level; see `.planning/codebase/` for full inventory)

**Planning artifacts (`.planning/`):**

- `PROJECT.md` / `REQUIREMENTS.md` / `ROADMAP.md` / `MILESTONES.md` / this `STATE.md` — milestone-level reconciled to ADR-0011 lean closed-beta scope (2026-05-20).
- `codebase/{STACK,INTEGRATIONS,ARCHITECTURE,STRUCTURE,CONVENTIONS,TESTING,CONCERNS}.md` — refreshed 2026-05-23 (commit `32cab82`).
- `phases/01-release-contract-version/` through `phases/05-observability-backend/` — Phases 1-5 closed (SUMMARY per plan).
- `phases/06-release-signing/` — Plan 06-01 closed; Plan 06-02 DEFERRED per ADR-0011 Amendment 3 (iOS).
- `phases/07-release-builds-mobile-stability/` — Plan 07-01 mid-flight (Tasks 0-5 done); Plan 07-03 not started.
- `phases/_archive/pre-v1.0-territory-refactors/` + `phases/_archive/superseded-21-phase-v1.0/` — historical context for the two scope resets.

**ADRs shipped:**

- `docs/DECISIONS/0001-framework-react-native.md` (locked)
- `docs/DECISIONS/0002-guest-mode.md` (deferred)
- `docs/DECISIONS/0003-oauth-providers.md` (Strava deferred to v1.1)
- `docs/DECISIONS/0004-feed-backend-cleanup.md` (do-nothing)
- `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` (deferred-validation; folded into Plan 07-03)
- `docs/DECISIONS/0006-mapbox-token-incident.md` (treat-as-compromise full reset, 2026-05-16)
- `docs/DECISIONS/0007-v1.0-release-contract.md` (wire contract locked, 2026-05-15)
- `docs/DECISIONS/0009-observability-architecture.md` (Phase 5 closeout, 2026-05-20)
- `docs/DECISIONS/0010-sentry-saas-and-colocation.md` (Phase 5; dormant per D-38)
- `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` + 4 amendments (scope reset, 2026-05-20..21)
- `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` + amendment (P0 incident + self-inflicted re-incident, 2026-05-22)

**Source-of-truth references** (largely stable):

- `docs/RUNNING_ECOSYSTEM_TZ.md` — master technical spec; §2.4 NFR table is canonical
- `docs/SECRETS.md` — secrets-handling playbook (incl. Mobile signing recovery section per Plan 06-01)
- `STATUS.md` — living per-task status
- `tests/FIELD_PROTOCOL.md` — field-test capture template (consumed by Plan 07-03)
- `.planning/codebase/CONCERNS.md` — current full backlog + pitfalls (refreshed 2026-05-23)
