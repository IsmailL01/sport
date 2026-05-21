# Phase 7: Release builds + mobile stability — Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 6 modified + 7 new (CI workflow + 3 vendor TS modules + foreground TS + asset + 7 smoke shell stubs)
**Analogs found:** 13 / 13 (all have at least a partial in-repo analog; 3 are role-only matches because Phase 7 introduces patterns not previously used in this codebase: GH-Actions SOPS-decrypt, expo-intent-launcher, expo-notifications dynamic content)

> Planner: cross-reference RESEARCH §0-§8 for the actual target snippets. This file shows the existing in-repo patterns the planner mimics. RESEARCH shows the new code to write.

---

## File Classification

| Phase 7 File | Action | Role | Data Flow | Closest Analog | Match Quality |
|--------------|--------|------|-----------|----------------|---------------|
| `.sops.yaml` | MOD (add CI recipient) | config (recipient list) | static-declarative | `.sops.yaml` itself (Phase 2 D-04 comment already anticipates this exact change) | exact (self-evolution) |
| `apps/mobile-rn/eas.json` | MOD (extend `production.android` only) | config | static-declarative | `eas.json` itself — `development.android` + `preview.android` already exist with the same block shape | exact (self-evolution) |
| `apps/mobile-rn/app.json` | MOD (extend expo-location plugin + add `notification` block) | config | static-declarative | `app.json` itself — `expo-location` plugin block already exists | exact (self-evolution) |
| `apps/mobile-rn/android/app/proguard-rules.pro` | MOD (append keeps) | config (ProGuard rules) | static-declarative | same file — react-native-reanimated keep is the template | exact (self-evolution) |
| `apps/mobile-rn/android/app/build.gradle` | MOD (add `ndk.abiFilters` inside `defaultConfig`) | config (Gradle DSL) | static-declarative | `defaultConfig {}` block already in same file (lines 99-107) | exact (self-evolution) |
| `apps/mobile-rn/android/gradle.properties` | MOD (flip flags + narrow archs) | config (key=value) | static-declarative | same file — gate properties already declared, only values change | exact (self-evolution) |
| `.gitignore` | MOD (2 new lines) | config (ignore list) | static-declarative | `.gitignore` itself — existing `*.jks` + `*.keystore` + `!debug.keystore` block (lines 52-54) | exact (self-evolution) |
| `.github/workflows/android-release.yml` | NEW | CI workflow | event-driven (tag push) | `.github/workflows/backend-cd.yml` (closest in-repo workflow with tag trigger, matrix, multi-step; but NO SOPS-decrypt in repo yet) | role-match (workflow shape exact; SOPS-in-CI is net-new) |
| `apps/mobile-rn/src/foreground/notification.ts` | NEW | service (foreground orchestrator) | event-driven (zustand-tick → notification) | `apps/mobile-rn/src/state/featureflags.ts` lines 142-152 (AppState listener registration at module-init) + `apps/mobile-rn/src/state/activity.ts` lines 161-194 (`onChange` callback subscribing to manager-internal state) | role-match |
| `apps/mobile-rn/src/vendor/oem.ts` | NEW | utility (lookup table) | transform | none in mobile codebase — trivial; planner writes inline | none (write per RESEARCH §6) |
| `apps/mobile-rn/src/vendor/openOEMSettings.ts` | NEW | adapter (intent launcher wrapper) | request-response | `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` lines 37-45 (`Linking.openURL(...)` wrapped in try/catch + warn-on-empty) | role-match (intent launch parallel to URL open) |
| `apps/mobile-rn/src/vendor/AutostartDialog.tsx` | NEW | component (modal with MMKV-flag gate) | event-driven (one-shot) | `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` (full screen Modal, RU strings, Pressable + StyleSheet, dark palette) + `apps/mobile-rn/src/state/settings.ts` lines 79-95 (MMKV-backed persist boolean flag pattern) | exact (UI) + exact (storage) |
| `apps/mobile-rn/assets/notification-icon.png` | NEW | asset (PNG binary) | static-data | `apps/mobile-rn/assets/adaptive-icon.png` (existing 96×96 white-silhouette foreground icon) | exact (derive from this) |
| `.planning/phases/07-release-builds-mobile-stability/evidence/smoke-*.sh` (7 files) | NEW | smoke (bash one-shot) | script | `.planning/phases/06-release-signing/evidence/smoke-sops-roundtrip.sh` + sibling files (full canonical template, freshly-shipped 2026-05-20) | exact |

---

## Section 1 — SOPS multi-recipient + `updatekeys` (D-04)

**File:** `.sops.yaml` (MOD)
**Analog:** `.sops.yaml` itself — Plan 02-01 artifact, last touched 2026-05-19. The recipient-list comment block already anticipates this exact change (line 23: `# - CI deploy key (Phase 4) appended here once issued.`).

### Current state (verbatim — `.sops.yaml`)

```yaml
# Recipient list (comma-separated string per SOPS spec):
#   - DEV_A: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
#   - TODO(DEV_B): append second developer's age public key once provided.
#       Until then, .secrets/<env>/*.yaml decrypts only with DEV_A's key — single
#       point of failure for bus factor (T-02-04). After DEV_B appends, rotate:
#           sops updatekeys .secrets/<env>/*.yaml
#       (non-destructive — re-wraps the data-encryption key against the new
#       recipient list, does NOT re-encrypt plaintext values).
#   - CI deploy key (Phase 4) appended here once issued.
creation_rules:
  - path_regex: \.secrets/.*\.yaml$
    age: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
```

### Target shape after Phase 7 D-04 edit (per RESEARCH §2)

```yaml
creation_rules:
  - path_regex: \.secrets/.*\.yaml$
    age: >-
      age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my,
      age1ci...xyz
    # ^ YAML folded scalar `>-` to wrap comma-separated recipients across lines
    # while staying valid SOPS spec input.
```

### Concrete `sops updatekeys` bash (Phase 6 precedent — commit 8201aa2)

The Phase 6 commits 9aa5cab + 8201aa2 + 0824c9b establish the SOPS-write idiom Phase 7 lifts/extends:

```bash
# Phase 6 / Plan 06-01 Task 3 (verbatim from 06-01-PLAN.md lines 702-712):
sops set --value-file "$B64" \
  .secrets/prod/mobile-signing.yaml '["android"]["keystore_base64"]'
sops set .secrets/prod/mobile-signing.yaml '["android"]["keystore_password"]' "$KS_PASS"
```

