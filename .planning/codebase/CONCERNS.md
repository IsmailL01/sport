# Codebase Concerns

**Analysis Date:** 2026-05-25

This document is the consolidated risk register for Milestone v1.0 Closed Beta (Android-only). Scope is limited to debt that affects shipping Plan 08-01 → Phase 9 (and now Phases 10 + 11 per ADR-0011 Amendment 6) to 5-10 Android testers. Phase 8 is GATED per ADR-0011 Amendment 5 (code-complete + runtime-disabled; closed beta uses manual sideload by solo dev). Items explicitly scope-cut by ADR-0011 (and its six amendments) are catalogued under §"Deferred to v1.0.1" with the residual risk and the backlog ID that tracks them.

**Diff since last refresh (commit `4e34728`, 2026-05-25 PM):**

1. **Phase 10 backend SHIPPED** (Session 1 of `social-yolo-pass`, commits `a827bc5..830b8db`, 4 commits, lint-clean, build-clean): social-graph `friend_requests` table + send/accept/reject endpoints + `are_friends()` SQL function; messaging `start_conversation` now permission-gated via `are_friends()` cross-service call. **Status: code-complete pending production migration apply + mobile UI**.
2. **v1.0.1 backlog SHRANK for the first time** (12 → 10): `STORIES-REVIVAL` promoted to Phase 11 (planned), `FRIEND-REQUEST-FLOW` promoted to Phase 10 (backend done). First-ever net-negative backlog delta.
3. **ADR-0011 Amendment 6 scope expansion** — v1.0 grew from 4 phases (Phases 6-9) to 6 phases (Phases 6-11). First scope expansion since ADR-0011 itself. Fallback noted: **Amendment 7 (re-trim) if Phase 10 OR Phase 11 exceeds 2× day-estimates**. Reversible by design — worth flagging as a watch-item.
4. **First cross-service permission gate** — messaging queries social-graph's `friend_requests` table via shared Postgres pool + `are_friends()` SQL function. New pitfall added: `CROSS-SERVICE-SCHEMA-COUPLING` (runtime coupling, not compile-time; mitigated by `are_friends()` SQL contract).
5. **New active blockers** — (a) migration `0022_friend_requests.up.sql` requires production apply on VPS (~5 min user action), (b) Sessions 2-3 of `social-yolo-pass` (mobile friends module + stories revival + chat polish) pending — first multi-session quick task with `yolo: true` flag; resume via `/gsd-quick resume social-yolo-pass`.
6. **Phase status snapshot:** Phase 6 done · Phase 7 partial (Plan 07-03 Tasks 5+6 device-blocked) · Phase 8 gated · Phase 9 not started · Phase 10 backend-done / mobile-pending · Phase 11 not started.

Source-of-truth references: `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` (scope cut + 6 amendments — Amendment 6 added 2026-05-25 PM expanding v1.0 to 4→6 phases), `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` (P0 keystore-password leak + self-inflicted re-incident), `docs/DECISIONS/0010-sentry-saas-and-colocation.md` + amendment D-38 (Sentry deferred), `.planning/phases/08-closed-beta-distribution/08-CONTEXT.md` (25 D-NN decisions for Plan 08-01), `.planning/phases/08-closed-beta-distribution/08-01-PLAN.md`, `.planning/ROADMAP.md` §"v1.0.1 Backlog" (10 items, first contraction), `.planning/STATE.md` §"Quick Tasks Completed" + §"Quick Tasks In Flight" (`social-yolo-pass` resume slug active), `.planning/quick/20260525-social-yolo-pass/CONTEXT.md` (Sessions 2-3 plan in progress log).

---

## Active blockers — USER ACTION gates open

Three blockers open as of 2026-05-25 PM. Plan 08-01 Phase 8 was GATED (parked behind feature flag) so its MinIO provisioning + tag-fire prerequisites left the critical path; tracked instead in the v1.0.1 backlog as `DISTRIBUTION-PIPELINE-RE-ENABLE`.

### B1. Plan 07-03 Tasks 5+6 — physical Pixel device (carry-forward, UNCHANGED)

- **What:** Pre-walk 3-phase smoke (notification visibility, OEM dialog branch, fresh install) + 1h pocket-walk per STAB-01 success criterion 7 + 07-CONTEXT D-18 5-sub-check matrix. With the signed .aab now in hand (`https://expo.dev/artifacts/eas/CZseoc8Nac3ouY86QqPU3.aab` from EAS Cloud build `052a2e92-ef79-4f82-aaa2-542f4fb26806`), procedure: `bundletool build-apks --bundle=<.aab> --output=<.apks> --mode=universal` → unzip universal.apk → `adb install -r` on Pixel → exercise → record pass/fail per task spec.
- **Files:** `.planning/phases/07-release-builds-mobile-stability/07-03-PLAN.md` Tasks 5+6.
- **Blocks:** Plan 07-03 closeout (only open plan in Phase 7 after Plan 07-01 CLOSED commit `5e2a8a6`). With PauseDetector warmup gate now in place (commit `815c0ff`) + time-freeze on pause (commit `b834eef`), the pocket-walk will land on a noticeably better baseline than the pre-polish-pass state.
- **Status:** Device-blocked since 2026-05-21.
- **Resolution:** Acquire/borrow a Pixel (any arm64-v8a Android flagship is acceptable).

### B2. Mapbox debug-cert allowlist — required for `android-debug-apk.yml` artifact to actually render maps (UNCHANGED, easy user action)

