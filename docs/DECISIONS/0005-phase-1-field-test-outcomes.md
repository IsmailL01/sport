# ADR-0005: Phase 1 Field-Test Outcomes — Code Closeout, Deferred Validation

**Дата:** 2026-05-14
**Статус:** Accepted (deferred-aware closure)
**Связанные:** ADR-0001 (Expo RN), STATUS.md §Phase 1, docs/DEVELOPMENT_PLAN.md §3, tests/FIELD_PROTOCOL.md, .planning/phases/01-validate-close-territory-core/01-09-SUMMARY.md, .planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md

## Контекст

Phase 1 (Validate & Close Territory Core) включал 14 REQ-ID:

- **PHASE1-01..04** — полевые тесты на трёх классах устройств (Pixel, iPhone, Chinese-Android): T1 (distance ≤3 %, NFR-001), T2/T9 (area ≤5 %, NFR-002), T6 (battery ≤10 %/h + memory ≤100 MB, NFR-003/NFR-007), T7 (FPS ≥50 при ≥5000 точек, NFR-006), T8 (background ≥95 % record-time, NFR-005).
- **PHASE1-05..12** — финальные code-level рефакторы (big-track simplification, hook extraction TrackerLive, SessionManager extraction + real-SQLite tests, closure haptic+toast, summary screen verify, manual offline region picker, adaptive sampling + iOS SLC gap-resume).
- **PHASE1-13** — ротация Mapbox-токена и ESLint guard от secret-литералов (Tasks 1-3 — playbook + ESLint + audit; Task 4 — owner-driven dashboard rotation).
- **PHASE1-14** — закрытие фазы в `STATUS.md`, `docs/DEVELOPMENT_PLAN.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` + этот ADR.

Phase 1 шла на ветке `feat/cursona-redesign` (та же ветка, на которой ранее закрывались Phase 8 / K..L). К 2026-05-14 завершён **только code-level слой**: Plans 01–08 (Tasks 1-3 по PHASE1-13) и Plan 09 Task 1 (поле-протокол scaffold). Физических прогонов на устройствах **не было**: PHASE1-01..04 заблокированы на (а) выполнении Plan 08 Task 4 (Mapbox `sk.` token rotation в dashboard + распространение на `~/.netrc` и `~/.gradle/gradle.properties`), (б) приобретении или подготовке устройств, (в) выделении непрерывного времени для T6 (2 ч) и T8 (30 мин в кармане).

Этот ADR фиксирует решение: **Phase 1 закрывается на code-level, но формально не закрыта до выполнения полевой валидации.** Phase 2 (Real Health Integrations) может стартовать на code-level, но Phase 1 acceptance §3.15 пункты M-01..M-04 остаются открытыми до тех пор, пока этот ADR не будет обновлён с измеренными значениями NFR.

> **Почему мы вообще закрываем фазу с открытыми пунктами:** code-level рефакторы (PHASE1-05..12) уже сходятся в `feat/cursona-redesign` и могут блокировать дальнейшие плановые работы, если оставлять их «в подвешенном состоянии». Полевые тесты — это owner-driven процесс, который не зависит от code-changes и тегов commit-ов; он происходит на готовых APK/IPA в реальной обстановке. Формально разделять «code closeout» и «field validation» — корректная гранулярность.

## Решение

### Полевые результаты (сводка из tests/FIELD_PROTOCOL.md)

| Test | NFR | Pixel | iPhone | Chinese-Android |
|------|-----|-------|--------|-----------------|
| T1 (distance ≤3 %) | NFR-001 | deferred | deferred | deferred |
| T2 (area ≤5 %, статика) | NFR-002 | deferred | deferred | deferred |
| T6 (battery ≤10 %/h + memory ≤100 MB) | NFR-003 + NFR-007 | deferred | deferred | deferred |
| T7 (FPS ≥50 при ≥5000 pts) | NFR-006 | deferred | deferred | deferred |
| T8 (background ≥95 %) | NFR-005 | deferred | deferred | deferred |
| T9 (closed-loop area ≤5 %) | NFR-002 | deferred | deferred | deferred |

**Причина deferred:** ни один из 18 тестов (6 × 3 device classes) ещё не выполнен. Per-device tables в `tests/FIELD_PROTOCOL.md` — все ячейки `—` / `pending`. Plan 09 SUMMARY (`01-09-SUMMARY.md` §CHECKPOINT REQUIRED) фиксирует это явно: «Plan 09 Task 1 is the only autonomous task; Tasks 2-4 require physical devices + physical activity + a Garmin reference. Claude cannot perform them».

