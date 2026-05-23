# Codebase Concerns

**Analysis Date:** 2026-05-23

This document is the consolidated risk register for Milestone v1.0 Closed Beta (Android-only). Scope is limited to debt that affects shipping Plan 07-01 → Phase 9 to 5-10 Android testers via the self-hosted Caddy manifest. Items explicitly scope-cut by ADR-0011 (and its four amendments) are catalogued under §"Deferred to v1.0.1" with the residual risk and the backlog ID that tracks them.

Source-of-truth references: `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` (scope cut + 4 amendments), `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` (P0 keystore-password leak + self-inflicted re-incident), `docs/DECISIONS/0010-sentry-saas-and-colocation.md` + amendment D-38 (Sentry deferred), `.planning/ROADMAP.md` §"v1.0.1 Backlog", `.planning/STATE.md`.

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

- **Files:** `apps/mobile-rn/android/gradle.properties` `reactNativeArchitectures=arm64-v8a`; `apps/mobile-rn/android/app/build.gradle` `defaultConfig.ndk.abiFilters 'arm64-v8a'`.
- **Residual risk:** A tester on Android 15+ with 16 KB page-size kernel may hit an unaligned native library and fail to launch. Mapbox/MMKV/Hermes JNI loads are the likely failure points.
- **Closed-beta mitigation:** Closed-beta testers self-report device + Android version on issue; v1.1 if it surfaces.
- **Tracks:** No backlog row; ADR-0011 re-expansion trigger §2 covers (P0 incident on Android 15+).

### 6. Background reliability scoped to 2 OEMs (partial drop of old Phase 16)

- **Files:** `apps/mobile-rn/src/session/SessionManager.ts` (`recoverLast()` exists from pre-v1.0 baseline); Phase 7 Plan 07-03 will add MIUI + One UI auto-start dialog; HyperOS + EMUI + low-end Doze NOT scripted.
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

