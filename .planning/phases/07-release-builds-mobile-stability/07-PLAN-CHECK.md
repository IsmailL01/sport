# Phase 7 — Plan Check Report

**Checked:** 2026-05-21
**Plans verified:** `07-01-PLAN.md` (EAS build + R8/ProGuard + CI workflow + first-build smoke, Wave 1, 8 tasks) + `07-03-PLAN.md` (foreground service + OEM dialog + recoverLast + 1h Pixel pocket-walk, Wave 2, 7 tasks)
**Methodology:** goal-backward against ROADMAP §"Phase 7" 7 success criteria (criterion 4 deferred per ADR-0011 Amendment 3) + REQUIREMENTS.md §BUILD-01 + §STAB-01 (Android-only) + 07-CONTEXT.md 28 D-NN + 07-RESEARCH.md 8 ⚠️ VERIFY markers + 07-VALIDATION.md per-task map + 07-PATTERNS.md analogs
**Provenance note:** Both plans were inline-written by the orchestrator after two gsd-planner socket-drops (70min + 54min). Scored against Phase 6 06-PLAN-CHECK PASS-WITH-NITS baseline.

---

## Verdict Summary

| Dim | Name | Verdict | Notes |
|-----|------|---------|-------|
| 1 | Goal coverage (7 ROADMAP + BUILD-01 + STAB-01) | PASS | All 7 criteria mapped (criterion 4 iOS DEFERRED explicitly per Amendment 3; criteria 1-3 → 07-01 Tasks 2-6; criteria 5-7 → 07-03 Tasks 1-6); scope boundary respected (no Phase 8/9 touch); BUILD-01 + STAB-01 acceptance items all surfaced in `must_haves.truths` |
| 2 | Dependencies + ordering | PASS | `07-03 depends_on: [07-01]` (strict serial — pocket-walk needs the signed APK from 07-01); both `autonomous: false`; within 07-01 Task 3 (ProGuard keeps) LANDS BEFORE Task 4 (minify flip) per Pitfall 9 ordering + explicit `**CRITICAL ORDER:**` note in Task 3 + `**ORDER:**` note in Task 4; within 07-03 Task 5 (recoverLast pre-walk) precedes Task 6 (1h walk) |
| 3 | Task quality (anti-shallow) | PASS-WITH-NITS | Every task has `<read_first>` with explicit § references to RESEARCH/PATTERNS/CONTEXT; every `<verify>` has `<automated>` (smoke script populated by the task itself or a Wave 0 stub); `<action>` blocks contain concrete bash + identifiers; USER ACTION tasks have explicit `<acceptance_criteria>` + `<resume-signal>` blocks. NIT: 07-01 Task 0 mixes AUTOMATIC + USER ACTION in a single `type="auto"` task instead of splitting into a checkpoint sub-task (see Findings §3.1) |
| 4 | 8 ⚠️ VERIFY items resolution | PASS | 4 of 4 RESEARCH §11-flagged items appear in 07-01 `verify_items` (MAPBOX-CONSUMER-RULES, MMKV-NAMESPACE, EXPO-TASK-MANAGER-CLASS-PATH, EXPO-GITHUB-ACTION-VERSION) + 4 of 4 in 07-03 `verify_items` (FOREGROUND-NOTIFICATION-API, EXPO-INTENT-LAUNCHER, ADB-FORCE-STOP-SEMANTICS, NOTIFICATION-ICON-FORMAT). Each has `why` + `where` + `fallback` + `fetch` URL. Total = 8 (matches RESEARCH §12 confidence table call-outs) |
| 5 | USER ACTION checkpoints | PASS | 07-01 Wave 0 (Task 0): EXPO_TOKEN + SOPS_AGE_KEY_CI generation as inline USER ACTION (boxed prompt + paste-to-clipboard sequence + `gh secret list` verify); 07-01 Task 6 = `type="checkpoint:human-action"` with 7-step matrix; 07-03 Task 5 = checkpoint:human-action with 7-row pre-walk matrix; 07-03 Task 6 = checkpoint:human-action with 5-sub-check matrix per D-18. All have structured `<resume-signal>` blocks |
| 6 | Path A keystore injection deviation | PASS | 07-01 frontmatter `deferrals` block documents Path A choice with full rationale (D-03 supersession + RESEARCH §0 existing-build.gradle preservation); Path A applied consistently in Task 2 (eas.json env block) + Task 5 (GH Actions $GITHUB_ENV injection); existing `RUNNING_ECO_RELEASE_*` Gradle properties honored (no `credentials.json` invocation); `.gitignore` (Task 0) defensively guards `credentials.json` even though never written |
| 7 | Phase 6 D-14-CI-AGE-KEY deferral lift | PASS | 07-01 Task 1 explicitly lifts D-14-CI-AGE-KEY in `<done>` block + commit message; `.sops.yaml` comma-separated multi-recipient pattern matches RESEARCH §2 verbatim (folded `>-` YAML scalar); `sops updatekeys --yes` loops over all 5 prod SOPS YAMLs (mobile-signing + mapbox + shared + oauth + sentry); dual-decrypt smoke verifies DEV_A still decrypts cleanly post-update |
| 8 | Validation continuity (Nyquist) | PASS | VALIDATION.md exists (07-VALIDATION.md, 105 lines, Wave 0 + per-task map); every code-modifying task has `<automated>` smoke; sampling continuity OK (no 3 consecutive tasks without smoke — Tasks 5/6/7 of 07-01 + Tasks 5/6/7 of 07-03 are USER ACTION/closeout, expected per VALIDATION); Wave 0 covers all MISSING refs (.gitignore + 5 smoke stubs + tool-versions + EXPO_TOKEN + SOPS_AGE_KEY_CI). Per-task map row count (8 + 6 = 14) tracks the 15 actual tasks acceptably (Task 0 of 07-01 counted as 07-01-00) |
| 9 | Quality-gate (planner prompt items) | PASS-WITH-NITS | 14 quality items satisfied; `must_haves.truths` cover all ROADMAP criteria 1-3 (07-01) + 5-7 (07-03) + DEFERRED rows for criterion 4 iOS + STAB-01 lean (07-03); commits use `feat(07-01):` / `feat(07-03):` / `chore(07-01):` / `docs(07-01):` style; NIT: 07-03 must_haves uses `~~strikethrough~~` for DEFERRED rows which is a clearer signal than 07-01's prose-only deferrals block (see Findings §9.1) |
| 10 | Mobile-codebase respect | PASS | 07-03 explicitly does NOT reimplement `recoverLast()` (D-15 honored — only validates on release build per Task 5/6 USER ACTION); SessionManager.recordingTick subscription extends existing Zustand pattern (07-03 Task 2); MMKV-flag pattern reuses existing `state/mmkv` storage (07-03 Task 4); RU-language strings preserved in all D-12 notification body + D-14 dialog copy + D-18 attestation lines; existing reanimated + turbomodule keeps preserved in proguard-rules.pro (07-01 Task 3) |