Phase 7 D-04 does NOT use `sops set` — it uses `sops updatekeys` (a different SOPS subcommand). Per RESEARCH §2:

```bash
# Re-encrypts the DEK wrapper against the new recipient list — does NOT touch plaintext.
# Safe to run; commits small diff to the .yaml file.
sops updatekeys .secrets/prod/mobile-signing.yaml
sops updatekeys .secrets/prod/shared.yaml
sops updatekeys .secrets/prod/mapbox.yaml
sops updatekeys .secrets/prod/oauth.yaml
sops updatekeys .secrets/prod/sentry.yaml

# Dual-decrypt verify (both recipients should produce identical plaintext):
SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt sops -d .secrets/prod/mobile-signing.yaml | head -3
SOPS_AGE_KEY_FILE=/tmp/ci-key-restored.txt   sops -d .secrets/prod/mobile-signing.yaml | head -3
```

### Divergence notes for planner

- D-04 lift means Plan 07-01 Wave 0 must include a `sops updatekeys` step against ALL existing `.secrets/prod/*.yaml` files (not just mobile-signing.yaml) — otherwise CI age key works only for the one file Phase 7 touches. RESEARCH §2 lists 5 files; planner should glob to be safe.
- Path A from RESEARCH §0 (preferred): the existing `build.gradle` `RUNNING_ECO_RELEASE_*` Gradle-property pattern is what CI writes (no `credentials.json`). The SOPS YAML structure from Phase 6 (`android.keystore_base64` + `android.keystore_password` + `android.key_alias` + `android.key_password`) is consumed verbatim in CI.

---

## Section 2 — Android build config (gradle.properties + build.gradle + proguard-rules.pro)

### 2.1 `apps/mobile-rn/android/gradle.properties` (MOD: D-05 + D-06)

**Analog:** `gradle.properties` itself — the gate properties are already declared as keys with `false` / multi-arch values. Phase 7 just changes the values.

**Current state (verbatim — gradle.properties lines 25-31):**

```properties
# Enable AAPT2 PNG crunching
android.enablePngCrunchInReleaseBuilds=true

# Use this property to specify which architecture you want to build.
# You can also override it from the CLI using
# ./gradlew <task> -PreactNativeArchitectures=x86_64
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
```

**Target shape after Phase 7 edit (per RESEARCH §3 + §4):**

```properties
# Use this property to specify which architecture you want to build.
reactNativeArchitectures=arm64-v8a   # D-05 — closed-beta arm64 only

# Phase 7 D-06 — enable R8 minification + resource shrinking for release builds
enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
```

The existing build.gradle already has the gate-property reads in place — no build.gradle change for D-06 (gates flip in gradle.properties alone). See divergence note in 2.2.

### 2.2 `apps/mobile-rn/android/app/build.gradle` (MOD: D-05 only — add `ndk.abiFilters`)

**Analog:** the existing `defaultConfig {}` block in same file (lines 99-107).

**Current state (verbatim — build.gradle lines 99-107):**

```groovy
defaultConfig {
    applicationId 'com.runningecosystem.mobile'
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 1
    versionName "0.1.0"

    buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL", "\"${findProperty('reactNativeReleaseLevel') ?: 'stable'}\""
}
```

**Target shape after Phase 7 D-05 edit:**

```groovy
defaultConfig {
    applicationId 'com.runningecosystem.mobile'
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 1
    versionName "0.1.0"

    ndk {
        abiFilters 'arm64-v8a'   // Phase 7 D-05 — closed-beta scope per ADR-0011
    }

    buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL", "\"${findProperty('reactNativeReleaseLevel') ?: 'stable'}\""
}
```

**Already-correct pieces — DO NOT TOUCH (verbatim from build.gradle lines 108-148):**

The `signingConfigs.release` (lines 119-133) already reads `RUNNING_ECO_RELEASE_*` Gradle properties with a debug-keystore fallback — that's the Path A from RESEARCH §0:

```groovy
release {
    def storeFileName = project.findProperty('RUNNING_ECO_RELEASE_STORE_FILE')
    if (storeFileName != null) {
        storeFile file(storeFileName)
        storePassword project.findProperty('RUNNING_ECO_RELEASE_STORE_PASSWORD') ?: ''
        keyAlias project.findProperty('RUNNING_ECO_RELEASE_KEY_ALIAS') ?: ''
        keyPassword project.findProperty('RUNNING_ECO_RELEASE_KEY_PASSWORD') ?: ''
    } else {
        // Fallback: debug keystore (для CI без secrets).
        storeFile file('debug.keystore')
        ...
    }
}
```

And the buildTypes.release block (lines 139-147) already wires the gate-property reads:

```groovy
release {
    signingConfig signingConfigs.release
    def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
    shrinkResources enableShrinkResources.toBoolean()
    minifyEnabled enableMinifyInReleaseBuilds
    proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
    crunchPngs enablePngCrunchInRelease.toBoolean()
}
```

**Divergence note:** D-06 is "flip gradle.properties values" — no build.gradle edit needed beyond D-05 `ndk.abiFilters`.

### 2.3 `apps/mobile-rn/android/app/proguard-rules.pro` (MOD: D-07 — append keeps)

**Analog:** same file — react-native-reanimated keep is the template (lines 10-12).

**Current state (verbatim — proguard-rules.pro lines 10-15):**

```proguard
# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:
```

**Target shape after Phase 7 D-07 edit (per RESEARCH §4):**

Append to the existing file (do NOT delete the reanimated keep). New blocks follow the established commenting style (one-line section header → 1-3 `-keep` lines → blank line):

```proguard
# react-native-reanimated  (EXISTING — keep)
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# === Phase 7 additions per D-07 ===

# Mapbox SDK (@rnmapbox/maps@10.3.x — JNI + reflection)
-keep class com.mapbox.** { *; }
-keep interface com.mapbox.** { *; }
-dontwarn com.mapbox.**
-keep class com.rnmapbox.rnmbx.** { *; }
-keep interface com.rnmapbox.rnmbx.** { *; }
-dontwarn com.rnmapbox.rnmbx.**

# MMKV (react-native-mmkv@4.x — JSI/JNI)
-keep class com.tencent.mmkv.** { *; }
-keep class com.mrousavy.mmkv.** { *; }

# expo-task-manager + expo-notifications + expo-location (background + foreground service)
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# Hermes + React Native bridge + DoNotStrip annotations
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.proguard.annotations.** { *; }
-keepclasseswithmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keepclasseswithmembers class * {
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
```

