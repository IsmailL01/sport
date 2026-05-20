# Phase 7: Release builds + mobile stability - Context

**Gathered:** 2026-05-21 (autonomous mode per standing memory `feedback_autonomous_discuss_mode` — no AskUserQuestion; decisions resolved from prior-phase patterns + closed-beta lean scope per ADR-0011 + 3 amendments)
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a **production Android APK that survives a 1-hour GPS-tracked run with the phone in your pocket.** That sentence is the entire phase goal — everything else is plumbing.

Concretely:

1. **EAS production profile (Android)** — `apps/mobile-rn/eas.json` `production.android` gets the signing-config seam wired (consume `.secrets/prod/mobile-signing.yaml` from Phase 6 via CI env injection); points at production backend; uses `app-bundle` build type (`.aab` for self-hosted manifest distribution in Phase 8 — Caddy serves `.apk` extracted from the `.aab`).
2. **R8 + ProGuard rules** verified — release build with minification ON does NOT strip Mapbox JNI, MMKV native, expo-task-manager classes, Hermes runtime, react-native-reanimated. Smoke = install signed release APK → exercise map render + adaptive sampling + SLC fallback + background task lifecycle. Rule set extends the existing `proguard-rules.pro` (currently react-native-reanimated keep only).
3. **arm64-v8a only** (drop `armeabi-v7a` per ADR-0011 lean scope; closed-beta testers are flagship-only). Builds halve in size + build time roughly halves too.
4. **Foreground service notification** visible during recording. Existing `expo-location` plugin config (`isAndroidForegroundServiceEnabled: true`) + `FOREGROUND_SERVICE_LOCATION` permission already in `app.json` — Phase 7 adds the notification text/icon config + verifies it actually shows on a release build.
5. **MIUI + One UI vendor-killer mitigations** — in-app auto-start permission dialog (one-shot, deep-link to OEM settings) + battery-saver-kill recovery via existing `recoverLast()` in `SessionManager` (pre-v1.0 baseline; Phase 7 validates it survives R8/ProGuard). 4-vendor matrix from old Phase 16 deferred per ADR-0011 — monitor remaining vendors (HyperOS / EMUI / generic Doze / low-end memory) during beta.
6. **GitHub Actions release workflow** — `.github/workflows/android-release.yml`, triggers on `v1.0-*` git tags (matches DIST-01 in Phase 8); decrypts `.secrets/prod/mobile-signing.yaml` via SOPS + injects keystore as env vars → `eas submit -p android --profile production --non-interactive`. New CI age key recipient added to `.sops.yaml` (lifts D-14 deferral from Phase 6 Plan 06-01).
7. **1-hour Pixel pocket-walk validation** — USER ACTION at end of Plan 07-03. Acceptance: ≥95% of expected GPS points (~1800 at 0.5 Hz); foreground service notification visible at end; battery drain <15%; SessionManager `recoverLast()` triggered on simulated battery-saver kill mid-walk; resume picks up cleanly with adaptive sampling + SLC fallback.

**Scope anchor:** Phase 7 produces the build pipeline + verifies the build works on a real Android device. Phase 8 distributes it (Caddy manifest + Hetzner Storage Box signed URLs). Phase 9 invites testers + 72h watchlist. Phase 7 does NOT touch backend, NOT distribute the APK, NOT invite testers.

**Why this is small in lean scope:**

- Most of the heavy lifting (SessionManager with `recoverLast()`, gap resume, adaptive sampling + SLC fallback, ESLint v9, token-secret guard) **already shipped** in the 35-commit pre-v1.0 baseline on `feat/cursona-redesign`. Phase 7's job is "make sure the existing code survives R8/ProGuard + show its foreground service notification + add the OEM auto-start dialog." Not invent.
- iOS arm DEFERRED per ADR-0011 Amendment 3 (no EAS iOS profile, no Hermes-on-iOS config, no iOS SLC re-validation, no iPhone pocket-walk).
- Reproducible-build verification DROPPED per ADR-0011 (closed-beta blast radius).
- 4-vendor matrix DROPPED — only MIUI + One UI mitigations land, rest monitored in beta.

</domain>

<decisions>
## Implementation Decisions

### EAS profile + build pipeline