- **What:** The standard Android `debug.keystore` (committed at `apps/mobile-rn/android/app/debug.keystore`, commit `0f6f840`) has cert SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`. Production Mapbox `pk.*` token is cert-restricted per ADR-0006 → debug-built APKs from `android-debug-apk.yml` will show blank Mapbox tiles (401 on tile fetch) unless the debug cert SHA-256 is added to the Mapbox dashboard token allowlist.
- **Files:** `.github/workflows/android-debug-apk.yml` lines 88-93 (workflow header comment surfaces this gotcha explicitly).
- **Blocks:** Internal-tester / BlueStacks debug-loop usefulness ONLY. Does NOT block Plan 07-03 Tasks 5+6 (those use the production-signed .aab where the `pk.*` token's cert SHA-256 restriction matches the production keystore cert).
- **Status:** Easy ~5-min user action; deferred until the debug-APK channel actually gets exercised for tester sharing.
- **Resolution:** Mapbox dashboard → token settings → Add allowed Android cert SHA-256 → paste the debug fingerprint → save.

### B3. Apply migration `0022_friend_requests.up.sql` on production VPS (NEW 2026-05-25 PM, ~5 min user action)

- **What:** Phase 10 Session 1 (commits `a827bc5..830b8db`) added migration `services/backend/social-graph/migrations/0022_friend_requests.up.sql` creating the `friend_requests` table + `are_friends(user_a, user_b)` SQL function. Until applied on the production Postgres, both social-graph friend-request endpoints (`POST /friend-requests`, `POST /friend-requests/{id}/accept`, etc.) AND messaging `start_conversation` (which now calls `are_friends()` via shared Postgres pool) will 500 on first call.
- **Files:** `services/backend/social-graph/migrations/0022_friend_requests.up.sql` (+ corresponding `.down.sql`); `services/backend/social-graph/internal/repo/friend_requests.go`; `services/backend/messaging/internal/svc/start_conversation.go` (cross-service `are_friends()` call site).
- **Blocks:** Phase 10 ship — without the migration applied, the backend endpoints will fail on first call once mobile UI lands in Session 2.
- **Resolution:**
  ```bash
  ssh user@148-253-214-156.sslip.io
  docker exec <postgres-container> psql -U <user> -d <db> -f /path/to/0022_friend_requests.up.sql
  # Verify: \dt friend_requests; \df are_friends
  ```
  Confirm idempotence (re-running should fail cleanly with "already exists" — schema is forward-only).
- **Status:** Code-complete on `main`; production apply pending.

### B4. Sessions 2-3 of `social-yolo-pass` (mobile + stories + polish) — IN FLIGHT, NEW 2026-05-25 PM

- **What:** Phase 10 backend done (Session 1); mobile friends module + Phase 11 stories revival + chat polish remain across Sessions 2-3 per `.planning/quick/20260525-social-yolo-pass/CONTEXT.md`. This is the FIRST multi-session quick task (`yolo: true` flag).
- **Files:** `.planning/quick/20260525-social-yolo-pass/CONTEXT.md` (progress log with Session 2-3 plan); `.planning/quick/20260525-social-yolo-pass/PLAN.md`; `.planning/STATE.md` §"Quick Tasks In Flight" (resume slug: `social-yolo-pass`).
- **Blocks:** Phase 10 ship (mobile UI side) + Phase 11 (stories revival).
- **Resolution:** `/gsd-quick resume social-yolo-pass` — picks up Session 2 from the CONTEXT.md progress log.
- **Status:** In flight, resume-ready.

**Net:** Phase 7 closeout requires B1 resolved. B2 is a small one-time convenience action (debug-APK channel only). B3 is the new ~5-min apply step before Phase 10 mobile work hits production. B4 is the in-flight resume gate for the rest of `social-yolo-pass`.

---

## Watch-Items — reversible scope decisions to monitor

### W1. ADR-0011 Amendment 6 scope expansion (NEW 2026-05-25)

- **What:** Amendment 6 expanded v1.0 from 4 phases (Phases 6-9) to 6 phases (Phases 6-11) by promoting `FRIEND-REQUEST-FLOW` to a full Phase 10 and `STORIES-REVIVAL` to a full Phase 11. First scope expansion since ADR-0011 itself.
- **Why a watch-item:** ADR-0011's prior 5 amendments only ever cut scope; Amendment 6 is the first net-add. Reversibility is built in via the explicit "Amendment 7 fallback" clause: if Phase 10 OR Phase 11 exceeds 2× day-estimates, re-trim by demoting the slower one back to v1.0.1.
- **Day-estimate baselines (from Amendment 6):**
  - Phase 10 (friend-request flow): backend Session 1 done in ~half-day actual vs estimate; mobile Sessions 2-3 still to land.
  - Phase 11 (stories revival): not started; greenfield mobile module on top of pre-existing `feed` backend service + `stories`/`story_views` v11 SQLite tables.
- **Trigger condition:** Either phase takes >2× its day-estimate AND the dev judges the residual delta non-essential to closed-beta acceptance.
- **Mitigation:** Both items have intact v1.0.1 backlog slots ready to re-receive them if Amendment 7 fires. No code burned; the promotion is a planning-doc-only operation.
- **Tracks:** No backlog row (it IS the backlog row — Amendment 6 itself is the watchpoint).

---

## Architecture Risk — Cross-Service Coupling (NEW)

### A1. Cross-service schema coupling: messaging ↔ social-graph via `friend_requests` table (NEW 2026-05-25 PM)

- **What:** Phase 10 Session 1 introduced the FIRST cross-service permission gate. Messaging's `start_conversation` checks friendship by calling `are_friends(user_a, user_b)` — a SQL function defined in social-graph's migration `0022_friend_requests.up.sql` and queried via the SHARED Postgres connection pool. This crosses service boundaries at the database layer.
- **Files:** `services/backend/social-graph/migrations/0022_friend_requests.up.sql` (defines table + function); `services/backend/messaging/internal/svc/start_conversation.go` (caller of `are_friends()`); shared Postgres pool wired via `services/backend/pkg/postgres/` (or equivalent — exact path verified per Session 1 commits).
- **Coupling concerns:**
  1. **Runtime, not compile-time:** If social-graph renames `friend_requests` table or alters `are_friends()` signature, messaging breaks at runtime on the next `start_conversation` call. No Go build error, no CI catch.
  2. **No service boundary contract:** Unlike a JSON-over-HTTP API where the contract is the OpenAPI schema, the contract here is whatever the SQL function happens to expose.
  3. **Deployment ordering:** Migrations to `friend_requests` must apply BEFORE rolling messaging updates that depend on new fields/columns. Currently solo-dev manages this manually; no enforcement.
- **Mitigation in place:**
  - `are_friends(user_a, user_b)` SQL function is the STABLE CONTRACT — even if the underlying `friend_requests` table is renamed or restructured, the function signature can be preserved.
  - Solo-dev controls both services and both migrations — no cross-team coordination required.
  - Plan 10 documents the dependency explicitly (Session 1 commits include the cross-call wiring).
- **Long-term improvement path:** Once scale demands service isolation (separate DBs, separate teams), move to inter-service HTTP API — e.g., `social-graph` exposes `GET /friendship/{a}/{b}` that returns a boolean, and messaging makes an HTTP call instead of a direct SQL query. Defer until: (a) deployment ordering causes a real incident, OR (b) social-graph migrates off the shared Postgres pool.
- **Tracks:** `CROSS-SERVICE-SCHEMA-COUPLING` v1.0.1 backlog (new entry — see below).

---

## Tech Debt — explicitly dropped from v1.0 per ADR-0011 amendments

Each row = work that the 21-phase enterprise-hardening scope mandated, now retired. "Residual risk" is the concrete failure mode that becomes visible during closed beta if the dropped phase's gap fires. "Tracks" = the v1.0.1 backlog row that will re-open it.

### 1. Edge protection — `/auth/*` rate-limit gap (dropped Phase 6 EDGE-01..05)

- **Files:** `services/backend/identity/internal/handler/http.go` lines 68 + 73 (`POST /auth/login` and `POST /auth/login-with-code` handlers — no rate limiter middleware in the chain); `services/backend/identity/cmd/server/main.go` line 174 (root middleware chain has DebugSession → Promhttp → SentryRecovery → OtelHTTP → clientversion → mux; **no rate limiter**).
- **Residual risk:** Brute-force or credential-stuffing against `/auth/login` is unmitigated. SOPS dev-mode disable was already closed (SEC-05 Plan 02-02 commit `27ad27f`), so the only remaining auth attack surface is online-guessing through the production endpoint.
- **Closed-beta mitigation:** Blast radius = 5-10 friend testers; private repo + `srv1561293` is not advertised. Mitigation does not generalize past beta.
- **Tracks:** `AUTH-RATELIMIT` in `.planning/ROADMAP.md` §"v1.0.1 Backlog".

### 2. No pgBackRest restore drill (dropped Phase 7)

- **Files:** `services/backend/Makefile` `make rollback v=N` + `infra/ansible/` migration playbooks (rollback drill scaffolding retained per ADR-0011 §"What stays as-shipped"); 9990/9991 drill migrations preserved.
- **Residual risk:** Recovery from a prod DB corruption event is `pg_dump` snapshot + WAL replay, untested under pressure. No proof that the snapshot is restorable to a fresh PostgreSQL container.
- **Closed-beta mitigation:** Pre-migration `pg_dump` (already in `docs/RUNBOOKS/deploy.md §6.4`); reconstruction from snapshot is feasible by hand at 10-user × few-sessions data scale.
- **Tracks:** No v1.0.1 backlog row — re-expansion is triggered by "beta passes >50 users" per ADR-0011 §"Re-expansion triggers".

### 3. No load profile or chaos drills (dropped Phase 8)

- **Files:** None — `k6/` directory was never created; chaos playbooks (`infra/chaos/`) never authored.
- **Residual risk:** First user-load surprise lands in production. No baseline for "what RPS does identity-svc handle before connections exhaust." No proof that NATS JetStream consumer-groups survive a broker restart.
- **Closed-beta mitigation:** 5-10 testers × ~3 sessions over 2 weeks ≈ ~30 sessions total — does not stress rate limits, DB pool, or NATS.
- **Tracks:** No backlog row; ADR-0011 re-expansion trigger §1 (`>50 users`) covers this.

### 4. Mapbox SDK 11.x migration deferred (dropped old Phase 13)

- **Files:** `apps/mobile-rn/package.json` (`@rnmapbox/maps@^10.3`); `apps/mobile-rn/android/app/proguard-rules.pro` keeps still target `com.mapbox.**` 10.x classes; `apps/mobile-rn/app.json` plugin `RNMapboxMapsImpl: "mapbox"`.
- **Residual risk:** No known native crashes at 10.3 today. New 11.x bug fixes (e.g., MapView memory leaks during long sessions) inaccessible. ADR-0008 was scheduled for this and was never written.
- **Closed-beta mitigation:** Stay pinned at 10.3; defer until 11.x bug-fix backlog forces the upgrade.
- **Tracks:** No backlog row — re-open only on a Mapbox 10.3 bug that affects closed beta.

### 5. arm64-v8a only — no 16 KB page-size validation for Android 15+ (dropped old Phases 14-15)

- **Files:** `apps/mobile-rn/android/gradle.properties` `reactNativeArchitectures=arm64-v8a`; `apps/mobile-rn/android/app/build.gradle` `defaultConfig.ndk.abiFilters 'arm64-v8a'`. **Exception:** `android-debug-apk.yml` builds universal (arm64-v8a + x86_64) for BlueStacks/emulator support — a debug-only deviation that does NOT affect the production .aab.
- **Residual risk:** A tester on Android 15+ with 16 KB page-size kernel may hit an unaligned native library and fail to launch. Mapbox/MMKV/Hermes JNI loads are the likely failure points.
- **Closed-beta mitigation:** Closed-beta testers self-report device + Android version on issue; v1.1 if it surfaces.
- **Tracks:** No backlog row; ADR-0011 re-expansion trigger §2 covers (P0 incident on Android 15+).

### 6. Background reliability scoped to 2 OEMs (partial drop of old Phase 16)

- **Files:** `apps/mobile-rn/src/session/SessionManager.ts` (`recoverLast()` exists from pre-v1.0 baseline); `apps/mobile-rn/src/vendor/oem.ts` + `apps/mobile-rn/src/vendor/openOEMSettings.ts` + `apps/mobile-rn/src/vendor/AutostartDialog.tsx` (shipped Plan 07-03 Tasks 3+4 commits `79cb767` + `4df65d8` — MIUI + One UI intents + generic fallback). HyperOS + EMUI + low-end Doze NOT scripted.
- **Residual risk:** A HyperOS/EMUI/budget-device tester hits a vendor-specific Doze kill mid-session, no in-app auto-start dialog, `recoverLast()` does or does not fire — outcome empirically unknown.
- **Closed-beta mitigation:** Solo dev validates on Pixel only (no second device); MIUI + One UI dialogs ship; rest = monitor + user reports.
- **Tracks:** No backlog row — re-open only on tester report.

### 7. No mobile crash reporting (dropped old Phase 17)

- **Files:** `services/backend/pkg/observability/sentry_init.go` (backend SDK wired but dormant per D-38 — empty DSN guard); **no mobile-side Sentry SDK installed**; `apps/mobile-rn/package.json` has no `@sentry/react-native`.
- **Residual risk:** Mobile crashes surface via tester chat reports only. No stack-trace symbolication, no crash-rate metric, no breadcrumbs. MTTR depends on tester being able to describe what they were doing when the crash happened.
- **Closed-beta mitigation:** Backend Sentry SDK is "flip on by populating SOPS DSN" — already in place if a backend-side panic spike happens. Mobile crashes route to `scripts/debug-tail.sh <user-id>` over Loki (backend logs around the crash time) + tester verbal report.
- **Tracks:** No backlog row; ADR-0010 amendment D-38 + ADR-0011 cover Sentry activation criteria.

### 8. No 8-device matrix (dropped old Phase 20)

- **Files:** None — `tests/FIELD_PROTOCOL.md` (541 lines, pre-v1.0 baseline) exists but is no longer the v1.0 acceptance gate.
- **Residual risk:** Vendor-specific failures on devices the dev doesn't own are discovered by testers, not by structured QA.
- **Closed-beta mitigation:** Solo dev runs Plan 07-03 on Pixel only (1h pocket-walk); testers act as the device matrix.
- **Tracks:** No backlog row.

### 9. No 48-hour staging soak / no on-call (dropped old Phase 21)

- **Files:** No `infra/staging/` (staging environment was never provisioned); no on-call rotation tooling.
- **Residual risk:** No multi-day stress validation of the full stack under continuous tester traffic before "launch." Phase 9 is "ship-then-watch with a 72-hour window".
- **Closed-beta mitigation:** Tag → release → 72h tester window; hotfix tag if a P0 surfaces.
- **Tracks:** No backlog row.

### 10. Lean key custody — single SOPS-on-workstation copy (Amendment 4 of ADR-0011)

- **Files:** `.secrets/prod/mobile-signing.yaml` (single SOPS-encrypted PKCS12 keystore + passwords); `.secrets/prod/manifest-signing.yaml` (Ed25519 private key for manifest signing — gate-disabled per Amendment 5 but the SOPS bundle stays in place); `~/.config/sops/age/keys.txt` (single age key for DEV_A, 1Password sealed backup per Phase 2 D-04); `.sops.yaml` (DEV_A + CI recipients — see §"Environment risks" E4 for the single-DEV_A bus-factor caveat); no cloud sync, no USB, no `RECOVERY-CARD.md`, no `cloud-backup-log.txt`.
- **Residual risk:** Loss of dev workstation = re-generate keystore + re-generate manifest signing keypair + ship new app version with new pubkey + re-release under new package name + DM 10 testers. Both keystore + manifest pubkey are regenerable; the age key (load-bearing) has 1Password sealed backup.
- **Closed-beta mitigation:** Time Machine on the dev workstation covers disk-loss incidentally. ~30-45 min total recovery.
- **Tracks:** `KEYSTORE-CLOUD-BACKUP` (single-cloud backup) + `PROD-LAUNCH-PREP` (bank-grade 2-USB ≥5 km) + `MANIFEST-SIGNING-KEY-ROTATION` (formal rotation runbook including pubkey re-embed + force-update flag flip) in v1.0.1 backlog.

### 11. iOS work deferred (Amendment 3 of ADR-0011)

- **Files:** `.planning/phases/06-release-signing/06-02-PLAN.md` (Apple Dev enrollment) — exists on disk, marked DEFERRED in `.planning/ROADMAP.md`; `apps/mobile-rn/eas.json` `production.ios` block (untouched — kept for re-activation without re-edit); `apps/mobile-rn/app.json` `ios:` block (kept; `NSLocationWhenInUseUsageDescription` + `UIBackgroundModes` already set); no `07-02-PLAN.md` (will be authored on re-trigger); no `08-02-PLAN.md`.
- **Residual risk:** Closed beta is Android-only. iOS testers cannot be invited until Apple Developer enrollment completes (2-7+ weeks SLA per RESEARCH §1) AND iOS sub-plans are written + executed.
- **Closed-beta mitigation:** Acceptable — Android beta is the v1.0 acceptance gate.
- **Tracks:** SIGN-02 / BUILD-02 / DIST-02 marked DEFERRED in `.planning/REQUIREMENTS.md`.

### 12. Phase 8 distribution pipeline parked behind feature gate (Amendment 5 of ADR-0011)

- **Files:** `apps/mobile-rn/src/update/manifestCheck.ts` lines reading `process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL ?? ''` → `{state:'disabled'}` short-circuit at top of `checkForUpdate`; `.github/workflows/android-release.yml` job-level `env.DISTRIBUTE_ENABLED` derived from `secrets.MINIO_RELEASES_ACCESS_KEY != ''`; 4 step-level `if: env.DISTRIBUTE_ENABLED == 'true'` gates (bundletool install, .aab download, manifest-signing decrypt, release distribute); UpdateBanner in `TrackerStartScreen` / `JournalScreen` / `SettingsScreen` renders no-op when state='disabled'.
- **Residual risk:** Closed beta uses manual sideload by solo dev — the workflow signs a .aab via EAS Cloud, but the DIST steps don't fire, so APKs aren't uploaded to MinIO and no signed manifest is published. Testers receive APKs via DM-with-link. As tester base grows past ~20, "did everyone update?" overhead surfaces.
- **Closed-beta mitigation:** Acceptable — closed beta is 5-10 testers; manual sideload is tractable at that scale.
- **Tracks:** `DISTRIBUTION-PIPELINE-RE-ENABLE` in v1.0.1 backlog (4 promotion triggers documented). Re-enable = (1) populate `MINIO_RELEASES_ACCESS_KEY` + `MINIO_RELEASES_SECRET_KEY` repo secrets, (2) set `EXPO_PUBLIC_UPDATE_MANIFEST_URL` in mobile env, (3) cut a new beta tag. 638/638 jest tests defend against drift in the meantime.

---

## Active Bugs — TODO/FIXME in code

### `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx:26` — hardcoded `APP_VERSION = '0.9'`

- **File:** `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx` line 26 — `const APP_VERSION = '0.9';` rendered at line 328 (`<Row label="Версия" value={APP_VERSION} t={t} />`).
- **Symptoms:** Settings screen always displays "Версия: 0.9" regardless of actual installed binary version. Plan 08-01's `version` field in `app.json` (currently `0.1.0`) and the EAS build's `versionCode` are not reflected.
- **Trigger:** Any tester opening Settings sees a wrong, stale version label. Will mislead Phase 9 bug reports ("which version did you see this on?").
- **Fix approach:** Replace `const APP_VERSION = '0.9'` with `import { getInstalledVersion } from '../../../util/version';` + use `getInstalledVersion()` (defined at `apps/mobile-rn/src/util/version.ts:44`). Backing call already used elsewhere in the update module (`apps/mobile-rn/src/update/manifestCheck.ts` reads via the same util).
- **Status:** Out-of-scope for Plan 08-01 (noted but not fixed); candidate for the next quick-fix pass.
- **Tracks:** No formal backlog row yet — fold into the next quick-fix pass or v1.0.1.

### `apps/mobile-rn/app.json` — 5 duplicate `android.permission.*` fully-qualified entries (carry-forward)

- **File:** `apps/mobile-rn/app.json` lines 48-60 (`android.permissions` array). Both forms present: `ACCESS_FINE_LOCATION` (short) AND `android.permission.ACCESS_FINE_LOCATION` (FQ). Same for `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`.
- **Symptoms:** 5 duplicate entries left by `eas init` (commit `5a26c68`). Android manifest-merge tool dedupes at build time → no runtime impact.
- **Trigger:** Any reader of `app.json` sees noise; no functional impact.
- **Fix approach:** Remove the 5 FQ entries (lines 55-59); keep the short-form entries (lines 49-54) since the rest of the app.json uses short form.
- **Status:** Harmless; tracked as cosmetic cleanup.

### `apps/mobile-rn/src/auth/authProviders.ts:71` — round 4 TODO (carry-forward)

- **File:** `apps/mobile-rn/src/auth/authProviders.ts` line 71 — `// TODO Round 4:`.
- **Symptoms:** OAuth provider stub awaits round 4 work (per pre-v1.0 baseline review rounds).
- **Trigger:** OAuth path is not load-bearing in v1.0 closed beta (HEALTH-04 Strava deferred per ADR-0011).
- **Fix approach:** Not in scope for v1.0; v1.1 if Strava read-only OAuth re-enters scope.

### `apps/mobile-rn/src/health/HealthAdapter.ts:13` — Health adapter stub (carry-forward)

- **File:** `apps/mobile-rn/src/health/HealthAdapter.ts` line 13 — `// HealthKitAdapter / HealthConnectAdapter — TODO Phase 7.1`.
- **Symptoms:** Stub adapter; no HealthKit / HealthConnect integration.
- **Trigger:** Not exercised in v1.0 — HEALTH-* requirements deferred per ADR-0011.
- **Fix approach:** v1.1 milestone.

### `apps/mobile-rn/src/domain/types.ts:37` — state machine extension TODO (carry-forward)

- **File:** `apps/mobile-rn/src/domain/types.ts` line 37 — `TODO: расширить под полную state-машину когда понадобится pause/discard разделение`.
- **Symptoms:** Session state machine lacks discrete `pause` vs `discard` states.
- **Trigger:** Closed-beta tester pauses then discards a session — current code may conflate the two transitions. Note: 2026-05-25 tracker-live-polish-pass added `SessionManager.pausedDurationMs` accumulator + `effectiveElapsedMs` getter (commit `b834eef`), partially addressing the pause semantics; full pause-vs-discard split remains deferred.
- **Fix approach:** Defer until tester-report surfaces a UX glitch.

### `services/backend/realtime-gw/internal/gw/connection.go:106-107` — typing + ack stubs (carry-forward)

- **File:** `services/backend/realtime-gw/internal/gw/connection.go` lines 106-107 — `// typing (TODO Phase B+: …)` + `// ack {lastEventId} (TODO: …)`.
- **Symptoms:** Realtime gateway accepts typing + ack frames but does not propagate or persist.
- **Trigger:** Not exercised in closed beta. Note: chat UI exists post Phase 8/A and is shipped; the typing indicator is a v1.0.1 polish item (`CHAT-TYPING-INDICATOR`).
- **Fix approach:** Out of scope; tracked as `CHAT-TYPING-INDICATOR` in v1.0.1 backlog.

### `services/backend/notifications/internal/service/svc.go:73` — Expo push collapse TODO (carry-forward)

- **File:** `services/backend/notifications/internal/service/svc.go` line 73 — `// Отправить через Expo Push API (collapse от same conversation 30s — TODO Phase B)`.
- **Symptoms:** No collapse-key dedup; same-conversation notifications can flood.
- **Trigger:** Acceptable at 5-10 testers; could surface if a chatty pair generates rapid-fire notifications.
- **Fix approach:** Phase B post-v1.0.

### `services/backend/pkg/observability/otel_init.go:25,104` — PII scrub coverage TODOs (carry-forward)

- **File:** `services/backend/pkg/observability/otel_init.go` lines 25 + 104.
- **Symptoms:** Per-call-site discipline + grep audit comment; span attribute scrub coverage gap noted at line 104 ("проходят НЕ scrubbed (см. TODO в Plan 05-06)").
- **Trigger:** A new service author adds a span attribute that contains PII without going through `piiScrubProcessor`.
- **Fix approach:** Already partially closed via Plan 05-05 `piiScrubProcessor`; remaining audit work is included in the existing pre-commit `pii_live_probe.py` runtime smoke (Plan 05-06).

---

## Security

### S1. CI-side secret leak via `$GITHUB_ENV` writes — root cause closed, hardening backlog open (ADR-0012 Phase A)

- **Files:** `.github/workflows/android-release.yml` lines 82-93 (patched form); `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` (incident record).
- **Root cause:** `echo "VAR=$value" >> "$GITHUB_ENV"` does NOT auto-mask in GitHub Actions step logs. Only `${{ secrets.X }}` references are registered with the runner's log masker at template-resolution time. A decrypted SOPS secret propagated via `$GITHUB_ENV` is, from the runner's perspective, just data.
- **Mitigation in place:** Workflow now does `STORE_PASS=$(yq -r ...)` then `echo "::add-mask::$STORE_PASS"` BEFORE `echo "RUNNING_ECO_RELEASE_STORE_PASSWORD=$STORE_PASS" >> "$GITHUB_ENV"`. Pattern is reusable; comment at line 28 of the workflow links back to ADR-0012. Same mask-before-write pattern applied to the Plan 08-01 MinIO + Ed25519 secrets in the extended workflow (commit `9b8aef9`) — currently gate-disabled per ADR-0011 Amendment 5 but the masking discipline stays applied when re-enabled.
- **Remaining gap:** No automated detection — a future workflow change could re-introduce the anti-pattern. `CI-MASK-LINT` v1.0.1 backlog item tracks a pre-commit / `actionlint` rule for `echo "X=$value" >> $GITHUB_ENV` without a preceding `::add-mask::` line. Generalize to `$GITHUB_OUTPUT` + `$GITHUB_STEP_SUMMARY`. NEW: `android-debug-apk.yml` introduces a Mapbox-token `$GITHUB_ENV` write (line 99-115) — relies on GH Actions auto-mask of secrets-referenced values rather than explicit `::add-mask::`. Acceptable for `pk.*` (public-designed token) but the lint rule should cover both flows uniformly.
- **Tracks:** `CI-MASK-LINT` + `SECRETS-LEAK-PLAYBOOK-AMEND` + `SOPS-VERIFY-HARDENING` + `CI-WORKFLOW-REGISTRY-AUDIT` in v1.0.1 backlog.

### S2. Self-inflicted re-incident — `xxd` byte-dump of credential in agent chat (ADR-0012 Amendment 2026-05-22)

- **Files:** `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` §"Amendment 2026-05-22 — Re-rotation after self-inflicted chat leak".
- **Root cause:** During post-rotation verification, an `xxd | tail -3` diagnostic was used to investigate a fingerprint discrepancy between two shell-pipeline forms (`yq -r ... | shasum` vs `P=$(yq -r ...); printf '%s' "$P" | shasum`). `xxd` rendered the credential bytes in hex+ASCII into the agent tool-result stream → AI vendor (Anthropic) conversation logs.
- **Mitigation in place:** Re-rotated via the same `keytool -storepasswd` flow (commit `21b992c`). Phase A discipline rules now codified in ADR-0012 Amendment:
  1. Single canonical fingerprint form — use `printf '%s' "$VAR" | shasum -a 256 | cut -c1-12` exclusively.
  2. No byte-level inspection of values — never `xxd`, `od -c`, `hexdump`, `${VAR:0:N}` etc.
  3. Length is acceptable; bytes are not — `echo "len=${#PASS}"` OK; `echo "first=${PASS:0:1}"` not OK.
  4. Fingerprint discrepancies are a shape problem, not a value problem — reproduce on a known-good test value before touching the real secret.
- **Remaining gap:** Rules are documented in the ADR amendment but not codified in `docs/SECRETS.md` yet; no pre-commit grep rule for `xxd .*\$[A-Z_]+` patterns.
- **Tracks:** `CRED-DIAG-DISCIPLINE` in v1.0.1 backlog.

### S3. `SOPS_AGE_KEY_FILE`-unset diagnostic blind spot

- **Files:** `.planning/phases/06-release-signing/evidence/smoke-sops-roundtrip.sh` lines 22-23 (defensive default `: "${SOPS_AGE_KEY_FILE:=$HOME/.config/sops/age/keys.txt}"`); ADR-0012 §"False-positive sub-incident"; the Plan 08-01 `scripts/release-distribute.sh` + `scripts/sign-manifest.go` inherit the same env-var assumption.
- **Root cause:** When `SOPS_AGE_KEY_FILE` is unset and the macOS-default `~/Library/Application Support/sops/age/keys.txt` is empty (key actually lives at XDG path `~/.config/sops/age/keys.txt`), `sops -d` silently fails to find an age identity. `yq -r '.path'` on the empty/partial pipe returns the literal string `null`. `shasum -a 256` on the string `null` produces sha256 prefix `74234e98` — a "valid" but meaningless fingerprint. This caused a real incident to be dismissed as a false positive during ADR-0012 STEP 2 audit.
- **Mitigation in place:** `smoke-sops-roundtrip.sh` defaults `SOPS_AGE_KEY_FILE`; ADR-0012 §"Lesson" mandates verifying decrypted value length > 0 before hashing + checking `sops -d` exit code.
- **Remaining gap:** Only `smoke-sops-roundtrip.sh` enforces the default. Other ad-hoc verification scripts in `evidence/` and `scripts/` don't all check decrypt shape before downstream processing. `scripts/release-distribute.sh` shells out to `sops -d .secrets/prod/manifest-signing.yaml`; same blind spot applies (gate-disabled per Amendment 5 but the audit gap stays open when re-enabled).
- **Tracks:** `SOPS-VERIFY-HARDENING` in v1.0.1 backlog — every verification script must (a) require `SOPS_AGE_KEY_FILE` explicitly, (b) check `sops -d` exit code, (c) validate decrypted value shape (length, schema) before downstream processing.

### S4. PKCS12 invariant — `key_pass` MUST equal `store_pass`

- **Files:** `.secrets/prod/mobile-signing.yaml` `android.keystore_password` + `android.key_password` (single-alias convention — same value); `.planning/phases/06-release-signing/06-01-SUMMARY.md` Task 3 ("`key_password` = same as keystore_password (single-alias convention per CONTEXT D-08)").
- **Root cause:** PKCS12 stores the private key under a KEK derived from the store password — there is no separate key password layer (unlike JKS). `keytool -keypasswd` is not supported on PKCS12 keystores (only `-storepasswd`). The two YAML fields exist for downstream compatibility (Gradle expects both), but they MUST hold the same value or `keytool` / Gradle signing will fail with a misleading "cannot recover key" error.
- **Mitigation in place:** ADR-0012 §"Решение" STEP 3 explicitly documents the invariant; rotation procedure uses `-storepasswd` only.
- **Remaining gap:** Schema does not enforce the invariant. A future SOPS edit that sets `key_password` to a different value than `keystore_password` would silently break the build. `smoke-sops-roundtrip.sh` verifies the keystore decrypts but does not assert `key_password == keystore_password`.
- **Tracks:** No backlog row — fold into `SOPS-VERIFY-HARDENING` audit pass.

### S5. Pre-rotation backups left on `/tmp` (carry-forward, still present 2026-05-25)

- **Files:** `/tmp/mobile-signing.pre-rotation.1779396983.yaml`, `/tmp/mobile-signing.pre-rotation.1779397027.yaml`, `/tmp/mobile-signing.pre-rotation.1779397205.yaml`, `/tmp/mobile-signing.pre-rerotation.1779404090.yaml` (rollback artifacts from ADR-0012 STEP 3 + Amendment re-rotation).
- **Root cause:** macOS does not purge `/tmp` until reboot; the rollback artifacts contain the pre-rotation SOPS-encrypted YAML (still encrypted, but with the old passwords visible to anyone with the age key).
- **Mitigation in place:** ADR-0012 §"Negative consequences" notes the artifacts must be `rm -P /tmp/mobile-signing.pre-rotation.*.yaml`-d after a few days of confidence in the rotation. Confidence is now strong (4 days post-rotation, multiple successful EAS Cloud builds against the rotated keystore, .aab signed end-to-end).
- **Remaining gap:** No automated cleanup; relies on the dev remembering. The 4 files are still on disk as of 2026-05-25.
- **Tracks:** No backlog row — one-shot `rm -P /tmp/mobile-signing.pre-{rotation,rerotation}.*.yaml` when convenient. **Note:** macOS `shred` is unavailable and `rm -P` is documented as ineffective on APFS (see Fragile Areas §F4). Operational guidance is "trust APFS encryption-at-rest + reboot/purge."

### S6. Treat-as-compromise reasoning carry-over from ADR-0006 (Mapbox)

- **Files:** `docs/DECISIONS/0006-mapbox-token-incident.md`; `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` §"Treat-as-compromise rationale (carry-over from ADR-0006)".
- **Pattern:** Any time a credential is observable in a log pipe outside the dev's own process (GitHub Actions logs, Anthropic chat transcripts, Mapbox dashboard), the standing rule is "rotate even if monitoring shows no abuse — chain of custody is unverifiable past the leak point." Applied twice now (Mapbox tokens in ADR-0006, keystore password in ADR-0012 main + Amendment). Same doctrine applies to the manifest-signing Ed25519 private key in `.secrets/prod/manifest-signing.yaml` if it ever leaks (currently gate-disabled but SOPS bundle in place).
- **Mitigation in place:** Doctrine is consistent across both incidents; rotation is cheap (~5 min for keystore password, ~10 min for Mapbox tokens, ~15-30 min for manifest-signing private key including the new pubkey re-embed + mobile build + tag push when the pipeline is re-enabled).
- **Remaining gap:** No checklist or playbook codifies the doctrine outside of the ADRs themselves. A future incident with a credential family that has higher rotation cost (e.g., DB master password, MinIO root key) may tempt a "monitor instead of rotate" decision under time pressure.
- **Tracks:** `SECRETS-LEAK-PLAYBOOK-AMEND` v1.0.1 backlog (codifies the corrected step-order: verify → audit → delete → rotate → patch → document, NOT delete-first as happened in ADR-0012 STEP 1). Manifest-signing key rotation procedure documented via `MANIFEST-SIGNING-KEY-ROTATION` backlog item.

### S7. `IDENTITY_DEV_MODE=true` default — closed

- **Files:** `services/backend/identity/cmd/server/main.go`.
- **Status:** CLOSED in Phase 2 SEC-05 (Plan 02-02, commit `27ad27f`). Kept in this register as a historical anchor — was a P0 before Phase 2.

### S8. OTP unconditional log — closed

- **Files:** `services/backend/identity/internal/service/otp.go`.
- **Status:** CLOSED in Phase 5 OBS-04 (Plan 05-03, commit `320975c`). Span-attribute scrub also closed via Plan 05-05 `piiScrubProcessor`.

### S9. Manifest-signing pubkey hardcoded in mobile source — rotation requires app rebuild (gate-disabled but constraint still relevant on re-enable)

- **Files:** `apps/mobile-rn/src/update/manifestSigning.ts` line 30 — `export const MANIFEST_PUBKEY_BASE64 = 'rDfoNbDp88ls1yoiuuKONsJ/PdstLOrioQqvXYIA40I=' as const;` (fingerprint `b57acd1efa3f`); private half SOPS-encrypted at `.secrets/prod/manifest-signing.yaml`.
- **Root cause / design intent:** Per 08-CONTEXT D-09, the pubkey is HARDCODED in source — NOT in `app.json` (could be tampered post-build), NOT remote (would create circular trust). Rotation strategy is identical to keystore rotation in ADR-0012: ship a new app build with a new pubkey + force-update the entire tester base. Intentional, not a bug, but a constraint to note when the distribution pipeline gets re-enabled.
- **Residual risk:** If the manifest-signing private key is compromised AFTER distribution is re-enabled, recovery requires: (a) generate new keypair; (b) update `MANIFEST_PUBKEY_BASE64` in source; (c) commit + tag + EAS build a new APK; (d) push the new manifest signed with the NEW key; (e) force-update all 5-10 testers via REL-02 (`min_supported_version` bump in the next manifest signed by the OLD key, then switch the source-of-truth pubkey). Mid-flight, the OLD signed manifest stays valid; old installs simply stop checking once their `min_supported_version` is enforced. Process is ~30 min total. While gate-disabled, compromise has zero blast radius (no manifest fetch happens).
- **Closed-beta mitigation:** Acceptable. Documented in `apps/mobile-rn/src/update/manifestSigning.ts` lines 1-12 (header comment) + 08-CONTEXT D-09.
- **Tracks:** `MANIFEST-SIGNING-KEY-ROTATION` v1.0.1 backlog item — codify the rotation runbook as a formal RUNBOOK.md entry; promote ahead of `DISTRIBUTION-PIPELINE-RE-ENABLE` trigger.

### S10. Standard Android debug.keystore committed to git

- **Files:** `apps/mobile-rn/android/app/debug.keystore` (committed in commit `0f6f840` 2026-05-24); `.github/workflows/android-debug-apk.yml` lines 86-93 (header comment explaining the debug-cert allowlist gap); `.github/workflows/android-debug-apk.yml` (the workflow that signs the universal debug APK with this keystore).
- **Root cause / design intent:** Standard Android debug keystore (password=android, key alias=androiddebugkey, public knowledge — `keytool -genkey` produces it everywhere). Committing eliminates the CI signing dance (~6 failed iterations before this commit; see Fragile Areas §F15). NOT a secret — Android tooling generates this same key on first build everywhere.
- **Residual risk:** Anyone with the repo can produce a debug-signed APK that impersonates "this app under debug signing". Debug-signed APKs CANNOT install over the production-signed APK (different cert SHA-256). The production .aab uses a different keystore (`.secrets/prod/mobile-signing.yaml` → cert SHA-256 `C6:33:47:6C:63:11:40:3F:5D:19:E2:3A:07:3A:15:F6:EA:BC:D6:40:FB:7F:F5:49:A5:B1:C3:A5:18:30:D7:BB`); the production pubkey allowlist on Mapbox is bound to that one only. Conclusion: zero risk to closed beta.
- **Closed-beta mitigation:** Acceptable. Production signing path is fully independent. Debug-APK channel is for BlueStacks/internal testers only, never goes to closed-beta tester base.
- **Tracks:** `MAPBOX-DEBUG-CERT-ALLOWLIST` v1.0.1 backlog item — one-time ~5-min user action to add debug cert SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C` to Mapbox dashboard pk.* token allowlist so debug APKs actually render maps.

---

## Performance

### P1. No load profile — old Phase 8 dropped per ADR-0011

- **Files:** No `k6/` directory; no synthetic load script.
- **Problem:** Unknown ceiling for any service. identity-svc connection-pool sizing, NATS JetStream consumer-group sizing, PostgreSQL `max_connections`, Caddy file-server signed-URL request rate — all set by configuration default, not by measurement.
- **Closed-beta mitigation:** 5-10 testers × ~3 sessions = ~30 sessions; will not stress any of the above.
- **Improvement path:** Re-open old Phase 8 when ADR-0011 re-expansion trigger §1 fires (>50 users). Author `k6/` directory; baseline identity + activity-sync + realtime-gw under 100 RPS sustained.

### P2. No chaos drills — old Phase 8 dropped per ADR-0011

- **Files:** No `infra/chaos/` playbooks; no toxiproxy / pumba scripting.
- **Problem:** Unknown blast radius when NATS broker restarts, PostgreSQL primary fails over, or `srv1561293` reboots mid-session. SessionManager `recoverLast()` handles client-side mid-session recovery, but server-side mid-flight request handling under broker restart is untested.
- **Closed-beta mitigation:** Single VPS, no broker HA, no fail-over needed at this scale.
- **Improvement path:** Pair with P1 re-open; toxiproxy in front of NATS + PostgreSQL.

### P3. No Mapbox 10.3 long-session memory characterization

- **Files:** `apps/mobile-rn/package.json` `@rnmapbox/maps@^10.3`; 1-hour Pixel pocket-walk in Plan 07-03 is the only soak test.
- **Problem:** MapView memory growth across a 1-hour session is not profiled. If a hidden leak exists, the OS may kill the app at the 30-40 min mark on memory-constrained devices.
- **Closed-beta mitigation:** Pixel + flagship Galaxy (S20+) have ≥6 GB RAM; closed-beta tester device class is flagship.
- **Improvement path:** v1.0.1 if a tester reports a recorder crash mid-session; pair with Mapbox 11.x migration.

### P4. MinIO `android-releases` bucket has no lifecycle / retention policy (gate-disabled; relevant on re-enable)

- **Files:** `.planning/phases/08-closed-beta-distribution/08-01-PLAN.md` Task 2 (bucket creation); no `mc ilm rule` documented.
- **Problem:** Every tag pushes a new universal APK (~80-120 MB). With weekly beta cadence + 6-month closed-beta runway = ~26 APKs ≈ 2-3 GB. Storage is on `srv1561293` (single VPS); not catastrophic but unbounded growth is a smell. Currently mooted by ADR-0011 Amendment 5 gate — no APKs uploaded to MinIO until pipeline re-enabled.
- **Closed-beta mitigation:** N/A while gate-disabled.
- **Tracks:** `RELEASE-RETENTION-POLICY` v1.0.1 backlog item — MinIO ILM rule on `android-releases` to keep last 5 APKs + expire older after 90 days. Promote ahead of `DISTRIBUTION-PIPELINE-RE-ENABLE` trigger.

### P5. Cross-service `are_friends()` SQL call on every `start_conversation` (NEW 2026-05-25 PM)

- **Files:** `services/backend/messaging/internal/svc/start_conversation.go` (call site); `services/backend/social-graph/migrations/0022_friend_requests.up.sql` (function definition).
- **Problem:** `are_friends()` executes a Postgres query on every `start_conversation` request, hitting the shared connection pool. Not cached; not memoized; no index hint stored alongside. At closed-beta scale (~10 testers × infrequent conversation creation) the load is negligible — but in any growth scenario, this becomes the messaging service's hottest cross-service hop.
- **Closed-beta mitigation:** Acceptable at 10-tester scale.
- **Improvement path:** If profiling shows >5% of `start_conversation` latency in `are_friends()`, consider (a) a short-TTL in-memory friend-cache in messaging, OR (b) a NATS-published `friendship.changed` event that invalidates the cache. Defer until measurement justifies the complexity.
- **Tracks:** No backlog row yet — covered by the broader `CROSS-SERVICE-SCHEMA-COUPLING` item.

---

## Fragile Areas

### F1. Tag-triggered workflows must be registered on default branch first

- **Files:** `.github/workflows/android-release.yml` (extended in commit `9b8aef9` with Plan 08-01 bundletool + MinIO + sign-manifest steps; later gated per Amendment 5 in `6ad0fef`; lives on `feat/cursona-redesign`); `main` branch has the patched header form (commit `b461ea6` cherry-pick) but NOT the Plan 08-01 extension.
- **Why fragile:** GitHub Actions registers workflows only when they exist on the default branch (`main`). Pushing a tag from a feature branch will NOT trigger a workflow that lives only on that feature branch. Discovered during Phase 7 Stage A' diagnostic 2026-05-21. Same quirk also explains why `backend-cd.yml` appears in the active workflow registry but is absent from `main` (it lives only on `feat/cursona-redesign`) — registry retains stale entries.
- **Safe modification:** Before tagging any future release that needs the Plan 08-01 extension (when `DISTRIBUTION-PIPELINE-RE-ENABLE` fires), cherry-pick the extension to `main` first; verify via `gh workflow view android-release.yml --repo IsmailL01/sport` returns the registered workflow; THEN tag from `feat/cursona-redesign` and the workflow fires.
- **Test coverage:** None — `gh workflow view` is a manual check at execution time.
- **Tracks:** `CI-WORKFLOW-REGISTRY-AUDIT` v1.0.1 backlog (audit + reconcile registry vs `main`).

### F2. `sops set --value-file` is broken in SOPS 3.13.1 (silent fail, exit 0)

- **Files:** `.planning/phases/06-release-signing/06-01-SUMMARY.md` Task 3 (notes the swap to value-stdin form); `.planning/phases/06-release-signing/06-RESEARCH.md` line 11 (still recommends `--value-file`, predates the discovery).
- **Why fragile:** `sops set --value-file /path/to/b64.txt '["android"]["keystore_base64"]' …` exits 0 silently in SOPS 3.13.1 without writing the value. Workaround: pipe via `sops set --value-stdin` with `jq -Rs` JSON-encoded payload to avoid shell escaping issues with multi-line base64. Pattern actually used in ADR-0012 STEP 3 rotation and Phase 6 Plan 06-01 Task 3.
- **Safe modification:** Always prefer `cat /path/b64.txt | sops set --value-stdin …` or `jq -Rs . < /path/b64.txt | sops set --value-stdin …` over `--value-file`. Round-trip-verify (`sops -d | yq -r .path | base64 -d | shasum`) after every write.
- **Test coverage:** `evidence/smoke-sops-roundtrip.sh` catches it post-write; nothing catches the bug pre-write.

### F3. `yq -r` trailing-newline inconsistency vs `printf '%s'` capture form

- **Files:** ADR-0012 §"Amendment 2026-05-22" — direct evidence; `evidence/smoke-sha256-captured.sh` line 22 (uses `printf '%s'` capture form correctly).
- **Why fragile:** Two pipelines that look equivalent are not:
  - Form A (`sops -d ... | yq -r '.path' | shasum`) — `yq -r` appends `\n`; `shasum` hashes value+newline.
  - Form B (`P=$(sops -d ... | yq -r '.path'); printf '%s' "$P" | shasum`) — `$()` strips trailing newlines; `printf '%s'` adds none; `shasum` hashes value-only.
  Both produce "valid" sha256 outputs that differ. Treating the difference as evidence of corruption was the trigger for the ADR-0012 Amendment re-incident.
- **Safe modification:** Single canonical form: `printf '%s' "$VAR" | shasum -a 256 | cut -c1-12`. Do not mix forms across a single audit.
- **Test coverage:** No automated check; codified as discipline rule #1 in ADR-0012 Amendment Phase A.

### F4. macOS `shred` unavailable; `rm -P` ineffective on APFS

- **Files:** `.planning/phases/06-release-signing/06-RESEARCH.md` lines 114 + 396 + 644.
- **Why fragile:** macOS does not ship `shred`. BSD `rm -P` overwrites the file's data extents but APFS copy-on-write + SSD wear leveling defeat the overwrite — old extents persist until garbage-collected. Worse, `srm` was removed from macOS Sierra (2016). Documented as RESEARCH Pitfall 11.
- **Safe modification:** For ephemeral keystore generation, use a RAM disk (`hdiutil attach -nomount ram://…` → `diskutil eraseVolume APFS …`); RAM disk evaporates on unmount with zero SSD trace. For already-on-disk artifacts (e.g., `/tmp/mobile-signing.pre-rotation.*.yaml`), trust APFS encryption-at-rest + reboot.
- **Test coverage:** Plan 06-01 Task 2 procedure used the RAM-disk pattern (`evidence/smoke-keystore-generated.sh` verifies the generated PKCS12 fingerprint).

### F5. `hdiutil attach -nomount ram://...` returns device path with trailing whitespace

- **Files:** `.planning/phases/06-release-signing/06-RESEARCH.md` §Pattern 1 (Plan 06-01 Task 2 procedure).
- **Why fragile:** `hdiutil attach -nomount ram://20480` prints the new device path followed by trailing whitespace (e.g., `/dev/disk7         \n`). Naive capture (`DEV=$(hdiutil attach -nomount ram://20480)`) preserves the whitespace; downstream `diskutil eraseVolume APFS SIGN_RAM "$DEV"` fails with `Could not find disk: /dev/disk7         `.
- **Safe modification:** Strip whitespace explicitly: `DEV=$(hdiutil attach -nomount ram://20480 | tr -d ' ')` OR use `awk '{print $1}'` to take the first whitespace-delimited token.
- **Test coverage:** None — silent failure if not stripped.

### F6. `keytool -keypasswd` unsupported on PKCS12 (use `-storepasswd` only)

- **Files:** ADR-0012 §"Решение" STEP 3 (rotation procedure); `.planning/phases/06-release-signing/06-01-SUMMARY.md` Task 3.
- **Why fragile:** PKCS12 stores keys under a KEK derived from the store password — there is no separate key-password layer. `keytool -keypasswd` on PKCS12 silently no-ops (or exits with a confusing error depending on JDK version). Rotating "both passwords" actually means rotating the single store password via `keytool -storepasswd`; the `key_password` field in `mobile-signing.yaml` is a downstream-compatibility artifact (Gradle expects both fields) and must mirror `keystore_password`.
- **Safe modification:** Use `keytool -storepasswd` only. Update both YAML fields with the same new value.
- **Test coverage:** `evidence/smoke-sops-roundtrip.sh` verifies the keystore decrypts post-rotation; nothing asserts `key_password == keystore_password` programmatically.

### F7. `expo/expo-github-action@v8` transient PATH dependency

- **Files:** `.github/workflows/android-release.yml` lines 100-101 (post-fix); ADR-0012 §"Положительные" (line 109).
- **Why fragile:** The original workflow used `expo/expo-github-action@v8` + `npx eas build`. `npx eas` relies on the transient PATH set by the action wrapper; CI run `26245775886` failed with `npm error could not determine executable to run` — root cause was action-vs-shell PATH disagreement, exposed by an unrelated rerun in a slightly different runner environment.
- **Safe modification:** Replaced action wrapper with explicit `npm install -g eas-cli` + bare `eas build` (line 101). EXPO_TOKEN passed via step env. Removes the transient-PATH coupling.
- **Test coverage:** None pre-merge; relies on the next tag-push smoke (Plan 07-03 Task 5 or the eventual `DISTRIBUTION-PIPELINE-RE-ENABLE` trigger) re-firing the workflow against the patched form.

### F8. CI age key creates an implicit second SOPS copy

- **Files:** `.sops.yaml` (two age recipients — DEV_A + CI); GitHub Actions secret `SOPS_AGE_KEY_CI`; `.planning/phases/07-release-builds-mobile-stability/07-CONTEXT.md` D-04 "Note". Applies to BOTH `.secrets/prod/mobile-signing.yaml` AND `.secrets/prod/manifest-signing.yaml` (the latter gate-disabled per Amendment 5 but the CI recipient is still in the recipient list).
- **Why fragile:** Phase 7 Plan 07-01 Task 1 added a CI age key as a second SOPS recipient and pushed the private half to `SOPS_AGE_KEY_CI`. This implicitly creates a second copy of the keystore (encrypted by CI key, stored in GitHub Actions secret state). ADR-0011 Amendment 4 PM said "single SOPS copy on dev workstation" — the CI copy is a real second copy, though access-scoped to GitHub Actions runners. Same CI recipient now also has access to the manifest-signing private key.
- **Safe modification:** Acknowledged in 06-01-SUMMARY follow-up note; does NOT promote `KEYSTORE-CLOUD-BACKUP` because the CI age key is rotatable separately + not a backup channel. If GitHub Actions is compromised, rotate `SOPS_AGE_KEY_CI` via `sops updatekeys` against a fresh recipient. Manifest-signing key compromise is recoverable via S9 procedure (when pipeline re-enabled).
- **Test coverage:** `evidence/smoke-sops-multi-recipient.sh` verifies both recipients decrypt; nothing checks for "the CI key never sees plaintext outside the runner."

### F9. Canonical JSON byte-identity drift across Go + Node (gate-disabled but constraint remains)

- **Files:** `scripts/sign-manifest.go` (Go signer — struct field declaration order); `apps/mobile-rn/src/update/manifestSigning.ts` lines 34-47 (`canonicalJsonWithoutSignature` — sorts keys alphabetically); `.planning/phases/08-closed-beta-distribution/evidence/smoke-manifest-sign-roundtrip.sh` (cross-language smoke catches drift); 08-PLAN-CHECK.md line 109 (planner self-identified Pitfall 18).
- **Why fragile:** Go's `encoding/json` marshals struct fields in declaration order, NOT alphabetical (Pitfall 18). The mobile verifier strips the signature field then sorts the remaining keys alphabetically before re-canonicalizing. If the Go signer's struct fields are declared in non-alphabetical order, the Go-produced canonical JSON does not match the Node-produced canonical JSON byte-for-byte → signature verification fails on the device with a misleading "invalid signature" error. Compounded by `omitempty` on the `Signature` field — the signed payload omits the field; the published manifest re-marshals with it populated.
- **Safe modification:** Always declare Go struct fields in alphabetical JSON-tag order. Run `evidence/smoke-manifest-sign-roundtrip.sh` after any change to `sign-manifest.go` OR `manifestSigning.ts` to catch drift. The cross-language smoke is the load-bearing safety net here. Gate-disabled state mutes the immediate risk but the smoke is still required on re-enable.
- **Test coverage:** `evidence/smoke-manifest-sign-roundtrip.sh` exercises Go-sign → Node-verify on a known payload. No CI gate yet (smoke is dev-workstation only).

### F10. `sops --encrypt --age` from stdin loses creation_rules path-context (Pitfall 19)

- **Files:** `.planning/phases/08-closed-beta-distribution/08-01-PLAN.md` Task 1 (manifest-signing keypair generation); `.sops.yaml` (creation_rules with `path_regex: .secrets/.*\.yaml`).
- **Why fragile:** `sops --encrypt --age "<RECIPIENT>" /tmp/somefile.yaml` on a file OUTSIDE the `.secrets/` regex match in `.sops.yaml` results in encrypted output, BUT the encrypted file lacks the creation_rules metadata (path-regex doesn't apply via stdin/external-path route). Subsequent `sops set --value-stdin ... existing-file.yaml` then fails with "sops metadata not found" because the metadata block expected by `sops set` is absent. Encountered during Plan 08-01 Task 1 (manifest-signing.yaml authored to `/tmp/` first, then `sops --encrypt --in-place` failed downstream).
- **Safe modification:** ALWAYS write the plaintext skeleton inside `.secrets/<env>/<name>.yaml` first (under the path-regex), THEN `sops --encrypt --in-place .secrets/<env>/<name>.yaml`. Do not stage SOPS files in `/tmp/`. Workaround was applied during Plan 08-01 Task 1 (commit `af6cb5f`).
- **Test coverage:** None — silent fail if the encrypted file path is outside the regex.

### F11. Jest `jest.mock` factory hoisting + outer-scope reference rules (Pitfall 20)

- **Files:** `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts` lines 54-67 (mocks instantiated INSIDE factory + retrieved via `jest.requireMock`); `apps/mobile-rn/src/update/__tests__/manifestSigning.test.ts`.
- **Why fragile:** `jest.mock(modulePath, factory)` is hoisted to the top of the file by babel-jest. The factory CANNOT reference outer-scope variables UNLESS the variable name starts with `mock` (case-insensitive). Even with the `mock` prefix, the hoisting puts the factory ABOVE the `const` declaration → the variable is `undefined` when the factory executes. The textbook pattern "declare `const mockFn = jest.fn()` then `jest.mock(... , () => ({ foo: mockFn }))`" fails silently.
- **Safe modification:** Real solution: instantiate the `jest.fn()` directly INSIDE the factory return object, then retrieve via `jest.requireMock(modulePath).fnName` after the import statements. Example: `jest.mock('../foo', () => ({ __esModule: true, bar: jest.fn(() => true) }))` then `const mockBar = jest.requireMock('../foo').bar as jest.Mock;`. Encountered + documented in `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts`.
- **Test coverage:** Encountered + fixed during Plan 08-01 Task 5 (manifestCheck.test.ts authoring).

### F12. Jest `jest.mock` for ESM-style named-export modules requires `__esModule: true` (Pitfall 21)

- **Files:** `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts` lines 56-63.
- **Why fragile:** `jest.mock(modulePath, () => ({ foo: jest.fn() }))` for an ESM-style module (TypeScript that imports via `import { foo } from '...'`) returns the mock object as-is. Without the `__esModule: true` flag in the returned object, `import { foo } from '...'` resolves to `undefined` because the import system expects the namespace-object shape with the ESM marker. Even though the named export "foo" is present on the returned object, the lack of the marker makes the resolver treat it as a non-ESM default-export.
- **Safe modification:** Always include `__esModule: true` in the factory return value when mocking ESM named-exports: `jest.mock('../foo', () => ({ __esModule: true, foo: jest.fn() }))`.
- **Test coverage:** Encountered + fixed in `manifestCheck.test.ts` lines 56-63 (`verifyManifestSignature` + `getInstalledVersion` mocks).

### F13. `jest.requireActual + ...override` cannot override module-internal closure constants (Pitfall 22)

- **Files:** `apps/mobile-rn/src/update/manifestSigning.ts` lines 73-91 (`verifyManifestSignature(manifest, pubkeyBase64 = MANIFEST_PUBKEY_BASE64)` — pubkey is a default parameter); ADR-style header comment lines 64-72 explaining the override rationale.
- **Why fragile:** Test code wants to call `verifyManifestSignature` with a TEST keypair (different from the production pubkey). The spread-overide pattern `jest.mock('../manifestSigning', () => ({ ...jest.requireActual('../manifestSigning'), MANIFEST_PUBKEY_BASE64: TEST_PUBKEY }))` does NOT work because the module's `verifyManifestSignature` function closes over the local `const MANIFEST_PUBKEY_BASE64` at module load time. Spreading a different value into the named export does NOT change what the function reads internally — the closure binding is fixed.
- **Safe modification:** Refactor the function to accept the value as an optional parameter, defaulting to the constant: `export function verifyManifestSignature(manifest, pubkeyBase64: string = MANIFEST_PUBKEY_BASE64): boolean`. Tests pass a different keypair's pubkey explicitly; production callers omit the argument. Applied in `manifestSigning.ts` line 78.
- **Test coverage:** Documented inline (header comment lines 64-72) so future devs don't try the spread-override pattern again.

### F14. `@noble/ed25519` v2→v3 + `@noble/hashes` v1→v2 API drift (Pitfall 13b)

- **Files:** `apps/mobile-rn/package.json` lines 17-18 (`@noble/ed25519: ^3.1.0` + `@noble/hashes: ^2.2.0`); `apps/mobile-rn/src/update/manifestSigning.ts` lines 14-22 (hash injection comment + assignment).
- **Why fragile:** `expo install` chose `@noble/ed25519@^3.1.0` + `@noble/hashes@^2.2.0` — both have v2→v3 (ed25519) + v1→v2 (hashes) API drift from RESEARCH §1 templates. Two breaking changes:
  1. Hash injection moved from `ed.etc.sha512Sync = sha512` (v2.x) to `ed.hashes.sha512 = sha512` (v3.x). `ed.etc.sha512Sync` no longer exists.
  2. `@noble/hashes` v2.x requires `.js` suffix on submodule imports — `import { sha512 } from '@noble/hashes/sha2.js'` works; `import { sha512 } from '@noble/hashes/sha2'` does not (v2.x exports map).
- **Safe modification:** Use the v3 API pattern: `import { sha512 } from '@noble/hashes/sha2.js'; ed25519.hashes.sha512 = sha512;`. Fixed in commit `721210f`. RESEARCH §1 should be updated on next planning cycle (templates predate the v3 release).
- **Test coverage:** `apps/mobile-rn/src/update/__tests__/manifestSigning.test.ts` exercises sign+verify on a synthetic keypair → catches injection failure at runtime.

### F15. `android-debug-apk.yml` gradle "keystore not found" false-negative (mystery)

- **Files:** `.github/workflows/android-debug-apk.yml` (final form after 5 iterations); `apps/mobile-rn/android/app/debug.keystore` (now committed per `0f6f840` to bypass the symptom).
- **Why fragile:** Initial workflow attempted to `keytool -genkey` the debug.keystore in-CI at `app/debug.keystore`. Step log showed `[Storing app/debug.keystore]` (keytool's own success line) BUT the subsequent `:app:validateSigningDebug` gradle task still failed with "Keystore file not found for signing config 'debug'." Working directory, ownership, mtime, path-resolution audits all came back inconclusive. Workaround: commit the keystore (`0f6f840`) — symptom disappears, but the root cause of the false-negative is unknown.
- **Safe modification:** Trust the committed keystore for now. If the gradle behavior surfaces again on a different keystore path (e.g., production `runningecosystem-release.keystore` reconstruction-at-CI-time), allocate an investigation: enable `--scan` on gradle, diff `./gradlew :app:validateSigningDebug -i` output between local and CI, suspect a working-directory or Gradle property race.
- **Test coverage:** None automated; investigated via the CI iteration log only.
- **Tracks:** `GRADLE-KEYSTORE-CI-MYSTERY` v1.0.1 backlog (low priority — workaround is durable).

### F16. Cross-service schema coupling — messaging reads social-graph's `friend_requests` (NEW 2026-05-25 PM)

- **Files:** `services/backend/social-graph/migrations/0022_friend_requests.up.sql` (defines `friend_requests` table + `are_friends(user_a, user_b)` SQL function); `services/backend/messaging/internal/svc/start_conversation.go` (caller); shared Postgres connection pool.
- **Why fragile:** First cross-service permission gate in the codebase. Messaging code calls `are_friends()` over the SHARED Postgres pool — a SQL-level coupling rather than HTTP/contract-level. If social-graph migrates the `friend_requests` schema (renames columns, splits the table, normalizes a field), the SQL function may continue to "work" against stale assumptions until a runtime mismatch fires. Crucially: NO BUILD-TIME CHECK catches this; everything passes lint + tests until production breaks.
- **Safe modification:** Treat the `are_friends(user_a, user_b) → boolean` function as the stable contract — even on internal table refactors, preserve the function signature. Document the cross-service dependency in social-graph's repo README (NOT YET DONE — fold into the broader `CROSS-SERVICE-SCHEMA-COUPLING` backlog item). Run an integration test that exercises `start_conversation` against a freshly migrated DB after any social-graph schema change.
- **Test coverage:** None at the moment. Phase 10 Session 1 commits added unit tests for both services in isolation; cross-service runtime path is only validated by manual smoke. Consider an integration test in `services/backend/messaging/internal/svc/start_conversation_test.go` that requires the migration to be applied (e.g., via a testcontainers-postgres fixture seeded with both services' migrations).
- **Tracks:** `CROSS-SERVICE-SCHEMA-COUPLING` v1.0.1 backlog (new entry).

---

## Deferred to v1.0.1 (the backlog)

Tracked in `.planning/ROADMAP.md` §"v1.0.1 Backlog". One-line summary per item — the ROADMAP has the full triggering conditions.

Two items REMOVED in 2026-05-25 PM (first-ever backlog contraction):
- `STORIES-REVIVAL` — PROMOTED to Phase 11 (ADR-0011 Amendment 6).
- `FRIEND-REQUEST-FLOW` — PROMOTED to Phase 10 backend (commits `a827bc5..830b8db`).

| ID | Item | Source |
|---|---|---|
| `AUTH-RATELIMIT` | `/auth/*` rate-limit (was old Phase 6 EDGE-01). Closed-beta mitigates blast radius; revisit before public launch. | CONCERNS.md §Tech Debt 1 |
| `KEYSTORE-CLOUD-BACKUP` | Cloud backup of `.secrets/prod/mobile-signing.yaml` + age key (Plan 06-01 Tasks 5+6 — preserved in plan body). Trigger: Play Store submission / >50 users / explicit production-asset decision. | ADR-0011 Amendment 4 PM |
| `EMERGENCY-RUNBOOK` | Codify the "what to tell testers" + recovery procedure when keystore is lost (ADR-0011 D-15 scenario b). | ADR-0011 Amendment 4 |
| `CI-MASK-LINT` | Pre-commit / `actionlint` rule that flags `echo "X=$value" >> $GITHUB_ENV` without a preceding `::add-mask::`. Generalize to `$GITHUB_OUTPUT` + `$GITHUB_STEP_SUMMARY`. | ADR-0012 Phase C |
| `SECRETS-LEAK-PLAYBOOK-AMEND` | Finalize the corrected leak-response playbook in `docs/SECRETS.md` — verify → audit → delete → rotate → patch → document. Reverse of the order used in ADR-0012 STEP 1 (which deleted-first). | ADR-0012 Phase B |
| `SOPS-VERIFY-HARDENING` | Every verification script in `evidence/` + `scripts/` must require `SOPS_AGE_KEY_FILE` explicitly, check `sops -d` exit code, validate decrypted value shape before downstream. Extends to `scripts/release-distribute.sh` + `scripts/sign-manifest.go` (gate-disabled but applies when re-enabled). | ADR-0012 Phase C |
| `CRED-DIAG-DISCIPLINE` | Codify the four credential-diagnostics rules in `docs/SECRETS.md` (single canonical fingerprint form; no byte inspection; length-only; shape vs value). Add pre-commit grep for `xxd .*\$[A-Z_]+`. | ADR-0012 Amendment Phase C |
| `CI-WORKFLOW-REGISTRY-AUDIT` | Audit + reconcile GH Actions workflow registry vs `main` branch contents. `backend-cd.yml` present in registry but absent from `main` (lives on `feat/cursona-redesign` only). New workflows register only when present on default branch. Re-enabling Plan 08-01 will require the same cherry-pick discipline. | Phase 7 Stage A' diagnostic 2026-05-21 |
| `DEBUG-MIDDLEWARE-ENV` | Refactor `services/backend/pkg/observability/DebugSessionMiddleware` to read `DEBUG_SESSIONS_FOR_USER` env-allowlist. Current 3-gate (header ∧ JWT.is_tester ∧ featureflag) is unusable for solo dev (no admin UI for featureflag flips). | ADR-0011 OBS-08 amendment |
| `PROD-LAUNCH-PREP` | Bank-grade key custody — re-backup `.secrets/prod/mobile-signing.yaml` to 2 encrypted-DMG USB sticks at ≥5 km separation + laminated paper RECOVERY-CARDs + 1Password sealed DMG entry. Trigger: beta passes 50 users. | ADR-0011 Amendment 2 PM |
| `GHCR-PULL-AUTH` | Direct GHCR pull on prod (replace save/scp/load). Inherited from Phase 4 Plan 04-04. | Plan 04-04 D-04-04-A |
| `MIGRATE-RSYNC-DELETE` | `rsync --delete` for migrations subtree only. | Plan 04-04 |
| `METADATA-RAW-TAG` | `metadata-action pattern={{raw}}` for semver — CD strips `v` prefix. | Plan 04-04 |
| `CD-SMOKE-VERIFY` | Fix `cosign-verify-smoke` job — UNAUTHORIZED on private packages. | Plan 04-04 |
| `DIGEST-PINNING` | SHA256 digest-pin compose images. | Plan 04-03a/04 |
| `SECRETS-ROTATE` | Rotate `POSTGRES_PASSWORD`, `JWT_SECRET`, MinIO creds (pasted in chat during Phase 3 SOPS-fill 2026-05-17). | Phase 3 chat leak |
| `MANIFEST-SIGNING-KEY-ROTATION` | Codify the rotation runbook for `.secrets/prod/manifest-signing.yaml` (Ed25519 private key). Steps: generate new keypair → update `MANIFEST_PUBKEY_BASE64` in `manifestSigning.ts` → bump `min_supported_version` in the OLD-key-signed manifest → publish the NEW-key-signed manifest → 7-day overlap window. Equivalent of ADR-0012 procedure for the manifest-signing key family. Promote ahead of `DISTRIBUTION-PIPELINE-RE-ENABLE`. | Plan 08-01 — S9 above |
| `RELEASE-RETENTION-POLICY` | MinIO ILM lifecycle rule on `android-releases` bucket — keep last 5 APKs + expire older after 90 days. Prevents unbounded growth at ~80-120 MB per tag × 26 tags / 6-month beta runway. Promote ahead of `DISTRIBUTION-PIPELINE-RE-ENABLE`. | Plan 08-01 — P4 above |
| `APK-URL-REFRESH-CRON` | Daily cron on `srv1561293` that re-signs the manifest (`scripts/release-distribute.sh` in manifest-only mode) with a fresh 24h presigned APK URL. Prevents expiry-induced 403s when no new tag fires within 24h. Promote ahead of `DISTRIBUTION-PIPELINE-RE-ENABLE`. | Plan 08-01 — S11 prior |
| `MANIFEST-INVITE-GATING` | Per-tester JWT-gated manifest URL — replace public-read `android-manifest` bucket with an authenticated endpoint (e.g., Caddy reverse proxy + JWT check via identity-svc). Trigger: any tester chat-leaks the URL or beta moves past 50 users. Promote ahead of `DISTRIBUTION-PIPELINE-RE-ENABLE`. | Plan 08-01 — S10 prior + D-08-PRIVATE-INVITE-GATING |
| `DISTRIBUTION-PIPELINE-RE-ENABLE` | Phase 8 distribution-pipeline (Plan 08-01) is code-complete + runtime-disabled per ADR-0011 Amendment 5. Re-enable = (1) populate `MINIO_RELEASES_*` repo secrets, (2) set `EXPO_PUBLIC_UPDATE_MANIFEST_URL` in mobile env, (3) cut a new beta tag. 638/638 jest tests defend against drift. | ADR-0011 Amendment 5 2026-05-24 |
| `CHAT-TYPING-INDICATOR` | Ghost bubble when peer is typing on ChatScreen. Backend realtime pubsub event (`typing.started` / `typing.stopped`) + mobile listener (5s expiry) + fade animation. ~3h. | `/gsd-quick chat-polish-pass` 2026-05-25 |
| `CHAT-SWIPE-DELETE` | Left-swipe row on ChatsListScreen → red Delete button → soft-delete chat. `react-native-gesture-handler` Swipeable wrapper. Backend `DELETE /conversations/{id}` (soft-delete `deleted_at`). ~3h. | `/gsd-quick chat-polish-pass` 2026-05-25 |
| `CHAT-MODULE-MIGRATION` | Move chat code from `src/state/social/`, `src/storage/socialRepository.ts`, `src/domain/social.ts`, `src/ui/social/` into `src/modules/chat/{domain,storage,state,sync,ui}/index.ts` to match the modular pattern. 1-2 days. | `/gsd-quick chat-polish-pass` 2026-05-25 |
| `MAPBOX-DEBUG-CERT-ALLOWLIST` | One-time ~5-min user action — add debug.keystore cert SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C` to Mapbox dashboard `pk.*` token allowlist so `android-debug-apk.yml` artifacts actually render maps (not blank tiles). | CONCERNS.md §B2 + S10 |
| `WORKSPACE-MOD-HYGIENE` | `go mod tidy` per-module fails for `identity` service (imports `github.com/runningecosystem/backend/pkg/permissions` via go.work workspace; per-module tidy doesn't honor workspace). Lint/vuln/vet/build all work via workspace mode → not a blocker. Decide: pin module paths or accept workspace-only tidy as documented dev workflow. | Go toolchain bump 2026-05-25 (commit `69cc8eb`) |
| `GRADLE-KEYSTORE-CI-MYSTERY` | Investigate why `keytool -genkey` storing debug.keystore in `android-debug-apk.yml` succeeded (`[Storing app/debug.keystore]`) but `:app:validateSigningDebug` still reported "Keystore file not found." Workaround: keystore committed to git (`0f6f840`). Root cause undetermined. Low priority — workaround is durable. | android-debug-apk.yml CI iteration debt |
| `TRACKER-LIVE-FIELD-TUNE` | Tune PauseDetector warmup gate thresholds (currently warmupMs + warmupMeters from `apps/mobile-rn/src/pipeline/filters/PauseDetector.ts`) post Plan 07-03 Pixel pocket-walk. Real-device baseline (GPS lock latency on Pixel vs flagship Galaxy) may justify a different warmup window than the dev-workstation guess. | `/gsd-quick tracker-live-polish-pass` 2026-05-25 survey |
| `MAP-RECENTER-BUTTON` | Add a "recenter" button to TrackerLive when the camera is released (after closure-fired or when paused). Tracker-live-polish-pass added "freeze map camera on pause" (commit `a3983cc`) — UX-paired follow-up is a one-tap recenter to user location when ready to resume. | `/gsd-quick tracker-live-polish-pass` 2026-05-25 survey |
| `RUN-LIVE-SPLITS` | Render per-km splits during the run (live), not just at RunDetails post-save. `computeSplits` already exists at `apps/mobile-rn/src/domain/splits.ts`; surfacing live is a TrackerLive UI work item. | `/gsd-quick tracker-live-polish-pass` 2026-05-25 survey |
| `CROSS-SERVICE-SCHEMA-COUPLING` (NEW 2026-05-25 PM) | Address the runtime coupling between messaging ↔ social-graph via `friend_requests` table + `are_friends()` SQL function (first cross-service permission gate, introduced Phase 10 Session 1). Steps: (a) document the dependency in social-graph README; (b) add an integration test in messaging that exercises `start_conversation` against a freshly migrated DB; (c) long-term, if scale demands service isolation, migrate to inter-service HTTP API (e.g., `GET /friendship/{a}/{b}`). Trigger: deployment-ordering incident OR social-graph migrates off shared Postgres pool. | Phase 10 Session 1 commits `a827bc5..830b8db` 2026-05-25 PM |

**Resolved items (intentionally listed for audit trail):**

- ☑ `EAS-PROJECT-INIT` — closed inline in Plan 07-01 commit `5a26c68` (projectId `a9f8e26f-bd3f-4296-b67e-21909721132c`). Was historical tracking, never an actual v1.0.1 deferral.
- ☑ Golangci-lint v2.5 backlog (8 issues in `pkg/observability`) — closed commit `92fe656`.
- ☑ Govulncheck findings (19-26 per module) — closed commit `69cc8eb` (Go 1.25.0 → 1.25.10 + otel v1.32 → v1.43).
- ☑ "ПРОДОЛЖИТЬ on start" UX bug — closed commit `815c0ff` (PauseDetector warmup gate).
- ☑ Time-freeze on pause — closed commit `b834eef` (SessionManager `pausedDurationMs` accumulator + `effectiveElapsedMs` getter; UI consumers updated in `ed5925f`).
- ☑ `STORIES-REVIVAL` — PROMOTED to Phase 11 (ADR-0011 Amendment 6 2026-05-25 PM). Not yet shipped — see Active Blocker B4. Reverting to backlog is the Amendment 7 fallback path if Phase 11 exceeds 2× day-estimate.
- ☑ `FRIEND-REQUEST-FLOW` — PROMOTED to Phase 10 backend (commits `a827bc5..830b8db` 2026-05-25 PM). Code-complete pending (a) production migration apply (B3), (b) Sessions 2-3 mobile UI (B4). Reverting to backlog is the Amendment 7 fallback path if Phase 10 mobile exceeds 2× day-estimate.

Total active backlog: ~30 items (-2 since prior refresh: net contraction; first-ever net-negative backlog delta).

---

## Environment Risks

Workstation-state assumptions that have caused real friction during Phase 6/7/8/10 execution and that the next executor will hit again without explicit setup.

### E1. `SOPS_AGE_KEY_FILE` not in shell profile

- **What:** macOS SOPS default search path is `~/Library/Application Support/sops/age/keys.txt`. The actual key lives at the XDG path `~/.config/sops/age/keys.txt`. `SOPS_AGE_KEY_FILE` must be exported per-invocation OR every script must default it via `: "${SOPS_AGE_KEY_FILE:=$HOME/.config/sops/age/keys.txt}"`.
- **Risk:** Silent decrypt failure → `yq -r` returns the literal `null` → downstream pipelines hash meaningless input → false-positive on credential integrity checks. Triggered the ADR-0012 STEP 2 false-positive. `scripts/release-distribute.sh` shells out to `sops -d .secrets/prod/manifest-signing.yaml`; same blind spot applies if executed outside CI without the env var set (currently gate-disabled but the audit gap stays open when re-enabled).
- **Mitigation:** `evidence/smoke-sops-roundtrip.sh` defaults it; pending follow-up #4 in `.planning/STATE.md` ("Add `~/.envrc` (direnv) or shell-rc snippet to auto-export `SOPS_AGE_KEY_FILE`").
- **Tracks:** Pending follow-up #4 in `.planning/STATE.md` + `SOPS-VERIFY-HARDENING` in v1.0.1 backlog.

### E2. Expo CLI not logged in locally

- **What:** `npx eas` requires a logged-in Expo account. Plan 07-01 commit `5a26c68` ran `eas login` + `eas init` from the dev workstation; `eas init` populated `app.json` `extra.eas.projectId`.
- **Risk:** Local invocations (`eas build:list`, `eas build:download`) need a logged-in Expo session OR `EXPO_TOKEN=… npx eas …`. Currently the dev workstation has the login session from Plan 07-01.
- **Mitigation:** Login persists across sessions until token rotation; refresh if expired.
- **Tracks:** Folded into the EAS-PROJECT-INIT historical note (now closed).

### E3. No `EXPO_TOKEN` in dev shell env

- **What:** `EXPO_TOKEN` is pushed as a GitHub Actions secret (CI-side) but not exported in the dev workstation shell. Local `npx eas` invocations (when re-enabling Plan 08-01 or downloading a fresh .aab) will prompt for login interactively unless the session is fresh.
- **Risk:** Friction during user-action sessions; possible interactive prompt that the autonomous executor cannot answer.
- **Mitigation:** Document `EXPO_TOKEN=...` shell-export in the SUMMARY follow-up; the executor pastes the token into a 1Password "Expo CLI personal token" entry for reproducibility.

### E4. Single age recipient in DEV_A position — no DEV_B yet

- **What:** `.sops.yaml` recipient list has DEV_A (`age1ph7d4a62n9...`) + CI (`age19ysu774h4c...`). No DEV_B. Phase 2 D-04 mandated a second human recipient; CONTEXT D-04 acknowledged the gap (`TODO(DEV_B)`).
- **Risk:** Single point of failure for bus factor (T-02-04 per Phase 2 CONTEXT). If DEV_A workstation + 1Password sealed-entry both lose the age key simultaneously, all `.secrets/<env>/*.yaml` become permanently unrecoverable. CI key is access-scoped to GitHub Actions runners and is not a backup channel (F8). Manifest-signing private key is in the same bundle — same bus-factor.
- **Mitigation:** Phase 2 D-04 1Password sealed-entry backup of the DEV_A age key is the load-bearing recovery path. Cloud-provider replication of 1Password gives ≥2 data-center geographic redundancy.
- **Tracks:** Pending follow-up #5 in `.planning/STATE.md` ("DEV_B age pubkey — `.sops.yaml` TODO; run `sops updatekeys` once provided") — solo-dev status means this stays open until team grows.

### E5. macOS-specific tooling assumptions throughout `evidence/` scripts

- **What:** Smoke scripts assume `hdiutil`, `diskutil`, `security`, BSD `awk`/`grep`/`shasum`. CI runners are Ubuntu (GNU coreutils); cross-platform script portability is not guaranteed. Plan 08-01 `evidence/smoke-manifest-sign-roundtrip.sh` invokes `go run scripts/sign-manifest.go` + `node` — both portable, but the surrounding shell uses BSD-ism `awk`.
- **Risk:** Phase 7 Plan 07-01 Task 5 workflow + Plan 08-01 extension (`.github/workflows/android-release.yml`) is hand-rolled to call `sops` + `yq` + `base64 -d` + `mc` + `go` on the Ubuntu runner; it does not re-use the `evidence/` smoke scripts. If a future workflow tries to run `evidence/smoke-sops-roundtrip.sh` directly on Ubuntu, expect divergences.
- **Mitigation:** Acknowledged separation: `evidence/` scripts = dev workstation; `.github/workflows/` = CI runner. Both verify SOPS round-trips independently.
- **Tracks:** None — accepted separation for closed beta.

### E6. `/tmp` not auto-purged on macOS (still 4 stale files as of 2026-05-25)

- **What:** macOS `/tmp` (actually `/private/tmp` linked) is not purged between reboots in some configurations. Pre-rotation backups from ADR-0012 STEP 3 + Amendment re-rotation remain there: `/tmp/mobile-signing.pre-rotation.1779396983.yaml`, `/tmp/mobile-signing.pre-rotation.1779397027.yaml`, `/tmp/mobile-signing.pre-rotation.1779397205.yaml`, `/tmp/mobile-signing.pre-rerotation.1779404090.yaml`.
- **Risk:** Aged plaintext-encrypted-by-old-password SOPS bundles persist on disk indefinitely until manual cleanup.
- **Mitigation:** Manual `rm -P /tmp/mobile-signing.pre-rotation.*.yaml /tmp/mobile-signing.pre-rerotation.*.yaml` after confidence in the rotation (now well-established post 4 days + multiple successful builds). Trust APFS encryption-at-rest in the interim (see F4 — `rm -P` is not a real scrub).
- **Tracks:** None — operational discipline. STATE.md "Pending user-actions" §3 already prompts the cleanup.

### E7. SettingsScreen hardcoded `APP_VERSION = '0.9'` misleads tester reports

- **What:** `apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx:26` defines `const APP_VERSION = '0.9'` and renders it at line 328. The string is hardcoded, not pulled from `getInstalledVersion()` (which exists at `apps/mobile-rn/src/util/version.ts:44` and reads from `expo-application`).
- **Risk:** Closed-beta testers reporting "I'm on version 0.9 and X happens" will mislead Phase 9 triage. Every tester sees "0.9" regardless of which beta tag they're on.
- **Mitigation:** Replace with `getInstalledVersion()` — one-line fix.
- **Tracks:** Out-of-scope for Plan 08-01 (D-08-RECORD-NOT-FIX); quick-fix candidate when convenient OR v1.0.1.

### E8. Quick tasks pattern accumulating in STATE.md (multi-session variant now in play 2026-05-25 PM)

- **What:** `/gsd-quick <slug>` workflow established; 2 completed 2026-05-25 AM (chat-polish-pass + tracker-live-polish-pass — both single-session) + 1 in-flight 2026-05-25 PM (`social-yolo-pass` — FIRST multi-session quick task with `yolo: true` flag). Each leaves a `.planning/quick/YYYYMMDD-slug/` directory with PLAN/CONTEXT/SUMMARY + a row in STATE.md's "Quick Tasks Completed" table (or "Quick Tasks In Flight" for active ones).
- **Risk:** Volume — if the pattern keeps accumulating (5+ quick tasks per fortnight), the STATE.md tables will grow unbounded. Discoverability of "what was in quick task X" depends on directory naming + commit message discipline. Multi-session variant adds resume-state complexity: CONTEXT.md progress log must capture exact session boundaries for `/gsd-quick resume <slug>` to work correctly.
- **Mitigation:** Pattern is structurally sound: SUMMARY.md per quick task captures the substantive findings; backlog items get promoted to ROADMAP.md (5 chat items + 3 tracker items promoted from today's two morning quick tasks; multi-session yolo-pass will produce its SUMMARY on close). STATE.md tables act as a lightweight index. Multi-session resume protocol exercised for the first time with `social-yolo-pass` Session 1 → 2 handoff.
- **Tracks:** None — operational pattern, working as designed. Re-evaluate at 10+ quick tasks OR if multi-session resume produces a stuck state.

---

## Test Coverage Gaps

### TC1. No mobile crash reporting → no automated crash detection

- **What's not tested:** Any client-side crash, ANR, JS exception, native bridge failure.
- **Files:** `apps/mobile-rn/package.json` (no `@sentry/react-native`); no `apps/mobile-rn/src/crash/` directory.
- **Risk:** Phase 9 watchlist depends entirely on tester verbal reports + Loki backend-side log tails (`scripts/debug-tail.sh <user-id>`). Closed beta is small enough that this is acceptable.
- **Priority:** Low for closed beta; High before public launch.

### TC2. R8 + ProGuard verification via device smoke only (no unit test)

- **What's not tested in CI:** ProGuard stripping of Mapbox JNI, MMKV native, expo-task-manager, Hermes runtime, react-native-reanimated keeps.
- **Files:** `.planning/phases/07-release-builds-mobile-stability/07-CONTEXT.md` D-08 ("ProGuard verification strategy = smoke test on a real device after the first signed release APK is built, NOT unit tests (no unit test can verify R8 stripping)"); Plan 07-01 Task 6 = 7-step device smoke (closed in Stage A' end-to-end .aab build); Plan 07-03 Task 5+6 (pending B1) = on-device validation.
- **Risk:** First release build can crash on launch if a keep is missing. Verified at execution time via the Pixel smoke; no regression test for future ProGuard rule additions. Stage A' empirically validated the keeps on the .aab build itself, but on-device smoke is the only end-to-end gate.
- **Priority:** Medium — extend ProGuard keeps with new packages → smoke on Pixel; document deltas.

### TC3. 1-hour soak is the only stability test (Plan 07-03 Task 6)

- **What's not tested:** Multi-hour sessions (2h, 4h, full marathon). 24-hour idle behavior. Multiple sequential sessions across a single app launch.
- **Files:** `.planning/phases/07-release-builds-mobile-stability/07-CONTEXT.md` §"1-hour Pixel pocket-walk validation". Note: tracker-live-polish-pass (commits `bc95c30..da35b5f`) added an integration test for PauseDetector+SessionManager flow (`da35b5f`), but only at unit scope, not multi-hour soak.
- **Risk:** Mid-marathon GPS recorder failure undiscovered; multiple-session-day testers may hit accumulated state issues.
- **Priority:** Acceptable for closed beta; tracked by tester reports.

### TC4. No PII regression test for new span attributes

- **What's not tested:** A new service author adding a span attribute that smuggles PII past the `piiScrubProcessor`.
- **Files:** `services/backend/pkg/observability/otel_init.go` lines 25 + 104 TODOs; `pii_live_probe.py` (Plan 05-06) runs at deploy time but not per-PR.
- **Risk:** PII leak via OTel spans → Tempo → Loki correlated logs.
- **Priority:** Medium; pre-commit grep audit + `pii_live_probe.py` cover the common case but a per-PR gate would be safer.

### TC5. No reproducible-build verification (dropped per ADR-0011)

- **What's not tested:** Two CI runs of the same tag → byte-identical artifacts (modulo signature).
- **Files:** Hard Rules in `.planning/ROADMAP.md` still mention "Release APK/IPA must be reproducible" but no test enforces it.
- **Risk:** Tag → re-tag of same code produces different APK → tester sees a "different build" with no code changes.
- **Priority:** Low for closed beta; revisit pre-public.

### TC6. Cross-language canonical-JSON smoke is dev-workstation-only

- **What's not tested in CI:** `evidence/smoke-manifest-sign-roundtrip.sh` (Go-sign → Node-verify on a known payload) catches Pitfall 18 (Go struct field order) drift, but it lives in `evidence/` (dev-workstation only) and is not part of any `.github/workflows/` job.
- **Files:** `.planning/phases/08-closed-beta-distribution/evidence/smoke-manifest-sign-roundtrip.sh`; `scripts/sign-manifest.go`; `apps/mobile-rn/src/update/manifestSigning.ts`.
- **Risk:** A future change to `sign-manifest.go` field ordering OR `manifestSigning.ts` canonicalization OR `@noble/ed25519` API drift goes undetected until on-device verification fails after a tag push. Currently muted by Amendment 5 gate but will re-surface on `DISTRIBUTION-PIPELINE-RE-ENABLE`.
- **Priority:** Medium — promote `smoke-manifest-sign-roundtrip.sh` to a CI gate on PRs that touch either file (single-PR `paths-filter` rule). Promote ahead of `DISTRIBUTION-PIPELINE-RE-ENABLE` trigger.

### TC7. Update flow tests don't exercise the real crypto path

- **What's not tested:** `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts` mocks `verifyManifestSignature` (always-accept stub) to focus on state-transition logic. Real crypto is exercised separately in `apps/mobile-rn/src/update/__tests__/manifestSigning.test.ts` against a synthetic keypair (NOT the production pubkey).
- **Files:** `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts` lines 56-59 (`verifyManifestSignature: jest.fn(() => true)`); `apps/mobile-rn/src/update/__tests__/manifestSigning.test.ts`.
- **Risk:** If a future code change breaks the integration between `manifestCheck.ts` ↔ `manifestSigning.ts` (e.g., changing the field-stripping logic), the unit tests still pass because the stub accepts everything. End-to-end smoke catches it but only on tag push.
- **Priority:** Low for closed beta; consider one integration test in `manifestCheck.test.ts` that uses the real `verifyManifestSignature` against a known-good signed fixture.

### TC8. Messaging ↔ social-graph cross-service integration not tested (NEW 2026-05-25 PM)

- **What's not tested:** End-to-end flow `start_conversation` → `are_friends()` lookup → permission decision against a freshly migrated DB containing both services' schemas.
- **Files:** `services/backend/messaging/internal/svc/start_conversation.go` (caller); `services/backend/social-graph/migrations/0022_friend_requests.up.sql` (function definition); `services/backend/messaging/internal/svc/start_conversation_test.go` (current tests use mocks for the cross-service call, not a real DB).
- **Risk:** A future social-graph migration that renames `friend_requests` or alters `are_friends()` signature breaks messaging at runtime, not at compile-time or test-time. Pairs with the architecture risk A1 + Fragile Area F16.
- **Priority:** Medium — write a testcontainers-postgres integration test that applies both services' migrations against a real Postgres, then exercises `start_conversation` end-to-end. Trigger this work alongside `CROSS-SERVICE-SCHEMA-COUPLING` backlog item.

---

*Concerns audit: 2026-05-25*