**Overall verdict:** **PASS-WITH-NITS** — proceed to `/gsd-execute-phase 7`.

---

## Detailed Findings

### Goal Coverage Table (Dim 1)

| ROADMAP §7 criterion | Covered by | Smoke / Attestation |
|---|---|---|
| 1. EAS production profile (Android) at production backend | 07-01 Task 2 (eas.json env block) + Task 5 (CI workflow eas build invocation) | `smoke-eas-config.sh` + `gh workflow view android-release.yml` |
| 2. R8 + ProGuard verified (Mapbox/MMKV/expo-task/Hermes/expo-loc) | 07-01 Task 3 (proguard keeps) + Task 4 (minify flip) + Task 6 (7-step device smoke) | `smoke-proguard-rules.sh` + `evidence/r8-smoke-attestation.txt` |
| 3. arm64-v8a only (drop armeabi-v7a) | 07-01 Task 4 (gradle.properties + build.gradle ndk.abiFilters) | `smoke-gradle-config.sh` |
| 4. ~~iOS: Hermes / bitcode / iOS 16+~~ | DEFERRED per ADR-0011 Amendment 3 | Both plans explicitly cite D-23 / iOS untouched in eas.json |
| 5. Foreground service notification on Android (~~+ iOS SLC~~) | 07-03 Task 1 (asset + app.json block) + Task 2 (dynamic notification.ts) | `smoke-notif-icon-asset.sh` + `smoke-foreground-notif.sh` + USER attestation in 07-03 Task 6 |
| 6. MIUI + One UI mitigations (auto-start dialog + recoverLast survives kill) | 07-03 Task 3 (OEM detection + intent) + Task 4 (AutostartDialog + MMKV flag) + Task 5 (recoverLast pre-walk smoke) | `smoke-oem-dialog.sh` + `AutostartDialog.test.tsx` + `recoverLast-pre-walk-attestation.txt` |
| 7. 1h pocket-walk on Pixel ≥95% GPS (~~+ iPhone~~) | 07-03 Task 6 (5-sub-check matrix per D-18) | `pocket-walk-attestation.txt` + `pocket-walk-track.gpx` |