**Divergence note:** RESEARCH §4 flags MMKV namespace (`com.mrousavy.mmkv.**`) + `expo.modules.taskmanager.**` exact class path with ⚠️ VERIFY markers — planner WebFetches the rnmapbox/maps Android install doc + react-native-mmkv repo to confirm class paths against installed versions before commit. Pitfall 9 (Plan 07-01 ordering): extend ProGuard keeps FIRST, flip `enableMinifyInReleaseBuilds=true` SECOND, smoke immediately.

---

## Section 3 — EAS profile + eas.json (D-01, D-02, D-03)

**File:** `apps/mobile-rn/eas.json` (MOD — only `build.production.android` block changes)
**Analog:** `eas.json` itself — `development.android` + `preview.android` already exist with `buildType` + `env` shape.

### Current state (verbatim — eas.json lines 6-37):

```jsonc
"build": {
  "development": {
    "developmentClient": true,
    "distribution": "internal",
    "ios": { "simulator": true, "resourceClass": "m-medium" },
    "android": { "buildType": "apk" },
    "env": {
      "MAPBOX_ACCESS_TOKEN_VAR": "EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"
    }
  },
  "preview": {
    "distribution": "internal",
    "ios": { "resourceClass": "m-medium" },
    "android": { "buildType": "apk" }
  },
  "production": {
    "ios": { "resourceClass": "m-medium" },     // ← D-23 stays untouched (iOS deferred)
    "android": { "buildType": "app-bundle" }    // ← Phase 7 EXTENDS this block only
  }
}
```

### Target shape after Phase 7 edit (Path A per RESEARCH §1 + §0)

```jsonc
"production": {
  "ios": {
    "resourceClass": "m-medium"
  },
  "android": {
    "buildType": "app-bundle",
    "env": {
      // Path A — env vars consumed by build.gradle RUNNING_ECO_RELEASE_*
      // Static values; password env vars injected at CI run time via $GITHUB_ENV
      "RUNNING_ECO_RELEASE_STORE_FILE": "release.keystore",
      "RUNNING_ECO_RELEASE_KEY_ALIAS": "runningecosystem-release"
    }
    // NOTE: `credentialsSource: "local"` consideration per D-03 — RESEARCH §0 recommends Path A
    // (keep existing build.gradle pattern; do NOT introduce credentials.json indirection).
    // Planner verifies via WebFetch https://docs.expo.dev/app-signing/local-credentials/
  }
}
```

### Divergence notes for planner

- The CONTEXT D-03 `credentials.json` proposal conflicts with the existing build.gradle's `RUNNING_ECO_RELEASE_*` reads (already in place pre-Phase 7). RESEARCH §0 surfaces this and recommends Path A — keep build.gradle as-is; inject keystore env vars via `eas.json` `production.android.env` + GitHub Actions `$GITHUB_ENV` forwarding. Planner resolves this in-plan (no escalation back per autonomous-mode posture); WebFetch confirms.
- The existing `development.env` block (line 17-19) shows the `env` schema pattern: object of string→string entries. Phase 7 mirrors this exactly.
- Per D-10: `cli.appVersionSource: "remote"` is ALREADY in eas.json (line 4); EAS auto-increments versionCode. No edit needed.

---

## Section 4 — `.github/workflows/android-release.yml` (NEW; D-20, D-21, D-22)

**Analog:** `.github/workflows/backend-cd.yml` (Plan 04-04 artifact)
**Why:** closest in-repo workflow with **tag trigger pattern** + multi-step + matrix structure. NOT an exact analog because backend-cd does NOT decrypt SOPS at workflow time — that's the net-new pattern Phase 7 introduces. Workflow scaffolding is verbatim-shape; SOPS-decrypt steps are net-new (RESEARCH §2 + §8 give the concrete bash).

### 4.1 Tag-trigger pattern (backend-cd.yml lines 23-30)

```yaml
on:
  push:
    branches: [main]
    paths:
      - "services/backend/**"
      - ".github/workflows/backend-cd.yml"
    tags:
      - "v*"
```

**Phase 7 divergence:** narrow tag pattern to `v1.0.0-beta.*` + `v1.0.0-rc.*` only (D-20). Drop `branches:` + `paths:` filters — Phase 7 workflow runs ONLY on tag pushes (no main-branch CI; closed-beta release-on-tag model):

```yaml
on:
  push:
    tags:
      - 'v1.0.0-beta.*'
      - 'v1.0.0-rc.*'
```

### 4.2 Permissions block (backend-cd.yml lines 32-36)

```yaml
permissions:
  contents: read           # checkout
  packages: write          # GHCR push
  id-token: write          # cosign keyless OIDC token from Fulcio
  attestations: write      # actions/attest-build-provenance push к Rekor
```

**Phase 7 divergence:** Phase 7 only needs `contents: read` + (optionally) `actions: read`. NO cosign / SLSA / id-token — Phase 7 just submits to EAS Cloud:

```yaml
permissions:
  contents: read           # checkout only
```

### 4.3 Job-step shape (backend-cd.yml lines 51-78)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: docker/setup-buildx-action@v3
  - name: Login к GHCR
    uses: docker/login-action@v3
    with:
      registry: ghcr.io
      username: ${{ github.actor }}
      password: ${{ secrets.GITHUB_TOKEN }}
  - name: Compute image metadata
    id: meta
    uses: docker/metadata-action@v5
    with:
      images: ghcr.io/ismaill01/${{ matrix.service }}
      ...
```

**Phase 7 divergence:** completely different action set (no docker/buildx/cosign; instead setup-node + setup-java + custom SOPS decrypt + expo/expo-github-action). But the **shape** (one step per concern, `name:` + `uses:` or `run:`, explicit `id:` only when needed for outputs) is identical. RESEARCH §8 gives the verbatim Phase 7 target — planner copies it.

### 4.4 Concrete SOPS-in-CI bash to add (NET NEW pattern — RESEARCH §2)

This pattern is NOT in any existing workflow in the repo — Phase 7 introduces it. Per RESEARCH §2 + §8:

```yaml
- name: Restore CI age key
  env:
    SOPS_AGE_KEY_CI: ${{ secrets.SOPS_AGE_KEY_CI }}
  run: |
    mkdir -p ~/.config/sops/age
    echo "$SOPS_AGE_KEY_CI" > ~/.config/sops/age/keys.txt
    chmod 600 ~/.config/sops/age/keys.txt