- **Files:** `.secrets/prod/mobile-signing.yaml` (single SOPS-encrypted PKCS12 keystore + passwords); `~/.config/sops/age/keys.txt` (single age key for DEV_A, 1Password sealed backup per Phase 2 D-04); `.sops.yaml` (DEV_A + CI recipients — see §"Environment risks" #6 for the single-DEV_A bus-factor caveat); no cloud sync, no USB, no `RECOVERY-CARD.md`, no `cloud-backup-log.txt`.
- **Residual risk:** Loss of dev workstation = re-generate keystore + re-release under new package name + DM 10 testers. The keystore is regenerable; the age key (load-bearing) has 1Password sealed backup.
- **Closed-beta mitigation:** Time Machine on the dev workstation covers disk-loss incidentally. ~30-45 min total recovery.
- **Tracks:** `KEYSTORE-CLOUD-BACKUP` (single-cloud backup) + `PROD-LAUNCH-PREP` (bank-grade 2-USB ≥5 km) in v1.0.1 backlog.

### 11. iOS work deferred (Amendment 3 of ADR-0011)

- **Files:** `.planning/phases/06-release-signing/06-02-PLAN.md` (Apple Dev enrollment) — exists on disk, marked DEFERRED in `.planning/ROADMAP.md`; `apps/mobile-rn/eas.json` `production.ios` block (untouched — kept for re-activation without re-edit); `apps/mobile-rn/app.json` `ios:` block (kept; `NSLocationWhenInUseUsageDescription` + `UIBackgroundModes` already set); no `07-02-PLAN.md` (will be authored on re-trigger); no `08-02-PLAN.md`.
- **Residual risk:** Closed beta is Android-only. iOS testers cannot be invited until Apple Developer enrollment completes (2-7+ weeks SLA per RESEARCH §1) AND iOS sub-plans are written + executed.
- **Closed-beta mitigation:** Acceptable — Android beta is the v1.0 acceptance gate.
- **Tracks:** SIGN-02 / BUILD-02 / DIST-02 marked DEFERRED in `.planning/REQUIREMENTS.md`.

---

## Active Bugs — TODO/FIXME in code

### `apps/mobile-rn/app.json` — placeholder EAS projectId blocks Plan 07-01 Task 6

- **File:** `apps/mobile-rn/app.json` line 74 — `"projectId": "TODO-eas-project-id-after-eas-init"`.
- **Symptoms:** `eas build` fails to map the project to the Expo organization; `gh workflow view android-release.yml` may succeed but the downstream EAS Cloud queue submission rejects the build because the project is unknown.
- **Trigger:** Any `eas build` invocation against this `app.json`.
- **Blocks:** Phase 7 Plan 07-01 Task 6 (first build smoke on `v1.0.0-beta.0` tag). Currently halted on this.
- **Fix approach:** `EAS-PROJECT-INIT` v1.0.1 backlog item — log into `expo.dev` from the dev workstation (`npx eas login`), run `npx eas init` from `apps/mobile-rn/`, copy the issued UUID into `app.json` `extra.eas.projectId`, commit.

### `apps/mobile-rn/src/auth/authProviders.ts:71` — round 4 TODO

- **File:** `apps/mobile-rn/src/auth/authProviders.ts` line 71 — `// TODO Round 4:`.
- **Symptoms:** OAuth provider stub awaits round 4 work (per pre-v1.0 baseline review rounds).
- **Trigger:** OAuth path is not load-bearing in v1.0 closed beta (HEALTH-04 Strava deferred per ADR-0011).
- **Fix approach:** Not in scope for v1.0; v1.1 if Strava read-only OAuth re-enters scope.

### `apps/mobile-rn/src/health/HealthAdapter.ts:13` — Health adapter stub

- **File:** `apps/mobile-rn/src/health/HealthAdapter.ts` line 13 — `// HealthKitAdapter / HealthConnectAdapter — TODO Phase 7.1`.
- **Symptoms:** Stub adapter; no HealthKit / HealthConnect integration.
- **Trigger:** Not exercised in v1.0 — HEALTH-* requirements deferred per ADR-0011.
- **Fix approach:** v1.1 milestone.

### `apps/mobile-rn/src/domain/types.ts:37` — state machine extension TODO

- **File:** `apps/mobile-rn/src/domain/types.ts` line 37 — `TODO: расширить под полную state-машину когда понадобится pause/discard разделение`.
- **Symptoms:** Session state machine lacks discrete `pause` vs `discard` states.
- **Trigger:** Closed-beta tester pauses then discards a session — current code may conflate the two transitions.
- **Fix approach:** Defer until tester-report surfaces a UX glitch.

### `services/backend/realtime-gw/internal/gw/connection.go:106-107` — typing + ack stubs

- **File:** `services/backend/realtime-gw/internal/gw/connection.go` lines 106-107 — `// typing (TODO Phase B+: …)` + `// ack {lastEventId} (TODO: …)`.
- **Symptoms:** Realtime gateway accepts typing + ack frames but does not propagate or persist.
- **Trigger:** Not exercised in closed beta (no chat UI in v1.0 scope).
- **Fix approach:** Out of scope; Phase B = post-v1.0 social features.

### `services/backend/notifications/internal/service/svc.go:73` — Expo push collapse TODO

- **File:** `services/backend/notifications/internal/service/svc.go` line 73 — `// Отправить через Expo Push API (collapse от same conversation 30s — TODO Phase B)`.
- **Symptoms:** No collapse-key dedup; same-conversation notifications can flood.
- **Trigger:** Not exercised in v1.0 (no chat notifications in scope).
- **Fix approach:** Phase B post-v1.0.

### `services/backend/pkg/observability/otel_init.go:25,104` — PII scrub coverage TODOs

- **File:** `services/backend/pkg/observability/otel_init.go` lines 25 + 104.
- **Symptoms:** Per-call-site discipline + grep audit comment; span attribute scrub coverage gap noted at line 104 ("проходят НЕ scrubbed (см. TODO в Plan 05-06)").
- **Trigger:** A new service author adds a span attribute that contains PII without going through `piiScrubProcessor`.
- **Fix approach:** Already partially closed via Plan 05-05 `piiScrubProcessor`; remaining audit work is included in the existing pre-commit `pii_live_probe.py` runtime smoke (Plan 05-06).

---

## Security

### S1. CI-side secret leak via `$GITHUB_ENV` writes — root cause closed, hardening backlog open (ADR-0012 Phase A)

- **Files:** `.github/workflows/android-release.yml` lines 82-93 (patched form); `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` (incident record).
- **Root cause:** `echo "VAR=$value" >> "$GITHUB_ENV"` does NOT auto-mask in GitHub Actions step logs. Only `${{ secrets.X }}` references are registered with the runner's log masker at template-resolution time. A decrypted SOPS secret propagated via `$GITHUB_ENV` is, from the runner's perspective, just data.
- **Mitigation in place:** Workflow now does `STORE_PASS=$(yq -r ...)` then `echo "::add-mask::$STORE_PASS"` BEFORE `echo "RUNNING_ECO_RELEASE_STORE_PASSWORD=$STORE_PASS" >> "$GITHUB_ENV"`. Pattern is reusable; comment at line 28 of the workflow links back to ADR-0012.
- **Remaining gap:** No automated detection — a future workflow change could re-introduce the anti-pattern. `CI-MASK-LINT` v1.0.1 backlog item tracks a pre-commit / `actionlint` rule for `echo "X=$value" >> $GITHUB_ENV` without a preceding `::add-mask::` line. Generalize to `$GITHUB_OUTPUT` + `$GITHUB_STEP_SUMMARY`.
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

- **Files:** `.planning/phases/06-release-signing/evidence/smoke-sops-roundtrip.sh` lines 22-23 (defensive default `: "${SOPS_AGE_KEY_FILE:=$HOME/.config/sops/age/keys.txt}"`); ADR-0012 §"False-positive sub-incident".
- **Root cause:** When `SOPS_AGE_KEY_FILE` is unset and the macOS-default `~/Library/Application Support/sops/age/keys.txt` is empty (key actually lives at XDG path `~/.config/sops/age/keys.txt`), `sops -d` silently fails to find an age identity. `yq -r '.path'` on the empty/partial pipe returns the literal string `null`. `shasum -a 256` on the string `null` produces sha256 prefix `74234e98` — a "valid" but meaningless fingerprint. This caused a real incident to be dismissed as a false positive during ADR-0012 STEP 2 audit.
- **Mitigation in place:** `smoke-sops-roundtrip.sh` defaults `SOPS_AGE_KEY_FILE`; ADR-0012 §"Lesson" mandates verifying decrypted value length > 0 before hashing + checking `sops -d` exit code.
- **Remaining gap:** Only `smoke-sops-roundtrip.sh` enforces the default. Other ad-hoc verification scripts in `evidence/` and `scripts/` don't all check decrypt shape before downstream processing.
- **Tracks:** `SOPS-VERIFY-HARDENING` in v1.0.1 backlog — every verification script must (a) require `SOPS_AGE_KEY_FILE` explicitly, (b) check `sops -d` exit code, (c) validate decrypted value shape (length, schema) before downstream processing.

### S4. PKCS12 invariant — `key_pass` MUST equal `store_pass`

- **Files:** `.secrets/prod/mobile-signing.yaml` `android.keystore_password` + `android.key_password` (single-alias convention — same value); `.planning/phases/06-release-signing/06-01-SUMMARY.md` Task 3 ("`key_password` = same as keystore_password (single-alias convention per CONTEXT D-08)").
- **Root cause:** PKCS12 stores the private key under a KEK derived from the store password — there is no separate key password layer (unlike JKS). `keytool -keypasswd` is not supported on PKCS12 keystores (only `-storepasswd`). The two YAML fields exist for downstream compatibility (Gradle expects both), but they MUST hold the same value or `keytool` / Gradle signing will fail with a misleading "cannot recover key" error.
- **Mitigation in place:** ADR-0012 §"Решение" STEP 3 explicitly documents the invariant; rotation procedure uses `-storepasswd` only.
- **Remaining gap:** Schema does not enforce the invariant. A future SOPS edit that sets `key_password` to a different value than `keystore_password` would silently break the build. `smoke-sops-roundtrip.sh` verifies the keystore decrypts but does not assert `key_password == keystore_password`.
- **Tracks:** No backlog row — fold into `SOPS-VERIFY-HARDENING` audit pass.

### S5. Pre-rotation backups left on `/tmp`

- **Files:** `/tmp/mobile-signing.pre-rotation.1779397205.yaml` + `/tmp/mobile-signing.pre-rerotation.1779404090.yaml` (rollback artifacts from ADR-0012 STEP 3 + Amendment re-rotation).
- **Root cause:** macOS does not purge `/tmp` until reboot; the rollback artifacts contain the pre-rotation SOPS-encrypted YAML (still encrypted, but with the old passwords visible to anyone with the age key).
- **Mitigation in place:** ADR-0012 §"Negative consequences" notes the artifacts must be `rm -P /tmp/mobile-signing.pre-rotation.*.yaml`-d after a few days of confidence in the rotation.
- **Remaining gap:** No automated cleanup; relies on the dev remembering.
- **Tracks:** No backlog row — one-shot `rm -P` after rotation confidence builds. **Note:** macOS `shred` is unavailable and `rm -P` is documented as ineffective on APFS (see Fragile Areas §F4). Operational guidance is "trust APFS encryption-at-rest + reboot/purge."

### S6. Treat-as-compromise reasoning carry-over from ADR-0006 (Mapbox)

- **Files:** `docs/DECISIONS/0006-mapbox-token-incident.md`; `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` §"Treat-as-compromise rationale (carry-over from ADR-0006)".
- **Pattern:** Any time a credential is observable in a log pipe outside the dev's own process (GitHub Actions logs, Anthropic chat transcripts, Mapbox dashboard), the standing rule is "rotate even if monitoring shows no abuse — chain of custody is unverifiable past the leak point." Applied twice now (Mapbox tokens in ADR-0006, keystore password in ADR-0012 main + Amendment).
- **Mitigation in place:** Doctrine is consistent across both incidents; rotation is cheap (~5 min for keystore password, ~10 min for Mapbox tokens).
- **Remaining gap:** No checklist or playbook codifies the doctrine outside of the ADRs themselves. A future incident with a credential family that has higher rotation cost (e.g., DB master password, MinIO root key) may tempt a "monitor instead of rotate" decision under time pressure.
- **Tracks:** `SECRETS-LEAK-PLAYBOOK-AMEND` v1.0.1 backlog (codifies the corrected step-order: verify → audit → delete → rotate → patch → document, NOT delete-first as happened in ADR-0012 STEP 1).

### S7. `IDENTITY_DEV_MODE=true` default — closed

- **Files:** `services/backend/identity/cmd/server/main.go`.
- **Status:** CLOSED in Phase 2 SEC-05 (Plan 02-02, commit `27ad27f`). Kept in this register as a historical anchor — was a P0 before Phase 2.

### S8. OTP unconditional log — closed

- **Files:** `services/backend/identity/internal/service/otp.go`.
- **Status:** CLOSED in Phase 5 OBS-04 (Plan 05-03, commit `320975c`). Span-attribute scrub also closed via Plan 05-05 `piiScrubProcessor`.

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

---

## Fragile Areas

### F1. Tag-triggered workflows must be registered on default branch first

- **Files:** `.github/workflows/android-release.yml` (lives on `feat/cursona-redesign`); `main` branch does NOT have it yet.
- **Why fragile:** GitHub Actions registers workflows only when they exist on the default branch (`main`). Pushing a tag from a feature branch will NOT trigger a workflow that lives only on that feature branch. Discovered during Phase 7 Stage A' diagnostic 2026-05-21. Same quirk also explains why `backend-cd.yml` appears in the active workflow registry but is absent from `main` (it lives only on `feat/cursona-redesign`) — registry retains stale entries.
- **Safe modification:** Before tagging `v1.0.0-beta.0` (Plan 07-01 Task 6), cherry-pick `android-release.yml` to `main` first; verify via `gh workflow view android-release.yml --repo IsmailL01/sport` returns the registered workflow; THEN tag from `feat/cursona-redesign` and the workflow fires.
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
- **Test coverage:** None pre-merge; relies on the next tag-push smoke (Plan 07-01 Task 6) re-firing the workflow against the patched form.

### F8. CI age key creates an implicit second SOPS copy

- **Files:** `.sops.yaml` (two age recipients — DEV_A + CI); GitHub Actions secret `SOPS_AGE_KEY_CI`; `.planning/phases/07-release-builds-mobile-stability/07-CONTEXT.md` D-04 "Note".
- **Why fragile:** Phase 7 Plan 07-01 Task 1 added a CI age key as a second SOPS recipient and pushed the private half to `SOPS_AGE_KEY_CI`. This implicitly creates a second copy of the keystore (encrypted by CI key, stored in GitHub Actions secret state). ADR-0011 Amendment 4 PM said "single SOPS copy on dev workstation" — the CI copy is a real second copy, though access-scoped to GitHub Actions runners.
- **Safe modification:** Acknowledged in 06-01-SUMMARY follow-up note; does NOT promote `KEYSTORE-CLOUD-BACKUP` because the CI age key is rotatable separately + not a backup channel. If GitHub Actions is compromised, rotate `SOPS_AGE_KEY_CI` via `sops updatekeys` against a fresh recipient.
- **Test coverage:** `evidence/smoke-sops-multi-recipient.sh` verifies both recipients decrypt; nothing checks for "the CI key never sees plaintext outside the runner."

---

## Deferred to v1.0.1 (the backlog)

Tracked in `.planning/ROADMAP.md` §"v1.0.1 Backlog". One-line summary per item — the ROADMAP has the full triggering conditions.

| ID | Item | Source |
|---|---|---|
| `AUTH-RATELIMIT` | `/auth/*` rate-limit (was old Phase 6 EDGE-01). Mitigated by closed-beta blast radius; revisit before public launch. | CONCERNS.md P0 |
| `KEYSTORE-CLOUD-BACKUP` | Cloud backup of `.secrets/prod/mobile-signing.yaml` + age key (Plan 06-01 Tasks 5+6 — preserved in plan body). Trigger: Play Store submission / >50 users / explicit production-asset decision. | ADR-0011 Amendment 4 PM |
| `EMERGENCY-RUNBOOK` | Codify the "what to tell testers" + recovery procedure when keystore is lost (ADR-0011 D-15 scenario b). | ADR-0011 Amendment 4 |
| `CI-MASK-LINT` | Pre-commit / `actionlint` rule that flags `echo "X=$value" >> $GITHUB_ENV` without a preceding `::add-mask::`. Generalize to `$GITHUB_OUTPUT` + `$GITHUB_STEP_SUMMARY`. | ADR-0012 Phase C |
| `SECRETS-LEAK-PLAYBOOK-AMEND` | Finalize the corrected leak-response playbook in `docs/SECRETS.md` — verify → audit → delete → rotate → patch → document. Reverse of the order used in ADR-0012 STEP 1 (which deleted-first). | ADR-0012 Phase B |
| `SOPS-VERIFY-HARDENING` | Every verification script in `evidence/` + `scripts/` must require `SOPS_AGE_KEY_FILE` explicitly, check `sops -d` exit code, validate decrypted value shape before downstream. | ADR-0012 Phase C |
| `CRED-DIAG-DISCIPLINE` | Codify the four credential-diagnostics rules in `docs/SECRETS.md` (single canonical fingerprint form; no byte inspection; length-only; shape vs value). Add pre-commit grep for `xxd .*\$[A-Z_]+`. | ADR-0012 Amendment Phase C |
| `CI-WORKFLOW-REGISTRY-AUDIT` | Audit + reconcile GH Actions workflow registry vs `main` branch contents. `backend-cd.yml` present in registry but absent from `main` (lives on `feat/cursona-redesign` only). New workflows register only when present on default branch. | Phase 7 Stage A' diagnostic 2026-05-21 |
| `DEBUG-MIDDLEWARE-ENV` | Refactor `services/backend/pkg/observability/DebugSessionMiddleware` to read `DEBUG_SESSIONS_FOR_USER` env-allowlist. Current 3-gate (header ∧ JWT.is_tester ∧ featureflag) is unusable for solo dev (no admin UI for featureflag flips). | ADR-0011 OBS-08 amendment |
| `EAS-PROJECT-INIT` | Run `eas init` from `apps/mobile-rn/`; replace `app.json` `extra.eas.projectId: "TODO-eas-project-id-after-eas-init"` with the issued UUID. Currently blocking Plan 07-01 Task 6. | Plan 07-01 Task 0 USER ACTION |
| `PROD-LAUNCH-PREP` | Bank-grade key custody — re-backup `.secrets/prod/mobile-signing.yaml` to 2 encrypted-DMG USB sticks at ≥5 km separation + laminated paper RECOVERY-CARDs + 1Password sealed DMG entry. Trigger: beta passes 50 users. | ADR-0011 Amendment 2 PM |
| `GHCR-PULL-AUTH` | Direct GHCR pull on prod (replace save/scp/load). Inherited from Phase 4 Plan 04-04. | Plan 04-04 D-04-04-A |
| `MIGRATE-RSYNC-DELETE` | `rsync --delete` for migrations subtree only. | Plan 04-04 |
| `METADATA-RAW-TAG` | `metadata-action pattern={{raw}}` for semver — CD strips `v` prefix. | Plan 04-04 |
| `CD-SMOKE-VERIFY` | Fix `cosign-verify-smoke` job — UNAUTHORIZED on private packages. | Plan 04-04 |
| `DIGEST-PINNING` | SHA256 digest-pin compose images. | Plan 04-03a/04 |
| `SECRETS-ROTATE` | Rotate `POSTGRES_PASSWORD`, `JWT_SECRET`, MinIO creds (pasted in chat during Phase 3 SOPS-fill 2026-05-17). | Phase 3 chat leak |

---

## Environment Risks

Workstation-state assumptions that have caused real friction during Phase 6/7 execution and that the next executor will hit again without explicit setup.

### E1. `SOPS_AGE_KEY_FILE` not in shell profile

- **What:** macOS SOPS default search path is `~/Library/Application Support/sops/age/keys.txt`. The actual key lives at the XDG path `~/.config/sops/age/keys.txt`. `SOPS_AGE_KEY_FILE` must be exported per-invocation OR every script must default it via `: "${SOPS_AGE_KEY_FILE:=$HOME/.config/sops/age/keys.txt}"`.
- **Risk:** Silent decrypt failure → `yq -r` returns the literal `null` → downstream pipelines hash meaningless input → false-positive on credential integrity checks. Triggered the ADR-0012 STEP 2 false-positive.
- **Mitigation:** `evidence/smoke-sops-roundtrip.sh` defaults it; pending follow-up #6 in `.planning/STATE.md` ("Add `~/.envrc` (direnv) or shell-rc snippet to auto-export `SOPS_AGE_KEY_FILE`").
- **Tracks:** Pending follow-up #6 in `.planning/STATE.md` + `SOPS-VERIFY-HARDENING` in v1.0.1 backlog.

### E2. Expo CLI not logged in locally

- **What:** `npx eas` requires a logged-in Expo account. The dev workstation has `npx eas` installed but no recorded `eas login` session as of Phase 7 entry.
- **Risk:** Plan 07-01 Task 0 USER ACTION ("Generate EXPO_TOKEN at expo.dev") cannot complete without a logged-in account; even after EXPO_TOKEN is pushed to GitHub Actions secrets, local invocations (`eas build:list`, `eas build:download`) needed during Plan 07-01 Task 6 will require `EXPO_TOKEN=… npx eas …` or an interactive `npx eas login`.
- **Mitigation:** Plan 07-01 Task 0 prompts the user to log in via the web flow + generate the token; document `EXPO_TOKEN` as a shell-export for local dev convenience.
- **Tracks:** Folded into `EAS-PROJECT-INIT` v1.0.1 backlog.

### E3. No `EXPO_TOKEN` in dev shell env

- **What:** `EXPO_TOKEN` is pushed as a GitHub Actions secret (CI-side) but not exported in the dev workstation shell. Local `npx eas` invocations during Plan 07-01 Task 6 (`eas build:list`, `eas build:download`) will prompt for login interactively.
- **Risk:** Friction during Plan 07-01 Task 6; possible interactive prompt that the autonomous executor cannot answer.
- **Mitigation:** Document `EXPO_TOKEN=...` shell-export in 07-01-SUMMARY follow-up; the executor pastes the token into a 1Password "Expo CLI personal token" entry for reproducibility.
- **Tracks:** Folded into `EAS-PROJECT-INIT`.

### E4. Single age recipient in DEV_A position — no DEV_B yet

- **What:** `.sops.yaml` recipient list has DEV_A (`age1ph7d4a62n9...`) + CI (`age19ysu774h4c...`). No DEV_B. Phase 2 D-04 mandated a second human recipient; CONTEXT D-04 acknowledged the gap (`TODO(DEV_B)`).
- **Risk:** Single point of failure for bus factor (T-02-04 per Phase 2 CONTEXT). If DEV_A workstation + 1Password sealed-entry both lose the age key simultaneously, all `.secrets/<env>/*.yaml` become permanently unrecoverable. CI key is access-scoped to GitHub Actions runners and is not a backup channel (F8).
- **Mitigation:** Phase 2 D-04 1Password sealed-entry backup of the DEV_A age key is the load-bearing recovery path. Cloud-provider replication of 1Password gives ≥2 data-center geographic redundancy.
- **Tracks:** Pending follow-up #8 in `.planning/STATE.md` ("DEV_B age pubkey — `.sops.yaml` TODO; run `sops updatekeys` once provided") — solo-dev status means this stays open until team grows.

### E5. macOS-specific tooling assumptions throughout `evidence/` scripts

- **What:** Smoke scripts assume `hdiutil`, `diskutil`, `security`, BSD `awk`/`grep`/`shasum`. CI runners are Ubuntu (GNU coreutils); cross-platform script portability is not guaranteed.
- **Risk:** Phase 7 Plan 07-01 Task 5 workflow (`.github/workflows/android-release.yml`) is hand-rolled to call `sops` + `yq` + `base64 -d` on the Ubuntu runner; it does not re-use the `evidence/` smoke scripts. If a future workflow tries to run `evidence/smoke-sops-roundtrip.sh` directly on Ubuntu, expect divergences.
- **Mitigation:** Acknowledged separation: `evidence/` scripts = dev workstation; `.github/workflows/` = CI runner. Both verify SOPS round-trips independently.
- **Tracks:** None — accepted separation for closed beta.

### E6. `/tmp` not auto-purged on macOS

- **What:** macOS `/tmp` (actually `/private/tmp` linked) is not purged between reboots in some configurations. Pre-rotation backups from ADR-0012 STEP 3 + Amendment re-rotation remain there.
- **Risk:** Aged plaintext-encrypted-by-old-password SOPS bundles persist on disk indefinitely until manual cleanup.
- **Mitigation:** Manual `rm -P /tmp/mobile-signing.pre-rotation.*.yaml /tmp/mobile-signing.pre-rerotation.*.yaml` after confidence in the rotation. Trust APFS encryption-at-rest in the interim (see F4 — `rm -P` is not a real scrub).
- **Tracks:** None — operational discipline.

---

## Test Coverage Gaps

### TC1. No mobile crash reporting → no automated crash detection

- **What's not tested:** Any client-side crash, ANR, JS exception, native bridge failure.
- **Files:** `apps/mobile-rn/package.json` (no `@sentry/react-native`); no `apps/mobile-rn/src/crash/` directory.
- **Risk:** Phase 9 watchlist depends entirely on tester verbal reports + Loki backend-side log tails (`scripts/debug-tail.sh <user-id>`). Closed beta is small enough that this is acceptable.
- **Priority:** Low for closed beta; High before public launch.

### TC2. R8 + ProGuard verification via device smoke only (no unit test)

- **What's not tested in CI:** ProGuard stripping of Mapbox JNI, MMKV native, expo-task-manager, Hermes runtime, react-native-reanimated keeps.
- **Files:** `.planning/phases/07-release-builds-mobile-stability/07-CONTEXT.md` D-08 ("ProGuard verification strategy = smoke test on a real device after the first signed release APK is built, NOT unit tests (no unit test can verify R8 stripping)"); Plan 07-01 Task 6 = 7-step device smoke.
- **Risk:** First release build can crash on launch if a keep is missing. Verified at execution time via the Pixel smoke; no regression test for future ProGuard rule additions.
- **Priority:** Medium — extend ProGuard keeps with new packages → smoke on Pixel; document deltas.

### TC3. 1-hour soak is the only stability test (Plan 07-03 Task N)

- **What's not tested:** Multi-hour sessions (2h, 4h, full marathon). 24-hour idle behavior. Multiple sequential sessions across a single app launch.
- **Files:** `.planning/phases/07-release-builds-mobile-stability/07-CONTEXT.md` §"1-hour Pixel pocket-walk validation".
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

---

*Concerns audit: 2026-05-23*
