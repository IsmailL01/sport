---
phase: 01-validate-close-territory-core
plan: 09
subsystem: field-test / documentation
tags: [field-test, NFR, gpx, protocol, phase1-closure, user-action]
dependency_graph:
  requires:
    - .planning/phases/01-validate-close-territory-core/01-CONTEXT.md
    - .planning/phases/01-validate-close-territory-core/01-RESEARCH.md
    - .planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md
    - docs/RUNNING_ECOSYSTEM_TZ.md (§2.4 NFR table, §2.5 T1-T10)
    - tests/FIELD_PROTOCOL.md (pre-existing Phase 0 scaffold from STATUS.md 2026-05-06)
  provides:
    - tests/FIELD_PROTOCOL.md (Plan 09 sections — Build Prerequisite, Acceptance Thresholds, Order of Operations, Per-Device Result Tables for Pixel / iPhone / Chinese-Android, per-test NFR gates)
    - tests/runs/.gitkeep (directory marker)
    - tests/runs/README.md (GPX capture convention + privacy boundary)
    - .gitignore (Rule 3 fix — `tests/runs/*` pattern with negations so artifacts can land)
  affects:
    - "PHASE1-01 (T1 5km on 3 devices) — protocol ready; awaits device runs"
    - "PHASE1-02 (T2/T9 area ≤5% on 3 devices) — protocol ready; awaits device runs"
    - "PHASE1-03 (T6 2h session — battery ≤10%/h, memory ≤100MB on 3 devices) — protocol ready; awaits device runs"
    - "PHASE1-04 (T8 background ≥95% on 3 devices) — protocol ready; awaits device runs"
    - "PHASE1-14 (Plan 10 — Phase 1 closure docs) — depends on filled-in Per-Device tables"
tech-stack:
  added: []
  patterns:
    - "Per-device markdown tables with gate annotations (NFR threshold spelled out per row)"
    - "GPX path convention: `tests/runs/<device>/<test>/<timestamp>.gpx` (D-03)"
    - "Build prerequisite cross-link (Plan 08 Task 4 sk. token) called out at top of doc"
key-files:
  created:
    - tests/runs/.gitkeep
    - tests/runs/README.md
    - .planning/phases/01-validate-close-territory-core/01-09-SUMMARY.md
  modified:
    - tests/FIELD_PROTOCOL.md (preserved all existing T1-T15 content; prepended Plan 09 sections)
    - .gitignore (negations for tests/runs/ artifacts)
  removed: []
decisions:
  - "Preserved all existing Phase 0 T1-T15 scenario descriptions and REPORT_TEMPLATE — added Plan 09 structure on top rather than rewriting. STATUS.md 2026-05-06 noted prior partial data; per plan Step 1d, NEVER delete prior result rows."
  - "Rule 3 deviation — added `.gitignore` negations for `tests/runs/.gitkeep`, `tests/runs/**/*.gpx`, etc. Otherwise the global `tests/runs/` and `*.gpx` ignores would silently hide the artifacts the plan must_haves require to land in git. Validated empirically via `git check-ignore -v` on probe files."
  - "Changed gitignore pattern from `tests/runs/` to `tests/runs/*` because git cannot re-include children of an ignored directory; only by ignoring the contents (with `*`) can negations re-include specific subpaths."
  - "REPORT.md per-run files marked OPTIONAL for Plan 09 (only required if a run goes non-standard). The Per-Device Result Tables in FIELD_PROTOCOL.md + the GPX file are the canonical record; this reduces friction for the owner-driven runs."
metrics:
  duration: ~25 minutes (Task 1 only — code/docs side)
  completed: 2026-05-14 (Task 1)
  tasks_completed: 1/4
---

# Phase 1 Plan 09: Field-Test Execution — Summary

Plan 09 Task 1 (protocol scaffold) is complete and committed as `c1af7c7`. The `tests/FIELD_PROTOCOL.md` document now has Build Prerequisite, Acceptance Thresholds (NFR-001..007), Order of Operations, and three Per-Device Result Tables (Pixel, iPhone, Chinese-Android) with per-test NFR gates spelling out pass/fail per row. The `tests/runs/` directory is committed via `.gitkeep` + README documenting the GPX capture convention. **Tasks 2-4 (physical device runs) remain `autonomous: false` checkpoints — they require physical devices, physical activity, and a Garmin baseline; the owner executes them and fills in the Per-Device tables as runs complete.**