- name: Install SOPS + yq
  run: |
    curl -sL https://github.com/getsops/sops/releases/download/v3.13.1/sops-v3.13.1.linux.amd64 -o /usr/local/bin/sops
    chmod +x /usr/local/bin/sops
    curl -sL https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -o /usr/local/bin/yq
    chmod +x /usr/local/bin/yq

- name: Decrypt mobile signing bundle
  run: |
    sops -d .secrets/prod/mobile-signing.yaml > /tmp/mobile-signing.yaml
    yq -r '.android.keystore_base64' /tmp/mobile-signing.yaml | base64 -d \
      > apps/mobile-rn/android/app/release.keystore
    chmod 600 apps/mobile-rn/android/app/release.keystore
    {
      echo "RUNNING_ECO_RELEASE_STORE_PASSWORD=$(yq -r '.android.keystore_password' /tmp/mobile-signing.yaml)"
      echo "RUNNING_ECO_RELEASE_KEY_PASSWORD=$(yq -r '.android.key_password' /tmp/mobile-signing.yaml)"
      echo "RUNNING_ECO_RELEASE_KEY_ALIAS=$(yq -r '.android.key_alias' /tmp/mobile-signing.yaml)"
    } >> "$GITHUB_ENV"
    rm -f /tmp/mobile-signing.yaml
```

### Divergence notes for planner

- Phase 7 sets a 30-min `timeout-minutes` on the job (per RESEARCH §8); backend-cd does not — different scale of work (EAS Cloud submission is bounded by network, not by build time).
- The `expo/expo-github-action@v8` step is net-new (no Expo action in any existing workflow). Pin verified via WebFetch per RESEARCH §11 Q4.
- The pin pattern matches backend-cd's style for non-major-version actions (`actions/checkout@v4`, `docker/setup-buildx-action@v3` etc — major-version-pinned, NOT SHA-pinned). Phase 7 follows the same convention.
- No matrix needed (single Android build, no per-service fan-out). Drop the `strategy: matrix: ...` block.

---

## Section 5 — Foreground service notification + expo-location plugin (D-12, D-13)

### 5.1 `apps/mobile-rn/app.json` (MOD — extend expo-location plugin + add root `notification` block)

**Analog:** `app.json` itself — the `expo-location` plugin block already exists with permission strings (lines 51-62).

**Current state (verbatim — app.json lines 51-62):**

```jsonc
"plugins": [
  [
    "expo-location",
    {
      "locationAlwaysAndWhenInUsePermission": "Нужно для трекинга пробежки в фоне, когда телефон в кармане или экран выключен.",
      "locationWhenInUsePermission": "Нужно для трекинга пробежки и отображения вашей позиции на карте.",
      "isIosBackgroundLocationEnabled": true,
      "isAndroidBackgroundLocationEnabled": true,
      "isAndroidForegroundServiceEnabled": true
    }
  ],
  ...
]
```

**Target shape after Phase 7 D-12 edit (per RESEARCH §5):**

Static title/body lives in the plugin config. Dynamic body content uses path (A) — separate `expo-notifications` channel with per-tick `presentNotificationAsync` (see Section 5.3 below). Add a root-level `notification` block for icon + color:

```jsonc
{
  "expo": {
    ...
    "notification": {
      "icon": "./assets/notification-icon.png",
      "color": "#0F1419",
      "androidMode": "default",
      "androidCollapsedTitle": "Running Ecosystem — запись"
    },
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Нужно для трекинга пробежки в фоне, когда телефон в кармане или экран выключен.",
          "locationWhenInUsePermission": "Нужно для трекинга пробежки и отображения вашей позиции на карте.",
          "isIosBackgroundLocationEnabled": true,
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ],
      ...existing other plugins unchanged...
    ]
  }
}
```

**Already-correct existing pieces — DO NOT TOUCH:**
- Permissions block (lines 42-49): `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK` already present.
- Color palette: existing `splash.backgroundColor` + `adaptiveIcon.backgroundColor` both `#0F1419` — matches D-12 notification color.

### 5.2 `apps/mobile-rn/assets/notification-icon.png` (NEW asset)

**Analog:** `apps/mobile-rn/assets/adaptive-icon.png` (existing foreground icon for Android adaptive launcher icon — likely already white-silhouette per Android adaptive-icon convention).

**Divergence:** generate 96×96 white-on-transparent PNG from `adaptive-icon.png` foreground or design a fresh running-figure silhouette. Plan 07-03 Task X handles this. Per RESEARCH §9 Pitfall 5: some OEMs (One UI 5+) require NO transparency in some bands — known-issue documented if Pixel-only validation.

### 5.3 `apps/mobile-rn/src/foreground/notification.ts` (NEW — dynamic content updater)

**Analog A (storage/observer wiring):** `apps/mobile-rn/src/state/featureflags.ts` lines 142-152 (module-init AppState listener that lives the lifetime of the process).

**Verbatim excerpt** (`apps/mobile-rn/src/state/featureflags.ts:142-152`):

```typescript
// Phase 1 / REL-03: register AppState foreground listener.  Fires on every
// active-resume; refresh() internal TTL guard bounds frequency to 5min.
// AppState может отсутствовать в test env — wrap в try чтобы не падать.
try {
  AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next !== 'active') return;
    void useFeatureFlagsStore.getState().refresh();
  });
} catch (e) {
  console.warn('[featureflags] AppState listener registration failed', e);
}
```

**Analog B (zustand `onChange` subscription that fires on every snapshot mutation):** `apps/mobile-rn/src/state/activity.ts` lines 169-194.

**Verbatim excerpt** (`apps/mobile-rn/src/state/activity.ts:169-194`):

```typescript
const manager = new SessionManager(
  pipeline,
  pauseDetector,
  closureDetector,
  repo,
  locationAdapter,
  // gpsGapTriggerS читается lazily при каждом foreground'е (D-31).
  () => useSettingsStore.getState().gpsGapTriggerS,
  () => {
    // Любая мутация в manager синхронизируется со store.
    const snap = manager.snapshot();
    useActivityStore.setState({
      state: snap.state,
      points: snap.points,
      startedAt: snap.startedAt,
      endedAt: snap.endedAt,
      ...
    });
  },
);
```

### Divergence notes for planner

