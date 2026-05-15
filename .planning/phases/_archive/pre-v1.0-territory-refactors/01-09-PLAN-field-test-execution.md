---
phase: 01-validate-close-territory-core
plan: 09
type: execute
wave: 3
depends_on: [01, 02, 03, 04, 05, 06, 07, 08]
files_modified:
  - tests/FIELD_PROTOCOL.md
  - tests/runs/.gitkeep
autonomous: false
requirements: [PHASE1-01, PHASE1-02, PHASE1-03, PHASE1-04]
maps_to_existing_plan: P1-M-01..15 (Полевое тестирование Phase 1 — DEVELOPMENT_PLAN.md §3.14)

must_haves:
  truths:
    - "tests/FIELD_PROTOCOL.md has documented result rows for T1 (5km loop), T2 (reference area), T6 (2h session), T7 (50fps at 5000+ pts), T8 (background 30min), and T9 (closed-loop area) on all three device classes: Pixel, iPhone, Chinese-Android"
    - "Each test row includes: date, device model + OS version, app build hash, baseline (Garmin watch reading), measured value, error %, pass/fail vs the NFR threshold"
    - "GPX exports for each T1/T2/T9 run are saved under tests/runs/<device>/<test>/<timestamp>.gpx"
    - "Battery before/after photos (or screenshot of system battery) are saved for T6 + T8 runs"
    - "Pixel test results are captured first (per D-02); iPhone gated on Xcode availability; Chinese-Android gated on device acquisition"
    - "If any test fails its NFR threshold, the failure is documented in tests/FIELD_PROTOCOL.md with notes — does NOT block this plan from being marked complete, but DOES feed into Plan 10's ADR-0005 decision"
  artifacts:
    - path: tests/FIELD_PROTOCOL.md
      provides: "Filled-in test rows for T1/T2/T6/T7/T8/T9 across the three device classes"
      min_lines: 100
    - path: tests/runs/.gitkeep
      provides: "Empty marker ensuring the directory exists in git; actual GPX files committed under subdirs"
      min_lines: 0
  key_links:
    - from: tests/FIELD_PROTOCOL.md
      to: tests/runs/
      via: hyperlinks to GPX export file paths under each test row
      pattern: "tests/runs/.+\\.gpx"
---

<objective>
Per ROADMAP §Success Criteria #1-2 + CONTEXT.md D-01..D-04 + PHASE1-01..04: execute the T1/T2/T6/T7/T8/T9 field-test protocol on three devices (Pixel, iPhone, Chinese-Android) and record the results in `tests/FIELD_PROTOCOL.md`. This is **OWNER-DRIVEN** field testing (D-01 — "Field testing is owner-driven"); Claude's role is to document the protocol, capture results into the `.md` table, and identify gaps. Most tasks in this plan are `autonomous: false` checkpoints since physical devices + physical activity are required.

**Build-side dependency on Plans 01–08:** The field-test APK / IPA built in Tasks 2–4 MUST contain ALL Phase 1 code refactors (Plans 01–07) AND the rotated `sk.…` Mapbox token from Plan 08 stored in `~/.netrc` (iOS pod install) and `~/.gradle/gradle.properties` (Android gradle build). Without the rotated token, the iOS build path cannot pull the Mapbox SDK during `pod install`; without the Plans 01–07 refactors landed, the field tests would be measuring stale behavior (e.g., T7 FPS test depends on Plan 05 big-track simplify; T6 battery depends on Plan 07 adaptive sampling; T2/T9 closure feedback depends on Plan 03 haptic+toast).

Purpose: NFR-001..008 (distance ≤3%, area ≤5%, battery ≤10%/h, memory ≤100MB growth, background ≥95%, FPS ≥50) cannot be validated in code — only with real GPS hardware, real running, real OEMs. Phase 1 cannot close (Plan 10) without these numbers.
Output: Filled-in `tests/FIELD_PROTOCOL.md` table; committed GPX exports under `tests/runs/<device>/<test>/<timestamp>.gpx`; battery photos referenced from the protocol. **This plan ships a documented protocol the owner executes; results land here as runs complete.**
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-validate-close-territory-core/01-CONTEXT.md
@.planning/phases/01-validate-close-territory-core/01-RESEARCH.md
@CLAUDE.md