## Completion State

- **Task 1 (auto):** ✅ **Complete.** Commit `c1af7c7` — `docs(phase1): field-test protocol scaffold (PHASE1-01..04)`.
- **Task 2 (checkpoint:human-action) — Pixel runs:** ⏳ **Pending user action.** Build prerequisite (Plan 08 Task 4 — Mapbox `sk.` in `~/.gradle/gradle.properties`) gates the parity-build APK.
- **Task 3 (checkpoint:human-action) — iPhone runs:** ⏳ **Pending user action.** Gated on (a) Xcode install per STATUS.md TODO, (b) Plan 08 Task 4 — `sk.` token in `~/.netrc` for `pod install`.
- **Task 4 (checkpoint:human-action) — Chinese-Android runs:** ⏳ **Pending user action.** Gated on device acquisition (Xiaomi / Realme / Oppo / Honor — not yet purchased per STATUS.md).

Per the plan's `<success_criteria>`: "the plan is considered COMPLETE when the Pixel device's tests are filled in." Therefore Plan 09 is **partially shipped** as of this SUMMARY — the protocol is ready; Pixel results are the next milestone.

## Per-Task Outcome

### Task 1 — Protocol scaffold + tests/runs/ directory

Status: **Done.** Commit `c1af7c7`.

**`tests/FIELD_PROTOCOL.md` changes** (preserved 273 existing lines, added 273 new on top):

1. **Build Prerequisite** section (lines 11-48) — explicit cross-link to `01-08-SUMMARY.md` §CHECKPOINT REQUIRED with the exact verification commands (`grep -A2 'api.mapbox.com' ~/.netrc`, `grep 'MAPBOX_DOWNLOADS_TOKEN' ~/.gradle/gradle.properties`).
2. **Acceptance Thresholds** table (lines 50-63) — NFR-001..007 with per-test gate formulas spelled out (e.g., `|phone − ref| / ref ≤ 0.03` for T1).
3. **Order of Operations** (lines 65-84) — explicit D-02 device order (Pixel → iPhone → Chinese-Android) AND per-device test order requested by user (T1 → T2/T9 → T6 → T8 → T7 on accumulated track).
4. **Result Template** (lines 86-97) — single canonical row format: `Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes`.
5. **Per-Device Result Tables**:
   - **Pixel** (lines 105-152): six per-test subsections (T1, T2, T6, T7, T8, T9), each with a pre-formatted result row + an explicit `**Gate:** Pass требует <formula>` line.
   - **iPhone** (lines 154-201): same structure; gated marker on Xcode + Plan 08 Task 4.
   - **Chinese-Android** (lines 203-262): same structure; OEM-specific setup callout for Xiaomi / Realme / Oppo / Honor (Autostart + battery saver whitelist); gated marker on device acquisition.
6. **Preserved verbatim**: Phase 0 «Принципы тестирования», T1-T15 scenario descriptions, REPORT_TEMPLATE, «Прогон по плану» tracking table (extended with one new row for PHASE1-01..04), «Если что-то не работает» troubleshooting (extended with three Plan 09-specific entries — Mapbox 401, iOS T8 fail, Chinese-Android T8 fail).

**`tests/runs/README.md`** (NEW, 96 lines) documents:
- Path convention: `tests/runs/<device>/<test>/<timestamp>.gpx` (D-03).
- Canonical `<device>` values: `pixel`, `iphone`, `xiaomi-redmi9` / `realme-c25` / etc.
- `<test>` must be literal `T1`, `T2`, `T6`, `T7`, `T8`, `T9` (not `t1`, not `T01`) — required for the plan's verify grep.
- `<timestamp>` format `YYYY-MM-DD-HHMM` (local time at start of run).
- What to commit vs not commit (GPX yes, raw JSON logs no, video no, personal data no).
- Privacy boundary (T-01-09-01) — repo currently private; Phase 4 will add privacy-zone masking before the repo opens.
- Sample suffix convention for multiple runs on same day (`-2`, `-3`).

**`tests/runs/.gitkeep`** (NEW, 0 bytes) — directory marker so the structure persists when no runs have landed yet.