- D-13 says "every 5 seconds while session is active (matches existing `recordingTick`)" — but SessionManager's `onChange` callback fires on EVERY snapshot mutation, not on a 5s tick. Two options:
  1. Subscribe to `useActivityStore` with `setInterval(5000)` reading `getState()` — independent timer that maps state→notification content.
  2. Add a notification update inside the existing `onChange` (line 184-194), but throttle to 5s minimum interval.
- Recommend option 1 for clean separation: `notification.ts` exports `startForegroundNotificationLoop()` and `stopForegroundNotificationLoop()`; activity.ts calls these from `start()` / `stop()` actions. Mirrors the AppState-listener registration pattern (module-init + try/catch).
- Per RESEARCH §5: use `expo-notifications` (already in package.json: `"expo-notifications": "~0.32.17"`) for the dynamic `presentNotificationAsync` call with `identifier: 'recording-status'` (dedupe). Android 13+ POST_NOTIFICATIONS permission prompt needed — planner adds permission request before first tick.

---

## Section 6 — OEM detection + intent launcher + MMKV-flagged dialog (D-14)

### 6.1 `apps/mobile-rn/src/vendor/oem.ts` (NEW — lookup table)

**Analog:** none in mobile codebase. Lookup-table pattern is trivial; planner writes inline per RESEARCH §6.