@docs/RUNNING_ECOSYSTEM_TZ.md
@docs/DEVELOPMENT_PLAN.md

<!-- Plans this depends on — their refactors AND the rotated Mapbox token (Plan 08) must be in the build under test -->
@.planning/phases/01-validate-close-territory-core/01-01-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-02-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-03-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-04-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-05-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-06-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-07-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md

<test_thresholds>
<!-- Authoritative NFR thresholds (from docs/RUNNING_ECOSYSTEM_TZ.md §2.4). Field test rows MUST match these. -->

| Test | NFR | Threshold | Reference |
|------|-----|-----------|-----------|
| T1 (5km loop) | NFR-001 | distance error ≤ 3% vs Garmin baseline | ТЗ §2.4 |
| T2 (reference area, football field) | NFR-002 | area error ≤ 5% vs surveyed area | ТЗ §2.4 |
| T6 (2-hour session, screen on) | NFR-003 + NFR-007 | battery ≤ 10%/h, memory growth ≤ 100 MB | ТЗ §2.4 |
| T7 (5000+ pts panning) | NFR-006 | ≥ 50 fps panning | ТЗ §2.4 |
| T8 (in-pocket 30 min) | NFR-005 | ≥ 95% record-time when phone in pocket | ТЗ §2.4 |
| T9 (closed-loop area) | NFR-002 | area error ≤ 5% vs reference closed shape | ТЗ §2.4 |
</test_thresholds>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit + fill in the field-test protocol scaffold</name>
  <files>tests/FIELD_PROTOCOL.md, tests/runs/.gitkeep</files>
  <action>
    Step 1a — Verify `tests/FIELD_PROTOCOL.md` exists. STATUS.md 2026-05-06 noted it was scaffolded as part of P1-M-01. If the file exists, read it and inventory the current state of T1..T15 rows. If it does not exist, create it from scratch.

    Step 1b — If creating from scratch (or filling gaps), structure the file as:

    ```
    # FIELD_PROTOCOL — Phase 1 Validation Runs

    **Status:** In progress (Plan 09 / PHASE1-01..04).
    **Device order:** Pixel → iPhone → Chinese Android (D-02).
    **Build prerequisite:** APK / IPA under test MUST be built from a commit containing all of Plans 01–08 (SessionManager refactor, hooks, closure feedback, summary screen wiring, big-track simplify, offline region picker, adaptive sampling, rotated Mapbox `sk.…` token).

    ## Acceptance thresholds (from docs/RUNNING_ECOSYSTEM_TZ.md §2.4)

    | Test | NFR | Threshold |
    |------|-----|-----------|
    | T1 | NFR-001 | distance error ≤3% |
    | T2 | NFR-002 | area error ≤5% (reference field) |
    | T6 | NFR-003 + NFR-007 | battery ≤10%/h, memory growth ≤100 MB |
    | T7 | NFR-006 | ≥50 fps panning at 5000+ pts |
    | T8 | NFR-005 | ≥95% record-time in pocket |
    | T9 | NFR-002 | area error ≤5% (closed loop) |

    ## Result template (one row per device per test)

    | Test | Device | OS | Build hash | Date | Baseline | Measured | Error % | Pass? | GPX | Battery photo | Notes |
    |------|--------|----|------------|------|----------|----------|---------|-------|-----|---------------|-------|

    ## Pixel (Android — debug APK)

    [Rows for T1, T2, T6, T7, T8, T9 — fill as runs complete.]

    ## iPhone (iOS — blocked on Xcode install per STATUS.md)

    [Rows for T1, T2, T6, T7, T8, T9 — fill after iPhone build is ready.]

    ## Chinese Android (Xiaomi / Realme / Oppo — TBD)

    [Rows for T1, T2, T6, T7, T8, T9 — fill after device acquisition.]

    ## Test protocols

    ### T1: 5 km reference loop
    - **Equipment:** Garmin watch (baseline), phone with app
    - **Run:** familiar 5 km loop, GPS lock obtained outdoors before start
    - **Capture:** GPX export to `tests/runs/<device>/T1/<YYYY-MM-DD-HHMM>.gpx`; phone screenshot at end
    - **Pass:** `|phone_distance - garmin_distance| / garmin_distance ≤ 3%`

    ### T2: Reference area (football field)
    - **Equipment:** phone with app
    - **Run:** walk perimeter of standard football field (105×68 m = 7140 m²)
    - **Capture:** GPX to `tests/runs/<device>/T2/...`; closure must fire; record reported area
    - **Pass:** `|reported_area - 7140| / 7140 ≤ 5%`

    ### T6: 2-hour session
    - **Equipment:** phone with app, fully charged, brightness 50%, location BestForNavigation
    - **Run:** any 2-hour activity; screen on; do not background the app
    - **Capture:** battery photo at start + at end (timestamps visible); memory readings from system / Flipper at start + end
    - **Pass:** `(start_battery_pct - end_battery_pct) / 2h ≤ 10%/h` AND `peak_mem - baseline_mem ≤ 100 MB`

    ### T7: 5000+ point panning
    - **Run:** record (or load from history) a session with ≥5000 GPS points; on Map view, pan + zoom continuously for 60s
    - **Capture:** FPS via Flipper / dev tools / Reanimated PerfMonitor — record min FPS over the 60s
    - **Pass:** min FPS ≥50

    ### T8: 30-min background reliability (in pocket)
    - **Run:** start recording, put phone in pocket, walk/run for 30 min; do not interact with phone
    - **Capture:** GPX export at end; count active recording duration vs wall-clock 30 min
    - **Pass:** `active_record_seconds / 1800 ≥ 0.95`

    ### T9: Closed-loop area
    - **Run:** walk a known closed shape (e.g., basketball court 28×15 m = 420 m²; or surveyed lawn rectangle); ensure closure fires
    - **Capture:** GPX to `tests/runs/<device>/T9/...`; reported area
    - **Pass:** `|reported_area - reference| / reference ≤ 5%`
    ```

    Step 1c — Create `tests/runs/.gitkeep` (empty file) so the directory is committed to git. The owner will create subdirectories like `tests/runs/pixel/T1/...` as runs happen.

    Step 1d — If the existing FIELD_PROTOCOL.md already has fields filled in from prior partial runs (per STATUS.md 2026-05-06), preserve all prior data; merge new structure around it. NEVER delete prior result rows.

    Implements PHASE1-01..04 protocol layer (D-01..D-04).
  </action>
  <verify>
    <automated>test -f tests/FIELD_PROTOCOL.md && test -d tests/runs && grep -c "T1\\|T2\\|T6\\|T7\\|T8\\|T9" tests/FIELD_PROTOCOL.md</automated>
  </verify>
  <done>tests/FIELD_PROTOCOL.md has thresholds table + per-device sections + per-test protocol descriptions. tests/runs/ exists in git via .gitkeep. Atomic commit: `docs(phase1): field-test protocol scaffold (PHASE1-01..04)`.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Execute Pixel field tests (T1, T2, T6, T7, T8, T9)</name>
  <what-built>
    Plan 09 Task 1 prepared the protocol scaffold. All code-side refactors (Plans 01–07) plus the rotated Mapbox `sk.…` token (Plan 08) are landed: SessionManager + real-SQLite tests, hook extraction, closure haptic+toast, summary screen verify, simplify-for-display + zoom prop, region picker + bounds fix, adaptive sampling + SLC, token rotation. The Pixel debug APK builds (per STATUS.md). It is now time to run the field tests on Pixel.
  </what-built>
  <how-to-verify>
    Per D-02 device order, run Pixel first.

    **Setup (once):**
    1. Confirm the Pixel build is on the latest commit (includes all Plan 01–08 changes): `cd apps/mobile-rn && eas build -p android --profile development --local` (or your preferred dev build command) → install APK on Pixel.
    2. Verify the build includes Plan 08's rotated Mapbox token: the gradle build pulled the SDK via the new `sk.…` token in `~/.gradle/gradle.properties` (`MAPBOX_DOWNLOADS_TOKEN`). If the build failed with a 401 on the Mapbox SDK download, Plan 08 was not fully landed — STOP and resolve before continuing.
    3. Pair a Garmin watch (or another reference GPS device) for the baseline.
    4. Ensure Pixel has fresh battery (>80%) before T6/T8. Disable Adaptive Battery for the app session if not already off.

    **T1 (5 km loop):**
    1. Run a familiar 5km loop with phone + Garmin.
    2. After Stop+Save → Summary screen → tap GPX Share → save the .gpx to `tests/runs/pixel/T1/<YYYY-MM-DD-HHMM>.gpx`.
    3. Record Garmin distance + phone distance.
    4. Compute error %; append a row to the "Pixel" section in `tests/FIELD_PROTOCOL.md`.

    **T2 (reference area, football field):**
    1. Walk the perimeter of a standard football field (or a surveyed reference area — record dimensions in the row).
    2. Wait for closure to fire (haptic + toast — verifies Plan 03 wiring).
    3. Save → record area.
    4. Compute error % vs the surveyed reference (105×68 = 7140 m² for a standard field).
    5. GPX export to `tests/runs/pixel/T2/...`; row in protocol.

    **T6 (2-hour session):**
    1. Photo of battery level + clock at start.
    2. Start session; screen on; brightness 50%; record for 2 hours of any activity.
    3. Photo at end (battery + clock).
    4. Memory: if Flipper or `adb shell dumpsys meminfo com.runningecosystem.mobile` is available, capture before + after numbers.
    5. Row in protocol: `(start_pct - end_pct) / 2 ≤ 10%/h`; memory growth ≤ 100 MB.

    **T7 (FPS at 5000+ points):**
    1. Either complete a long enough session to reach 5000+ pts, OR load an existing long session from Journal (>5000 points).
    2. On the live track view OR history overlay, pan + zoom continuously for 60s.
    3. FPS: use Flipper or the React Native dev menu FPS overlay; record the minimum observed.
    4. Row in protocol; pass = min FPS ≥ 50.

    **T8 (30-min in-pocket):**
    1. Start session, phone in pocket, walk/run for 30 minutes.
    2. Do not interact with the phone.
    3. After 30 minutes, stop and save.
    4. Compute `active_record_seconds = (last_point.ts - first_point.ts) / 1000`; pass = ≥1710 (95% of 1800).
    5. GPX to `tests/runs/pixel/T8/...`; row.

    **T9 (closed-loop area):**
    1. Walk a known closed shape (basketball court ~420 m², or a measured rectangle).
    2. Wait for closure; record area.
    3. Row; pass = error ≤ 5%.

    **After all 6 tests:**
    1. Commit `tests/FIELD_PROTOCOL.md` + GPX exports + battery photos with message `test(phase1): pixel field results T1/T2/T6/T7/T8/T9 (PHASE1-01..04)`.
    2. If any test failed its threshold, note in the row's "Notes" column AND surface in Plan 10's ADR-0005.
  </how-to-verify>
  <resume-signal>Type "pixel done" when all 6 Pixel test rows are filled in the protocol + GPX/photos committed; OR type "blocked: <reason>" if a specific test cannot complete (e.g., "T6 blocked — no 2h block available this week")</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Execute iPhone field tests (T1, T2, T6, T7, T8, T9) — gated on Xcode install</name>
  <what-built>
    iPhone build is gated on Xcode availability (per STATUS.md TODO) AND on the rotated Mapbox `sk.…` token from Plan 08 being installed in `~/.netrc` (the iOS pod install path reads the token from netrc). Once Xcode is installed + the iOS build is on the Pixel-validated commit, run the same 6 tests on iPhone.
  </what-built>
  <how-to-verify>
    Same protocol as Task 2 (T1..T9) but on iPhone. Capture to `tests/runs/iphone/...`.

    **Pre-flight:**
    1. Install Xcode (latest stable supporting Expo SDK 54 — typically Xcode 15.x or 16.x).
    2. Verify `~/.netrc` contains the Plan 08-rotated `sk.…` token entry for `api.mapbox.com` (machine + login + password lines). If missing, Plan 08 was not fully landed — STOP and resolve before continuing.
    3. `cd apps/mobile-rn/ios && pod install` (relies on the new Mapbox `sk.` token in `~/.netrc` — Plan 08 prerequisite).
    4. `eas build -p ios --profile development --local` (or `npx expo run:ios --device` if direct device deploy is set up).
    5. Install on iPhone (TestFlight or direct device install via Xcode).

    **Special considerations on iOS:**
    - T8 (background in pocket): iOS suspends backgrounded apps aggressively. If `expo-task-manager` foreground service does its job, recording should continue. If T8 fails on iPhone, document the failure mode (e.g., "killed at 12min by OS") in Notes; this feeds Plan 10 ADR-0005 (PHASE1-12 SLC may need real-SLC native module for some users).
    - T6 (battery): iPhone battery management is more aggressive about throttling background — observed % drop may be lower than Pixel (good news).

    Commit message: `test(phase1): iphone field results T1/T2/T6/T7/T8/T9 (PHASE1-01..04)`.
  </how-to-verify>
  <resume-signal>Type "iphone done" when 6 rows filled + artifacts committed; OR type "blocked: xcode" if Xcode install is still pending; OR type "blocked: netrc" if Plan 08 token is missing from netrc; OR type "blocked: <other-reason>"</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: Execute Chinese-Android field tests (Xiaomi / Realme / Oppo) — gated on device acquisition</name>
  <what-built>
    Per D-02, the Chinese-Android device is the highest-variability OEM (battery optimizers, Auto-start blockers). Acquire one (Xiaomi, Realme, Oppo, or Honor) and run the same 6 tests. The build under test MUST contain the same Plan 01–08 landed commit used for Pixel + iPhone.
  </what-built>
  <how-to-verify>
    Same protocol as Task 2 (T1..T9) but on a Chinese-Android device. Capture to `tests/runs/<device-vendor>/...` (e.g., `tests/runs/xiaomi-redmi9/T1/...`).

    **OEM-specific setup (mandatory before T6/T8):**
    - Xiaomi: Settings → Apps → Permissions → Autostart → enable for the running-ecosystem app. Settings → Battery → App battery saver → No restrictions.
    - Realme: similar — locate Autostart + battery saver settings; whitelist the app.
    - Oppo: similar.
    - Document the OEM-specific steps taken in the FIELD_PROTOCOL.md "Notes" column of each row.

    **Expected outcomes per PHASE1 thresholds (RESEARCH.md §Risk Register):**
    - T8 (background) is the highest-risk test on Chinese Android. If it fails despite Autostart enabled, that is an Accepted limitation per D-36 (ADR-0005 documents the failure mode + workaround instructions for end-users).
    - T6 (battery) may exceed 10%/h on aggressive devices — also an Accepted documented limitation.
    - T1/T2/T9 (accuracy) should pass — these depend on GPS chipset, not OEM tuning.

    Commit message: `test(phase1): <vendor>-<model> field results T1/T2/T6/T7/T8/T9 (PHASE1-01..04)`.
  </how-to-verify>
  <resume-signal>Type "chinese-android done" when 6 rows filled + artifacts committed; OR type "blocked: device" if device acquisition is still pending; OR type "deferred: <reason>" if a specific test is being deferred to a known follow-up (e.g., "T8 deferred to v1.0.1 — Xiaomi auto-start kill documented in ADR-0005")</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GPX export → Local filesystem (commit to git) | GPX files contain GPS coordinates of the owner's actual runs. Privacy consideration: these files are committed to a private repo (per PROJECT.md status — repo is not public). |