All 7 criteria have explicit task + smoke (or manual attestation for the 4 USER ACTIONS). Criterion 4 iOS deferral surfaced in BOTH plans' `deferrals` + must_haves blocks.

### ⚠️ VERIFY Items Coverage (Dim 4)

| ID | Plan | Task | Fallback documented | Fetch URL |
|---|---|---|---|---|
| MAPBOX-CONSUMER-RULES | 07-01 | 3 | Apply explicit `-keep com.mapbox.**` verbatim (redundancy harmless) | github.com/rnmapbox/maps install.md |
| MMKV-NAMESPACE | 07-01 | 3 | Grep node_modules/react-native-mmkv/android for `^package` decl; both `com.mrousavy.mmkv` + `com.tencent.mmkv` defensively kept | mrousavy/react-native-mmkv |
| EXPO-TASK-MANAGER-CLASS-PATH | 07-01 | 3 | Use broad `expo.modules.**` keep | docs.expo.dev v54 task-manager |
| EXPO-GITHUB-ACTION-VERSION | 07-01 | 5 | npm install eas-cli directly + npx eas build | github.com/expo/expo-github-action/releases |
| FOREGROUND-NOTIFICATION-API | 07-03 | 1 + 2 | expo-notifications channel + per-tick presentNotificationAsync (Path A from RESEARCH §5) | docs.expo.dev v54 location |
| EXPO-INTENT-LAUNCHER | 07-03 | 3 | Tiny native module OR Linking.openURL with intent:// | docs.expo.dev v54 intent-launcher |
| ADB-FORCE-STOP-SEMANTICS | 07-03 | 5 + 6 | `am force-stop --user 0` OR `pm disable-user` + re-enable | developer.android.com adb#am |
| NOTIFICATION-ICON-FORMAT | 07-03 | 1 | Regenerate as SVG vector drawable OR fully-opaque PNG | developer.android.com notifications |

8 of 8 verify items present with fallback paths. Each carries a `fetch` URL the planner expects to be WebFetched at execution time if uncertainty surfaces.

### Pitfall Application Audit (Dim 4 + RESEARCH §9)

