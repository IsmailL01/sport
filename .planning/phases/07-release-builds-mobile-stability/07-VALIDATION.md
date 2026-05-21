---
phase: 07
slug: release-builds-mobile-stability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 07 — Validation Strategy

> **Phase 7 is mobile-build + device-smoke + 1h pocket-walk USER ACTION.** Existing Jest unit tests cover SessionManager + gapResume (pre-v1.0 baseline). Phase 7 validation = `npm test` (existing tests survive) + signed-release-APK device smoke (7 R8 checks) + USER ACTION 1h Pixel pocket-walk (5-sub-check matrix per CONTEXT D-18). See `07-RESEARCH.md §10` for the full rationale.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Existing **Jest (RN)** for unit tests + **bash smoke scripts** for build/install/foreground-service + **USER ACTION 1h pocket-walk** for stability |
| **Config file** | `apps/mobile-rn/jest.config.js` (existing; no Phase 7 changes) |
| **Quick run command** | `cd apps/mobile-rn && npm test` (~30s, runs SessionManager + gapResume + other existing tests; verifies pre-v1.0 baseline survives any Phase 7 edits) |
| **Full suite command** | `npm test` + bash smoke scripts in `evidence/` + signed-release-APK install on Pixel + 5-min recording smoke (~20 min total) |
| **Pre-walk gate** | All 7 R8 smoke checks PASS on a real Pixel BEFORE the 1h pocket-walk begins |
| **Estimated runtime** | ~30s (unit) + ~5min (build smokes) + 60min (pocket-walk USER ACTION) |

---

## Sampling Rate

- **After every Plan 07-01 task commit:** Run `cd apps/mobile-rn && npm test` (existing tests must stay green; any breakage = halt + investigate)
- **After Plan 07-01 closes (CI workflow runs first build):** Run the 7-step R8 device smoke checklist on a tethered Pixel (per `07-RESEARCH.md §4` verification path)
- **After Plan 07-03 Task N (just before pocket-walk):** Pre-walk smoke — confirm OEM dialog + foreground notification + adb force-stop recoverLast all work in controlled conditions (10 min)
- **Plan 07-03 final task (USER ACTION):** 1h Pixel pocket-walk per CONTEXT D-18 5-sub-check matrix
- **Max feedback latency:** ~30 seconds per code task commit; ~5 min per build smoke; pocket-walk is the load-bearing gate (60 min)

---

## Per-Task Verification Map

> Plans 07-01 + 07-03 do not exist yet. Planner populates this table during plan generation; each task gets a row mapping its acceptance criterion to a smoke command or test. Pattern:

| Task ID | Plan | Wave | Requirement | Smoke Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------------|-----------|-------------------|-------------|--------|
| 07-01-00 | 01 | 0 | BUILD-01 | Wave 0 prereqs — `.gitignore` updated for keystore + credentials.json; `evidence/` dir + smoke stubs created; tool versions captured | smoke | `bash evidence/smoke-wave0.sh` | ❌ W0 | ⬜ pending |
| 07-01-01 | 01 | 1 | BUILD-01 | CI age key generated; `.sops.yaml` recipient added; `sops updatekeys .secrets/prod/mobile-signing.yaml` succeeds; dual-decrypt (dev + CI key) round-trips clean | smoke | `bash evidence/smoke-sops-multi-recipient.sh` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | BUILD-01 | `apps/mobile-rn/eas.json` production.android has `env` block + `buildType: app-bundle` + (optionally) `credentialsSource`; `npx eas build:configure --check` clean | smoke | `bash evidence/smoke-eas-config.sh` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | BUILD-01 | `apps/mobile-rn/android/gradle.properties` has `enableMinifyInReleaseBuilds=true` + `android.enableShrinkResourcesInReleaseBuilds=true` + `reactNativeArchitectures=arm64-v8a`; `build.gradle` has `defaultConfig.ndk.abiFilters "arm64-v8a"` | smoke | `bash evidence/smoke-gradle-config.sh` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | BUILD-01 | `proguard-rules.pro` extended with Mapbox + MMKV + expo-task-manager + Hermes keeps per RESEARCH §4; existing reanimated keeps preserved | smoke | `grep` patterns for required keep classes in `evidence/smoke-proguard-rules.sh` | ❌ W0 | ⬜ pending |
| 07-01-05 | 01 | 1 | BUILD-01 | `.github/workflows/android-release.yml` exists; `gh workflow view android-release.yml` exit 0; YAML schema valid (workflow appears in GitHub Actions UI) | smoke | `gh workflow view android-release.yml` | ❌ W0 | ⬜ pending |
| 07-01-06 | 01 | 1 | BUILD-01 | First EAS Cloud build triggered via smoke tag (e.g., `v1.0.0-beta.0`); EAS dashboard shows build queued/running within 5min; build finishes successfully (~10-15 min); .aab artifact downloadable via `eas build:download` | manual smoke | `gh run watch && npx eas build:list --limit 1 --json` then USER confirms .aab download | ❌ W0 | ⬜ pending |
| 07-01-07 | 01 | 1 | BUILD-01 | 7-step R8 device smoke (per RESEARCH §4 verification path) passes on tethered Pixel: app opens + map renders + 30s session + MMKV persists + foreground notif visible + Stop+Save + `am force-stop` + relaunch + recoverLast restored | manual | USER ACTION attestation in 07-01-SUMMARY §"R8 smoke attestation" | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 2 | STAB-01 | `notification-icon.png` (96×96 white silhouette) exists at `apps/mobile-rn/assets/`; `app.json` `notification` block references it + brand color `#0F1419` | smoke | `bash evidence/smoke-notif-icon-asset.sh` | ❌ W0 | ⬜ pending |
| 07-03-02 | 03 | 2 | STAB-01 | Foreground service notification rendered with RU text "Запись пробежки активна — %duration% • %distance%"; updates every 5s via existing SessionManager recordingTick subscription | manual | USER confirms via tethered Pixel screenshot at 0:00, 0:30, 1:30, 2:30 of test session | ❌ W0 | ⬜ pending |
| 07-03-03 | 03 | 2 | STAB-01 | OEM detection works on tethered Pixel (`detectVendor()` returns `'generic'` since Pixel = pure Android); generic fallback intent launches Settings → App details correctly | smoke | `bash evidence/smoke-oem-dialog.sh` (calls openOEMAutoStartSettings programmatically + checks Activity launched) | ❌ W0 | ⬜ pending |
| 07-03-04 | 03 | 2 | STAB-01 | MMKV flag `vendorAutostartDialogShown` toggles from `false` → `true` after first dialog dismissal; survives app restart | smoke | unit test in `apps/mobile-rn/src/vendor/__tests__/AutostartDialog.test.ts` (new) | ❌ W0 | ⬜ pending |
| 07-03-05 | 03 | 2 | STAB-01 | `recoverLast()` validation — pre-walk controlled test: 2-min recording → `adb shell am force-stop com.runningecosystem.mobile` → relaunch → SessionManager.recoverLast() restores session state + 0-2min points intact | manual | USER attestation in 07-03-SUMMARY §"recoverLast pre-walk attestation" + screenshot of restored session | ❌ W0 | ⬜ pending |
| 07-03-06 | 03 | 2 | STAB-01 | **USER ACTION — 1h Pixel pocket-walk** — per CONTEXT D-18 5-sub-check matrix: ≥95% expected GPS points (~1710+ of ~1800); foreground notif visible at end; battery <15% drain; mid-walk `am force-stop` survived via recoverLast; map renders post-walk on the recorded track | manual | 5-row USER attestation in 07-03-SUMMARY §"Pocket-walk attestation" + GPX export attached to evidence/ | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · 🛑 deferred*

---

## Wave 0 Requirements

Wave 0 = environment prerequisites before Plan 07-01 / 07-03 tasks can execute. Per `07-RESEARCH.md §10`:

- [ ] `.planning/phases/07-release-builds-mobile-stability/evidence/` directory created
- [ ] `apps/mobile-rn/android/app/release.keystore` added to `.gitignore` (NEW entry; not previously gitignored since the file doesn't exist yet)
- [ ] `apps/mobile-rn/credentials.json` added to `.gitignore` (NEW entry; defensive — even if Path A is chosen and credentials.json is never written, gitignore guards against accidental commit)
- [ ] Stub smoke scripts created (7 bash scripts per the per-task verification map above)
- [ ] Tool versions captured to `evidence/tool-versions.txt`: `node` ≥20, `npm` ≥10, `npx eas --version` ≥latest, `sops` ≥3.13, `yq` ≥4, `gh` (GitHub CLI), `adb` (Android Platform Tools), `bundletool` (for .aab → .apks extraction)
- [ ] EXPO_TOKEN generated by user at `https://expo.dev/accounts/<user>/settings/access-tokens` and stored as GitHub Actions secret (USER ACTION at Wave 0)
- [ ] SOPS_AGE_KEY_CI generated via `age-keygen` on RAM disk (per RESEARCH §2) and stored as GitHub Actions secret (USER ACTION at Wave 0)

*If any Wave 0 prereq fails, Plan 07-01 cannot proceed — halt and resolve before Wave 1 dispatch.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| EXPO_TOKEN generation via Expo dashboard | BUILD-01 | Browser-based; cannot be automated; one-time per dev account | User visits `https://expo.dev/accounts/<user>/settings/access-tokens` → Create token → push as `EXPO_TOKEN` GitHub Actions secret |
| SOPS_AGE_KEY_CI generation on RAM disk | BUILD-01 | Requires `hdiutil` + `age-keygen` + secure paste-to-GitHub-secrets flow; mostly automatable but the "paste to GH secret" step is browser-based | User runs the RAM-disk + age-keygen + read-private-key sequence per RESEARCH §2; pastes to GitHub Actions secret `SOPS_AGE_KEY_CI` |
| First EAS Cloud build via smoke tag | BUILD-01 | Tag push triggers CI; workflow runs; EAS Cloud schedules build (~10-15 min wall-clock); user must visit EAS dashboard to confirm .aab artifact appears | USER tags `v1.0.0-beta.0`, pushes, watches `gh run watch` + EAS dashboard; confirms .aab downloadable; deletes smoke tag |
| 7-step R8 device smoke on tethered Pixel | BUILD-01 | Requires physical Pixel + adb + manual UI exercise (open map, start session, etc.); cannot be automated | USER runs the 7-step sequence per RESEARCH §4 verification path; attests each step in 07-01-SUMMARY |
| OEM dialog appears + deep-link works | STAB-01 | Requires actual OEM device OR Pixel-as-fallback; visual confirmation; user must tap dialog button to verify intent launches | USER confirms during pre-walk smoke (tethered laptop screenshots) |
| Foreground service notification dynamic content updates every 5s | STAB-01 | Visual confirmation on phone screen; cannot be automated reliably | USER screenshots phone at 0:00, 0:30, 1:30, 2:30 of test session; embeds in 07-03-SUMMARY |
| 1h Pixel pocket-walk 5-sub-check pass | STAB-01 | Cannot be automated — agent cannot walk for an hour with a phone in pocket | USER walks 1h with tethered laptop in backpack; mid-walk `adb shell am force-stop` at 30-min mark; attests 5 sub-checks in 07-03-SUMMARY |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (smoke command) or `<manual>` USER ACTION marker
- [ ] Sampling continuity: no 3 consecutive tasks without smoke verify (Phase 7 has ~14 tasks total across 2 plans — should be easy)
- [ ] Wave 0 covers all MISSING references (`.gitignore` entries, smoke stubs, EXPO_TOKEN, SOPS_AGE_KEY_CI)
- [ ] No watch-mode flags (this is mobile build + device smoke; no test runner watch)
- [ ] Feedback latency: ~30s (unit), ~5min (build smoke), 60min (pocket-walk gate)
- [ ] `nyquist_compliant: true` set in frontmatter — flipped by planner once plans are written + smoke scripts exist
- [ ] Pre-walk smoke MUST pass before 1h pocket-walk begins (load-bearing gate)

**Approval:** pending (planner writes plans → fills in remaining smoke commands → flips compliant flag)