| Battery photos → Local filesystem | Photos contain device screen contents (battery %, time). Privacy: same as above. |
| OEM-specific autostart settings → System-level permission grants | The owner grants the app autostart + battery-no-restrictions on Chinese-Android devices. Standard user action. No code-side trust boundary. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-09-01 | Information Disclosure | GPX files committed to git reveal owner's home/work locations | mitigate | Phase 4 (privacy zones) will land mask-zone clipping; for this phase, the repo is private — accepted per PROJECT.md scope. Note in FIELD_PROTOCOL.md "Capture" section: "GPX files contain raw GPS — repo must remain private until Phase 4 lands privacy zones." |
| T-01-09-02 | Repudiation | Field test results disputed → no proof of when/where the test was run | mitigate | Battery photos include timestamps; GPX files include ISO timestamps in `<time>` tags; commit messages include date + device. Multi-source proof. |
| T-01-09-03 | Tampering | GPX files edited post-hoc to fudge numbers | accept | Single-developer project; trust the developer. If a third-party audit is needed in future, GPX could be cross-referenced against backend sync (when Phase 2 ships server-side ingestion). |
| T-01-09-04 | Information Disclosure | Battery photos accidentally include sensitive notifications | mitigate | Owner reviews each photo before committing; crops to battery % bar if a notification is visible. Note in protocol. |

