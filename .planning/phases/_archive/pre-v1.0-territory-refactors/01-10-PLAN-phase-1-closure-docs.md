---
phase: 01-validate-close-territory-core
plan: 10
type: execute
wave: 4
depends_on: [01, 02, 03, 04, 05, 06, 07, 08, 09]
files_modified:
  - STATUS.md
  - docs/DEVELOPMENT_PLAN.md
  - docs/DECISIONS/0005-phase-1-field-test-outcomes.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
autonomous: true
requirements: [PHASE1-14]
maps_to_existing_plan: Phase 1 closure documentation — supports ROADMAP §Success Criteria #5

must_haves:
  truths:
    - "STATUS.md Phase 1 progress section marks PHASE1-01..14 (or the corresponding P1-* IDs) as ✅"
    - "docs/DEVELOPMENT_PLAN.md Phase 1 acceptance section reflects the field-test outcome (pass / partial-pass with documented exceptions)"
    - "docs/DECISIONS/0005-phase-1-field-test-outcomes.md exists as a complete ADR documenting test results + decisions on any failures or deferrals (Russian, matching ADR-0004 style)"
    - ".planning/STATE.md Current Position advances from Phase 1 to Phase 2 (or notes Phase 1 partial closure with deferred items)"
    - ".planning/ROADMAP.md Phase 1 checkbox becomes [x] (fully closed) OR retains [ ] with a NOTE pointing to ADR-0005 if a critical NFR was not met"
  artifacts:
    - path: docs/DECISIONS/0005-phase-1-field-test-outcomes.md
      provides: "ADR with Russian narrative documenting field-test outcomes + accepted limitations + decisions on any deferred follow-ups"
      min_lines: 60
  key_links:
    - from: docs/DECISIONS/0005-phase-1-field-test-outcomes.md
      to: tests/FIELD_PROTOCOL.md
      via: ADR Context section links to the protocol file
      pattern: "FIELD_PROTOCOL\\.md"
    - from: STATUS.md
      to: tests/FIELD_PROTOCOL.md
      via: Phase 1 closure section cross-references the field results
      pattern: "FIELD_PROTOCOL\\.md|PHASE1-"
---

<objective>
Per CONTEXT.md D-35..D-37 + ROADMAP §Success Criteria #5: officially close Phase 1 across all canonical documents. Update `STATUS.md` (project-level living doc), `docs/DEVELOPMENT_PLAN.md` (canonical task IDs), `.planning/STATE.md` (GSD state), and `.planning/ROADMAP.md` (GSD phase tracker). Write `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` ADR per D-36 — capturing any field-test surprises, accepted limitations, or items deferred to follow-up phases.

Purpose: Phase 1 closure must be visible across ALL source-of-truth documents (the project has historically tracked status in both `STATUS.md` and `docs/DEVELOPMENT_PLAN.md`; GSD adds two more — `STATE.md` and `ROADMAP.md`). A single closed checkpoint avoids drift.

This plan is `autonomous: true` because it is pure documentation editing — all source data (field-test results, refactor outcomes) comes from Plans 01-09 SUMMARYs and the FIELD_PROTOCOL.md file.

Output: Updates to 4 living documents + a new ADR.
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
@CLAUDE.md

@STATUS.md
@docs/DEVELOPMENT_PLAN.md
@docs/DECISIONS/0004-feed-backend-cleanup.md
@tests/FIELD_PROTOCOL.md