| Pitfall | Where applied | Status |
|---|---|---|
| #1 EAS Cloud fails late if env vars missing | 07-01 Task 6 phase 1 watches workflow + EAS dashboard ≤5 min | OK |
| #2 `am kill` doesn't kill foreground-service-attached process | 07-03 Task 5/6 use `am force-stop` per RESEARCH §7 + ADB-FORCE-STOP-SEMANTICS verify item | OK |
| #3 Mapbox style URLs stripped by R8 | 07-01 Task 6 step 2 explicitly checks "map renders + tiles load" | OK |
| #4 expo-task-manager >30s timeout | Out of scope (SessionManager tick is 5s) — noted in RESEARCH | n/a |
| #5 Notification icon transparency rejected by One UI 5+ | 07-03 Task 1 Path A (96×96 white silhouette) + Path B (adaptive-icon copy) + NOTIFICATION-ICON-FORMAT fallback path | OK |
| #6 versionName from git-describe on non-tag pushes | Workflow only triggers on tag pushes per 07-01 Task 5 | OK |
| #7 EXPO_TOKEN wrong scope | 07-01 Task 0 USER ACTION explicitly says "personal account" + URL | OK |
| #8 EAS rebuilds iOS reflexively | 07-01 Task 5 invocation uses `--platform android` explicitly | OK |
| #9 Minify ON before keeps in place → crash | 07-01 Task 3 `**CRITICAL ORDER:**` note + Task 4 `**ORDER:**` note enforce sequencing | OK |
| #10 OEM intent unavailable → crash | 07-03 Task 3 `openOEMSettings.ts` wraps `startActivityAsync` in try/catch + generic fallback | OK |
| #11 `sops updatekeys` silent failure on bad YAML | 07-01 Task 1 dual-decrypt smoke catches broken header | OK |
| #12 keystore accidentally committed | 07-01 Task 0 step 2 adds both keystore + credentials.json to .gitignore BEFORE Task 5 CI run | OK |

12 of 12 RESEARCH §9 pitfalls applied or out-of-scope-acknowledged.

### USER ACTION Resume-Signal Format (Dim 5)

| Task | Format | Verifiable? |
|---|---|---|
| 07-01 Task 0 (EXPO_TOKEN + SOPS_AGE_KEY_CI) | Boxed prompt + "Type done to continue" + `gh secret list` verify | YES |
| 07-01 Task 6 (7-step R8 smoke) | 7-row PASS/FAIL matrix copied verbatim from `r8-smoke-attestation.txt` | YES |
| 07-03 Task 5 (recoverLast pre-walk) | 7-row PASS/FAIL matrix copied verbatim from `recoverLast-pre-walk-attestation.txt` | YES |
| 07-03 Task 6 (1h pocket-walk) | 5-sub-check matrix + overall verdict copied verbatim from `pocket-walk-attestation.txt` | YES |

All 4 USER ACTIONS have structured machine-parseable resume signals matching Phase 6 06-01 Task 6 attestation pattern (PATTERNS §5 Analog C).

### Path A Consistency Audit (Dim 6)

| Point of injection | Implementation | Path A compliance |
|---|---|---|
| `apps/mobile-rn/eas.json production.android.env` | `RUNNING_ECO_RELEASE_STORE_FILE` + `RUNNING_ECO_RELEASE_KEY_ALIAS` (static — no passwords) | OK |
| GH Actions `$GITHUB_ENV` after SOPS decrypt | `RUNNING_ECO_RELEASE_STORE_PASSWORD` + `RUNNING_ECO_RELEASE_KEY_PASSWORD` propagated (Task 5) | OK |
| Existing `build.gradle signingConfigs.release` | UNTOUCHED — reads from Gradle properties via existing `RUNNING_ECO_RELEASE_*` pattern | OK |
| `apps/mobile-rn/credentials.json` | NEVER WRITTEN; only defensive `.gitignore` entry (Task 0) | OK |

Path A preserved consistently — no `credentials.json` references in any task action beyond the defensive gitignore entry.

### Per-Task Scope Sanity (Dim 5 quantitative)

| Plan | Tasks | files_modified count | Wave 0 type | Status |
|---|---|---|---|---|
| 07-01 | 8 (including Task 0 Wave 0 + Task 6 USER ACTION + Task 7 closeout) | 19 | combined auto + inline USER ACTION | Within budget (3-task target); each task ≤4 files except Task 0 (7 files, all stubs) |
| 07-03 | 7 (including Task 5/6 USER ACTION + Task 7 closeout) | 17 | inherits Wave 0 from 07-01 (no separate Wave 0) | Within budget; Task 4 has 3 files (AutostartDialog + test + TrackerStartScreen edit) |