**Dep requirement:** `expo-device` (verified installed — `package.json:33` does NOT show it explicitly in the grep but it's referenced by RESEARCH §6 with ⚠️ VERIFY). Plan 07-03 Task 1 verifies: `grep expo-device apps/mobile-rn/package.json` — if absent, `npm install expo-device`.

### 6.2 `apps/mobile-rn/src/vendor/openOEMSettings.ts` (NEW — intent launcher wrapper)

**Analog (URL/intent open pattern with try/catch fallback):** `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` lines 37-45 — the only existing in-repo pattern for "launch external action with empty-fallback warn".

**Verbatim excerpt** (`apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx:37-45`):

```typescript
const onUpdate = () => {
  if (!forceUpdateUrl) {
    // Пустой URL — клиент не отдал ссылку. Это сигнал ошибки конфига
    // на стороне сервера; ничего не делаем (кнопка не реагирует).
    console.warn('[forceUpdate] empty forceUpdateUrl — cannot open');
    return;
  }
  void Linking.openURL(forceUpdateUrl);
};
```

**Divergence for `openOEMSettings.ts`:**
- Use `expo-intent-launcher` (NEW dep — Plan 07-03 Task 1 = `npm install expo-intent-launcher`; NOT present in current `package.json` per grep). RESEARCH §11 Q-not-listed: planner WebFetches to confirm package is maintained for SDK 54.
- Wrap intent launch in try/catch; fall back to `ActivityAction.APPLICATION_DETAILS_SETTINGS` on failure (per RESEARCH §6 code block).
- Use `expo-application.applicationId` (verified installed — `package.json:26`: `"expo-application": "~7.0.8"`) for package name.
- Pattern: same try/catch + warn + fallback shape as ForceUpdateScreen, but the "happy path" call is `startActivityAsync(...)` instead of `Linking.openURL(...)`.

### 6.3 `apps/mobile-rn/src/vendor/AutostartDialog.tsx` (NEW — MMKV-flagged modal)

**Analog A (Modal UI shape — full-screen, RU strings, Pressable, dark palette):** `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` lines 47-78.

**Verbatim excerpt** (`apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx:47-78`):

```typescript
return (
  <Modal
    visible
    animationType="fade"
    presentationStyle="fullScreen"
    onRequestClose={() => {
      /* Android back: no-op — modal неотменяемая */
    }}
  >
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Требуется обновление</Text>
        <Text style={styles.body}>
          Версия приложения устарела. Минимальная поддерживаемая:{' '}
          {minVersion || 'N/A'}.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={onUpdate}
          accessibilityRole="button"
          accessibilityLabel="Обновить сейчас"
        >
          <Text style={styles.buttonText}>Обновить сейчас</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);
```

**Divergence for AutostartDialog:**
- D-14 dialog IS dismissible (`onRequestClose` actually dismisses, unlike ForceUpdateScreen). Add `Pressable` with "Понятно, потом" + checkbox "Не показывать снова".
- 3 buttons instead of 1 (per CONTEXT §specifics): "Открыть настройки" (calls `openOEMAutoStartSettings()`) | "Понятно, потом" | checkbox "Не показывать снова".
- RU strings per CONTEXT §specifics + CLAUDE.md convention.

**Analog B (MMKV-backed boolean flag pattern with `createMMKV()`):** `apps/mobile-rn/src/state/featureflags.ts` lines 59-72.

**Verbatim excerpt** (`apps/mobile-rn/src/state/featureflags.ts:59-72`):

```typescript
const mmkv = createMMKV();

const mmkvStorage = {
  getItem: (name: string): string | null => {
    const value = mmkv.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string): void => {
    mmkv.set(name, value);
  },
  removeItem: (name: string): void => {
    mmkv.remove(name);
  },
};
```

**Analog C (zustand `persist` middleware with MMKV storage):** `apps/mobile-rn/src/state/featureflags.ts` lines 134-138.

**Verbatim excerpt** (`apps/mobile-rn/src/state/featureflags.ts:134-138`):

```typescript
{
  name: 'running-ecosystem-featureflags',
  storage: createJSONStorage(() => mmkvStorage),
  version: 1,
},
```

**Divergence for `vendorAutostartDialogShown` flag:**
- Simpler than featureflags — a single boolean flag, no TTL, no refresh. Direct `mmkv.getBoolean('vendorAutostartDialogShown')` + `mmkv.set('vendorAutostartDialogShown', true)` is sufficient (no zustand store wrapping needed).
- Recommend writing utility module `apps/mobile-rn/src/vendor/AutostartDialog.tsx` that exports `shouldShowDialog()` (reads MMKV) + `markDialogShown()` (writes MMKV) helpers alongside the React component — keeps MMKV access co-located with the only consumer. Or alternatively put helpers in a separate `apps/mobile-rn/src/vendor/autostartFlag.ts` for testability (analog: `apps/mobile-rn/src/state/forceUpdate.ts` — a clean small-scope module pattern).

---

## Section 7 — Bash smoke scripts (`evidence/smoke-*.sh`)

**Analog:** `.planning/phases/06-release-signing/evidence/smoke-sops-roundtrip.sh` (and siblings — Phase 6 has 7 freshly-shipped 2026-05-20 smokes that all follow the canonical template).

### 7.1 Verbatim canonical template (`smoke-sops-roundtrip.sh` lines 1-46)

```bash
#!/usr/bin/env bash
# Phase 6 / Plan 06-01 Task 3 — smoke: SOPS → base64 → keystore round-trip
# Verifies VALIDATION row 06-01-02. Decrypts the SOPS file fresh, extracts the
# keystore via base64 -d, invokes keytool to list the alias, and verifies the
# SHA-256 matches the captured evidence.
#
# Exit codes:
#   0 — smoke green
#   1 — smoke red (probe assertion failed)
#   2 — pre-req missing
#
# Required env vars (if SOPS default lookup doesn't find the age key):
#   SOPS_AGE_KEY_FILE — path to age private key (~/.config/sops/age/keys.txt)
set -euo pipefail
for bin in sops yq keytool base64 awk grep; do
  command -v "$bin" >/dev/null 2>&1 || { echo "❌ pre-req missing: $bin"; exit 2; }
done
must() {
  local name="$1" expected="$2" actual="$3" detail="${4:-}"
  [ "$actual" = "$expected" ] || { echo "❌ ${name}: expected '${expected}', got '${actual}' ${detail}"; exit 1; }
  echo "✓ ${name} → ${actual}"
}
# Provide a sensible default for SOPS_AGE_KEY_FILE if unset:
: "${SOPS_AGE_KEY_FILE:=$HOME/.config/sops/age/keys.txt}"
export SOPS_AGE_KEY_FILE

TMP=$(mktemp -d -t sport-sign-XXXXXX)
trap 'rm -rf "$TMP"; unset VER_PASS' EXIT

sops -d .secrets/prod/mobile-signing.yaml \
  | yq -r '.android.keystore_base64' \
  | base64 -d > "$TMP/keystore.p12"

# ... probe steps ...

echo "🎉 smoke green: SOPS round-trip → base64 -d → keytool lists alias + SHA-256 matches"
```

### 7.2 Pattern divergences per Phase 7 smoke

Per VALIDATION row 07-01-01..07-03-06 (13 rows), Phase 7 needs 7 smoke files. Each follows the same skeleton with task-specific probe body:

| Smoke script | Specific probe |
|--------------|----------------|
| `smoke-wave0.sh` | Asserts `.gitignore` contains `release.keystore` + `credentials.json` lines; `evidence/` dir exists; `tool-versions.txt` populated with required tool versions |
| `smoke-sops-multi-recipient.sh` | `grep -cE 'age1' .sops.yaml` ≥ 2; dual-decrypt against dev key AND ci key both succeed with matching plaintext |
| `smoke-eas-config.sh` | `jq '.build.production.android.env' apps/mobile-rn/eas.json` returns non-null; contains `RUNNING_ECO_RELEASE_STORE_FILE` + `RUNNING_ECO_RELEASE_KEY_ALIAS`; `buildType == "app-bundle"` |
| `smoke-gradle-config.sh` | `grep` patterns in gradle.properties (`enableMinifyInReleaseBuilds=true` + `reactNativeArchitectures=arm64-v8a`) + build.gradle (`abiFilters 'arm64-v8a'`) |
| `smoke-proguard-rules.sh` | Grep for required keep patterns: `com.mapbox.\*\*`, `com.tencent.mmkv.\*\*`, `expo.modules.\*\*`, `com.facebook.hermes.\*\*`; existing reanimated keep preserved |
| `smoke-notif-icon-asset.sh` | `apps/mobile-rn/assets/notification-icon.png` exists; PNG header magic bytes valid; `app.json` `notification.icon` references it |
| `smoke-oem-dialog.sh` | Unit-test-style: verifies `detectVendor()` returns expected string for fake `Device.manufacturer` values; MMKV flag round-trip (false → mark → true → survives reload) |

### 7.3 Wave 0 stub pattern (verbatim from Phase 6 Plan 06-01 Task 0, commit 7f43069)

The Phase 6 commit "chore(06-01): Wave 0 — evidence/ scaffolding + tool versions + smoke stubs (SIGN-01)" demonstrates the **stub pattern**: each smoke script written at Wave 0 with `exit 2` body + "Wave 0 stub — implemented in Plan 07-0X Task N" placeholder. Phase 7 mirrors this exactly.

### Divergence notes for planner

- All 7 Phase 7 smokes inherit the exit-code semantics (0=green / 1=red / 2=pre-req-missing) verbatim.
- The `must()` helper is verbatim — copy as-is.
- The `trap 'rm -rf "$TMP"' EXIT` pattern carries over only for smokes that mktemp; not all Phase 7 smokes need a tempdir.
- The `SOPS_AGE_KEY_FILE` default is only needed for smokes that invoke `sops -d` (smoke-sops-multi-recipient.sh only).
- Final celebratory line uses 🎉 — Phase 7 keeps the same emoji for visual continuity with Phase 6 evidence/.

---

## Section 8 — Plan task XML structure for `autonomous: false` plans

**Analog:** `.planning/phases/06-release-signing/06-01-PLAN.md` (most recent precedent — committed 2026-05-20).

### 8.1 Frontmatter pattern (verbatim from 06-01-PLAN.md lines 1-117)

```yaml
---
phase: 06-release-signing
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/06-release-signing/evidence/tool-versions.txt
  - .planning/phases/06-release-signing/evidence/smoke-keystore-generated.sh
  ...
autonomous: false
requirements:
  - SIGN-01
tags:
  - secrets
  - sops
  ...
expected_pause_max: "1 day"
deferred_tasks: [5, 6]
deferred_tasks_per: |
  ADR-0011 Amendment 4 2026-05-20 PM — ...
deferrals:
  - id: D-14-CI-AGE-KEY
    summary: |
      ...
    scope: Phase 7
user_setup:
  - service: macOS-bundled toolchain
    why: "..."
    install_cmd: "brew install yq"
    expected_versions: {...}
must_haves:
  truths:
    - "..."
  artifacts:
    - path: .secrets/prod/mobile-signing.yaml
      provides: "..."
      contains: "android"
  key_links:
    - from: "..."
      to: "..."
      via: "..."
      pattern: "..."
tags_for_global_learnings:
  - android-keystore
  ...
---
```

### 8.2 Auto-task body pattern (verbatim from 06-01-PLAN.md lines 250-330)

```xml
<task type="auto">
  <name>Task 0 (Wave 0): Create evidence/ scaffolding + tool-version capture + smoke-script stubs + recovery-card template</name>
  <files>
    .planning/phases/06-release-signing/evidence/tool-versions.txt,
    ...
  </files>
  <read_first>
    - .planning/phases/06-release-signing/06-VALIDATION.md §"Wave 0 Requirements"
    - .planning/phases/06-release-signing/06-PATTERNS.md §2 (bash smoke-script canonical template)
    - .planning/phases/06-release-signing/06-RESEARCH.md §"Standard Stack"
    ...
  </read_first>
  <action>
    1. Create directory:
       ```bash
       mkdir -p .planning/phases/06-release-signing/evidence
       ```
    2. ...
  </action>
</task>
```

### 8.3 USER ACTION checkpoint pattern (verbatim from 06-01-PLAN.md lines 1113-1201)

```xml
<task type="checkpoint:human-action" gate="blocking" status="deferred">
  <name>Task 6: USER ACTION — Verify cloud sync on second device + place RECOVERY-CARD.md at home</name>
  <files>
    .planning/phases/06-release-signing/evidence/cloud-backup-log.txt (Task 6 appends attestation lines)
  </files>
  <read_first>
    - docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md §"Amendment 2026-05-20 PM"
    - .planning/phases/06-release-signing/evidence/cloud-backup-log.txt (Task 5 output)
  </read_first>
  <what-built>
    By this point (post-Task 5), all automatable work for Plan 06-01 is complete:
    - `.secrets/prod/mobile-signing.yaml` exists, SOPS-encrypted ...
    - ...
  </what-built>
  <how-to-verify>
    Execute the 3-step lean attestation checklist. Each step's pass/fail goes into
    `evidence/cloud-backup-log.txt` via `>>` append AND into `06-01-SUMMARY.md
    §"Backup placement attestation"` after this checkpoint clears.

    1. **Cross-device sync verification.** ...
    2. **Print + place RECOVERY-CARD.md.** ...
    3. **Resume signal** — paste back into the executor's prompt:
       ```
       Cloud provider: <iCloud | Google Drive | Dropbox>
       Folder path: <full path from Task 5>
       Second-device verification: PASS — ...
       RECOVERY-CARD.md printed: YES
       RECOVERY-CARD.md placed at: <location>
       ```
  </how-to-verify>
  <resume-signal>Paste the 5-line attestation block from step 3 above. Executor appends verbatim to `evidence/cloud-backup-log.txt` AND records into `06-01-SUMMARY.md §"Backup placement attestation"`.</resume-signal>
  <acceptance_criteria>
    - Cloud provider + folder path explicitly named in resume-signal
    - Second-device sync verified — both files visible on phone
    - RECOVERY-CARD.md printed
    - RECOVERY-CARD.md home location explicitly named
  </acceptance_criteria>
</task>
```

### Divergence notes for Phase 7 plans

- **Plan 07-01:** mostly auto tasks (Wave 0 + SOPS multi-recipient setup + eas.json edit + gradle/proguard edits + workflow file + first build trigger via smoke tag). Then ONE USER ACTION at end: "Run 7-step R8 device smoke on tethered Pixel + paste attestation block". `autonomous: false` + `expected_pause_max: "1 day"` (matches 06-01).
- **Plan 07-03:** auto tasks (notification icon asset + notification.ts + oem.ts + openOEMSettings.ts + AutostartDialog.tsx + recoverLast adb-kill validation script). Then ONE FINAL USER ACTION: "1h Pixel pocket-walk per CONTEXT D-18 5-sub-check matrix". `autonomous: false` + `expected_pause_max: "2 days"` (pocket-walk + recovery validation cannot be re-scheduled instantly; weather, schedule).
- Both plans use `<resume-signal>...</resume-signal>` paste-back block per 06-01 line 1194 precedent.
- Both plans encode `deferrals:` block for Phase 7's documented exclusions (iOS profile per D-23; 4-vendor matrix per D-24; reproducible build per D-25; Mapbox 11.x per D-26; armeabi-v7a per D-05 deferred lift).

---

## Section 9 — Wave 0 prereq task encoding

**Analog:** `.planning/phases/06-release-signing/06-01-PLAN.md` Task 0 (lines 250-410 — full Wave 0 scaffolding for Phase 6, executed 2026-05-20 commit 7f43069).

### Wave 0 task semantic match for Phase 7

| 06-01 Task 0 element | 07-01 Task 0 mirror |
|----------------------|---------------------|
| `mkdir -p evidence/` | `mkdir -p .planning/phases/07-release-builds-mobile-stability/evidence/` |
| Tool-version probe (sops, yq, keytool, openssl, hdiutil, base64, macOS) | Tool-version probe (node ≥20, npm ≥10, npx eas, sops ≥3.13, yq, gh, adb, bundletool) |
| Smoke-script stubs with `exit 2` body | 7 smoke-script stubs (per VALIDATION row table) with `exit 2` body |
| Recovery-card template | (N/A — Phase 7 has no paper recovery card) |
| `.gitignore` edits | `.gitignore` edits: `apps/mobile-rn/android/app/release.keystore` + `apps/mobile-rn/credentials.json` |
| Verification: `sops --version` ≥ 3.11.0 inline-asserted | Verification: `node --version` ≥ 20 + `npm --version` ≥ 10 inline-asserted |

### `.gitignore` divergence (Phase 7 D-03 Path A → may obviate `credentials.json` line)

**Analog:** `.gitignore` itself lines 51-54.

**Current state (verbatim):**

```gitignore
android/build/
android/.gradle/
android/app/build/
android/app/release/
android/local.properties
*.jks
*.keystore
!debug.keystore
```

**Note:** `*.keystore` already ignored globbed (line 53) — but `!debug.keystore` exception (line 54) keeps the dev fixture. The new `release.keystore` file Phase 7 introduces would already be caught by `*.keystore` — so the literal addition `apps/mobile-rn/android/app/release.keystore` is REDUNDANT but defensive. Per VALIDATION row 07-01-00 + Wave 0 list, planner still adds the literal line for clarity:

```gitignore
# Phase 7 BUILD-01 — release signing material (decrypted at CI run time only).
# `*.keystore` above already catches it; explicit pin for grep-discoverability.
apps/mobile-rn/android/app/release.keystore
apps/mobile-rn/credentials.json
```

### Wave 0 verification (VALIDATION row 07-01-00)

```bash
# smoke-wave0.sh probe body:
grep -qE '^apps/mobile-rn/android/app/release\.keystore$' .gitignore || { echo "❌ missing .gitignore entry: release.keystore"; exit 1; }
grep -qE '^apps/mobile-rn/credentials\.json$' .gitignore || { echo "❌ missing .gitignore entry: credentials.json"; exit 1; }
[ -d .planning/phases/07-release-builds-mobile-stability/evidence ] || { echo "❌ missing evidence/ dir"; exit 1; }
for f in smoke-sops-multi-recipient.sh smoke-eas-config.sh smoke-gradle-config.sh smoke-proguard-rules.sh smoke-notif-icon-asset.sh smoke-oem-dialog.sh smoke-wave0.sh; do
  [ -x .planning/phases/07-release-builds-mobile-stability/evidence/"$f" ] || { echo "❌ missing/non-exec: $f"; exit 1; }
done
[ -f .planning/phases/07-release-builds-mobile-stability/evidence/tool-versions.txt ] || { echo "❌ missing tool-versions.txt"; exit 1; }
echo "🎉 smoke green: Wave 0 scaffolding present"
```

---

## Shared / Cross-Cutting Patterns

### A. Russian-language user-facing strings (CLAUDE.md convention)

**Source:** `apps/mobile-rn/app.json` lines 24-25 (existing `NSLocationWhen*Description` already Russian) + `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` (full RU UI).

**Apply to:**
- D-12 foreground notification text (title "Running Ecosystem" + body "Запись пробежки активна — ...")
- D-14 AutostartDialog labels + buttons
- Any new RN UI Phase 7 introduces

### B. SOPS-encrypted secrets consumed at run time → env vars (Phase 2 + Phase 6 + Phase 7 pattern)

**Source pattern lineage:**
- Phase 2 D-03 backend (services consume SOPS via `sops -d` at deploy time)
- Phase 6 D-03 mobile-signing pattern (`sops -d | yq -r | base64 -d` → keystore)
- Phase 7 D-04 lifts this to GitHub Actions runner context (`$GITHUB_ENV` indirection)

**Apply to:** Plan 07-01 Task N (workflow SOPS-decrypt step) — verbatim 5-line bash from Section 4.4 above.

### C. Self-managed credentials over vendor-managed

**Source pattern lineage:**
- Phase 4 (save/scp/load over GHCR auth)
- Phase 6 D-10 (SOPS-encrypted-in-repo + 1Password-sealed-age-key over EAS-managed)
- Phase 7 D-03 (Path A from RESEARCH §0 — keep build.gradle custom Gradle-property reads, not Expo credentials.json indirection)

**Apply to:** All Phase 7 build pipeline decisions. The Expo "managed credentials" option is consistently rejected per project principle "no vendor lock-in".

### D. Module-init listeners + try/catch wrap

**Source:** `apps/mobile-rn/src/state/featureflags.ts` lines 142-152 + `apps/mobile-rn/src/state/activity.ts` lines 207-210.

**Apply to:** `apps/mobile-rn/src/foreground/notification.ts` module-init registration (Phase 7 5.3) — wrap in try/catch since AppState / Notifications APIs may be absent in test env.

### E. `expected_pause_max` + USER ACTION resume-signal block

**Source:** `06-01-PLAN.md` lines 30 + 1182-1193.

**Apply to:** Plans 07-01 + 07-03 — both have one or more USER ACTION checkpoints. 07-01 = "1 day" (R8 device smoke on dev workstation); 07-03 = "2 days" (1h pocket-walk needs scheduling + weather).

---

## No Analog Found

| File | Role | Data Flow | Reason | Planner Strategy |
|------|------|-----------|--------|------------------|
| `apps/mobile-rn/src/vendor/oem.ts` (OEM detection lookup table) | utility | transform | First time a Build-MANUFACTURER lookup appears in the mobile codebase | Use RESEARCH §6 verbatim code (trivial; ~15 lines) |
| `expo-intent-launcher` usage | adapter | request-response | No existing `expo-intent-launcher` import in the codebase (verified via `grep -rn "expo-intent-launcher" apps/mobile-rn/`) | Plan 07-03 Task 1 = `npm install expo-intent-launcher`; planner WebFetches SDK 54 doc to confirm maintained; uses RESEARCH §6 code |
| `expo-notifications` dynamic `presentNotificationAsync` per-tick | service | event-driven | `expo-notifications` is installed (`package.json:34`) but no existing call site in the codebase | Use RESEARCH §5 verbatim code; Plan 07-03 Task M = create notification channel + permission request on first run |
| Foreground service notification testing on real device | smoke | manual | No prior "device smoke" or "device install" pattern in repo evidence/ — Phase 6 was all desktop crypto | Plan 07-01 final task USER ACTION + Plan 07-03 final task USER ACTION (1h pocket-walk) — both encoded via `<task type="checkpoint:human-action">` per Section 8.3 |

---

## Metadata

**Analog search scope:**
- `.sops.yaml` (Phase 2 D-04 artifact)
- `.github/workflows/*.yml` (4 workflows scanned; backend-cd.yml is closest)
- `.gitignore` (existing structure)
- `apps/mobile-rn/eas.json` + `app.json` + `android/app/build.gradle` + `android/gradle.properties` + `android/app/proguard-rules.pro` (Phase 1 substrate; all have target-block precedents)
- `apps/mobile-rn/src/state/*.ts` (22 files — MMKV / persist / AppState patterns)
- `apps/mobile-rn/src/domain/session/SessionManager.ts` + `apps/mobile-rn/src/state/activity.ts` (zustand `onChange` callback pattern)
- `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` (Modal + RU + Pressable + Linking.openURL pattern)
- `.planning/phases/06-release-signing/06-01-PLAN.md` (autonomous=false plan precedent)
- `.planning/phases/06-release-signing/evidence/smoke-*.sh` (canonical bash smoke template — 6 files all shipped 2026-05-20)
- `.planning/phases/06-release-signing/06-PATTERNS.md` (precedent format for this file)

**Files scanned:** ~40 (focused on the 13 Phase 7 targets + their direct analogs)

**Pattern extraction date:** 2026-05-21

**Confidence:** HIGH for all in-repo analogs (direct file reads). MEDIUM for net-new patterns (SOPS-in-CI bash + expo-intent-launcher + expo-notifications dynamic content) — planner WebFetches per RESEARCH §11 to nail exact 2026 syntax before commit.

---

*Phase: 7-release-builds-mobile-stability*
*Pattern mapping: 2026-05-21 (gsd-pattern-mapper)*