<!-- All Plan SUMMARYs feed into the ADR + status updates -->
@.planning/phases/01-validate-close-territory-core/01-01-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-02-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-03-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-04-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-05-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-06-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-07-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md
@.planning/phases/01-validate-close-territory-core/01-09-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write ADR-0005 — Phase 1 field-test outcomes</name>
  <files>docs/DECISIONS/0005-phase-1-field-test-outcomes.md</files>
  <action>
    Per CONTEXT.md D-36 + PATTERNS.md §ADR-0005 (lines 697-701):

    Read `docs/DECISIONS/0004-feed-backend-cleanup.md` to learn the existing ADR structure (Title, Status, Context, Decision, Consequences, in Russian per CLAUDE.md). Match that structure exactly.

    Read each plan SUMMARY (01-01-SUMMARY.md through 01-09-SUMMARY.md) and `tests/FIELD_PROTOCOL.md` to extract concrete data points.

    Required sections in `docs/DECISIONS/0005-phase-1-field-test-outcomes.md`:

    ```
    # ADR-0005: Phase 1 Field Test Outcomes

    **Дата:** <YYYY-MM-DD>
    **Статус:** Accepted
    **Связанные:** ADR-0001 (Expo RN), STATUS.md §Phase 1, docs/DEVELOPMENT_PLAN.md §3, tests/FIELD_PROTOCOL.md

    ## Контекст

    Phase 1 (Validate & Close Territory Core) включал 14 REQ-ID:
    - Полевые тесты на трёх классах устройств: Pixel, iPhone, Chinese-Android (PHASE1-01..04)
    - Финальные рефакторы (PHASE1-05..12)
    - Ротация Mapbox-токена (PHASE1-13)
    - Документальное закрытие (PHASE1-14)

    Результаты полевых тестов и накопленные решения за Phase 1 фиксируются ниже.

    ## Решение

    ### Полевые результаты (сводка из tests/FIELD_PROTOCOL.md)

    | Test | NFR | Pixel | iPhone | Chinese-Android |
    |------|-----|-------|--------|-----------------|
    | T1 (distance ≤3%) | NFR-001 | <result> | <result or deferred> | <result or deferred> |
    | T2 (area ≤5%) | NFR-002 | <result> | <result> | <result> |
    | T6 (battery ≤10%/h) | NFR-003 | <result> | <result> | <result> |
    | T7 (FPS ≥50) | NFR-006 | <result> | <result> | <result> |
    | T8 (background ≥95%) | NFR-005 | <result> | <result> | <result> |
    | T9 (closed-loop area) | NFR-002 | <result> | <result> | <result> |

    [Заполните таблицу из FIELD_PROTOCOL.md. Если тест не выполнен — "deferred" с причиной. Если не прошёл порог — "fail: <значение>" с разбором ниже.]

    ### Принятые ограничения (Accepted limitations)

    [Перечислите случаи, где результат не дотянул до NFR, но решено принять как известное ограничение. Шаблон:]

    - **<NFR-ID>: <device> — <fail value>**
      - Корень причины: <e.g., Xiaomi MIUI убивает foreground service несмотря на autostart>
      - Workaround для пользователя: <e.g., добавить in-app подсказку "Отключите оптимизацию батареи">
      - Когда пересмотреть: <e.g., перед public release, как часть Phase 4 privacy UX>

    ### Решения, принятые во время Phase 1

    - **SessionManager extraction (D-08, D-09):** Phase A (gradual cutover) — manager+store coexist. Phase B (closure detection inside manager) deferred to a future phase.
    - **Big-track simplification (D-12..D-15):** `@turf/simplify` с threshold 2000 точек. Visvalingam–Whyatt fallback не понадобился.
    - **Offline region picker bounds bug (Pitfall 1):** исправлен через новый `createCustomPack` API; регрессионный тест зафиксирован.
    - **expo-haptics pinned to ~14.1.4:** SDK 54 совместимость; SDK 55 (15.x) — Phase 2+.
    - **Mapbox token rotation (D-32):** sk.<…> теперь в `~/.netrc` + `~/.gradle/gradle.properties`; ESLint guard включён.
    - **Real-SQLite integration tests (R5, D-10):** <включён через expo-sqlite | через better-sqlite3 shim> — см. 01-01-SUMMARY.md probe outcome.

    ### Deferred items → следующие фазы

    - <Item 1: e.g., HR-zone time breakdown — Phase 6.5 (cosmetic).>
    - <Item 2: e.g., privacy zones — Phase 4.>
    - <Item 3 if applicable from any plan SUMMARY.>

    ## Последствия

    - Phase 1 закрыта в STATUS.md и docs/DEVELOPMENT_PLAN.md.
    - Phase 2 (Real Health Integrations) разблокирована и может стартовать.
    - <Accepted limitations задокументированы для будущего ретроспективного review.>
    - <Если какой-то NFR провалился: в release notes для бета-тестеров будет упомянуто.>
    ```

    NEVER fabricate field results — read FIELD_PROTOCOL.md and copy exact numbers. If a device class has not run yet (per Plan 09 deferred state), document "deferred" with the reason from Plan 09's SUMMARY. NEVER omit accepted-limitation entries — they are the explicit cost of closing Phase 1 with partial data.

    Implements PHASE1-14 ADR layer (D-36).
  </action>
  <verify>
    <automated>test -f docs/DECISIONS/0005-phase-1-field-test-outcomes.md && grep -c "PHASE1-\\|NFR-\\|FIELD_PROTOCOL" docs/DECISIONS/0005-phase-1-field-test-outcomes.md</automated>
  </verify>
  <done>ADR exists with all required sections. Result table populated from FIELD_PROTOCOL.md. Accepted limitations + deferred items explicit. Russian narrative throughout.</done>
