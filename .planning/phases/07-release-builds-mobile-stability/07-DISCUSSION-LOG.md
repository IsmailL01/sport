# Phase 7: Release builds + mobile stability - Discussion Log

**Date:** 2026-05-21
**Mode:** Autonomous (per standing memory `feedback_autonomous_discuss_mode` — no AskUserQuestion; orchestrator selected recommended defaults from prior-phase patterns + closed-beta lean scope per ADR-0011 + 3 amendments).

> Audit trail for human review. Not consumed by downstream agents — see `07-CONTEXT.md` for the canonical decisions.

---

## Gray areas identified

Phase 7 has 6 broad implementation-decision clusters. None re-asked of the user — each resolved by mapping to existing prior-phase patterns or applying the closed-beta lean principle.

### Cluster 1 — Build pipeline architecture (EAS Cloud vs local)

**Q1: EAS Cloud or `eas build --local`?**
- Options considered:
  - (a) EAS Cloud (Expo's macOS workers; ~10 min/build; keystore travels to their containers at build time)
  - (b) `eas build --local` (on dev workstation; ~25 min/build; requires Java/Gradle/Android-SDK locally; keystore never leaves the machine)
- Selected: **(a) EAS Cloud** — D-02
- Why: Amendment 4 PM established that keystore-loss blast radius for closed beta = ~30 min recovery. Acceptable to let EAS Cloud see the keystore at build time (does NOT mean EAS-managed credentials per D-03). EAS Cloud trades 15 min of build time for not having to maintain a local Android SDK + JDK + Gradle environment. Net win for closed-beta velocity.

**Q2: Credential source — EAS-managed (persistent in Expo cloud) vs local file injection?**
- Options considered:
  - (a) `eas credentials:configure-build` uploads keystore to Expo once; EAS Cloud uses it on every build
  - (b) `credentialsSource: "local"` in eas.json; GitHub Actions writes `credentials.json` from SOPS at each CI run
  - (c) Hybrid — local for CI, EAS-managed as fallback
- Selected: **(b) local file injection** — D-03
- Why: matches Phase 4 D-04-04-A "no vendor lock-in" + Phase 6 D-10 "self-managed credentials" + Phase 2 D-01 "age over cloud KMS" — consistent project principle. The keystore stays in SOPS as single source of truth; CI hydrates it just-in-time. EAS-managed = vendor dependency on Expo's continued availability. Trade-off: each CI run takes ~5 seconds longer to do the SOPS decrypt. Acceptable.

### Cluster 2 — CI age key activation (D-14 deferral lift)

**Q3: How does GitHub Actions decrypt `.secrets/prod/mobile-signing.yaml`?**
- Options considered:
  - (a) Add solo-dev's age key as a GitHub Actions secret (same key for dev + CI)
  - (b) Generate a SECOND age key specifically for CI; add as recipient to `.sops.yaml`; `sops updatekeys`; store new private key in GH Actions secret
  - (c) Use age-keygen with passphrase-protected key + store passphrase as GH secret (extra hop)
- Selected: **(b) separate CI age key** — D-04
- Why: principle of least privilege + ease of rotation. If GitHub Actions credentials leak, revoke ONLY the CI key (remove from `.sops.yaml` recipients + `sops updatekeys`); solo-dev workflow unaffected. Sharing the dev key (a) couples revocation to a workstation re-encryption. Passphrase wrapping (c) adds complexity for no marginal security on a CI-only key.

**Q4: Where does CI age private key live?**
- Selected: **GitHub Actions repository secret `SOPS_AGE_KEY_CI`** — D-04
- Why: standard GH Actions secret storage; encrypted at rest in GitHub infra; injected as env var at workflow run time; never written to disk on the runner (`mktemp` for the `keys.txt` file in workflow, then SOPS reads it via `SOPS_AGE_KEY_FILE`).

### Cluster 3 — Android build config (ABI + ProGuard + minify)

**Q5: ABI filter — arm64-v8a only, or include armeabi-v7a for compat?**
- Options considered: arm64 only / dual / dual + x86_64 (emulator)
- Selected: **arm64-v8a only** — D-05
- Why: ADR-0011 lean scope explicitly drops `armeabi-v7a`; closed-beta testers all on flagship Android (Pixel 6+, Galaxy S20+, etc.) which are arm64. APK size halves (Mapbox SDK ~30 MB per ABI). 32-bit re-add to v1.0.1 backlog if a tester surfaces a budget-device case.

**Q6: R8 minification — enable for release or stay off?**
- Selected: **enable** — D-06
- Why: ROADMAP Phase 7 success criterion 2 explicitly requires "R8 + ProGuard rules verified". Existing build.gradle already has the property gate; just flip `gradle.properties`. The ProGuard keep set (D-07) protects the JNI bindings that R8 would otherwise strip.

**Q7: ProGuard keep set — what to whitelist?**
- Options considered: full per-class enumeration vs library-wildcard vs minimal "trust the libs to ship consumer-rules"
- Selected: **library-wildcard for verified deps only** — D-07: Mapbox, MMKV, expo-task-manager, Hermes. Drop placeholder for react-native-health-connect (not installed).
- Why: each dep in the keep set has either reflection-based bindings (Mapbox), C++ JNI (MMKV), background task scheduling (expo-task-manager), or runtime introspection (Hermes) that R8 conservatively over-strips. Wildcard keeps avoid the brittleness of per-class enumeration. Verification (D-08) is via smoke test on a real device, not unit tests.

**Q8: How to verify ProGuard didn't strip anything load-bearing?**
- Options considered:
  - (a) Unit tests (impossible — R8 only runs on release builds; unit tests run on dev JVM)
  - (b) Smoke test on real device after first signed release APK built
  - (c) Trust ProGuard rules + ship blind
- Selected: **(b) device smoke** — D-08
- Why: only authentic verification path. Plan 07-01 task acceptance = "install signed APK on Pixel → open map → start session → foreground service notification visible → stop + save → no crashes". If any step fails, extend keeps + rebuild. Iterate until smoke green. Then 07-03 takes the validated build to the 1h pocket-walk.

### Cluster 4 — Foreground service UX

**Q9: Foreground service notification — minimal or richly informative?**
- Options considered:
  - (a) Minimal "Recording…" + app name
  - (b) Dynamic content showing duration + distance + state (Active/Paused)
  - (c) Rich custom layout with notification actions (Pause, Stop)
- Selected: **(b) dynamic content** — D-12
- Why: closed-beta testers running 30+ min sessions need to see at-a-glance that recording is alive. "Запись пробежки активна — 12:34 • 1.8 km" tells them the service is healthy + how far/long they've been running. Notification actions (c) require dedicated PendingIntent + BroadcastReceiver setup — over-engineering for closed beta; OEM lockscreen UIs render action buttons inconsistently anyway.

**Q10: Notification update interval — every tick or coarse?**
- Selected: **every 5 seconds** — D-13
- Why: matches existing SessionManager `recordingTick`. Reusing the existing tick = no new background timer; just a side-effect on each tick. 5s granularity is enough for testers to see the duration/distance update without battery drain from notification churn.

### Cluster 5 — Vendor-killer mitigations (MIUI + One UI)

**Q11: When to show the auto-start permission dialog?**
- Options considered:
  - (a) On app first launch (before any tracker action)
  - (b) On first TrackerStartScreen entry per install
  - (c) On every TrackerStartScreen entry
  - (d) Only after detecting an OS-kill (`recoverLast()` fires)
- Selected: **(b) first TrackerStartScreen entry, gated by MMKV flag, dismissible** — D-14
- Why: (a) shows it to users who don't care about tracking yet; annoying. (c) is hostile. (d) is reactive — by the time `recoverLast` fires, the user has already lost a session — too late. (b) is the just-in-time pattern: user is about to start recording = relevant moment to surface the permission ask.

**Q12: Which OEMs to mitigate?**
- Options considered:
  - (a) MIUI + One UI only (per ADR-0011 lean STAB-01)
  - (b) MIUI + HyperOS + EMUI + One UI (old Phase 16 D-style 4-vendor matrix)
  - (c) Generic Android only (no OEM-specific deep links)
- Selected: **(a) MIUI + One UI only** — D-14 + D-17
- Why: ADR-0011 lean STAB-01 explicitly scopes to MIUI + One UI. HyperOS = Xiaomi's MIUI rebrand for newer devices (probably resolved by the MIUI intent fallback chain anyway). EMUI = Huawei; few global users; deferred to beta-monitored. Generic Android (c) leaves Xiaomi/Samsung testers exposed.

**Q13: `recoverLast()` implementation — code in Phase 7 or already exists?**
- Selected: **already exists in pre-v1.0 baseline** — D-15
- Why: `SessionManager.recoverLast()` is in `apps/mobile-rn/src/domain/session/SessionManager.ts` with unit tests in `SessionManager.test.ts` and `gapResume.test.ts` (confirmed by scout). Phase 7 ADDS a release-build validation step (force-kill via adb mid-session + relaunch + verify restoration). Does NOT reimplement.

### Cluster 6 — 1-hour Pixel pocket-walk acceptance

**Q14: What's the acceptance threshold for pocket-walk?**
- Options considered:
  - (a) Pass/fail on "any GPS data captured"
  - (b) ≥95% of expected points (per ROADMAP §"Phase 7" success criterion 7)
  - (c) ≥99% (stricter)
  - (d) Per-band tolerance (95% in open sky, 80% in urban canyons, etc.)
- Selected: **(b) ≥95% of expected** — D-18
- Why: ROADMAP wording. 95% accounts for GPS gaps under buildings/trees + adaptive sampling stretching intervals during low-power events. 99% (c) is unrealistic without a chest-mount; per-band tolerance (d) requires field-test scaffolding old Phase 16 had, which is deferred.

**Q15: What to verify beyond GPS point count?**
- Selected: **5 sub-checks** — D-18
- 1. GPS point count ≥95% of expected (~1710 of ~1800)
- 2. Foreground service notification visible at end of walk
- 3. Battery drain <15% over the hour
- 4. `recoverLast()` triggered mid-walk + restored cleanly
- 5. Map render works on the recorded track (release-APK Mapbox smoke)

**Q16: How is pocket-walk gated for Phase 8/9?**
- Selected: **load-bearing acceptance** — D-19
- Why: if pocket-walk fails any sub-check → Plan 07-03 does NOT close → Phase 8/9 do not run. The whole closed-beta program assumes background recording works; surfacing a failure at Phase 9 launch is too late.

---

## Deferred ideas (captured for future phases)

- iOS portion of EAS profile + Hermes-on-iOS + bitcode + iOS SLC + iPhone pocket-walk → ADR-0011 Amendment 3
- 4-vendor matrix expansion (HyperOS / EMUI / generic Doze / low-end memory) → v1.0.1 backlog `STAB-02-VENDOR-MATRIX`
- Reproducible-build byte-identical verification → dropped per ADR-0011
- Mapbox SDK 11.x migration → dropped per ADR-0011
- `armeabi-v7a` ABI re-add → v1.0.1 backlog if beta tester surfaces 32-bit device
- EAS managed credentials as v1.0.1 fallback → if local credential injection proves flaky in CI

---

## Scope creep blocked

- None — discussion stayed entirely within "ship a production Android APK + verify it works on a real device" boundary. Backend (deferred to Phase 7 NO TOUCHES per workstream scope), distribution (Phase 8), tester invites (Phase 9), iOS arm (Amendment 3) all explicitly out of scope.

---

*Audit trail only — see `07-CONTEXT.md` for the canonical decisions consumed by gsd-phase-researcher + gsd-planner.*