**`.gitignore` change** (Rule 3 — see Deviations below).

### Tasks 2-4 — Physical device runs

Status: **PENDING — USER ACTION REQUIRED.** See `▶ CHECKPOINT REQUIRED — USER ACTION` section below.

## Verify Block (executed)

Per plan `<verify>` automated command:
```
test -f tests/FIELD_PROTOCOL.md && test -d tests/runs       -> pass (both exist)
grep -c "T1\|T2\|T6\|T7\|T8\|T9" tests/FIELD_PROTOCOL.md    -> 82 (≥1 required, ≥6 expected)
```

Plus the user-requested per-test-gate grep (round 1 plan-checker fix #11):
```
for t in T1 T2 T6 T7 T8 T9; do grep -c "## $t\|### $t\|^| $t " tests/FIELD_PROTOCOL.md; done
  T1: 11   T2: 5   T6: 5   T7: 5   T8: 5   T9: 5
```
Each ≥1 — pass.

Plus device-section grep (plan `<verification>` line 309):
```
grep -c "Pixel\|iPhone\|Chinese" tests/FIELD_PROTOCOL.md    -> 43 (≥3 required, all 3 sections present)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `.gitignore` was ignoring the artifacts the plan must_haves require**
- **Found during:** Task 1, immediately after creating `tests/runs/.gitkeep`.
- **Issue:** `.gitignore` lines 102-107 contained `tests/runs/`, `tests/screenshots/`, `tests/gpx/`, `*.gpx`, `!tests/gpx/reference/*.gpx`. The `tests/runs/` directory was globally ignored — `git check-ignore -v tests/runs/.gitkeep` confirmed `.gitkeep` was hidden. `*.gpx` globally ignored any GPX export under `tests/runs/<device>/<test>/`. Without a fix, the plan's `must_haves.truths` line 18 ("GPX exports for each T1/T2/T9 run are saved under `tests/runs/<device>/<test>/<timestamp>.gpx`") and `must_haves.artifacts` line 26 (`tests/runs/.gitkeep`) could not land in git — Tasks 2-4 would produce uncommittable files.
- **Why git couldn't simply add `!tests/runs/.gitkeep` to the existing pattern:** Git documentation: "It is not possible to re-include a file if a parent directory of that file is excluded." Pattern `tests/runs/` excludes the directory; negations on children cannot escape that.
- **Fix:** Changed `tests/runs/` → `tests/runs/*` (ignore the contents of the directory, but not the directory itself), then added explicit negations for `.gitkeep`, `README.md`, `*.gpx`, `*.md`, `*.jpg`, `*.jpeg`, `*.png`. Also added trailing `!tests/runs/**/*.gpx` AFTER the global `*.gpx` line so the GPX negation wins by recency.
- **Validated empirically** via `git check-ignore -v` on probe paths — `.gitkeep`, `pixel/T1/2026-05-15-1200.gpx`, `README.md` all confirmed not-ignored; the last matching `!` rule wins. Also via `mkdir -p tests/runs/pixel/T1 && touch tests/runs/pixel/T1/test.gpx && git status` — both probe files appeared as `??` (untracked, trackable), proving git would let them stage. Probes were cleaned up before the commit.
- **Files modified:** `.gitignore`.
- **Commit:** `c1af7c7`.

**2. [Rule 2 — Critical functionality] Per-test gate annotations in each Per-Device subsection**
- **Found during:** Task 1, after generating the per-device tables — noticed the plan's `<verification>` line 311 requires presence of "Pass/Fail" column and `<test_thresholds>` table values match. Per the user's prompt ("Add per-test gate confirmation grep to the verify command (per plan-checker round 1 fix #11)"), each subsection needs an explicit `**Gate:** Pass требует <formula>` line so a future grep can confirm the gate is documented before any actual pass/fail flag flips.
- **Fix:** Added `**Gate:**` line under EVERY per-test subsection across all 3 devices = 18 gate lines total. Each spells out the exact NFR formula from `<test_thresholds>` (e.g., for T6 Pixel: `Pass требует battery_rate ≤ 10 %/h (NFR-003) AND Δmem ≤ 100 MB (NFR-007)`). This ensures Pass/Fail decision is mechanical, not subjective.
- **Files modified:** `tests/FIELD_PROTOCOL.md` (Pixel §, iPhone §, Chinese-Android §).
- **Commit:** `c1af7c7`.

**3. [Rule 3 — Blocking] Plan-step 1d compliance — preserved all existing T1-T15 + REPORT_TEMPLATE content**
- **Found during:** Task 1 Step 1a (audit before rewrite).
- **Issue:** Existing FIELD_PROTOCOL.md (14.9 KB / 273 lines) had Phase 0 protocol details (T1-T10 scenarios, T11-T15 Phase 1 additions, REPORT_TEMPLATE). Plan Step 1d explicitly says "NEVER delete prior result rows" — but the prior file had only scenario descriptions, no result rows. Conservatively, preserved EVERYTHING including REPORT_TEMPLATE (now marked optional for Plan 09).
- **Fix:** New Plan 09 sections prepended; all 273 existing lines preserved with a 3-line note pointing readers to the Per-Device tables as the canonical Plan 09 capture format.
- **Files modified:** `tests/FIELD_PROTOCOL.md`.
- **Commit:** `c1af7c7`.

No architectural changes required (Rule 4 not triggered). No source code under `apps/mobile-rn/src/` touched (per user constraint "documentation-only").

## Threat Model Disposition (carried over from plan)

| Threat ID | Status |
|-----------|--------|
| T-01-09-01 IS — GPX files reveal home/work coordinates | **mitigated for now via private repo + accept**. README.md §"Privacy boundary" documents this — Phase 4 ships privacy-zone clipping before the repo opens. Owner manually skips GPX commit if a run starts at sensitive location. |
| T-01-09-02 Repudiation — disputed test results | **mitigated** by 3-source proof: GPX has `<time>` ISO timestamps; battery photos carry device clock; commit messages carry date + device. Encoded into the README convention. |
| T-01-09-03 Tampering — edited GPX post-hoc | **accept** — single-developer project. If Phase 2 backend sync ships, cross-reference becomes possible. |
| T-01-09-04 IS — battery photos with stray notifications | **mitigated** in README.md ("Если возникают сомнения — не коммитьте"). Owner reviews/crops photos before commit. |

All threat dispositions actionable in Task 1 documentation are complete. Tasks 2-4 inherit these protections through the README + protocol structure.

## Stub Tracking

No code stubs introduced — this plan is documentation-only.

The Per-Device Result Tables intentionally contain placeholder rows with em-dashes (`—`) and `pending` flags. These are **not stubs in the code-functionality sense** — they are designed-empty rows that get filled in as physical runs complete. The plan explicitly anticipates this (CONTEXT.md D-01: "Field testing is owner-driven... results land here as runs complete"). Plan 10 (PHASE1-14) will read these tables and produce ADR-0005 even if some rows remain `pending` — Tasks 2-4 declare `deferred` rather than blocking phase closure (per `<success_criteria>` line 320).

## Cross-links

- **Closes (partial):** PHASE1-01, PHASE1-02, PHASE1-03, PHASE1-04 **protocol layer**. Result rows for the three devices remain open per Tasks 2-4.
- **Supports:** ROADMAP §Success Criteria #1-2 (T1 distance ≤3% / T2 area ≤5% on 3 devices).
- **Depends on:** Plan 08 Task 4 (Mapbox token rotation) for the build prerequisite — explicit cross-link in FIELD_PROTOCOL.md §Build Prerequisite.
- **Unblocks:** Plan 10 (PHASE1-14) once the Per-Device tables have at least Pixel rows filled in.

---

## ▶ CHECKPOINT REQUIRED — USER ACTION (Tasks 2-4)

Plan 09 Task 1 is the only autonomous task; Tasks 2-4 require physical devices + physical activity + a Garmin reference. Claude cannot perform them. Below is the complete handoff so the owner can run them at their own pace.

### Prerequisites checklist (do these BEFORE any device run)

- [ ] **Plan 08 Task 4 done** — Mapbox `sk.` token rotated, stored in both `~/.netrc` (iOS) and `~/.gradle/gradle.properties` (Android). Without this, `pod install` and gradle SDK download both fail with 401 from `api.mapbox.com`. See `01-08-SUMMARY.md` §CHECKPOINT REQUIRED for the 7-step rotation procedure.
- [ ] **Pixel parity build ready** — `cd apps/mobile-rn && eas build -p android --profile development --local` (or your preferred dev build command) → install APK on Pixel.
- [ ] **iPhone build prereqs** — Xcode installed (latest stable supporting Expo SDK 54, typically 15.x or 16.x), and `cd apps/mobile-rn/ios && pod install` succeeds (relies on Plan 08 sk. token in `~/.netrc`).
- [ ] **Chinese-Android device acquired** — Xiaomi / Realme / Oppo / Honor. Battery optimizer + Autostart settings configured per FIELD_PROTOCOL.md §Chinese-Android OEM-specific setup.
- [ ] **Garmin watch (or other reference GPS device)** paired and ready for T1 distance baseline.
- [ ] **Reference area dimensions** confirmed — for T2/T9, use a standard football field (105 × 68 = 7140 m²) OR a measured rectangle. Note the exact dimensions in the FIELD_PROTOCOL.md "Notes" column.

### Per-device test order (apply on Pixel first, then iPhone, then Chinese-Android — per D-02)

1. **T1 — 5 km loop**
   - Run a familiar 5 km loop with phone + Garmin simultaneously.
   - Stop+Save → Summary screen → tap GPX Share → save to `tests/runs/<device>/T1/<YYYY-MM-DD-HHMM>.gpx`.
   - Record Garmin distance + phone distance.
   - Compute error: `(phone - garmin) / garmin × 100`. **Pass = ≤ 3% (NFR-001).**
   - Append row to FIELD_PROTOCOL.md §<device> §T1.

2. **T2 — Reference area (football field, static walk perimeter)**
   - Walk the perimeter of a football field (or surveyed rectangle).
   - Wait for closure to fire — **haptic buzz + toast** must appear (verifies Plan 03 closure feedback).
   - Save → record area shown in app.
   - Compute error vs reference (7140 m² for standard field). **Pass = ≤ 5% (NFR-002).**
   - GPX export to `tests/runs/<device>/T2/...`; row in FIELD_PROTOCOL.md.

3. **T6 — 2-hour session**
   - Photo of phone battery level + clock at start. Save as `tests/runs/<device>/T6/battery_before.jpg`.
   - Start session; screen on; brightness 50%; record for 2 hours of any activity.
   - Photo at end. Save as `battery_after.jpg`.
   - Memory: if Flipper or `adb shell dumpsys meminfo com.runningecosystem.mobile` is available, capture before + after numbers.
   - **Pass:** `(start_pct − end_pct) / 2 ≤ 10 %/h (NFR-003)` AND `peak_mem − base_mem ≤ 100 MB (NFR-007)`.

4. **T8 — 30 min background (phone in pocket)**
   - Start session, lock phone, put in pocket, walk/run for 30 minutes. Do not interact with phone.
   - After 30 min, stop and save.
   - Compute `active_record_seconds = (last_point.ts − first_point.ts) / 1000`. **Pass = ≥ 1710 s (95% of 1800, NFR-005).**
   - GPX to `tests/runs/<device>/T8/...`; row.
   - **Chinese-Android specific:** OEM Autostart + battery saver whitelist must be configured first (see FIELD_PROTOCOL.md §Chinese-Android). Document exact OEM settings in the "Notes" column.

5. **T7 — FPS at 5000+ points**
   - Re-use the T6 session (after 2 hours it has ≥5000 points), OR load any historical session with ≥5000 points.
   - On Map view, pan + zoom continuously for 60 s.
   - FPS: Flipper, React Native dev menu FPS overlay, or Xcode Instruments Core Animation.
   - Record minimum FPS over 60 s. **Pass = min_fps ≥ 50 (NFR-006).**

6. **T9 — Closed-loop area (dynamic)**
   - Walk a known closed shape at running/walking pace (e.g., basketball court ≈ 420 m², or a measured rectangle).
   - Wait for closure detector to fire.
   - **Pass = `(reported − reference) / reference ≤ 5% (NFR-002 dynamic)`** AND closure detector triggered.
   - GPX to `tests/runs/<device>/T9/...`; row.

### Acceptance numbers (canonical reference)

| Test | NFR | Threshold |
|------|-----|-----------|
| T1 | NFR-001 | distance error ≤ 3 % |
| T2 | NFR-002 | area error ≤ 5 % (static reference) |
| T6 | NFR-003 + NFR-007 | battery ≤ 10 %/h AND memory ≤ 100 MB growth |
| T7 | NFR-006 | min FPS ≥ 50 over 60 s panning |
| T8 | NFR-005 | active record-time ≥ 95 % of wall clock |
| T9 | NFR-002 | area error ≤ 5 % (dynamic closed loop) |

### How to record results

1. **Update FIELD_PROTOCOL.md row** for the device + test you ran. Fill `Date`, `Device`, `OS`, `Build hash` (`git rev-parse --short HEAD` at the time the APK was built), `Baseline`, `Outcome value` (measured + error %), `Pass/Fail` (✅ / ❌), `GPX file path`, `Notes`.
2. **Save the GPX file** at the path declared in the row.
3. **For T6/T8**, save `battery_before.jpg` + `battery_after.jpg` next to the GPX.
4. **If a run goes non-standard** (force-kill, OEM-killer triggered, weird gap in track), add a `NOTES.md` next to the GPX with a short narrative — reference it in the row's "Notes" column.

### How to signal Plan 09 completion

When all six Pixel tests are filled in (minimum for plan close per `<success_criteria>` line 318):

```bash
cd apps/mobile-rn && \
git add tests/FIELD_PROTOCOL.md tests/runs/pixel/ && \
git commit -m "test(phase1): pixel field results T1/T2/T6/T7/T8/T9 (PHASE1-01..04)"
```

Then either:
- **`/gsd-execute-plan 01-09`** — re-runs this plan; the SUMMARY will be re-generated with Pixel results acknowledged, iPhone + Chinese-Android marked deferred if still pending.
- **`/gsd-execute-plan 01-10`** — proceeds directly to Phase 1 closure docs. Plan 10 will read FIELD_PROTOCOL.md as-is, record Pixel pass/fail aggregates in ADR-0005, and document iPhone + Chinese-Android as deferred items (per D-36 — accepted limitations get an ADR entry, not a phase block).

iPhone (Task 3) and Chinese-Android (Task 4) can land later via the same pattern — commit messages `test(phase1): iphone field results T1/T2/T6/T7/T8/T9 (PHASE1-01..04)` and `test(phase1): <vendor>-<model> field results T1/T2/T6/T7/T8/T9 (PHASE1-01..04)` respectively, then re-run `/gsd-execute-plan 01-09` to update this SUMMARY.

### Resume signal options (per plan)

- **Task 2** (Pixel): `pixel done` after 6 rows + GPX/photos committed; OR `blocked: <reason>` (e.g., `blocked: 2h block unavailable this week`).
- **Task 3** (iPhone): `iphone done` / `blocked: xcode` / `blocked: netrc` / `blocked: <other>`.
- **Task 4** (Chinese-Android): `chinese-android done` / `blocked: device` / `deferred: <reason>`.

---

## Self-Check: PASSED

**Files exist:**
- ✓ `/Users/ismail/Desktop/projects/sport/tests/FIELD_PROTOCOL.md` (541 lines — ≥100 min_lines required)
- ✓ `/Users/ismail/Desktop/projects/sport/tests/runs/.gitkeep` (0 bytes — directory marker, present)
- ✓ `/Users/ismail/Desktop/projects/sport/tests/runs/README.md` (96 lines)
- ✓ `/Users/ismail/Desktop/projects/sport/.planning/phases/01-validate-close-territory-core/01-09-SUMMARY.md` (this file)

**Commit exists:**
- ✓ `c1af7c7` — Task 1 — confirmed via `git log --oneline -1` returning `c1af7c7 docs(phase1): field-test protocol scaffold (PHASE1-01..04)`.
- ✓ Stat: 4 files changed, 383 insertions(+), 3 deletions(-) — no unexpected deletions.

**Verification commands re-run:**
- ✓ `test -f tests/FIELD_PROTOCOL.md && test -d tests/runs` → exit 0
- ✓ `grep -c "T1\|T2\|T6\|T7\|T8\|T9" tests/FIELD_PROTOCOL.md` → 82
- ✓ Per-test gate grep (round 1 fix #11) — every T1..T9 returns ≥5
- ✓ Device-section grep → 43 (Pixel/iPhone/Chinese all present)