</task>

<task type="auto">
  <name>Task 2: Update STATUS.md + docs/DEVELOPMENT_PLAN.md Phase 1 closure rows</name>
  <files>STATUS.md, docs/DEVELOPMENT_PLAN.md</files>
  <action>
    Per CONTEXT.md D-35:

    Step 2a — Edit `STATUS.md`. Read the current "Текущая фаза" section + Phase 1 progress. Add a new top entry (above the existing "Review fixes R1–R8" entry) documenting Phase 1 closure:

    ```
    ## Текущая фаза

    **Phase 1 closed (GSD)** ✅ (<YYYY-MM-DD>) — см. [ADR-0005](docs/DECISIONS/0005-phase-1-field-test-outcomes.md), [FIELD_PROTOCOL.md](tests/FIELD_PROTOCOL.md):

    - **PHASE1-01..04** (field tests on Pixel/iPhone/Chinese-Android): <complete | partial>; results in `tests/FIELD_PROTOCOL.md`.
    - **PHASE1-05** (big-track simplification): `@turf/simplify` dual-source активен при >2000 точек. T7 FPS verified.
    - **PHASE1-06** (TrackerLive hook extraction): `useTrackerCamera` / `useLayerVisibility` / `usePauseUI` extracted; screen body reduced.
    - **PHASE1-07** (SessionManager): pure class в `src/domain/session/`; store делегирует; real-SQLite integration tests добавлены (CONCERNS R5 закрыт частично — sessionRepository covered).
    - **PHASE1-08** (closure haptic + toast): `expo-haptics@~14.1.4`; in-house Toast.
    - **PHASE1-09** (summary screen): `RunDetailsScreen` flow verified; nav.replace; snapshot test.
    - **PHASE1-10** (manual offline picker): RegionPickerScreen + critical bounds-order bug fix in `offline.ts`.
    - **PHASE1-11..12** (adaptive sampling + iOS SLC): `LocationAdapter.setSamplingMode`; gap-resume on AppState foreground.
    - **PHASE1-13** (Mapbox token rotation): `docs/SECRETS.md` playbook + ESLint guard + sk.<…> в `~/.netrc` / `~/.gradle/`.
    - **PHASE1-14** (closure docs): this entry + ADR-0005.

    Phase 1 maps to canonical P1-A..P1-M IDs in `docs/DEVELOPMENT_PLAN.md` §3. Все pending P1-* помечены ✅ или явно deferred с указанием будущей фазы.

    tsc clean, **jest <NEW-BASELINE>/<NEW-BASELINE> passing** (+<count> new tests across plans 01-08).
    ```

    PRESERVE all existing entries below (Review fixes R1–R8, Round 3 P2 scaffolds, etc.) — never delete project history.

    Step 2b — Edit `docs/DEVELOPMENT_PLAN.md` §3 (Phase 1). Find the Phase 1 acceptance / closure section near the end of the §3 block. Update it to:

    ```
    ### Phase 1 — Acceptance Status: ✅ CLOSED (<YYYY-MM-DD>)

    Phase 1 acceptance criteria (ТЗ §3.15) verified through GSD plans 01-10 (`.planning/phases/01-validate-close-territory-core/`):

    | Criterion | Status | Evidence |
    |-----------|--------|----------|
    | NFR-001 distance ≤3% (T1 on 3 OEMs) | <pass | partial: <devices>> | tests/FIELD_PROTOCOL.md |
    | NFR-002 area ≤5% (T2/T9) | <pass | partial> | tests/FIELD_PROTOCOL.md |
    | NFR-003 battery ≤10%/h (T6) | <pass | partial> | tests/FIELD_PROTOCOL.md + ADR-0005 |
    | NFR-005 background ≥95% (T8) | <pass | partial> | tests/FIELD_PROTOCOL.md + ADR-0005 |
    | NFR-006 FPS ≥50 (T7) | <pass | partial> | tests/FIELD_PROTOCOL.md |
    | NFR-007 memory ≤100 MB growth (T6) | <pass | partial> | tests/FIELD_PROTOCOL.md |
    | Refactors P1-B / P1-C / P1-D-04 / P1-G-09 / P1-I-02 / P1-I-05 / P1-J-05 / P1-K-04 | ✅ shipped via GSD plans | .planning/phases/01-validate-close-territory-core/SUMMARIES |
    | Mapbox token rotation (P1 security) | ✅ | docs/SECRETS.md + ADR-0005 |

    Accepted limitations + deferred follow-ups in [ADR-0005](DECISIONS/0005-phase-1-field-test-outcomes.md).
    ```

    Per-task ID updates: for each P1-* ID that was closed by a GSD plan (per the mapping in each PLAN's frontmatter `maps_to_existing_plan` line), mark ✅ or update the acceptance line. Read each P1 task subsection — if it says "отложено / отложен / TODO", update to "✅ closed via PHASE1-XX in GSD Phase 1" (specific REQ-ID).

    NEVER delete prior P1-* task text — append the closure note at the bottom of each task's subsection.

    Implements PHASE1-14 docs layer (D-35).
  </action>
  <verify>
    <automated>grep -c "Phase 1 closed\\|✅ CLOSED" STATUS.md docs/DEVELOPMENT_PLAN.md</automated>
  </verify>
  <done>STATUS.md top entry documents Phase 1 closure. docs/DEVELOPMENT_PLAN.md Phase 1 has acceptance status table. Both reference ADR-0005 + FIELD_PROTOCOL.md.</done>
</task>

<task type="auto">
  <name>Task 3: Update .planning/STATE.md + .planning/ROADMAP.md (GSD documents)</name>
  <files>.planning/STATE.md, .planning/ROADMAP.md</files>
  <action>
    Per CONTEXT.md D-37 + ROADMAP §Success Criteria #5:

    Step 3a — Edit `.planning/STATE.md`. Update the "Current Position" section:

    Before (current):
    ```
    Phase: 1 of 8 (Validate & Close Territory Core)
    Plan: 0 of TBD in current phase
    Status: Ready to plan
    Last activity: 2026-05-14 — GSD brownfield init completed
    ```

    After (post-closure):
    ```
    Phase: 2 of 8 (Real Health Integrations)
    Plan: 0 of TBD in current phase
    Status: Phase 1 closed <YYYY-MM-DD>; Phase 2 ready to plan
    Last activity: <YYYY-MM-DD> — Phase 1 closed via plans 01-10; see ADR-0005

    Progress: [█░░░░░░░░░] 12.5% (Phase 1 of 8 complete)
    ```

    If Phase 1 closed with partial field-test results (some devices deferred), reflect that nuance:
    ```
    Status: Phase 1 closed <YYYY-MM-DD> with accepted limitations (see ADR-0005); Phase 2 ready to plan
    ```

    Update "Performance Metrics" → "By Phase" table: add a row for Phase 1 with `Plans: 10`, `Total: 10`, `Avg/Plan: <count from SUMMARYs>`.

    Update "Accumulated Context" → "Decisions" subsection: append "ADR-0005: Phase 1 field-test outcomes — see docs/DECISIONS/0005-phase-1-field-test-outcomes.md".

    Update "Session Continuity":
    ```
    Last session: <YYYY-MM-DD> — Phase 1 closure (Plan 10).
    Stopped at: All Phase 1 plans complete; Phase 2 ready to plan.
    Resume file: .planning/phases/02-real-health-integrations/02-CONTEXT.md (will be created on /gsd-discuss-phase 2)
    Next action: `/gsd-discuss-phase 2` (Real Health Integrations).
    ```

    Step 3b — Edit `.planning/ROADMAP.md`. Find the Phase 1 line in the Phases list (line ~19):
    ```
    - [ ] **Phase 1: Validate & Close Territory Core** - ...
    ```
    Change to:
    ```
    - [x] **Phase 1: Validate & Close Territory Core** - Closed <YYYY-MM-DD>. See ADR-0005 for outcomes.
    ```

    If Phase 1 closed with partial / deferred items (per Plan 09 outcome), use:
    ```
    - [~] **Phase 1: Validate & Close Territory Core** - Closed <YYYY-MM-DD> with accepted limitations (ADR-0005).
    ```
    (where `[~]` indicates "closed with caveats" — note this is custom syntax; alternative is to keep `[ ]` but add a note. Pick `[x]` if all NFRs passed, `[~]` if some deferred — whatever is clearer for the project.)

    Update the "Progress" table at the bottom: Phase 1 row → `10/10`, `Status: Closed`, `Completed: <YYYY-MM-DD>`.

    NEVER mark Phase 2 as in-progress at this step — that happens when `/gsd-discuss-phase 2` runs. This plan's job is only to mark Phase 1 done.

    Implements PHASE1-14 GSD-side closure (D-37).
  </action>
  <verify>
    <automated>grep -c "Phase 1.*Closed\\|Phase 1.*closed\\|\\[x\\] \\*\\*Phase 1" .planning/STATE.md .planning/ROADMAP.md</automated>
  </verify>
  <done>.planning/STATE.md Current Position points to Phase 2. .planning/ROADMAP.md Phase 1 entry shows `[x]` or `[~]`. Progress table updated. Atomic commit: `docs(phase1): close Phase 1 in GSD state + roadmap (PHASE1-14)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new trust boundaries — pure documentation editing.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-10-01 | Repudiation | Future contributor disputes whether Phase 1 was closed | mitigate | Multiple living docs (STATUS.md, DEVELOPMENT_PLAN.md, STATE.md, ROADMAP.md) + ADR-0005 cross-reference each other. Single closure event across 4 docs is hard to dispute. |
| T-01-10-02 | Tampering | ADR-0005 fabricates passing results to hide failures | mitigate | Each result row in ADR is sourced verbatim from FIELD_PROTOCOL.md (which is committed with GPX files + battery photos providing physical evidence). Audit trail. |

Very low security surface.
</threat_model>

<verification>
- `test -f docs/DECISIONS/0005-phase-1-field-test-outcomes.md && wc -l docs/DECISIONS/0005-phase-1-field-test-outcomes.md` ≥60 lines.
- `grep -c "Phase 1.*closed\\|PHASE1-" STATUS.md` shows ≥10 references (one per REQ-ID).
- `grep -c "Phase 1.*CLOSED\\|✅" docs/DEVELOPMENT_PLAN.md` shows the closure section + per-P-ID checkmarks.
- `.planning/STATE.md` Current Position → Phase 2.
- `.planning/ROADMAP.md` Phase 1 → `[x]` or `[~]`.
- All cross-links resolve (ADR ↔ FIELD_PROTOCOL ↔ STATUS ↔ STATE ↔ ROADMAP).
</verification>

<success_criteria>
- All must_haves.truths above are TRUE.
- Single atomic commit for this plan: `docs(phase1): close Phase 1 — STATUS, DEV_PLAN, STATE, ROADMAP, ADR-0005 (PHASE1-14)` — co-locates all four file updates so a future revert is a single git operation.
- After this commit, running `/gsd-discuss-phase 2` (Real Health Integrations) is the natural next step.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-10-SUMMARY.md` capturing:
- ADR-0005 length + key decisions logged
- Pass/fail breakdown across PHASE1-01..14
- Any items carried into Phase 2+ (cross-link to `.planning/STATE.md` Deferred Items)
- Total Jest baseline at Phase 1 close (e.g., "from 435 to <NEW-BASELINE>")
- Cross-link: closes PHASE1-14 + supports ROADMAP §Success Criteria #5; marks Phase 1 fully closed.
</output>