ASVS does not have categories that map cleanly to physical field testing. The main consideration is GPS privacy per T-01-09-01.
</threat_model>

<verification>
- `test -f tests/FIELD_PROTOCOL.md && grep -c "Pixel\\|iPhone\\|Chinese" tests/FIELD_PROTOCOL.md` shows all three device sections present.
- `find tests/runs -name "*.gpx" -type f | wc -l` shows ≥18 GPX files (6 tests × 3 devices) once all checkpoints complete; partial counts acceptable for partial completion (e.g., Pixel-only = ≥6 files).
- For each filled row in `tests/FIELD_PROTOCOL.md`: presence of all columns (Device, OS, Date, Baseline, Measured, Error %, Pass?, GPX, Battery photo, Notes).
- Pass/fail thresholds match the table at `<test_thresholds>` above (ROADMAP §Success Criteria #1-2).
- Commit history shows separate commits per device class (Pixel commit, iPhone commit, Chinese-Android commit) — easier to revert/inspect.
- The commit hash recorded in each device's "Build hash" column corresponds to a commit that includes all of Plans 01–08 (verify with `git log --oneline <build-hash> -- .planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md`).
</verification>

<success_criteria>
- All must_haves.truths above are TRUE for completed devices.
- The plan is considered COMPLETE when the Pixel device's tests are filled in. iPhone + Chinese-Android may complete in parallel or land later — those checkpoints can resume independently.
- Acknowledged: parts of this plan are blocked on acquisition (Xcode install, Chinese-Android device). Owner declares "deferred" with reason in the checkpoint's resume signal; Plan 10 captures the deferred items in ADR-0005 (per D-36).
- Atomic commits per task: Task 1 `docs(phase1): field-test protocol scaffold (PHASE1-01..04)`, Tasks 2-4 each `test(phase1): <device> field results (PHASE1-01..04)`.
</success_criteria>

<output>
After completion (or partial completion declared by the owner), create `.planning/phases/01-validate-close-territory-core/01-09-SUMMARY.md` capturing:
- Status of each device class: complete / deferred / blocked
- For each completed device: aggregate pass/fail summary (e.g., "Pixel: 5/6 pass; T6 borderline at 11%/h — captured in ADR-0005")
- Build hash(es) used for each device — confirm each contains Plans 01–08
- Any test failures that feed into Plan 10's ADR-0005 (PHASE1-14)
- Cross-link: closes (or defers with rationale) PHASE1-01 + PHASE1-02 + PHASE1-03 + PHASE1-04 + P1-M
</output>
</output>