> **При обновлении ADR после прогонов:** заменить `deferred` на одну из:
> - `pass: <значение> (<error %>)` — например `pass: 5.02 km / +0.4 %`.
> - `fail: <значение> (<error %>) → accepted limitation: <ссылка ниже>` — например `fail: 12.3 %/h → accepted limitation: Xiaomi MIUI killer`.
> - `n/a: <причина>` — например `n/a: device class not acquired`.

### Принятые ограничения (Accepted limitations)

На момент closure известных measured limitations **нет** (никаких прогонов не было). Ожидаемые риски, которые могут стать accepted limitation после прогонов, документируются заранее (per CONTEXT.md D-30, D-36):

- **NFR-005 на Chinese-Android (T8):** агрессивные MIUI / ColorOS / FuntouchOS / MagicOS battery optimizer могут убивать foreground service несмотря на правильно настроенный Autostart. Если T8 fail-ит даже при включённом Autostart + battery saver whitelist, это будет принято как known limitation (см. CONTEXT.md D-36); workaround — in-app hint в Phase 4 (Privacy & Visibility) с рекомендацией отключить battery optimization для конкретных OEM. PHASE1-12 SLC fallback на Android **не помогает** — `expo-location` не предоставляет SLC API на Android (D-30).
- **NFR-005 на iPhone (T8):** iOS иногда suppress foreground-service notification, ведя к gap в треке. PHASE1-12 iOS SLC + AppState foreground gap-resume mitigation реализованы (см. `01-07-SUMMARY.md`); ожидание — gap visible (не интерполируется per D-29), но запись продолжается. Если активный record-time всё равно <95 %, принять как known limitation для iOS background и документировать failure mode в release notes.
- **NFR-003 на Chinese-Android (T6):** если battery rate > 10 %/h из-за CPU-агрессивности OEM при foreground location + WebGL render — accept как known limitation, добавить in-app hint «отключите Power-Saving Mode».
- **NFR-006 (T7):** big-track simplification (PHASE1-05 / Plan 05) уже снижает point count для display layer; если на Pixel/iPhone FPS всё-таки <50 на 10k+ pts, можно ужесточить tolerance в `simplifyForDisplay`. Real-time fallback (Visvalingam–Whyatt) — deferred per CONTEXT.md «Deferred Ideas», не блокирует Phase 1.

### Решения, принятые во время Phase 1 (code-level)

- **SessionManager extraction (D-08, D-09, Plan 01):** Phase A (gradual cutover) выполнена — pure-domain `SessionManager` класс живёт в `apps/mobile-rn/src/domain/session/`, `useActivityStore` делегирует к нему mutating operations. Phase B (closure detection + lap orchestration внутри manager) отложена; manager пока не знает про zustand / wallet / records — orchestration остаётся в `postStopEnrich` wrapper-е в store. См. `01-01-SUMMARY.md`.
- **Real-SQLite integration tests (R5, D-10, Plan 01):** `expo-sqlite` под `jest-expo@~54.0.0` не запускается (отсутствует `expo-asset` runtime dep); поэтому интеграционные тесты идут через `better-sqlite3@12.10.0` Jest-shim в `apps/mobile-rn/__mocks__/expo-sqlite.ts`. Это покрывает sync API surface, реально используемый в `src/storage/*.ts`. Probe outcome: **red** for `expo-sqlite`, **green** for shim.
- **TrackerLive hook extraction (D-05..D-07, Plan 02):** три hook-а — `useTrackerCamera`, `useLayerVisibility`, `usePauseUI` — извлечены из тела экрана с TDD; co-located unit tests через `@testing-library/react-native@13.3.3 renderHook` (первое использование API в кодовой базе — паттерн зафиксирован для будущих рефакторов).
- **Closure haptic + toast (D-16..D-19, Plan 03):** `expo-haptics@~14.1.4` (SDK 54 совместимый — caret range запрещён, иначе подтянет 15.x под SDK 55); Toast — in-house Animated.View overlay, theme-aware (`useTheme().lime` с fallback `#10B981`).
- **Big-track simplification (D-12..D-15, Plan 05):** `@turf/simplify@^7.3.5`, threshold 2000 точек, dual-source разделение — LineLayer/FillLayer получают simplified, AreaCalculator / closure detection продолжают читать raw points из store. Visvalingam–Whyatt fallback не понадобился. D-15 (HistoryTerritoryLayer) **доставлено**, не отложено TODO.
- **Manual offline region picker (D-23..D-26, Plan 06):** `RegionPickerScreen` + `RegionPickerOverlay` с draggable 4-corner rectangle; `createCustomPack` API теперь единственный owner of bounds-order invariant — `downloadHomeRegion` делегирует к нему (закрывает регрессионный bounds-order bug, который существовал в pre-existing `offline.ts`). Tile-count estimate через локальную Web Mercator math — `getPackEstimateSize` отсутствует в `@rnmapbox/maps@10.3.0`.
- **Adaptive sampling + iOS SLC gap-resume (D-27..D-31, Plan 07):** `LocationAdapter.setSamplingMode('active' | 'paused' | 'background-slc')` — табличный switch через `MODE_OPTIONS`; SessionManager подписывается на PauseDetector transitions через constructor-injected adapter; `AppState` listener в `state/activity.ts` детектит foreground после iOS sleep и вызывает `SessionManager.handleAppForeground()` для gap-detection (strict `>` comparison против `gpsGapTriggerS` setting, default 30 s, persisted в MMKV v6). Android SLC не реализован — `expo-location` не предоставляет API.
- **Mapbox token rotation (D-32..D-34, Plan 08, Task 1-3):** `docs/SECRETS.md` расширен с 139 → 365 строк — добавлен Inventory + Classification + 4-step Rotation Playbook + Storage Rules + Incident Response + Audit Summary + Rotation Log. ESLint config мигрирован с legacy `.eslintrc.json` на flat-config `eslint.config.js` (eslint v9.39 требует flat); добавлены два `no-restricted-syntax` rules: для `process.env.EXPO_PUBLIC_*_SECRET` и для `sk.<…>` литералов (regex `{40,}` quantifier защищает от false-positive на UI-string «sk-button»). Audit grep на исторические утечки — clean; единственный исторический reference — документ `docs/REVIEW_ROUNDS_1-3.md:22` (past concern R1, не реальный leak).
- **Summary screen flow (D-20..D-22, Plan 04):** `nav.replace('RunDetails', { sessionId })` flow уже был корректен (`TrackerLiveScreen.tsx:136`) — Plan 04 добавляет nav-assertion test + RunDetailsScreen snapshot, чтобы заблокировать UX контракт от регрессии. Zero behavior changes — только тестовая safety-net.
- **Field protocol (D-01..D-03, Plan 09 Task 1):** `tests/FIELD_PROTOCOL.md` расширен с 273 → 541 строки — добавлены Build Prerequisite, Acceptance Thresholds, Order of Operations, и три Per-Device Result Tables (Pixel / iPhone / Chinese-Android) с per-test NFR gates. `tests/runs/` директория и `tests/runs/README.md` зафиксировали GPX path convention `tests/runs/<device>/<test>/<timestamp>.gpx`. `.gitignore` правлен (Rule 3 deviation) чтобы артефакты могли land в git без рукопашной негации каждого файла.

