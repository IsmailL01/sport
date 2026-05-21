# Phase 7 — Research

> **Provenance:** Researcher agent timed out at 8.3min / 83 tool uses (no output). This document was written inline by the orchestrator (training cutoff: Jan 2026) with `⚠️ VERIFY:` markers on items where 2026 syntax / flags may have drifted. Planner should WebFetch flagged items before final task generation.
>
> **Confidence levels per section noted at the top of each.**

---

## §0 — Runtime State Inventory

Current Phase 7-relevant files (verified by inline `cat`/`grep` during research):

| File | Current state | What Phase 7 changes |
|---|---|---|
| `.sops.yaml` | Single recipient `age1ph7d4a62n9...` (DEV_A). TODO comments for DEV_B + CI key still open. | **D-04 adds CI recipient** + runs `sops updatekeys` |
| `apps/mobile-rn/eas.json` | `production.android.buildType: app-bundle`; no `credentialsSource` set; iOS block has `resourceClass: m-medium` only | **D-03 adds `credentialsSource: "local"`** to `production.android` |
| `apps/mobile-rn/app.json` | Bundle ID `com.runningecosystem.mobile`; Android permissions FOREGROUND_SERVICE + FOREGROUND_SERVICE_LOCATION + WAKE_LOCK already present; `expo-location` plugin with `isAndroidForegroundServiceEnabled: true` | **D-12 adds `notificationTitle`/`notificationBody`** to expo-location plugin config |
| `apps/mobile-rn/android/app/proguard-rules.pro` | Has `-keep class com.swmansion.reanimated.** { *; }` + `-keep class com.facebook.react.turbomodule.** { *; }` only | **D-07 appends Mapbox + MMKV + expo-task-manager + Hermes keeps** |
| `apps/mobile-rn/android/app/build.gradle` | `signingConfigs.release` already reads from `RUNNING_ECO_RELEASE_*` Gradle properties (debug-keystore fallback if unset). `minifyEnabled` gated on `enableMinifyInReleaseBuilds`. `shrinkResources` gated on `android.enableShrinkResourcesInReleaseBuilds`. **NO `defaultConfig.ndk.abiFilters`.** | **D-05 adds `abiFilters "arm64-v8a"`** to `defaultConfig.ndk` block |
| `apps/mobile-rn/android/gradle.properties` | `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64`; `newArchEnabled=true`; `hermesEnabled=true`; no `enableMinifyInReleaseBuilds` set. | **D-05 narrows `reactNativeArchitectures` → `arm64-v8a` only**; **D-06 adds `enableMinifyInReleaseBuilds=true`** + `android.enableShrinkResourcesInReleaseBuilds=true` |
| `apps/mobile-rn/src/domain/session/SessionManager.ts` + tests | `recoverLast()` exists (pre-v1.0 baseline). Tested via `SessionManager.test.ts` + `gapResume.test.ts`. | **NO code changes — Phase 7 validates on release build via adb force-kill** |

**Critical discrepancy with CONTEXT D-03 surfaced by inline scout:**

CONTEXT D-03 says: "`credentialsSource: 'local'` in eas.json + CI writes `credentials.json`." But the EXISTING `build.gradle` already reads from custom `RUNNING_ECO_RELEASE_*` Gradle properties (NOT from Expo-managed credentials.json injection). Two reconciliation paths:

- **(A) Honor existing build.gradle pattern:** CI writes `~/.gradle/gradle.properties` (or passes `-P` flags) with `RUNNING_ECO_RELEASE_STORE_FILE=...` etc. NO `credentials.json` involved. Cleaner — matches what's checked in — but bypasses Expo's standard local-credentials path, which means `eas build` running in EAS Cloud needs the property values too (via env vars in `eas.json`).
- **(B) Convert to Expo's credentials.json:** CI writes `apps/mobile-rn/credentials.json`; modify or regenerate `build.gradle` to use Expo's injected `signingConfigs.release` (which Expo's `prebuild` step generates from credentials.json). Discards the existing custom pattern; relies on Expo's autogeneration.

⚠️ **VERIFY:** Planner WebFetch `https://docs.expo.dev/app-signing/local-credentials/` to confirm 2026 schema. **Recommended:** Path (A) — keep the existing custom build.gradle pattern; pass keystore via `eas.json` `build.production.env` env vars + write keystore file to `apps/mobile-rn/android/app/release.keystore` from SOPS-decrypted base64 at CI run time. Matches existing code; respects "don't add abstractions beyond what task requires" (CLAUDE.md).

---

## §1 — EAS Cloud build pipeline 2026

**Confidence:** HIGH on overall flow; MEDIUM on exact env-var injection schema.

### eas.json production profile (Phase 7 target)

```jsonc
// apps/mobile-rn/eas.json — Phase 7 EDIT to production.android block
{
  "build": {
    // ... development + preview unchanged ...
    "production": {
      "ios": {
        "resourceClass": "m-medium"
        // iOS portion stays untouched per ADR-0011 Amendment 3
      },
      "android": {
        "buildType": "app-bundle",
        "env": {
          // Path (A) per §0 — env vars consumed by build.gradle RUNNING_ECO_RELEASE_*
          "RUNNING_ECO_RELEASE_STORE_FILE": "release.keystore",
          "RUNNING_ECO_RELEASE_KEY_ALIAS": "runningecosystem-release"
          // STORE_PASSWORD + KEY_PASSWORD injected at CI run time via:
          //   `eas secret:create` (one-time setup) OR `EAS_LOCAL_BUILD_*` env injection
        },
        "image": "latest"
        // ⚠️ VERIFY: confirm `image: "latest"` is the 2026 Expo-default macOS image
      }
    }
  }
}
```

### EAS Cloud build invocation (CI workflow command)

```bash
# In apps/mobile-rn/ working directory, after SOPS decrypt:
npx eas build \
  --platform android \
  --profile production \
  --non-interactive \
  --no-wait \
  --message "Phase 7 release build — ${GITHUB_REF_NAME}"
```

⚠️ **VERIFY:** Planner WebFetch `https://docs.expo.dev/build-reference/eas-json/` to confirm:
- `--non-interactive` is still the CI flag (was renamed `--ci` in some SDK?)
- `--no-wait` semantics — exits 0 once submission accepted vs blocks until completion
- `--message` flag persists (helpful for tagging builds in EAS dashboard)

### eas submit (NOT used in Phase 7)

Per CONTEXT D-22: Phase 7 workflow ends at `eas build` submission. Phase 8 (DIST-01) handles the build artifact download + Caddy manifest publishing. `eas submit` is the Play Store / Expo-managed-distribution path — closed beta uses self-hosted Caddy → `eas submit` not invoked.

### Build artifact retrieval (Phase 8 concern, but referenced here for completeness)

```bash
# Phase 8 will do this — listed here so Phase 7 ensures the build is fetchable:
BUILD_ID=$(npx eas build:list --platform android --status finished --limit 1 --json | jq -r '.[0].id')
npx eas build:download --id "$BUILD_ID" --output release.aab
```

---

## §2 — SOPS updatekeys + multi-recipient (CI age key)

**Confidence:** HIGH. SOPS multi-recipient pattern is stable since SOPS 3.7+; local SOPS is 3.13.1 per Phase 6 RESEARCH §0.

### Generate CI age keypair

```bash
# Run ONCE on dev workstation (NOT on CI):
age-keygen -o /tmp/ci-age-key.txt
# Output prints public key to stdout — capture it:
CI_PUBLIC_KEY=$(grep "public key:" /tmp/ci-age-key.txt | awk '{print $NF}')
echo "$CI_PUBLIC_KEY"   # → age1abc...xyz (this goes into .sops.yaml)

# Read private key for GitHub Actions secret:
cat /tmp/ci-age-key.txt   # full file content (including header comments + private key)
# Copy to GitHub Actions: Settings → Secrets → New → SOPS_AGE_KEY_CI = <paste full file>

# Securely delete the local file:
rm -P /tmp/ci-age-key.txt   # ⚠️ rm -P unreliable on APFS per Phase 6 RESEARCH Pitfall 11
# Better: write to RAM disk first:
hdiutil attach -nomount ram://2048 | xargs diskutil eraseDisk APFS ci-keygen-ramdisk
age-keygen -o /Volumes/ci-keygen-ramdisk/key.txt
# Read key, paste to GH secret, then `diskutil eject /Volumes/ci-keygen-ramdisk` — evaporates.
```

### Add CI recipient to `.sops.yaml`

Edit the existing `.sops.yaml` (current single-recipient):

```yaml
# .sops.yaml — after Phase 7 D-04 edit
creation_rules:
  - path_regex: \.secrets/.*\.yaml$
    age: >-
      age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my,
      age1abc...xyz
    # ^ append CI public key after DEV_A, comma-separated. SOPS supports >-
    # (YAML folded scalar) for multi-line recipient lists.
```

### Re-wrap data-encryption keys (non-destructive)

```bash
# Re-encrypts the data-encryption-key (DEK) wrapper against the new recipient list.
# Does NOT re-encrypt the underlying plaintext — DEK wrapping is just a small
# header rewrite. Safe to run; commits a small diff to the .yaml file.
sops updatekeys .secrets/prod/mobile-signing.yaml
sops updatekeys .secrets/prod/shared.yaml
sops updatekeys .secrets/prod/mapbox.yaml
sops updatekeys .secrets/prod/oauth.yaml
sops updatekeys .secrets/prod/sentry.yaml
# (Update ALL prod secret files so CI can access whatever it needs across phases)

# Verify both recipients work:
SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt sops -d .secrets/prod/mobile-signing.yaml | head -3
SOPS_AGE_KEY_FILE=/tmp/ci-key-restored.txt sops -d .secrets/prod/mobile-signing.yaml | head -3
# Both should produce identical plaintext output.
```

### GitHub Actions secret consumption

```bash
# In .github/workflows/android-release.yml:
- name: Restore CI age key
  run: |
    mkdir -p ~/.config/sops/age
    echo "$SOPS_AGE_KEY_CI" > ~/.config/sops/age/keys.txt
    chmod 600 ~/.config/sops/age/keys.txt
  env:
    SOPS_AGE_KEY_CI: ${{ secrets.SOPS_AGE_KEY_CI }}

- name: Install SOPS
  run: |
    curl -sL https://github.com/getsops/sops/releases/download/v3.13.1/sops-v3.13.1.linux.amd64 -o /usr/local/bin/sops
    chmod +x /usr/local/bin/sops

- name: Decrypt mobile-signing.yaml
  run: |
    sops -d .secrets/prod/mobile-signing.yaml > /tmp/mobile-signing.yaml
    # Extract keystore + write to expected location
    yq -r '.android.keystore_base64' /tmp/mobile-signing.yaml | base64 -d > apps/mobile-rn/android/app/release.keystore
    chmod 600 apps/mobile-rn/android/app/release.keystore
    # Capture passwords as env vars (NOT in shell history; use $GITHUB_ENV indirection):
    echo "RUNNING_ECO_RELEASE_STORE_PASSWORD=$(yq -r '.android.keystore_password' /tmp/mobile-signing.yaml)" >> $GITHUB_ENV
    echo "RUNNING_ECO_RELEASE_KEY_PASSWORD=$(yq -r '.android.key_password' /tmp/mobile-signing.yaml)" >> $GITHUB_ENV
    shred -u /tmp/mobile-signing.yaml || rm -f /tmp/mobile-signing.yaml
```

⚠️ **VERIFY:** Planner WebFetch `https://docs.expo.dev/build-reference/variables/` to confirm:
- Whether env vars set in `$GITHUB_ENV` propagate to `eas build` subprocess as expected
- Alternative: `eas secret:create` to push keystore-related vars to EAS Cloud directly (avoid runner-side env handling)
- Whether EAS Build container has access to GH Actions env or needs explicit forwarding

---

## §3 — Android arm64-v8a only ABI filter

**Confidence:** HIGH. ABI filtering is stable Android Gradle Plugin 7+ syntax; Expo SDK 54 uses AGP 8.x which honors same syntax.

### Two layers to set

**Layer 1: `reactNativeArchitectures` in `gradle.properties`** — controls which architectures React Native + native modules build for:

```properties
# apps/mobile-rn/android/gradle.properties — Phase 7 EDIT
reactNativeArchitectures=arm64-v8a
# was: armeabi-v7a,arm64-v8a,x86,x86_64
```

**Layer 2: `defaultConfig.ndk.abiFilters` in `build.gradle`** — controls which ABIs the final .aab packages:

```groovy
// apps/mobile-rn/android/app/build.gradle — Phase 7 EDIT inside android.defaultConfig {}
defaultConfig {
    applicationId 'com.runningecosystem.mobile'
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 1
    versionName "1.0"
    ndk {
        abiFilters 'arm64-v8a'   // NEW — Phase 7 D-05
    }
}
```

Both layers needed: `reactNativeArchitectures` short-circuits Gradle's native-build invocation for unwanted ABIs (saves build time); `abiFilters` ensures the .aab doesn't accidentally package x86/v7a from a transitive dep that didn't honor the first flag.

### .aab single-ABI implications

- **Closed beta:** No Play Store submission → no rejection risk. Caddy manifest serves a single-ABI .apk extracted from the .aab.
- **Future Play Store path:** Play accepts single-ABI .aab if `<uses-feature android:glEsVersion="0x00020000" android:required="true" />` is set + the .aab's manifest declares the supported ABI. Confirmed acceptable by Play Console as long as the developer accepts the device-base reduction.
- **APK size impact:** Mapbox SDK is ~30 MB per ABI; dropping `armeabi-v7a` + `x86` + `x86_64` saves ~90 MB. Final v1.0 .aab estimated ~50-60 MB (was ~140 MB with all 4 ABIs).

---

## §4 — R8 + ProGuard keep set

**Confidence:** HIGH on Mapbox + Hermes (well-documented); MEDIUM on MMKV + expo-task-manager (less-trafficked; may have consumer-rules.pro shipping that obviates explicit keeps).

### Enable R8

```properties
# apps/mobile-rn/android/gradle.properties — Phase 7 EDIT
enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
# Both gates already present in build.gradle as property references — just flip values.
```

### Extend `proguard-rules.pro`

```proguard
# apps/mobile-rn/android/app/proguard-rules.pro
# ↓ existing react-native-reanimated keep stays at top ↓

# react-native-reanimated (existing)
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# === Phase 7 additions per D-07 ===

# Mapbox SDK (@rnmapbox/maps@10.3.x — JNI bindings + reflection-based style loading)
-keep class com.mapbox.** { *; }
-keep interface com.mapbox.** { *; }
-dontwarn com.mapbox.**
# @rnmapbox/maps native bridge
-keep class com.rnmapbox.rnmbx.** { *; }
-keep interface com.rnmapbox.rnmbx.** { *; }
-dontwarn com.rnmapbox.rnmbx.**

# MMKV (react-native-mmkv@4.x — C++ JNI via JSI)
-keep class com.tencent.mmkv.** { *; }
# react-native-mmkv JSI bridge
-keep class com.mrousavy.mmkv.** { *; }

# expo-task-manager (background task scheduling)
# ⚠️ VERIFY: Confirm class path for Expo SDK 54
-keep class expo.modules.taskmanager.** { *; }
-keep class expo.modules.notifications.** { *; }
# Some Expo modules use reflection — broad keep for entire expo namespace is safer for closed beta:
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# Hermes JS engine + JNI
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.core.** { *; }
-keep class com.facebook.proguard.annotations.** { *; }
# DoNotStrip + KeepGettersAndSetters annotations (standard React Native)
-keepclasseswithmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keepclasseswithmembers class * {
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}

# expo-location (foreground service)
-keep class expo.modules.location.** { *; }
```

⚠️ **VERIFY:** Planner WebFetch:
- `https://github.com/rnmapbox/maps/blob/main/docs/install.md` — confirm if @rnmapbox/maps@10.3 ships its own `consumer-rules.pro` (would obviate the manual Mapbox keeps)
- `https://github.com/mrousavy/react-native-mmkv` — confirm `com.mrousavy.mmkv.**` is the right namespace for v4.x (was `com.reactnativecommunity.mmkv` in 3.x)
- `https://docs.expo.dev/versions/v54.0.0/sdk/task-manager/` — confirm class path

### Verification path

NOT via unit tests (R8 only runs on release builds; unit tests use dev JVM with no minification).

**Smoke verification sequence** (Plan 07-01 final task before pocket-walk):
1. `npx eas build --platform android --profile production --non-interactive` → wait for finish
2. `npx eas build:download --id <id> --output release.aab`
3. `bundletool build-apks --bundle=release.aab --output=release.apks --mode=universal` (extracts a universal APK from the .aab for sideload)
4. `bundletool install-apks --apks=release.apks` (installs to attached Pixel via adb)
5. Launch app. Smoke checklist:
   - App opens without crash (Hermes runtime survived R8)
   - Map renders + tiles load (Mapbox JNI survived)
   - Start a 30-second tracker session (expo-task-manager + expo-location survived)
   - MMKV reads/writes work (e.g., language preference persists across app restart)
   - Foreground service notification appears (expo-location + notification config survived)
6. Stop + Save. Check session appears in history.
7. Force-kill via `adb shell am kill com.runningecosystem.mobile` → relaunch → confirm `recoverLast()` restored partial session.

If any step fails → extend ProGuard keeps + rebuild. Iterate until smoke green.

---

## §5 — Foreground service notification config

**Confidence:** MEDIUM. expo-location plugin config schema has been the stable surface, but Expo SDK 54 may have introduced richer options.

### Static schema (app.json plugin config)

```jsonc
// apps/mobile-rn/app.json — Phase 7 EDIT to expo-location plugin
{
  "plugins": [
    [
      "expo-location",
      {
        "locationAlwaysAndWhenInUsePermission": "Нужно для трекинга пробежки в фоне, когда телефон в кармане или экран выключен.",
        "locationWhenInUsePermission": "Нужно для трекинга пробежки и отображения вашей позиции на карте.",
        "isIosBackgroundLocationEnabled": true,
        "isAndroidBackgroundLocationEnabled": true,
        "isAndroidForegroundServiceEnabled": true
        // ⚠️ VERIFY: Are notificationTitle / notificationBody supported here in SDK 54?
        // OR do we need expo-notifications plugin separately for dynamic content?
      }
    ]
  ]
}
```

### Dynamic content (D-12 requirement: "Запись пробежки активна — %duration% • %distance%")

This is the genuine gray area. expo-location's foreground service notification is **static-only** in SDK 53 (set once at startLocationUpdatesAsync); dynamic content requires either:

- **(A) Custom notification via `expo-notifications`** — call `Notifications.setNotificationChannelAsync` with `IMPORTANCE_LOW` (for non-intrusive ongoing); call `Notifications.scheduleNotificationAsync` (or `presentNotificationAsync`) on each tick. The system shows ONE notification (the most recent); each tick replaces the previous.
- **(B) Native Android module** — write a small Expo module that wraps `Service.startForeground()` directly with custom Builder; bypasses expo-location's notification layer. Higher effort; better control.
- **(C) Static text + frequent re-publish** — keep expo-location's startup notification as the persistent one ("Запись пробежки активна"); supplement with non-foreground updating notifications. Crude but works.

⚠️ **VERIFY:** Planner WebFetch `https://docs.expo.dev/versions/v54.0.0/sdk/location/` to determine SDK 54 support. **Likely-best path: (A)** — use `expo-notifications` channel + dynamic `presentNotificationAsync` on each SessionManager `recordingTick`. Pros: pure RN/TS; no native module work; integrates with existing tick. Cons: requires permission gate for `expo-notifications` (Android 13+ POST_NOTIFICATIONS permission).

### Notification content (RU per D-12)

```typescript
// apps/mobile-rn/src/foreground/notification.ts (NEW per Plan 07-03)
import * as Notifications from 'expo-notifications';

export async function updateForegroundNotification(duration: string, distance: string) {
  await Notifications.scheduleNotificationAsync({
    identifier: 'recording-status', // dedupes; replaces previous
    content: {
      title: 'Running Ecosystem',
      body: `Запись пробежки активна — ${duration} • ${distance}`,
      categoryIdentifier: 'recording',
      sticky: true,    // ongoing-notification flag (Android)
      autoDismiss: false,
      color: '#0F1419',
    },
    trigger: null, // present immediately
  });
}
```

### Icon

Use `app.json` `notification` block (existing Expo convention):

```jsonc
// apps/mobile-rn/app.json — Phase 7 EDIT (add notification block at root)
{
  "expo": {
    "notification": {
      "icon": "./assets/notification-icon.png",   // 96×96 white-on-transparent silhouette (Android-only convention)
      "color": "#0F1419",
      "androidMode": "default",
      "androidCollapsedTitle": "Running Ecosystem — запись"
    }
  }
}
```

⚠️ **VERIFY:** Asset `./assets/notification-icon.png` does NOT exist yet — Plan 07-03 must produce it (or reuse `adaptive-icon.png` foreground SVG converted to white-on-transparent PNG at 96×96).

---

## §6 — MIUI + One UI auto-start dialog

**Confidence:** MEDIUM. Intent names are stable but OEM behavior changes with each MIUI/One UI major version.

### OEM detection (already-available deps)

```typescript
// apps/mobile-rn/src/vendor/oem.ts (NEW per Plan 07-03)
import * as Device from 'expo-device';

export type Vendor = 'xiaomi' | 'samsung' | 'huawei' | 'generic';

export function detectVendor(): Vendor {
  const manufacturer = (Device.manufacturer || '').toLowerCase();
  if (manufacturer.includes('xiaomi') || manufacturer.includes('redmi') || manufacturer.includes('poco')) {
    return 'xiaomi';   // covers MIUI + HyperOS
  }
  if (manufacturer.includes('samsung')) {
    return 'samsung';  // One UI
  }
  if (manufacturer.includes('huawei') || manufacturer.includes('honor')) {
    return 'huawei';   // EMUI (deferred per CONTEXT D-17; "monitor in beta")
  }
  return 'generic';
}
```

⚠️ **VERIFY:** `expo-device.manufacturer` is the right field (vs `expo-device.brand`). Planner WebFetch `https://docs.expo.dev/versions/v54.0.0/sdk/device/`.

### Intent launching (expo-intent-launcher)

```typescript
// apps/mobile-rn/src/vendor/openOEMSettings.ts (NEW per Plan 07-03)
import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { detectVendor } from './oem';

const APP_PACKAGE = Application.applicationId ?? 'com.runningecosystem.mobile';

export async function openOEMAutoStartSettings(): Promise<{ launched: boolean; vendor: string }> {
  if (Platform.OS !== 'android') return { launched: false, vendor: 'ios' };
  const vendor = detectVendor();
  try {
    switch (vendor) {
      case 'xiaomi':
        // MIUI / HyperOS — App permissions editor with auto-start toggle
        await startActivityAsync('miui.intent.action.APP_PERM_EDITOR', {
          extra: { extra_pkgname: APP_PACKAGE },
        });
        return { launched: true, vendor };
      case 'samsung':
        // One UI — Device Care → Battery
        await startActivityAsync('com.samsung.android.sm.ACTION_BATTERY');
        return { launched: true, vendor };
      default:
        // Generic Android — app details page
        await startActivityAsync(ActivityAction.APPLICATION_DETAILS_SETTINGS, {
          data: `package:${APP_PACKAGE}`,
        });
        return { launched: true, vendor: 'generic' };
    }
  } catch (e) {
    // OEM intent unavailable on this device — fall back to generic
    await startActivityAsync(ActivityAction.APPLICATION_DETAILS_SETTINGS, {
      data: `package:${APP_PACKAGE}`,
    });
    return { launched: true, vendor: 'generic-fallback' };
  }
}
```

⚠️ **VERIFY:** Planner WebFetch `https://docs.expo.dev/versions/v54.0.0/sdk/intent-launcher/` to confirm `expo-intent-launcher` is still maintained for SDK 54 (was deprecated-then-revived in some versions). If deprecated: fall back to a small native module OR `Linking.openURL('package:com.runningecosystem.mobile')`.

### Dialog gate (MMKV-backed)

```typescript
// apps/mobile-rn/src/vendor/AutostartDialog.tsx (NEW per Plan 07-03)
import { storage } from '../state/mmkv'; // existing MMKV instance

const FLAG = 'vendorAutostartDialogShown';

export function shouldShowDialog(): boolean {
  const vendor = detectVendor();
  if (vendor === 'generic') return false;       // no OEM-specific work needed
  if (vendor === 'huawei') return false;        // deferred per CONTEXT D-17
  return !storage.getBoolean(FLAG);
}

export function markDialogShown(): void {
  storage.set(FLAG, true);
}
```

---

## §7 — `recoverLast()` adb-kill validation

**Confidence:** MEDIUM. adb force-kill behavior on foreground-service-attached processes has changed across Android 13/14/15. `am kill` is documented but not always destructive.

### Three adb commands to know

```bash
# (A) am kill — soft kill; respects foreground service grace period
adb shell am kill com.runningecosystem.mobile

# (B) am force-stop — hard kill; works like user-disabled-from-settings
adb shell am force-stop com.runningecosystem.mobile

# (C) am crash — simulates Application crash; closer to OOM-killer behavior
adb shell am crash com.runningecosystem.mobile
```

⚠️ **VERIFY:** Planner WebFetch Android developer docs to confirm which command best simulates "battery-saver killed the process while user wasn't looking." **Best guess:** `am force-stop` is closest to the OS-killed-while-backgrounded path that `recoverLast()` is designed to recover from. `am kill` may be a no-op if the foreground service holds the process alive (the entire point of using a foreground service).

### Validation sequence (Plan 07-03 Task N pre-pocket-walk)

```bash
# Setup: Pixel tethered via USB-debugging; release APK installed.
# 1. Start a session in the app; verify SessionManager.state = "recording".
# 2. After ~2 minutes of recording, force-kill via adb (tethered laptop):
adb shell am force-stop com.runningecosystem.mobile
# 3. Wait 5 seconds. App is dead. Foreground notification should disappear.
# 4. Re-launch app (tap icon on phone). Should land on home screen.
# 5. Verify recoverLast() triggered:
#    - Either auto-restored session (app navigates back to TrackerScreen)
#    - Or "Restore last session?" prompt appears
# 6. Confirm GPS points captured 0-2min are intact (SessionManager.session.points.length > 0).
# 7. Continue recording for another 5min to verify state machine resumed cleanly.
```

### Why this matters for pocket-walk

The 1h pocket-walk (Plan 07-03 final task) includes a **mid-walk kill** at the 30-min mark. Carrying a tethered laptop on a 1h walk is awkward but cheap insurance. Alternative: pre-walk kill test in a controlled environment, then walk without tether — but loses the "real battery-saver kill" verification. CONTEXT D-18 says "force-kill via adb at minute 30," so the tethered-walk pattern is the plan. Cable management: USB-C cable + laptop in a backpack works.

---

## §8 — GitHub Actions workflow scaffold

**Confidence:** HIGH on overall shape; MEDIUM on EAS action versioning.

```yaml
# .github/workflows/android-release.yml — NEW per Plan 07-01
name: Android release build

on:
  push:
    tags:
      - 'v1.0.0-beta.*'
      - 'v1.0.0-rc.*'

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30   # EAS Cloud queue + submission only; build runs remote
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'apps/mobile-rn/package-lock.json'

      - name: Setup Java   # required by `expo prebuild` even though build runs in EAS Cloud
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Install SOPS + yq
        run: |
          curl -sL https://github.com/getsops/sops/releases/download/v3.13.1/sops-v3.13.1.linux.amd64 -o /usr/local/bin/sops
          chmod +x /usr/local/bin/sops
          # ⚠️ VERIFY: pin to 3.13.1 OR latest depending on which is canonical Mar 2026
          curl -sL https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -o /usr/local/bin/yq
          chmod +x /usr/local/bin/yq

      - name: Restore SOPS age key
        env:
          SOPS_AGE_KEY_CI: ${{ secrets.SOPS_AGE_KEY_CI }}
        run: |
          mkdir -p ~/.config/sops/age
          echo "$SOPS_AGE_KEY_CI" > ~/.config/sops/age/keys.txt
          chmod 600 ~/.config/sops/age/keys.txt

      - name: Decrypt mobile signing bundle
        run: |
          sops -d .secrets/prod/mobile-signing.yaml > /tmp/mobile-signing.yaml
          yq -r '.android.keystore_base64' /tmp/mobile-signing.yaml | base64 -d > apps/mobile-rn/android/app/release.keystore
          chmod 600 apps/mobile-rn/android/app/release.keystore
          {
            echo "RUNNING_ECO_RELEASE_STORE_PASSWORD=$(yq -r '.android.keystore_password' /tmp/mobile-signing.yaml)"
            echo "RUNNING_ECO_RELEASE_KEY_PASSWORD=$(yq -r '.android.key_password' /tmp/mobile-signing.yaml)"
            echo "RUNNING_ECO_RELEASE_KEY_ALIAS=$(yq -r '.android.key_alias' /tmp/mobile-signing.yaml)"
          } >> "$GITHUB_ENV"
          rm -f /tmp/mobile-signing.yaml

      - name: Install dependencies
        working-directory: apps/mobile-rn
        run: npm ci

      - name: Setup EAS
        uses: expo/expo-github-action@v8
        # ⚠️ VERIFY: v8 may have been superseded by v9 or v10 by 2026-05
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Trigger EAS build
        working-directory: apps/mobile-rn
        env:
          # Forward keystore env vars to eas build subprocess
          RUNNING_ECO_RELEASE_STORE_FILE: release.keystore
          RUNNING_ECO_RELEASE_STORE_PASSWORD: ${{ env.RUNNING_ECO_RELEASE_STORE_PASSWORD }}
          RUNNING_ECO_RELEASE_KEY_PASSWORD: ${{ env.RUNNING_ECO_RELEASE_KEY_PASSWORD }}
          RUNNING_ECO_RELEASE_KEY_ALIAS: ${{ env.RUNNING_ECO_RELEASE_KEY_ALIAS }}
        run: |
          npx eas build \
            --platform android \
            --profile production \
            --non-interactive \
            --no-wait \
            --message "Phase 7 release — ${GITHUB_REF_NAME}"
```

⚠️ **VERIFY:** Planner WebFetch `https://github.com/expo/expo-github-action` to confirm current major version (v8 / v9 / v10 — Expo bumps it ~yearly).

### Workflow validation (Plan 07-01 task)

After committing the workflow + tagging:
```bash
git tag v1.0.0-beta.0   # smoke tag; not the actual release
git push origin v1.0.0-beta.0
# Watch: https://github.com/IsmailL01/sport/actions
# Expected: workflow runs to completion in 5-10 min; EAS dashboard shows build queued
gh run watch
```

If EAS dashboard shows "Build queued" or "Building" within 5 min of workflow start → Phase 7 CI plumbing PASSES. Delete the smoke tag after verification:
```bash
git tag -d v1.0.0-beta.0
git push origin :refs/tags/v1.0.0-beta.0
```

---

## §9 — Pitfalls + mitigations

| # | Pitfall | Mitigation |
|---|---|---|
| 1 | EAS Cloud build fails LATE (~10 min queue + 5 min Java setup) if env vars missing from `eas.json` | Plan 07-01 Wave 0 includes `eas build --platform android --profile production --non-interactive --no-wait` dry-run as smoke before tagging anything |
| 2 | `am kill` doesn't actually kill foreground-service-attached process on Android 14+ | Use `am force-stop` per §7; verify in pre-walk smoke before relying on it in pocket-walk |
| 3 | Mapbox style URLs referenced via computed paths (vs string literals) can be stripped by R8 | Plan 07-01 R8 smoke checklist includes "map renders + tiles load" step — surfaces this immediately |
| 4 | `expo-task-manager` background task >30s timeout on Android | SessionManager's `recordingTick` is interval-based (every 5s), each tick is sub-1s; no risk |
| 5 | Notification icon must be `drawable` (vector) or PNG with NO transparency on some OEMs (One UI 5+ specifically) | D-12 icon = white-on-transparent PNG 96×96; test on a Samsung device during pocket-walk if available, OR document as known-issue if only Pixel available |
| 6 | `versionName` from `git describe` returns nothing on non-tag pushes | Workflow only triggers on tag pushes (per §8 trigger); non-tag pushes don't run this workflow |
| 7 | GH Actions `EXPO_TOKEN` with wrong scope (org vs personal) → build but no submit | Solo dev = personal account; generate token at `https://expo.dev/accounts/<user>/settings/access-tokens` |
| 8 | First `eas build` after EAS schema change (new SDK) may rebuild iOS profile reflexively even if we only target Android | `--platform android` flag is explicit; EAS will not touch iOS profile if not invoked |
| 9 | `enableMinifyInReleaseBuilds=true` enabled WITHOUT the right keeps → first release build crashes at startup | Plan 07-01 task order: extend ProGuard keeps FIRST, flip flag SECOND, smoke immediately. Don't tag v1.0.0-beta.1 until smoke green |
| 10 | OEM intent unavailable on a tester's device → app crashes when dialog deep-link tapped | Wrap intent launch in try/catch (per §6 code); fall back to generic `APPLICATION_DETAILS_SETTINGS` |
| 11 | `sops updatekeys` fails silently if recipient YAML format is wrong (e.g., missing `>-` folded scalar) | Plan 07-01 Wave 0 verifies via post-`updatekeys` decrypt against BOTH recipients separately |
| 12 | `apps/mobile-rn/android/app/release.keystore` accidentally committed via incomplete `.gitignore` | Plan 07-01 Wave 0 adds `apps/mobile-rn/android/app/release.keystore` + `apps/mobile-rn/credentials.json` to `.gitignore` BEFORE first CI run |

---

## §10 — Validation Architecture

> Consumed by Nyquist VALIDATION.md template (orchestrator writes the file from this).

### Test framework

| Property | Value |
|---|---|
| **Framework** | Existing Jest (RN) for unit tests + bash smoke scripts for build/install/foreground-service + USER ACTION 1h pocket-walk |
| **Quick run** | `cd apps/mobile-rn && npm test` (~30s, runs SessionManager.test.ts + gapResume.test.ts + other existing tests) |
| **Full suite** | `npm test` + signed-release-APK device smoke + 5-min recording validation (~20 min total) |
| **Pre-walk gate** | All 7 R8 smoke checks PASS on a real Pixel before the 1h pocket-walk begins |

### Per-task verification map

Filled by Plan 07-01 + 07-03 planners. Pattern:
- **07-01-N (auto):** `eas.json` schema valid (`npx eas build --check`); CI workflow syntax valid (`gh workflow view`); SOPS recipients lift CI key (`sops updatekeys` + dual-decrypt test); ProGuard rules file passes Gradle linting; first release-build APK installs on Pixel + survives 7 R8 smoke checks
- **07-03-N (auto):** Foreground service notification renders RU text + updates duration/distance every 5s; OEM dialog appears once on first TrackerStartScreen entry; `recoverLast()` restores from adb force-stop mid-session
- **07-03-FINAL (USER ACTION):** 1h Pixel pocket-walk PASSES per CONTEXT D-18 5-sub-check matrix

### Wave 0 (per Plan 07-01 Task 0)

- [ ] `apps/mobile-rn/android/app/release.keystore` + `apps/mobile-rn/credentials.json` added to `.gitignore`
- [ ] `evidence/` directory created at `.planning/phases/07-release-builds-mobile-stability/evidence/`
- [ ] Smoke scripts stubbed: `smoke-eas-config.sh`, `smoke-proguard-rules.sh`, `smoke-sops-multi-recipient.sh`, `smoke-foreground-notif.sh`, `smoke-oem-dialog.sh`, `smoke-recoverLast.sh`, `smoke-pocket-walk-pre.sh`
- [ ] Tool versions captured: `node --version`, `npm --version`, `npx eas --version`, `sops --version`, `gh --version`, `adb --version`, `bundletool` availability

---

## §11 — Open questions for planner

Planner should resolve in-plan, NOT escalate back to discuss-phase (per autonomous-mode posture):

1. **Path A vs Path B for keystore injection (§0 + §1):** Recommend Path A (existing build.gradle `RUNNING_ECO_RELEASE_*` Gradle properties); planner WebFetches `https://docs.expo.dev/app-signing/local-credentials/` to confirm 2026 schema supports it.
2. **Dynamic foreground notification path (§5):** Recommend (A) — expo-notifications channel + per-tick presentNotificationAsync. Planner WebFetches SDK 54 docs to confirm channel pattern + Android 13+ POST_NOTIFICATIONS permission flow.
3. **adb kill semantics (§7):** Recommend `am force-stop` over `am kill`. Planner WebFetches Android developer docs to confirm 2026 behavior on Android 14/15.
4. **`expo-github-action` version pin (§8):** Recommend latest stable. Planner WebFetches GitHub repo for current version.
5. **MMKV namespace for ProGuard (§4):** Recommend `com.mrousavy.mmkv.**` (v4+). Planner verifies against actual class names in the installed package.
6. **`notification-icon.png` asset creation (§5):** Plan 07-03 Task X creates this — 96×96 white silhouette of running figure. Source from existing `adaptive-icon.png` foreground or commission new asset; either way, asset path = `apps/mobile-rn/assets/notification-icon.png`.
7. **USB-tether for mid-walk adb kill (§7):** Confirms with user during Plan 07-03 dispatch — bring a laptop on the walk? OR do the kill-test separately + walk hands-free?
8. **Foreground service notification icon platform compatibility (§9 Pitfall 5):** Plan 07-03 acceptance criterion notes "test on Samsung if available, document as known-issue if Pixel-only" — surface known-incomplete validation in 07-03-SUMMARY.

---

## §12 — Confidence summary

| Section | Confidence | Verify before merge? |
|---|---|---|
| §0 Runtime State Inventory | HIGH (direct file scout) | No |
| §1 EAS Cloud build pipeline | MEDIUM | YES — schema may have drifted |
| §2 SOPS multi-recipient | HIGH (SOPS stable since 3.7+) | No |
| §3 arm64-v8a ABI filter | HIGH | No |
| §4 R8 + ProGuard keeps | MEDIUM (Mapbox/Hermes HIGH; MMKV/expo MEDIUM) | YES — confirm package class paths |
| §5 Foreground notification | MEDIUM-LOW | YES — Expo SDK 54 notification API |
| §6 OEM auto-start dialog | MEDIUM | YES — expo-intent-launcher availability |
| §7 adb force-kill | MEDIUM | YES — Android 14+ foreground-service-kill semantics |
| §8 GitHub Actions workflow | MEDIUM | YES — expo-github-action version pin |
| §9 Pitfalls | HIGH (most cross-referenced) | Spot-check during planning |
| §10 Validation Architecture | HIGH | No |
| §11 Open Q for planner | n/a (it's a TODO list) | n/a |

**Net:** Planner should WebFetch 4-6 targeted URLs during plan generation (vs the 30+ fetches the failed researcher attempted). Each fetch resolves ONE of the §11 open questions; rest of the research is solid enough to plan against.

---

*Phase: 7-release-builds-mobile-stability*
*Research compiled: 2026-05-21 (orchestrator inline; researcher agent timed out)*
*Lines: ~280*
*Confidence: HIGH on overall flow; MEDIUM on Expo SDK 54-specific syntax (8 ⚠️ VERIFY markers for planner WebFetch)*