- **D-01:** EAS profile scope = **Android only** for v1.0. iOS portion of `eas.json` production profile stays untouched (Amendment 3 says "Phase 7/8/9 plan files ... read the deferred flags from ROADMAP/REQUIREMENTS and skip iOS scope"). The existing `production.ios.resourceClass: m-medium` stays in eas.json as dormant config — preserves Apple Silicon EAS Cloud worker assignment for when iOS arm reactivates without re-editing config.

- **D-02:** Build pipeline = **EAS Cloud** (not `eas build --local`). Why: Amendment 4 PM reasoning — keystore-loss blast radius is small for closed-beta scope (5-10 testers, ~30 min recovery). EAS Cloud holding the keystore at build time is acceptable for closed beta. Trade-off: EAS Cloud takes ~10 min/build vs local ~25 min/build + requires Java/Gradle on dev workstation. EAS Cloud wins for closed-beta velocity.

- **D-03:** Credential source = **`credentialsSource: "local"` in eas.json** + GitHub Actions decrypts `.secrets/prod/mobile-signing.yaml` via SOPS at workflow run time + writes `credentials.json` at `apps/mobile-rn/credentials.json` (gitignored) + `eas submit` reads it. NOT EAS-managed credentials (would store keystore in Expo's infrastructure persistently — contradicts Phase 6 D-10 self-managed pattern). Matches "no vendor lock-in" project principle (Phase 4 save/scp/load over GHCR auth; Phase 2 age over cloud KMS).

  ```json
  // apps/mobile-rn/credentials.json (gitignored; written by CI from SOPS)
  {
    "android": {
      "keystore": {
        "keystorePath": "release.keystore",
        "keystorePassword": "$KEYSTORE_PASSWORD",
        "keyAlias": "runningecosystem-release",
        "keyPassword": "$KEY_PASSWORD"
      }
    }
  }
  ```

- **D-04:** CI age key activation = **lifts D-14 deferral from Phase 6 Plan 06-01.** Phase 7 Plan 07-01 Wave 0 generates a new age keypair specifically for GitHub Actions, adds the public key as a recipient in `.sops.yaml`, runs `sops updatekeys .secrets/prod/mobile-signing.yaml` (re-encrypts to BOTH solo-dev + CI recipients without re-keying any underlying secrets), pushes the private key as GitHub Actions secret `SOPS_AGE_KEY_CI`. One-time setup. CI key is **separate from solo-dev key** — easier to revoke (e.g., GitHub Actions compromise scenario) without touching dev workflow.

  Note: This implicitly creates a SECOND COPY of the keystore (encrypted by CI age key + stored in GitHub Actions secret state) — partial mitigation against the D-14 lift's "single-SOPS-copy" Amendment 4 PM claim. The CI copy provides incidental durability via GitHub's replicated secret storage. Worth flagging in 06-01-SUMMARY follow-up note, but does NOT promote `KEYSTORE-CLOUD-BACKUP` v1.0.1 backlog item — the CI age key is rotatable separately and is access-scoped to GitHub Actions runners, NOT a backup channel.

- **D-05:** ABI filter = **`arm64-v8a` only** in `apps/mobile-rn/android/app/build.gradle` `defaultConfig.ndk.abiFilters`. Drops `armeabi-v7a`. Why: per ADR-0011 lean scope, closed-beta testers are flagship-only (Pixel 6+, Galaxy S20+, etc., all arm64). Halves APK size (Mapbox SDK is ~30 MB per ABI). 32-bit Android targets re-add to v1.0.1 backlog if a tester is on a 5-year-old budget device.

### R8 + ProGuard rules

- **D-06:** R8 minification = **ENABLED for release** via `gradle.properties` `enableMinifyInReleaseBuilds=true`. Existing build.gradle has the property gate (`minifyEnabled enableMinifyInReleaseBuilds.toBoolean()`); Plan 07-01 just flips the value.

- **D-07:** ProGuard keeps to ADD to `apps/mobile-rn/android/app/proguard-rules.pro` (currently has react-native-reanimated keep only):

  ```proguard
  # Mapbox SDK (@rnmapbox/maps@10.x — JNI bindings + reflection)
  -keep class com.mapbox.** { *; }
  -keep interface com.mapbox.** { *; }
  -dontwarn com.mapbox.**

  # MMKV native (react-native-mmkv@4.x — C++ JNI)
  -keep class com.tencent.mmkv.** { *; }

  # expo-task-manager (background task scheduling)
  -keep class expo.modules.taskmanager.** { *; }
  -keep class host.exp.exponent.modules.api.taskmanager.** { *; }

  # Hermes JS engine
  -keep class com.facebook.hermes.** { *; }
  -keep class com.facebook.jni.** { *; }
  ```

  NOT adding: `react-native-health-connect` (not installed — `HealthAdapter.ts` is a stub awaiting v1.1 Strava work per ADR-0011 HEALTH-04 deferral); `react-native-reanimated` (already kept).

- **D-08:** ProGuard verification strategy = **smoke test on a real device after the first signed release APK is built**, NOT unit tests (no unit test can verify R8 stripping). Plan 07-01 Task N = install release APK on dev workstation's Pixel + open map screen + start a tracker session + verify foreground service notification appears + Stop + Save. If any of those crash or no-op, R8 stripped something — extend ProGuard keeps + rebuild. Iterate until smoke green.

### Android build config

- **D-09:** App signing in `build.gradle` `android.signingConfigs.release` = reads from `credentials.json` via Expo's standard pattern (which `eas build` interpolates from `credentialsSource: "local"`). No raw keystore path in build.gradle — let Expo handle the indirection.

- **D-10:** App version + version code = **bumped via EAS `appVersionSource: "remote"`** (already in eas.json). Phase 7 first build = `1.0.0-beta.1` (versionName) + EAS auto-assigns versionCode. Phase 9 closed-beta launch uses the same scheme: each `v1.0.0-beta.N` git tag → CI builds + EAS auto-increments versionCode.

- **D-11:** `versionName` source = **derived from git tag** at CI time (e.g., `git describe --tags --exact-match` → `v1.0.0-beta.1` → `1.0.0-beta.1` after stripping `v` prefix). Tag must exist before CI runs; ad-hoc builds during dev use whatever `version` field is in `app.json` (currently `0.1.0`, bumped at first release tag).

### Foreground service notification

- **D-12:** Foreground service notification text + icon = **added via `expo-notifications` config plugin or app.json `notification` block**:
  - Title (RU): "Running Ecosystem"
  - Body (RU, dynamic per state): "Запись пробежки активна — %duration% • %distance%" (template; populated from SessionManager state at notification-update tick)
  - Icon: existing `./assets/adaptive-icon.png` foreground (white SVG of running stick figure if available; else fall back to app logo)
  - Color: `#0F1419` (matches `app.json` `splash.backgroundColor` + `adaptiveIcon.backgroundColor`)
  - Update interval: every 5 seconds while session is active (matches the existing `recordingTick` from SessionManager — no new timer needed)

- **D-13:** Notification update mechanism = **observe `SessionManager.state` via existing Zustand subscription** + post a new notification on each state change. No new background thread — leverage existing UI thread updates. The notification IS the user's only feedback that recording is alive when the screen is off.

### MIUI + One UI mitigations

- **D-14:** Auto-start permission dialog = **shown ONCE on first `TrackerStartScreen` entry per install**, gated by MMKV flag `vendorAutostartDialogShown` (`false` by default; flipped to `true` after user dismisses with "OK, понял" OR "Не показывать снова" checkbox). Dismissible. Deep-link to OEM-specific settings:
  - **Xiaomi (MIUI / HyperOS)**: `Intent("miui.intent.action.APP_PERM_EDITOR")` with extras `extra_pkgname=com.runningecosystem.mobile`
  - **Samsung (One UI)**: `Intent("com.samsung.android.sm.ACTION_BATTERY")` (opens Device Care → Battery → app); fallback to generic `Settings.ACTION_APPLICATION_DETAILS_SETTINGS` if Samsung intent unavailable
  - **Other Android**: generic `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`

  OEM detection via `Build.MANUFACTURER` from `expo-device`. Fail-soft: if OEM detection fails or intent doesn't resolve, show generic "Откройте Настройки → Приложения → Running Ecosystem → Разрешения и батарея" + open generic settings.

- **D-15:** `recoverLast()` validation = **via existing tests** (`SessionManager.test.ts §"recoverLast()"`, `gapResume.test.ts`) — pre-v1.0 baseline. Plan 07-03 Task N adds a **release-build validation step**: install signed release APK → start session → force-kill via adb (`adb shell am kill com.runningecosystem.mobile`) → relaunch → confirm `recoverLast()` restores session state + GPS points captured before kill are intact + adaptive sampling resumes. If R8 stripped `recoverLast` (it shouldn't, but verify), this is where it surfaces.

- **D-16:** Battery-saver detection = **already in code** (pre-v1.0 baseline includes adaptive sampling triggered by `Battery.lowPowerMode`). Phase 7 verifies it works on release build — no new code, just smoke.

- **D-17:** 4-vendor matrix beyond MIUI + One UI = **deferred to "monitor during beta"** per ADR-0011 lean STAB-01. HyperOS (Xiaomi rebrand), EMUI (Huawei), generic Doze, low-end memory → beta tester reports surface issues; v1.0.1 backlog (`STAB-02-VENDOR-MATRIX`) tracks extension if reports warrant.

### 1-hour Pixel pocket-walk acceptance

- **D-18:** Acceptance criteria for the USER ACTION 1-hour pocket-walk (Plan 07-03 final task):
  - **Expected GPS point count:** ~1800 at 0.5 Hz over 60 min (or proportionally scaled for `gpsGapTriggerS` triggering adaptive sampling).
  - **Threshold:** ≥95% of expected (≥1710 points). Misses below this = investigate cause: foreground service killed? GPS lock weak? Adaptive sampling too aggressive? Bug.
  - **Foreground service notification visible at end of walk:** check phone — notification still showing.
  - **Battery drain:** <15% over the hour (Pixel 6/7/8 baseline; lower-end Pixels excluded since closed-beta is flagship-only per D-05).
  - **`recoverLast()` survives a forced kill mid-walk:** at minute 30, run `adb shell am kill com.runningecosystem.mobile` from a tethered laptop; reopen app; confirm session restored + points 0-30min intact + recording continues.
  - **Map render works on release APK:** open map screen post-walk, confirm tiles render + the just-recorded track displays on map.

- **D-19:** Pocket-walk is **autonomous=false USER ACTION**. Cannot be automated — agent cannot wear pants. Pause at Plan 07-03 final task with structured checkpoint state. User reports: GPS point count, foreground notification status, battery delta, recoverLast test outcome, map render OK/FAIL.

  If pocket-walk fails: Plan 07-03 does NOT close until cause investigated + fixed + re-walked. Phase 7 stays open. This is the load-bearing gate for Phase 9 launch.

### GitHub Actions release workflow

- **D-20:** Workflow file = **`.github/workflows/android-release.yml`** — NEW, separate from existing `backend-ci.yml` (backend matrix) + `backend-cd.yml` (cosign keyless + GHCR push). Trigger:
  ```yaml
  on:
    push:
      tags:
        - 'v1.0.0-beta.*'
        - 'v1.0.0-rc.*'
  ```
  Job: checkout → setup-node@v4 → setup-java@v4 (JDK 17 for EAS) → `cd apps/mobile-rn` → `npm ci` → SOPS decrypt mobile-signing.yaml to credentials.json (script extracts base64 → keystore.jks + writes credentials.json with env-var refs) → `npx eas build --platform android --profile production --non-interactive --no-wait` (returns build ID) → optionally `eas build:wait <id>` if synchronous needed → upload artifact (the `.aab`) for Phase 8 consumption.

- **D-21:** EAS_TOKEN = Expo personal access token, stored as GitHub Actions secret `EXPO_TOKEN`. Generated by user via `expo login` + `expo whoami` + Expo dashboard → Access Tokens. One-time setup at Plan 07-01 Wave 0 USER ACTION (alongside CI age key generation).

- **D-22:** Workflow exits 0 = build submitted to EAS Cloud (not = build completed). Phase 8 DIST-01 picks up the EAS build artifact `.aab` URL and serves the extracted `.apk` via Caddy manifest. Phase 7 acceptance for CI = "tag triggers workflow + workflow exits 0 + EAS dashboard shows build queued/running." Actual download + install on Pixel = Plan 07-03 prereq (manual `eas build:download` while CI still running, OR wait for completion → download via dashboard).

### Out of scope (deferred to other phases)

- **D-23:** iOS portion of Phase 7 (EAS iOS production profile, Hermes-on-iOS, bitcode disabled, staging↔prod flavor switching, iOS 16+ baseline) → DEFERRED per ADR-0011 Amendment 3. `eas.json` `production.ios` block stays as-is (untouched). Plan 07-02 was never written; not creating it.

- **D-24:** 4-vendor matrix (HyperOS, EMUI, generic Doze, low-end memory <4GB RAM) → "monitor during beta" per ADR-0011 lean STAB-01. Tracked as `STAB-02-VENDOR-MATRIX` in v1.0.1 backlog if beta reports surface issues.

- **D-25:** Reproducible build (byte-identical APK across builds) → DROPPED per ADR-0011 (funded-team rigor, not closed-beta gate). Standard EAS build determinism is acceptable.

- **D-26:** Mapbox SDK 11.x migration → DROPPED per ADR-0011 (stay on `@rnmapbox/maps@^10.3.0` for closed beta).

- **D-27:** Android signed-JSON manifest serving + Caddy update channel → Phase 8 (DIST-01) scope. Phase 7 produces the `.aab`; Phase 8 distributes.

- **D-28:** Tester invitation + 72h watchlist → Phase 9 (LAUNCH-01..02) scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project decision history

- `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` — ADR with 3 amendments shaping Phase 7 scope:
  - Amendment 2 PM (lean key custody): keystore backup ceremony principle
  - Amendment 3 (Android-first): drops iOS scope from Phase 7 BUILD-02 + iOS SLC + STAB iOS portion + LAUNCH iOS tester arm
  - Amendment 4 PM (keystore backup deferred): SOPS single copy on dev workstation; CI age key adds incidental durability per D-04
- `docs/DECISIONS/0007-v1.0-release-contract.md` — v1.0 IN/OUT scope freeze; `v1.0.0-beta.1` tag scheme per D-11
- `docs/DECISIONS/0006-mapbox-token-incident.md` — Mapbox restriction strategy; Phase 7 unblocks `pk.` Bundle ID + SHA-256 restriction (uses keystore SHA-256 from Phase 6 evidence) — follow-up `/gsd-fast mapbox-restrict` after first Android release APK built

### Phase 6 substrate (consumed by Phase 7)

- `.planning/phases/06-release-signing/06-CONTEXT.md` — keystore decisions D-01..D-22 + 4 amendment blocks. Critical inheritance: D-03 SOPS YAML structure (Phase 7 reads `android.keystore_base64` + `android.keystore_password` + `android.key_alias` + `android.key_password`).
- `.planning/phases/06-release-signing/06-01-SUMMARY.md` — what's actually in `.secrets/prod/mobile-signing.yaml` + the D-14-CI-AGE-KEY deferral Phase 7 lifts in D-04.
- `.planning/phases/06-release-signing/06-RESEARCH.md` §3 (Apple distribution cert) — not consumed by Phase 7 (iOS deferred); §4 (Android keytool best practices) confirms PKCS12 + RSA 4096 + 100y are compatible with EAS Cloud (no special handling needed).
- `.secrets/prod/mobile-signing.yaml` — the SOPS-encrypted YAML; CI workflow decrypts at submit time per D-03.
- `.planning/phases/06-release-signing/evidence/keystore-sha256.txt` — SHA-256 fingerprint (2 bands) for Mapbox restriction follow-up

### Phase 2 substrate (SOPS)

- `.sops.yaml` — recipients config; Phase 7 D-04 adds a CI age recipient
- `.planning/phases/02-secrets-and-config-hardening/02-CONTEXT.md` §D-01 (age over PGP/KMS), §D-04 (1Password sealed for age key — provides recovery path for the dev key)

### App + EAS config

- `apps/mobile-rn/app.json` lines 22-50 — bundle ID + applicationId `com.runningecosystem.mobile` + Android permissions (FOREGROUND_SERVICE + FOREGROUND_SERVICE_LOCATION + WAKE_LOCK already present) + expo-location plugin with `isAndroidForegroundServiceEnabled: true`. Phase 7 ADDS notification text/icon config.
- `apps/mobile-rn/eas.json` — current `production.android.buildType: app-bundle`; Phase 7 ADDS `credentialsSource: "local"` per D-03 + env block for keystore env vars
- `apps/mobile-rn/android/app/proguard-rules.pro` — minimal keep (react-native-reanimated only); Phase 7 EXTENDS per D-07
- `apps/mobile-rn/android/app/build.gradle` — `minifyEnabled enableMinifyInReleaseBuilds.toBoolean()` gate; `shrinkResources enableShrinkResources.toBoolean()` gate. Phase 7 sets both gates `true` via `gradle.properties`.
- `apps/mobile-rn/android/gradle.properties` — Phase 7 sets `enableMinifyInReleaseBuilds=true` + `enableShrinkResources=true`
- `apps/mobile-rn/package.json` — confirms `@rnmapbox/maps@^10.3.0` + `expo-task-manager@~14.0.9` + `react-native-mmkv@^4.3.1` (D-07 ProGuard keep set)

### Existing mobile code (validated, not invented in Phase 7)

- `apps/mobile-rn/src/domain/session/SessionManager.ts` — `recoverLast()` method (D-15) + adaptive sampling state (D-16)
- `apps/mobile-rn/src/__tests__/SessionManager.test.ts` + `gapResume.test.ts` — unit tests for the recovery mechanism
- `apps/mobile-rn/src/navigation/screens/record/TrackerStartScreen.tsx` — entry point for D-14 auto-start dialog gate
- `apps/mobile-rn/src/state/activity.ts` — Zustand store; D-13 notification observer hooks in here

### Roadmap + requirements

- `.planning/ROADMAP.md` §"Phase 7: Release builds + mobile stability" — 7 success criteria (criteria 4-5 deferred per Amendment 3 — iOS-only items)
- `.planning/REQUIREMENTS.md` §"Phase 7 — Release Builds + Mobile Stability (BUILD + STAB)" — BUILD-01 (Android EAS prod) + STAB-01 (Android-only background reliability)
- `.planning/PROJECT.md` §"Current Milestone" — milestone description "Android Closed Beta" + Phase 7 row

### Historical reference (archived 21-phase scope; informs Phase 7 but does not constrain it)

- `.planning/phases/_archive/superseded-21-phase-v1.0/16-background-reliability-in-release/16-CONTEXT.md` — old Phase 16 decisions D-01..D-31 (4-vendor matrix etc); Phase 7 inherits the lean subset only

### Expo + Android docs (researcher will fetch fresh via WebFetch in plan-phase)

- EAS Build credentials.json: `https://docs.expo.dev/build/eas-json/#credentialsource`
- EAS Build env vars: `https://docs.expo.dev/build-reference/variables/`
- expo-location foreground service: `https://docs.expo.dev/versions/latest/sdk/location/#background-location-tracking`
- expo-notifications Android channel config: `https://docs.expo.dev/versions/latest/sdk/notifications/`
- ProGuard for React Native: `https://reactnative.dev/docs/signed-apk-android#enabling-proguard-to-reduce-the-size-of-the-apk-optional`
- @rnmapbox/maps Android setup: `https://github.com/rnmapbox/maps/blob/main/docs/install.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`SessionManager.recoverLast()`** (pre-v1.0 baseline): battery-saver-kill + force-kill recovery. Phase 7 D-15 validates it survives R8/ProGuard on a release build — does NOT reimplement.
- **Adaptive sampling + SLC fallback** (pre-v1.0 baseline): triggered by `Battery.lowPowerMode`. Phase 7 D-16 validates on release build — does NOT reimplement.
- **`expo-location` plugin with `isAndroidForegroundServiceEnabled: true`** (already in app.json): foreground service infrastructure. Phase 7 ADDS notification text/icon config; does NOT add the service itself.
- **MMKV-backed Zustand store** (Phase 1 REL-03 substrate): can hold D-14 `vendorAutostartDialogShown` flag without new dependencies.
- **`gradle.properties` gate-property pattern** in existing build.gradle: `enableMinifyInReleaseBuilds` already wired as a property reference; Phase 7 flips the value, doesn't restructure.
- **`proguard-rules.pro` with react-native-reanimated keep** (existing): template for the D-07 extension. Same file, new keeps appended.

### Established Patterns

- **SOPS-encrypted secrets consumed at deploy/build time, decrypted to env or temp file** (Phase 2 D-03 backend pattern, Phase 6 D-03 mobile-signing pattern): Phase 7 D-03 + D-04 extends this to GitHub Actions for mobile builds. Same `sops -d | yq -r | base64 -d` pattern as Phase 6 Task 5 (cloud backup) — except the destination is `credentials.json` in `apps/mobile-rn/` instead of a cloud folder.
- **Self-managed credentials over vendor-managed** (Phase 4 save/scp/load, Phase 6 D-10): Phase 7 D-03 picks `credentialsSource: "local"` over EAS-managed credentials.
- **Plans with USER ACTION checkpoints are `autonomous: false`** (Phase 2 Plan 02-04, Phase 4 Plan 04-04, Phase 5 Plan 05-06, Phase 6 Plan 06-01): Phase 7 Plans 07-01 + 07-03 both `autonomous: false` per D-19 + D-21.
- **Russian-language user-facing strings** (CLAUDE.md convention; app.json `infoPlist.NSLocationWhen*Description` already Russian): D-12 foreground service notification text in Russian.

### Integration Points

- **Phase 6 SOPS → Phase 7 build pipeline**: `.secrets/prod/mobile-signing.yaml` `android.*` fields → `credentials.json` at build time. CI workflow does the translation (D-03 + D-04).
- **Phase 7 keystore SHA-256 (from Phase 6 evidence) → Mapbox restriction (D-19 follow-up)**: Phase 7 first signed release APK has the same SHA-256 captured in Phase 6 `evidence/keystore-sha256.txt` (since same keystore signs it). The follow-up `/gsd-fast mapbox-restrict` task is unblocked once the APK actually exists in EAS Cloud (proves SHA-256 → AAB → signed APK chain works).
- **Phase 7 `.aab` artifact → Phase 8 distribution**: EAS Cloud build artifact URL → Phase 8 Plan 08-01 downloads + extracts `.apk` → Caddy manifest.
- **Phase 7 → Phase 9 smoke gate**: 1h Pixel pocket-walk (D-18) is the load-bearing acceptance for proceeding to Phase 8/9. If pocket-walk fails, Phase 8/9 do not run.

</code_context>

<specifics>
## Specific Ideas

- **`credentials.json` lives at `apps/mobile-rn/credentials.json`**, gitignored, written by CI from SOPS at build time. NOT checked in.
- **Keystore extracted as `apps/mobile-rn/release.keystore`** by CI workflow, also gitignored; deleted after build (CI runner ephemeral storage anyway).
- **D-14 dialog text (RU)** draft for execution-phase planning:
  > **Заголовок:** "Разрешите фоновую запись"
  > **Тело:** "Чтобы запись пробежки не прерывалась, когда телефон в кармане или экран выключен — откройте настройки и включите автозапуск + отключите оптимизацию батареи для Running Ecosystem."
  > **Кнопки:** "Открыть настройки" | "Понятно, потом" | (checkbox) "Не показывать снова"

- **GitHub Actions secret list** for Phase 7 workflow:
  - `SOPS_AGE_KEY_CI` (private key for the CI age recipient; generated D-04)
  - `EXPO_TOKEN` (Expo PAT; generated D-21)
- **Test devices for D-18 pocket-walk**: own Pixel (dev's primary). Friend's Pixel = nice-to-have but not blocking (closed-beta scope per LAUNCH-01 says "own + 1 friend's device" — that's Phase 9, not Phase 7).
- **EAS build profile name** = `production` (existing); not adding `production-android` or `production-staging` variants. Closed beta single channel.

</specifics>

<deferred>
## Deferred Ideas

- **iOS production profile + Hermes-on-iOS + bitcode + staging↔prod flavor switching + iOS 16+ baseline** → deferred per ADR-0011 Amendment 3 (Android-first launch). Reactivation: same triggers as Amendment 3 (Android beta stabilizes OR explicit user decision).
- **4-vendor matrix expansion (HyperOS / EMUI / generic Doze / low-end memory <4GB)** → v1.0.1 backlog `STAB-02-VENDOR-MATRIX` if beta reports surface vendor-specific failures.
- **Reproducible-build byte-identical verification** → dropped per ADR-0011 (funded-team rigor).
- **Mapbox SDK 11.x migration** → dropped per ADR-0011 (stay on 10.3 for v1.0).
- **`armeabi-v7a` ABI re-add** → v1.0.1 backlog if a tester surfaces a 32-bit-only device. Closed-beta testers are flagship-only per D-05.
- **EAS managed credentials** (let Expo hold the keystore persistently) → v1.0.1 fallback if `credentialsSource: "local"` proves flaky in CI. D-03 self-managed is the default.
- **Auto-versionName from semver-tag** beyond `v1.0.0-beta.N` scheme → Phase 9 / v1.0.1 cycle when first stable `v1.0.0` ships.
- **EAS build profile variants** (`production-android-arm64`, `production-staging`, etc.) → v1.0.1 only if multi-channel testing becomes useful.
- **MMKV migration to native arm64-v8a only build flavor** → no action needed; MMKV's native binary supports both ABIs and the D-05 ABI filter handles it at packaging.

</deferred>

---

*Phase: 7-release-builds-mobile-stability*
*Context gathered: 2026-05-21 (autonomous mode — 28 decisions D-01..D-28 resolved from prior-phase patterns + closed-beta lean scope per ADR-0011 + 3 amendments)*