### Deferred items → формальное закрытие Phase 1 и Phase 2+

**Чтобы Phase 1 формально закрылась, владельцу проекта необходимо** (этот блок — explicit checklist для resumption):

1. **Выполнить Plan 08 Task 4 (Mapbox token rotation в dashboard).** Полная процедура — `01-08-SUMMARY.md` §CHECKPOINT REQUIRED — Task 4 (USER ACTION). ~10 минут. После выполнения — добавить строку в `docs/SECRETS.md` §«История ротаций» и закоммитить.
2. **Выполнить Plan 09 Tasks 2-4 (физические прогоны).** Order: Pixel → iPhone → Chinese-Android per CONTEXT.md D-02. Per-device tasks: T1, T2, T6, T7, T8, T9. Заполнить per-device tables в `tests/FIELD_PROTOCOL.md`, положить GPX файлы и фотографии батареи в `tests/runs/<device>/<test>/`. Каждый device commit-ить отдельно: `test(phase1): pixel field results T1/T2/T6/T7/T8/T9 (PHASE1-01..04)`, `test(phase1): iphone field results … (PHASE1-01..04)`, `test(phase1): <vendor>-<model> field results … (PHASE1-01..04)`.
3. **Обновить этот ADR.** После завершения хотя бы Pixel и iPhone (Chinese-Android может остаться deferred-by-device, не deferred-by-time): заменить `deferred` в таблице на `pass`/`fail`, наполнить раздел Accepted limitations реальными измерениями (если что-то не сошлось), и перевести статус ADR с `Accepted (deferred-aware closure)` на `Accepted (closed)`. После этого:
   - Обновить `STATUS.md` §«Текущая фаза»: пометить PHASE1-01..04 как ✅ или с явным «accepted limitation» reference на этот ADR.
   - Обновить `docs/DEVELOPMENT_PLAN.md` §3.15 Acceptance table — заменить ⏳ DEFERRED на ✅ pass / ⚠️ partial.
   - Обновить `.planning/STATE.md` Current Position — снять «field-tests pending» статус.
   - Обновить `.planning/ROADMAP.md` Phase 1 line — `[ ]` → `[x]` (или `[~]` если есть accepted limitations).

Прочие deferred items, не блокирующие formal closure:

- **HR-zone time breakdown в session detail** — cosmetic, Phase 6.5 deferred per `STATUS.md` запись 2026-05-07. Не блокирует.
- **Splits-over-time line chart** — Phase 6.5 deferred, bar chart уже работает.
- **Mapbox Studio custom style (P0-A-02)** — per PROJECT.md Out of Scope, revisit если стандартный `outdoors-v12` визуально неадекватен.
- **Visvalingam–Whyatt simplification fallback** — Plan 05 SUMMARY: не понадобился; revisit если real run покажет >20k точек с FPS dip.
- **`personal_records.user_id` / `sessions.user_id` columns (R18)** — должно быть добавлено перед Phase 4 (Privacy Zones); не блокирует Phase 1 closure.
- **`recoverLast` интегрирован с incomplete `closure_detector_state`** — race-condition fix (R7 functional set) уже в production коде; интеграционный тест на force-kill mid-session — отложен на Plan 11 (future) либо включён в полевой T5 (Phase 0 protocol, не входит в Phase 1 NFR set).

## Последствия

- **Phase 1 принят на code-level** в `feat/cursona-redesign` (commits: см. Plan 01-09 SUMMARYs). Code review этой ветки в рамках Phase 3 (Cursona Redesign Wrap) — отдельный гейт.
- **Phase 1 НЕ закрыта формально** — пока не выполнены 3 user-action steps выше. `STATUS.md`, `docs/DEVELOPMENT_PLAN.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` отражают этот «code-complete, field-tests pending» статус.
- **Phase 2 (Real Health Integrations) может стартовать на code-level в parallel.** Plans для Phase 2 можно discuss/plan через `/gsd-discuss-phase 2`; field tests Phase 1 могут идти в фоне. Production release Phase 2 features (HealthKit / Health Connect / Strava write-back) **не должен происходить** до formal closure Phase 1 — accepted-limitation outcomes из полевых тестов могут потребовать соответствующих корректировок (например, T8 fail на Chinese-Android означает, что background-write в Health Connect нельзя обещать как «надёжный» на этом классе устройств без disclaimer).
- **Phase 3 (Cursona Redesign Wrap → merge to `main`) не должен происходить** до Plan 08 Task 4 (token rotation): production-merge с unrotated `pk.<…>` server-secret token недопустим — это explicit security gate (CONTEXT.md D-32, ROADMAP.md Phase 1 Success Criteria #4).
- **Если какой-то NFR провалится** в полевых прогонах — обновление ADR + accepted-limitation entry → release notes для бета-тестеров обязаны упомянуть OEM/limitation, чтобы они понимали, что им подходит, а что нет.
- **Test coverage Phase 1 close baseline:** 48 jest suites, 536 tests passing (включает тесты Plans 01-09). Это новый baseline для всех последующих фаз — Phase 2 должна сохранять ≥536 passing.

## Когда пересмотреть

Триггеры для перевода ADR из `deferred-aware closure` → `closed`:

1. **Плановое** — после выполнения 3-step checklist выше («Чтобы Phase 1 формально закрылась…»). Это и есть основной trigger.
2. **При нахождении блокера на полевом прогоне** — если какой-то OEM/device показывает критическое поведение (например, app crashes consistent на конкретной модели), создаётся либо новый ADR-0006 (если решение архитектурное), либо обновляется этот ADR с дополнительными accepted limitations и hot-fix PR.
3. **Перед Phase 3 production merge** — если к этому моменту Phase 1 всё ещё не closed, нужно re-prioritize: либо ускорить field tests, либо принять Phase 1 как «accepted with caveats, field-validation deferred к β-tester phase» (это потребует обновления ADR на третий статус — `Accepted (β-validation)`, новый decision).
4. **Через 90 дней (2026-08-12)** без выполнения тестов — re-evaluate: возможно, нужно либо acquire device, либо официально объявить Chinese-Android как «best-effort, not guaranteed» в PROJECT.md.

## Список user actions для разблокирования formal closure

1. ☐ **Mapbox dashboard rotation** (Plan 08 Task 4, ~10 минут) — см. `01-08-SUMMARY.md` §CHECKPOINT REQUIRED.
2. ☐ **Field test execution** (Plan 09 Tasks 2-4) — минимум Pixel + iPhone runs (Chinese-Android может остаться deferred-by-device). T1, T2, T6, T7, T8, T9 × per-device. См. `01-09-SUMMARY.md` §CHECKPOINT REQUIRED + `tests/FIELD_PROTOCOL.md`.
3. ☐ **Update this ADR** — заменить `deferred` на measured values, перевести статус на `Accepted (closed)`, sync с `STATUS.md` / `DEVELOPMENT_PLAN.md` / `.planning/STATE.md` / `.planning/ROADMAP.md`.

После выполнения этих трёх шагов Phase 1 formally closed; Phase 2 production readiness gate also unlocked.
