---
phase: 07-release-builds-mobile-stability
plan: 01
type: summary
wave: 1
status: complete
closes_requirements: [BUILD-01]
related_requirements: [STAB-01]  # device-side validation = Plan 07-03
adrs_referenced: [ADR-0011, ADR-0012]
---

# Plan 07-01 — SUMMARY (closeout)

**Plan:** 07-01 (EAS Android production profile + R8/ProGuard + arm64-v8a + tag-triggered CI workflow)
**Phase:** 07 — Release builds + mobile stability
**Requirements:** BUILD-01 (Android). _BUILD-02 (EAS iOS) DEFERRED per [ADR-0011 Amendment 3](../../../docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md)._
**Status:** ✅ Complete — Tasks 0-7 done. CI-side validation green; device-side R8 smoke folded into Plan 07-03 territory.
**Commits (Tasks 0-5 chronology):** `993409d` Wave 0 → `dd0dce5` CI age recipient → `ce09cd7` eas.json production env → `fbbdb9b` proguard-rules extension → `d84b0c9` un-ignore proguard → `4a5b8f0` gradle.properties (R8 + shrink + ABI) → `1e312de` android-release.yml → `2e2b5ca` CI-WORKFLOW-REGISTRY-AUDIT backlog → cherry-pick `b461ea6` on `main` (workflow registration)
**Commits (ADR-0012 P0 incident response — landed inside Plan 07-01 closeout window):** `f35b4c6` rotate → `fbc5186` workflow patch (`::add-mask::` + explicit eas-cli) → `c3659e7` ADR-0012 → `21b992c` re-rotate (self-inflicted chat-dump leak) → `0a206a0` ADR-0012 amendment
**Commits (Task 6 unblockers + fix):** `5a26c68` `eas init` (real projectId) → `8b750cd` `credentialsSource: local` + `credentials.json` generation in CI
**CI runs (Task 6 Stage A' iterations):** 26243095033 (backend-cd false-trigger) → 26245775886 (DELETED per ADR-0012 STEP 1; leaked plaintext password) → 26258849328 (security-PASS but `Invalid UUID appId`) → 26362716928 (security-PASS but EAS used auto-managed remote credentials) → **26362961267 ✅ green: 14/14 steps + "Using local Android credentials (credentials.json)" confirmed + EAS build `9e243e59-525f-42d1-89e2-894a62716cba` queued**

---

## What landed

### Task 0 — Wave 0 evidence scaffolding (commit `993409d`)

Pre-execution prereqs:
- `.planning/phases/07-release-builds-mobile-stability/evidence/` directory
- `evidence/tool-versions.txt` — audit trail of `node` / `npm` / `eas-cli` / Java JDK / sops / yq versions at execution time
- `evidence/smoke-*.sh` stubs (5 scripts): `smoke-wave0.sh` (umbrella) + `smoke-sops-multi-recipient.sh` (CI age key round-trip — proves D-14-CI-AGE-KEY lift) + `smoke-eas-config.sh` (eas.json `production.android` shape) + `smoke-gradle-config.sh` (build.gradle ABI filter + signingConfigs.release) + `smoke-proguard-rules.sh` (presence of Mapbox/MMKV/expo-task-manager/Hermes keeps)
- `.gitignore` extension: `apps/mobile-rn/android/app/release.keystore` + `apps/mobile-rn/credentials.json` (defensive — Path A original intent was "no credentials.json"; subsequently revised in Task 6 fix commit `8b750cd`)
- `.sops.yaml` already had DEV_A — CI age key added in Task 1

### Task 1 — Add CI age recipient + `sops updatekeys` (commit `dd0dce5`)

Lifts Phase 6 D-14-CI-AGE-KEY deferral:
- Added second age recipient to `.sops.yaml`: `age19ysu774h4crzynkpf9pjpe829cxt0e3ckgfmnkweag0h7dxmp4kqn9vswx` (CI key; private half lives in GitHub Actions secret `SOPS_AGE_KEY_CI` per Plan 07-01 Task 5)
- `sops updatekeys --yes` ran across `.secrets/prod/*.yaml` (non-destructive DEK re-wrap; plaintext values unchanged)
- `smoke-sops-multi-recipient.sh` verifies both recipients can decrypt independently

### Task 2 — eas.json `production.android.env` block (commit `ce09cd7`)

Added Path A keystore-injection env block to `apps/mobile-rn/eas.json`:
```jsonc
"production": {
  "android": {
    "buildType": "app-bundle",
    "env": {
      "RUNNING_ECO_RELEASE_STORE_FILE": "release.keystore",
      "RUNNING_ECO_RELEASE_KEY_ALIAS": "runningecosystem-release"
    },
    "image": "latest"
  }
}
```

Note: Task 6 fix (commit `8b750cd`) later added `"credentialsSource": "local"` to this same block — see Task 6 below.

### Task 3 — `proguard-rules.pro` extensions (commits `fbbdb9b` + `d84b0c9`)

Extended `apps/mobile-rn/android/app/proguard-rules.pro` with R8 keep rules for:
- `com.mapbox.**` + `com.rnmapbox.rnmbx.**` (Mapbox JNI + RN Mapbox wrapper)
- `com.margelo.nitro.mmkv.**` (actual MMKV package — was wrongly documented as `com.mrousavy.mmkv` / `com.tencent.mmkv` in the original CONTEXT; corrected via grep against `node_modules/`)
- `expo.modules.taskManager.**` (camelCase M — NOT `taskmanager`)
- `com.facebook.hermes.**` + Hermes-jni keep rules
- `@DoNotStrip`-annotated symbols (Nitro Modules pattern)

`d84b0c9` un-ignored the file from `.gitignore` (template-only files were filtered out at Plan 01 scaffolding; reverted for this artifact since the keep rules are deterministic + reviewable).

### Task 4 — `gradle.properties` + `build.gradle` ABI/R8 config (commit `4a5b8f0`)

- `apps/mobile-rn/android/gradle.properties`:
  - `reactNativeArchitectures=arm64-v8a` (narrowed from default 4-ABI set per ADR-0011 lean scope; closed-beta = flagship-only)
  - `android.enableMinifyInReleaseBuilds=true` (R8 ON — note `android.` prefix per build.gradle's `findProperty` call)
  - `android.enableShrinkResourcesInReleaseBuilds=true`
- `apps/mobile-rn/android/app/build.gradle`:
  - `defaultConfig.ndk { abiFilters 'arm64-v8a' }` at line 112 (defense-in-depth + matches gradle.properties)
  - `signingConfigs.release` reads `RUNNING_ECO_RELEASE_*` Gradle properties with debug-keystore fallback (Path A injection)

### Task 5 — Tag-triggered CI workflow (commit `1e312de` + cherry-pick `b461ea6` on `main`)

Created `.github/workflows/android-release.yml`:
- Triggers on `v1.0.0-beta.*` + `v1.0.0-rc.*` tag pushes
- Steps: Checkout → Setup Node 20 → Setup JDK 17 → Install SOPS+yq → Restore CI age key from `${{ secrets.SOPS_AGE_KEY_CI }}` → Decrypt mobile signing bundle (writes keystore + passwords to `$GITHUB_ENV`) → npm ci → Install eas-cli → Trigger EAS build (`eas build --platform android --profile production --non-interactive --no-wait`)

**GitHub workflow-registration quirk discovered:** GitHub Actions only fires tag-triggered workflows from the default branch's registration. Since the workflow lived on `feat/cursona-redesign` only, the v1.0.0-beta.0 tag push did NOT fire the workflow until cherry-picked to `main` via PR #2 (merged `62da1c1`). This pitfall is tracked in v1.0.1 backlog as `CI-WORKFLOW-REGISTRY-AUDIT` (commit `2e2b5ca`).

### ADR-0012 P0 incident response — INTERLEAVED with Task 6 execution

CI run 26245775886 (after workflow registered on `main`) revealed that bare `echo "VAR=$value" >> $GITHUB_ENV` does NOT auto-mask the value in logs — only `${{ secrets.X }}` references do. Result: the keystore_password value leaked plaintext in 3 step env blocks. Full 5-step incident response executed:

| Step | Action | Commit |
|---|---|---|
| 1 | Delete leaked CI run 26245775886 | (`gh run delete`) |
| 2 | Audit other CI runs since incident start (0 matches across `backend-cd × 2` + `backend-ci × 1`) | — |
| 3 | Rotate keystore password atomically via `keytool -storepasswd` (PKCS12 invariant rotates store+key together; cert SHA-256 preserved → existing-install upgrade path = OK) | `f35b4c6` |
| 4 | Patch `.github/workflows/android-release.yml`: `::add-mask::$STORE_PASS` + `::add-mask::$KEY_PASS` BEFORE `$GITHUB_ENV` writes; replace `npx eas` (transient PATH failure) with explicit `npm install -g eas-cli` | `fbc5186` + cherry-pick `b461ea6` |
| 5 | Write `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` | `c3659e7` |

**Re-incident (self-inflicted) closed same session:** During post-rotation verification I (executor) dumped the freshly-rotated password into agent chat via `xxd | tail -3` while investigating a phantom fingerprint discrepancy (root cause: `yq -r` adds trailing newline → pipeline `shasum` hashes `value\n` while `printf '%s' "$VAR" | shasum` hashes `value`; both valid; not corruption). Re-rotated (commit `21b992c`), wrote ADR-0012 amendment codifying 4 credential-diagnostics discipline rules (commit `0a206a0`). New v1.0.1 backlog items added: CI-MASK-LINT, SECRETS-LEAK-PLAYBOOK-AMEND, SOPS-VERIFY-HARDENING, CRED-DIAG-DISCIPLINE.

### Task 6 — Stage A' CI validation across 4 iterations

CI-side smoke validation of the full Phase 6 + Phase 7 chain. Stage A' = CI+EAS-only (no emulator + no device); device-side R8 smoke folded into Plan 07-03 (Pixel pocket-walk).

#### Iteration 1 — CI run 26245775886 (DELETED)

Tag push v1.0.0-beta.0; first end-to-end fire post-workflow-registration. **Failed at "Trigger EAS build"** with `npm error could not determine executable to run` (transient PATH from `expo/expo-github-action@v8`). Side-effect: leaked plaintext keystore_password — full incident response per ADR-0012 §"Решение".

#### Iteration 2 — CI run 26258849328

Tag push v1.0.0-beta.1 after `::add-mask::` patch + explicit eas-cli install. **Failed at "Trigger EAS build"** with `Invalid UUID appId` — root cause: `apps/mobile-rn/app.json` had literal `extra.eas.projectId: "TODO-eas-project-id-after-eas-init"` placeholder. Validated everything except the EAS appId resolution: 0 password matches; passwords masked as `***` in all step env blocks.

#### Iteration 3 — CI run 26362716928 (after `eas init`, commit `5a26c68`)

Tag push v1.0.0-beta.2. **All 14 steps passed.** EAS build `9b8ec55c-395a-4bee-acd9-0e0cd974a60f` queued. BUT: log showed `✔ Using remote Android credentials (Expo server)` + `✔ Created keystore` — EAS Cloud auto-generated its own keystore on Expo server instead of using the SOPS-bundled `runningecosystem-release` keystore we'd carefully managed across Plan 06-01 + ADR-0012. Original Path A design (env-var-only injection per `.gitignore` comment "Path A does NOT write credentials.json") underestimated EAS Cloud's default-remote-credentials behavior.

#### Iteration 4 — CI run 26362961267 (after `credentialsSource: "local"` fix, commit `8b750cd`)

Tag push v1.0.0-beta.3. **All 14 steps passed.** Critical log line confirms the fix:
```
✔ Using local Android credentials (credentials.json)
```

EAS build `9e243e59-525f-42d1-89e2-894a62716cba` queued — and signed with our `runningecosystem-release` keystore (cert SHA-256 `C6:33:47:6C:63:11:40:3F:5D:19:E2:3A:07:3A:15:F6:EA:BC:D6:40:FB:7F:F5:49:A5:B1:C3:A5:18:30:D7:BB`, matching the locally-captured value in `evidence/keystore-sha256.txt`).

**Path A design revised:** original "env-var-only, no credentials.json" intent updated to "credentials.json generated at CI time from SOPS-decrypted values via `jq -n --arg pass --arg keypass`, with `::add-mask::` log protection inherited; file gitignored; ephemeral on runner + EAS Cloud build env".

### Task 7 — closeout (this SUMMARY)

---

## Key files

### Created (committed)
- `.planning/phases/07-release-builds-mobile-stability/evidence/tool-versions.txt`
- `.planning/phases/07-release-builds-mobile-stability/evidence/smoke-*.sh` × 5
- `.github/workflows/android-release.yml` (with ADR-0012 mitigations applied)
- `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` + amendment

### Modified (committed)
- `apps/mobile-rn/eas.json` — `production.android` block (env + `credentialsSource: "local"` + `buildType: app-bundle` + `image: latest`)
- `apps/mobile-rn/android/gradle.properties` — arm64-v8a + R8 + shrinker
- `apps/mobile-rn/android/app/build.gradle` — ABI filter + signingConfigs.release
- `apps/mobile-rn/android/app/proguard-rules.pro` — Mapbox/MMKV/expo-task-manager/Hermes/DoNotStrip keeps
- `apps/mobile-rn/app.json` — `extra.eas.projectId` (real UUID `a9f8e26f-bd3f-4296-b67e-21909721132c`) + `owner: "qqweasdf"`; 5 duplicate `android.permission.*` entries from `eas init` (flagged for future cleanup, see below)
- `.gitignore` — `release.keystore` + `credentials.json` + clarifying comments
- `.sops.yaml` — CI age recipient (D-14-CI-AGE-KEY lift)
- `.secrets/prod/mobile-signing.yaml` — rotated twice (live fingerprint sha256_prefix `d05a15e088c5`)

### Generated at CI time only (gitignored — never committed)
- `apps/mobile-rn/android/app/release.keystore` (decrypted from SOPS each CI run)
- `apps/mobile-rn/credentials.json` (generated from SOPS each CI run via `jq -n --arg`; passwords carry `::add-mask::` protection)

### Cherry-picked to `main`
- `.github/workflows/android-release.yml` (commit `b461ea6` on main) — required for tag-triggered workflow registration

---

## Acceptance criteria mapping (from Phase 7 success criteria in ROADMAP.md)

| Criterion | Status | Evidence |
|---|---|---|
| 1. `apps/mobile-rn/eas.json` has `production` profile (Android) | ✅ | `production.android` block with `buildType: app-bundle` + `credentialsSource: local` + env + image |
| 2. R8 + ProGuard rules verified — no strip Mapbox/MMKV/expo-task-manager/Hermes | ✅ (CI-side) | `proguard-rules.pro` has keeps; CI build queued without R8 errors. Device-side smoke validation = Plan 07-03. |
| 3. Android: `arm64-v8a` only | ✅ | `gradle.properties:reactNativeArchitectures=arm64-v8a` + `build.gradle:abiFilters 'arm64-v8a'` |
| 4. ~~iOS Hermes/bitcode/flavor/16+~~ | DEFERRED per Amendment 3 | — |
| 5. Background reliability: foreground service notification | DEFERRED to Plan 07-03 | — |
| 6. MIUI + One UI mitigations | DEFERRED to Plan 07-03 | — |
| 7. 1h pocket-walk ≥95% expected GPS points | DEFERRED to Plan 07-03 (device-blocked) | — |

Plan 07-01 specifically gates criteria 1-3; criteria 5-7 are Plan 07-03 scope (depends_on: 07-01).

---

## Deviations from plan (vs. original 07-01-PLAN.md task spec)

1. **Task 5 plan vs. reality — `npx eas` → explicit `npm install -g eas-cli`.** Original task spec used `npx eas build`. Patched in commit `fbc5186` per ADR-0012 STEP 4 after CI run 26245775886 demonstrated transient-PATH failure (`npm error could not determine executable to run`). New convention: explicit global install; EXPO_TOKEN propagated via step env.

2. **Task 5 plan vs. reality — `expo/expo-github-action@v8` removed.** Original task spec used the action. Removed in commit `fbc5186` along with the npx fix. Cleaner contract: explicit npm install + bare `eas` binary + EXPO_TOKEN env var.

3. **Path A design — credentials.json NOW generated at CI time.** Original `.gitignore` comment and Plan 07-01 RESEARCH §0 claimed "Path A does NOT write credentials.json". Empirically false: EAS Cloud defaults to remote/managed credentials unless `credentialsSource: "local"` + `credentials.json` are both present. Revised in commit `8b750cd`; `.gitignore` comment updated. The keystore still lives in SOPS as canonical source; credentials.json is the ephemeral CI-side bridge.

4. **Task 6 ran as 4 CI iterations**, not one. Each iteration exposed a different upstream issue (incident → eas init → credentialsSource). Acceptable cost for the closed-beta budget; the iterations produced a hardened final pipeline.

5. **Cross-phase: P0 incident response landed inside Plan 07-01.** ADR-0012 is technically a Phase 7 incident artifact, not a Plan 07-01 deliverable, but the rotation commits + workflow patch + ADR all happened during Plan 07-01's execution window. Plan 07-01 is the natural narrative home for them.

---

## Followups (out of Plan 07-01 scope; tracked elsewhere)

1. **Plan 07-03** — foreground service + MIUI/One UI mitigations + 1h Pixel pocket-walk. Wave 2, device-blocked.
2. **EAS build 9e243e59 outcome** — currently building on EAS Cloud; outcome tracked at https://expo.dev/accounts/qqweasdf/projects/running-ecosystem-mobile/builds/9e243e59-525f-42d1-89e2-894a62716cba. Plan 07-03 will validate the APK on device once it builds + a Pixel is available.
3. **`app.json` duplicate permissions cleanup** — `eas init` added 5 duplicate `android.permission.*` FQ entries that duplicate the existing short-form entries (`ACCESS_FINE_LOCATION` ↔ `android.permission.ACCESS_FINE_LOCATION`). Harmless (Android merges at manifest time) but ugly. Single-commit cleanup; non-urgent.
4. **v1.0.1 backlog items from ADR-0012** (already in ROADMAP.md): CI-MASK-LINT, SECRETS-LEAK-PLAYBOOK-AMEND, SOPS-VERIFY-HARDENING, CRED-DIAG-DISCIPLINE, EAS-PROJECT-INIT, CI-WORKFLOW-REGISTRY-AUDIT.

---

## Plan 07-01 status — CLOSED

Task 0 — Wave 0 scaffolding ✅
Task 1 — CI age recipient ✅
Task 2 — eas.json production.android ✅
Task 3 — proguard-rules.pro ✅
Task 4 — gradle.properties + build.gradle ✅
Task 5 — android-release.yml ✅
Task 6 — Stage A' CI validation (4 iterations) ✅
Task 7 — closeout (this SUMMARY) ✅

BUILD-01 — **Complete** for closed-beta scope per ADR-0011.