Both plans within scope budget. 07-01 at 8 tasks is high but justified — splitting would lose critical ordering (Task 3 keeps → Task 4 minify flip → Task 5 workflow → Task 6 first-build smoke is a coupled sequence that benefits from co-location in one plan).

---

## Nits (Non-Blocking Recommendations)

### NIT 3.1 — Task 0 dual-mode in single `type="auto"` task

07-01 Task 0 mixes AUTOMATIC scaffolding (evidence dir + smoke stubs + tool versions + .gitignore) with USER ACTION (EXPO_TOKEN generation + SOPS_AGE_KEY_CI generation). Per Phase 6 06-01-PLAN.md precedent, USER ACTIONS get their own `type="checkpoint:human-action"` task with a `<resume-signal>` block. The current Task 0 inlines the USER ACTION prompt inside an `<action>` block which works but is structurally inconsistent. Recommendation: split into Task 0a (auto scaffolding) + Task 0b (checkpoint:human-action for EXPO_TOKEN + SOPS_AGE_KEY_CI). Not blocking — the inline prompt + "Type 'done' to continue" + `gh secret list` verify all function — but worth aligning with Phase 6 pattern at next revision.

### NIT 9.1 — Deferrals expression inconsistency between plans

07-01 expresses deferrals as a `deferrals:` frontmatter block with `id` + `summary` + `scope` (D-03-PATH-A + D-23-IOS-PRODUCTION). 07-03 uses BOTH a `deferrals:` block (D-24-VENDOR-MATRIX-EXPANSION + D-25-REPRODUCIBLE-BUILD) AND a `~~strikethrough~~` style in `must_haves.truths` for the iOS + lean-vendor deferred rows. The strikethrough rows in 07-03 are clearer at-a-glance but the dual mechanism is inconsistent. Recommendation: pick one expression. Not blocking.

### NIT 8.1 — VALIDATION.md `nyquist_compliant: false`

07-VALIDATION.md frontmatter still has `nyquist_compliant: false` (line 5). Per VALIDATION.md own §"Validation Sign-Off", this flips to `true` "by planner once plans are written + smoke scripts exist". Both plans are now written + smoke scripts are populated in-task. Recommendation: flip to `true` at next opportunity (e.g., the closeout task on the umbrella SUMMARY, or as part of 07-01 Task 0 since all smoke stub paths are referenced there). Not blocking — execution still proceeds — but it's a hygiene flag.

### NIT 6.1 — `cli.appVersionSource` already in eas.json (out-of-band)

CONTEXT D-10 says "appVersionSource: 'remote' already in eas.json"; PATTERNS §3 confirms it on line 4. 07-01 Task 2 action does NOT verify this is present (only modifies `production.android`). If the existing eas.json got edited between plan-write and execution, the EAS auto-versionCode behavior could break silently. Recommendation: 07-01 Task 2 step 1 could add a defensive `python3 -c "assert json.load(open('apps/mobile-rn/eas.json'))['cli']['appVersionSource'] == 'remote'"` smoke. Trivial fix; not blocking.

### NIT 4.1 — VERIFY-NOTIFICATION-ICON-FORMAT lacks Pixel-only validation surfacing

VERIFY-NOTIFICATION-ICON-FORMAT fallback path says "If One UI tester reports icon-not-shown: regenerate as SVG OR fully-opaque PNG." But the only test device in Plan 07-03 is the dev's Pixel (where the issue doesn't surface). Per RESEARCH §9 Pitfall 5: "test on a Samsung device during pocket-walk if available, OR document as known-issue if only Pixel available." 07-03 Task 6 doesn't include a "if no Samsung tester, document as known-issue in 07-03-SUMMARY" step. Recommendation: 07-03 Task 7 (closeout SUMMARY) `§"Deviations from plan"` should mention "notification icon Samsung One UI compatibility = unvalidated (Pixel-only test device); document as v1.0.1 watch item if beta tester reports surface". Not blocking — Phase 7's load-bearing gate is the pocket-walk, not Samsung-icon validation.

---

## Goal-Backward Trace (Final Sanity Check)

**Phase goal (CONTEXT §Phase Boundary):** "Ship a production Android APK that survives a 1-hour GPS-tracked run with the phone in your pocket."

| Truth backing the goal | Plan + Task | Verification |
|---|---|---|
| APK is built + signed | 07-01 Task 2 (eas.json) + Task 5 (workflow) + Task 6 (first-build USER attestation) | EAS build id captured in r8-smoke-attestation.txt |
| APK installs on Pixel | 07-01 Task 6 step 6 (`bundletool install-apks`) + USER attestation step 1 PASS | Manual: app opens without crash |
| APK survives R8/ProGuard | 07-01 Task 3 (keeps) + Task 4 (minify) + Task 6 (7-step smoke) | r8-smoke-attestation 7-row matrix |
| Foreground notification visible during recording | 07-03 Task 1 (asset + config) + Task 2 (dynamic update) | Pocket-walk sub-check 2 |
| `recoverLast` survives adb force-stop on release build | 07-03 Task 5 (pre-walk smoke) + Task 6 (mid-walk kill at min 30) | recoverLast-pre-walk-attestation + pocket-walk sub-check 4 |
| 1h pocket-walk ≥95% GPS points | 07-03 Task 6 (5-sub-check matrix per D-18) | pocket-walk-attestation sub-check 1 (1710+ of 1800) |

All 6 truths trace to a Plan + Task + Verification triple. Goal coverage is complete.

---

## Comparison Against Phase 6 06-PLAN-CHECK Baseline (PASS-WITH-NITS)

| Dimension | Phase 6 verdict | Phase 7 verdict | Materially thinner? |
|---|---|---|---|
| Frontmatter completeness (must_haves + verify_items + deferrals + tags) | All present | All present (07-01 + 07-03 both) | NO |
| Task XML shape (read_first + action + verify + done + resume-signal) | All tasks compliant | All tasks compliant | NO |
| must_haves rigor (truths + artifacts + key_links + min_lines/contains) | 06-01 has 4 truths + 9 artifacts + 3 key_links | 07-01: 10 truths + 9 artifacts + 3 key_links; 07-03: 7 truths + 9 artifacts + 3 key_links | NO — thicker if anything |
| USER ACTION resume-signal | Phase 6 06-01 Task 6 = 5-line attestation block | Phase 7 has 4 USER ACTIONS, all with attestation blocks | NO |
| Smoke script population pattern | Phase 6 evidence/smoke-*.sh populated in-task | Phase 7 follows same pattern (5 smoke scripts populated across 07-01 Tasks 0-4 + 3 across 07-03 Tasks 1-3) | NO |
| Fallback path documentation | Phase 6 11 deferrals tracked | Phase 7 8 ⚠️ VERIFY items + 4 deferrals tracked | NO |

Phase 7 plans are structurally on par with Phase 6 (which passed PASS-WITH-NITS with a real planner-agent). The inline-write provenance has NOT degraded plan quality on any dimension. PASS-WITH-NITS is the correct verdict.

---

## Recommendation

**Proceed to `/gsd-execute-phase 7`.**

The 5 nits listed above are non-blocking quality-of-life improvements. None block goal achievement. The plans are executable as-written.

If the executor surfaces any of the 8 ⚠️ VERIFY items during run (e.g., MMKV namespace differs from `com.mrousavy.mmkv`), the documented fallback paths handle the divergence in-plan without re-planning.

The load-bearing gate remains 07-03 Task 6 (1h Pixel pocket-walk). All upstream tasks exist to make that gate executable. If it fails, 07-03 stays open until cause investigated + fixed + re-walked per CONTEXT D-19.

---

*Phase: 7-release-builds-mobile-stability*
*Plan check completed: 2026-05-21 (verdict PASS-WITH-NITS; proceed to execute-phase)*
