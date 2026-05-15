# FIELD PROTOCOL — Phase 0 / Phase 1

Документ описывает 10 (+5 для Phase 1) сценариев полевого тестирования прототипов и шаблон отчёта по каждому, **плюс** свежие per-device результаты Phase 1 (PHASE1-01..04 / план 01-09).

> **Источник требований:** [docs/RUNNING_ECOSYSTEM_TZ.md](../docs/RUNNING_ECOSYSTEM_TZ.md) §2.4–2.5 (NFR + T1–T10), [docs/DEVELOPMENT_PLAN.md](../docs/DEVELOPMENT_PLAN.md) `P0-D-01`, `P1-M-01` (T11–T15).
> **Связанный GSD-план:** [`.planning/phases/01-validate-close-territory-core/01-09-PLAN-field-test-execution.md`](../.planning/phases/01-validate-close-territory-core/01-09-PLAN-field-test-execution.md).
> **REQ-IDs:** PHASE1-01 (T1), PHASE1-02 (T2/T9), PHASE1-03 (T6), PHASE1-04 (T8). PHASE1-05 / NFR-006 (T7 FPS) — closure-supporting.

---

## Build Prerequisite (ВНИМАНИЕ — читать перед сборкой)

Сборки APK / IPA, на которых выполняются T1/T2/T6/T7/T8/T9 в этом протоколе,
**должны быть сделаны после того, как landed**:

1. **Plans 01–07** (Phase 1 рефакторы — все SUMMARYs в
   `.planning/phases/01-validate-close-territory-core/`):
   SessionManager + real-SQLite tests, hook extraction, closure haptic+toast,
   summary screen verify, big-track simplify, offline region picker, adaptive
   sampling + SLC. Без них T7 / T6 / T2 могут показывать stale numbers.
2. **Plan 08 Task 4** — owner-driven Mapbox token rotation.
   - Открыть [`.planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md)
     §CHECKPOINT REQUIRED.
   - Новый `sk.…` токен должен лежать в `~/.netrc` (iOS pod install) **и** в
     `~/.gradle/gradle.properties` (Android gradle build).
   - Без него: `pod install` падает на 401 от `api.mapbox.com`; gradle SDK
     download падает с тем же кодом. Тесты Task 2 (Pixel parity-build),
     Task 3 (iPhone), Task 4 (Chinese-Android) **заблокированы** на этом
     шаге, пока он не выполнен.

**Verification — перед запуском первого теста:**

```bash
# iOS — netrc установлен?
grep -A2 'api.mapbox.com' ~/.netrc | head -5
# Должен содержать: machine api.mapbox.com / login mapbox / password sk.…

# Android — gradle.properties установлен?
grep 'MAPBOX_DOWNLOADS_TOKEN' ~/.gradle/gradle.properties
# Должен содержать: MAPBOX_DOWNLOADS_TOKEN=sk.…

# Smoke-test сборки:
cd apps/mobile-rn && npm run lint   # должен пройти; ESLint-guard из Plan 08 живой
```

Если verification падает — STOP, выполните Plan 08 Task 4, потом возвращайтесь.

---

## Acceptance Thresholds (NFR table из `docs/RUNNING_ECOSYSTEM_TZ.md` §2.4)

Эти числа — авторитетный источник pass/fail для Plan 09. Не выдумывайте свои.

| Test | NFR | Threshold | Per-device gate |
|------|-----|-----------|-----------------|
| T1 (5km loop) | NFR-001 | distance error ≤ **3 %** vs Garmin / reference | `|phone − ref| / ref ≤ 0.03` |
| T2 (reference area, football field) | NFR-002 | area error ≤ **5 %** vs surveyed | `|reported − ref| / ref ≤ 0.05` |
| T6 (2-hour session, screen on) | NFR-003 + NFR-007 | battery ≤ **10 %/h** AND memory growth ≤ **100 MB** | `(start_pct − end_pct) / 2 ≤ 10` AND `peak_mem − base_mem ≤ 100` |
| T7 (5000+ pts panning) | NFR-006 | ≥ **50 fps** panning, min over 60 s | `min_fps ≥ 50` |
| T8 (in-pocket 30 min) | NFR-005 | ≥ **95 %** record-time when phone in pocket | `active_record_s / 1800 ≥ 0.95` |
| T9 (closed-loop area) | NFR-002 | area error ≤ **5 %** vs reference closed shape | `|reported − ref| / ref ≤ 0.05` |

---

## Order of Operations (D-02 device order + per-device test order)

**Между устройствами:** Pixel → iPhone → Chinese-Android (CONTEXT.md D-02).

**На каждом устройстве:**

1. **T1** (5 km loop) — быстрый смоук-тест точности GPS.
2. **T2** (статический обход football field) **или T9** (динамический обход —
   можно сделать в один заход).
3. **T6** (2 часа screen-on) — самый длинный, ставится после короткого
   разогрева T1+T2/T9.
4. **T8** (30 min in-pocket background) — отдельный заход.
5. **T7** (FPS panning) — выполняется на завершённой длинной сессии
   (T6 даёт ≥5000 точек), не требует отдельного выхода на улицу.

Этот порядок сначала валидирует точность (T1/T2/T9), затем стабильность
длительной сессии (T6), затем background-надёжность (T8), и финально
производительность UI (T7) на накопленных данных.

---

## Result Template (одна строка на тест-на-устройстве)

Колонки фиксированы — `01-09-PLAN` §verification проверяет их наличие через grep:

| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| `YYYY-MM-DD` | model | OS ver | `<short>` | reference value | measured value + error % | ✅ / ❌ | `tests/runs/<dev>/<T>/<ts>.gpx` | OEM-killer settings, gotchas, photo paths |

Для T6/T8 в «Notes» обязательно ссылка на `battery_before.jpg`/`battery_after.jpg`
рядом с GPX.

---

## ▶ Per-Device Result Tables (заполняются по мере прогонов)

> Заполняйте сразу после прогона. Если тест не выполнен — оставьте строку
> с прочерками и пометкой `pending`. Plan 10 (PHASE1-14) читает эти таблицы
> для ADR-0005.

### Pixel (Android — debug APK)

**Device acquisition:** ✅ in-hand (per `STATUS.md`).
**Build status:** ✅ parity build готов после Plan 08 Task 4.

#### T1 — Pixel — distance ≤3%
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | Pixel — | Android — | — | — km (Garmin) | — km / — % error | pending | `tests/runs/pixel/T1/<ts>.gpx` | — |

**Gate:** Pass требует `Outcome error % ≤ 3` (NFR-001).

#### T2 — Pixel — area ≤5% (reference field)
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | Pixel — | Android — | — | 7140 m² (105×68) | — m² / — % error | pending | `tests/runs/pixel/T2/<ts>.gpx` | reference dims confirmed? |

**Gate:** Pass требует `Outcome error % ≤ 5` (NFR-002).

#### T6 — Pixel — battery ≤10%/h, memory ≤100 MB
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | Pixel — | Android — | — | start: —% / —MB | end: —% / —MB → rate —%/h, Δmem —MB | pending | `tests/runs/pixel/T6/<ts>.gpx` | photos: `battery_before.jpg`, `battery_after.jpg` |

**Gate:** Pass требует `battery_rate ≤ 10 %/h` (NFR-003) AND `Δmem ≤ 100 MB` (NFR-007).

#### T7 — Pixel — min FPS ≥50 при 5000+ pts
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | Pixel — | Android — | — | track ≥5000 pts | min_fps over 60 s = — | pending | `tests/runs/pixel/T6/<ts>.gpx` (re-use) | tool: Flipper / RN PerfMonitor |

**Gate:** Pass требует `min_fps ≥ 50` (NFR-006).

#### T8 — Pixel — ≥95% record-time in pocket
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | Pixel — | Android — | — | 1800 s wall | active_record_s = — | pending | `tests/runs/pixel/T8/<ts>.gpx` | screen lock, в кармане, без касаний |

**Gate:** Pass требует `active_record_s / 1800 ≥ 0.95` (NFR-005).

#### T9 — Pixel — closed-loop area ≤5%
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | Pixel — | Android — | — | reference shape — m² | reported — m² / — % error | pending | `tests/runs/pixel/T9/<ts>.gpx` | замыкание сработало? (haptic+toast) |

**Gate:** Pass требует `Outcome error % ≤ 5` (NFR-002 в динамике) AND closure detector сработал.

---

### iPhone (iOS)

**Device acquisition:** ✅ in-hand.
**Build status:** ⏳ **gated на Xcode install** (per `STATUS.md` TODO) AND на Plan 08 Task 4 (Mapbox `sk.` в `~/.netrc`).

#### T1 — iPhone — distance ≤3%
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | iPhone — | iOS — | — | — km (Garmin) | — km / — % error | pending | `tests/runs/iphone/T1/<ts>.gpx` | — |

**Gate:** Pass требует `Outcome error % ≤ 3` (NFR-001).

#### T2 — iPhone — area ≤5% (reference field)
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | iPhone — | iOS — | — | 7140 m² | — m² / — % error | pending | `tests/runs/iphone/T2/<ts>.gpx` | — |

**Gate:** Pass требует `Outcome error % ≤ 5` (NFR-002).

#### T6 — iPhone — battery ≤10%/h, memory ≤100 MB
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | iPhone — | iOS — | — | start: —% / —MB | end: —% / —MB → rate —%/h, Δmem —MB | pending | `tests/runs/iphone/T6/<ts>.gpx` | iOS battery management обычно мягче Android — ожидаемо ниже % drop |

**Gate:** Pass требует `battery_rate ≤ 10 %/h` AND `Δmem ≤ 100 MB`.

#### T7 — iPhone — min FPS ≥50 при 5000+ pts
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | iPhone — | iOS — | — | track ≥5000 pts | min_fps over 60 s = — | pending | `tests/runs/iphone/T6/<ts>.gpx` (re-use) | tool: Instruments Core Animation FPS |

**Gate:** Pass требует `min_fps ≥ 50`.

#### T8 — iPhone — ≥95% record-time in pocket
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | iPhone — | iOS — | — | 1800 s wall | active_record_s = — | pending | `tests/runs/iphone/T8/<ts>.gpx` | iOS агрессивен к background; failure mode пишем в Notes для ADR-0005 |

**Gate:** Pass требует `active_record_s / 1800 ≥ 0.95`.

#### T9 — iPhone — closed-loop area ≤5%
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | iPhone — | iOS — | — | reference shape — m² | reported — m² / — % error | pending | `tests/runs/iphone/T9/<ts>.gpx` | замыкание сработало? |

**Gate:** Pass требует `Outcome error % ≤ 5` AND closure detector сработал.

---

### Chinese-Android (Xiaomi / Realme / Oppo / Honor)

**Device acquisition:** ⏳ **gated** — устройство ещё не приобретено
(per `STATUS.md` Phase 1 progress). Любая Xiaomi / Realme / Oppo / Honor с
агрессивным battery optimizer подходит.
**Build status:** APK тот же, что и на Pixel (parity build); OEM-specific
setup mandatory перед T6/T8.

#### OEM-specific setup (обязательно перед T6/T8)
- **Xiaomi:** Settings → Apps → Permissions → Autostart → включить для app.
  Settings → Battery → App battery saver → **No restrictions**. Документировать
  точные шаги в колонке Notes.
- **Realme:** аналогично — найти Autostart + battery saver settings, whitelist.
- **Oppo:** аналогично.
- **Honor:** Phone Manager → Battery → App launch → Manage manually → enable
  Auto-launch, Secondary launch, Run in background.

#### T1 — Chinese-Android — distance ≤3%
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | `<vendor>-<model>` | Android — | — | — km (Garmin) | — km / — % error | pending | `tests/runs/<vendor>-<model>/T1/<ts>.gpx` | — |

**Gate:** Pass требует `Outcome error % ≤ 3` (NFR-001). Ожидание: должен пройти — точность зависит от GPS-чипа, не OEM-tuning.

#### T2 — Chinese-Android — area ≤5%
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | `<vendor>-<model>` | Android — | — | 7140 m² | — m² / — % error | pending | `tests/runs/<vendor>-<model>/T2/<ts>.gpx` | — |

**Gate:** Pass требует `Outcome error % ≤ 5`.

#### T6 — Chinese-Android — battery ≤10%/h, memory ≤100 MB
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | `<vendor>-<model>` | Android — | — | start: —% / —MB | end: —% / —MB → rate —%/h, Δmem —MB | pending | `tests/runs/<vendor>-<model>/T6/<ts>.gpx` | OEM autostart enabled? указать |

**Gate:** Pass требует `battery_rate ≤ 10 %/h` AND `Δmem ≤ 100 MB`. **Ожидание:** на агрессивных OEM может превысить 10 %/h — если превышение — accepted limitation per D-36, фиксируем в ADR-0005.

#### T7 — Chinese-Android — min FPS ≥50 при 5000+ pts
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | `<vendor>-<model>` | Android — | — | track ≥5000 pts | min_fps over 60 s = — | pending | `tests/runs/<vendor>-<model>/T6/<ts>.gpx` (re-use) | tool: Flipper |

**Gate:** Pass требует `min_fps ≥ 50`.

#### T8 — Chinese-Android — ≥95% record-time in pocket
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | `<vendor>-<model>` | Android — | — | 1800 s wall | active_record_s = — | pending | `tests/runs/<vendor>-<model>/T8/<ts>.gpx` | **highest-risk test on chinese OEM** — autostart кнопка нажата? Если fail — accepted per D-36 |

**Gate:** Pass требует `active_record_s / 1800 ≥ 0.95`. **Ожидание:** highest-risk test. Если fail даже при правильном autostart — accepted limitation, документируется в ADR-0005 + в-app warning к Phase 4.

#### T9 — Chinese-Android — closed-loop area ≤5%
| Date | Device | OS | Build hash | Baseline | Outcome value | Pass/Fail | GPX file path | Notes |
|------|--------|----|------------|----------|----------------|-----------|---------------|-------|
| — | `<vendor>-<model>` | Android — | — | reference shape — m² | reported — m² / — % error | pending | `tests/runs/<vendor>-<model>/T9/<ts>.gpx` | замыкание сработало? |

**Gate:** Pass требует `Outcome error % ≤ 5` AND closure detector сработал.

---

## Принципы тестирования

1. **Воспроизводимость.** Каждый прогон — на одном устройстве в один день для каждого фреймворка, чтобы условия GPS не различались между RN и Flutter.
2. **Минимум 2 устройства:** один iOS (iPhone 12+), один Android (Pixel 6+ ИЛИ китайский флагман с агрессивным background-управлением — Xiaomi/Huawei/Realme/Oppo). Phase 0 acceptance требует **3** устройства (P0-D-02..04).
3. **Каждый прогон — записывается:**
   - timestamped JSON-лог в `tests/runs/<framework>/<test_id>/<run_id>/log.json`
   - GPX-экспорт трека в `tests/runs/<framework>/<test_id>/<run_id>/track.gpx`
   - скриншоты карты: начало и конец пробежки
   - фотография телефона до/после с состоянием батареи в кадре (для NFR-003)
4. **Эталонные референсы** — параллельно записывать на Garmin / Strava / Komoot для сравнения дистанции и трека.
5. **Заполнение шаблона отчёта** — копия `REPORT_TEMPLATE.md` (см. ниже) внутрь папки прогона.

> **Note для Phase 1 (Plan 09):** «Заполнение шаблона отчёта» больше не
> обязательно — достаточно строки в Per-Device Result Table + GPX в
> `tests/runs/<device>/<test>/<timestamp>.gpx`. REPORT.md создавайте только
> если прогон шёл нештатно.

---

## Сценарии Phase 0 (T1–T10)

### T1. Эталонная петля 5 км

**Условия.** Пробежать или пройти 5 кругов по сегменту с точно известной длиной (стадион 400м × 12.5 круга, или Garmin/Strava-сегмент с >1000 attempts).

**Метрики.**
- Итоговая дистанция (наша vs эталон)
- Покруговое отклонение
- Кол-во отброшенных точек по фильтрам (accuracy, jump)

**Acceptance.** Отклонение ≤3% (NFR-001).

---

### T2. Эталонная площадь (статический обход)

**Условия.** Обойти периметр прямоугольной фигуры известной площади, **не пересекая** трек. Эталоны:
- Футбольное поле FIFA 105×68 = 7140 м²
- Стандартное баскетбольное поле 28×15 = 420 м²
- Парк прямоугольной формы — мерить по спутнику (Google Earth Pro)

**Метрики.**
- Расчётная площадь (закрытый полигон)
- Расчётная площадь буферного коридора (если незамкнут)
- Метод (`shoelace_simple` / `shoelace_with_warning`)

**Acceptance.** Отклонение ≤5% (NFR-002).

---

### T3. Городской каньон

**Условия.** 30 минут движения в плотной застройке (узкие улицы, высокие здания). Frankfurt am Main — Bockenheim или Bahnhofsviertel.

**Метрики.**
- Кол-во отброшенных точек (по `accuracy > 20м`, `jump > 30м/<5с`)
- Явные артефакты на полилинии (срезанные углы, точки внутри зданий)
- Скриншот трека на спутниковой подложке

**Acceptance.** Не более 15% точек отброшено по accuracy. Полилиния визуально не проходит через здания (после Kalman).

---

### T4. Потеря сигнала

**Условия.** Пройти 100м+ без GPS — тоннель, метро, подземный переход.

**Метрики.**
- Поведение на разрыве: пауза, gap в треке, "склейка через здания"?
- Корректность распознавания возвращения сигнала
- Авто-пауза сработала? (или зачла время)

**Acceptance.** Pipeline не достраивает прямую через тоннель. После выхода — продолжает запись плавно.

---

### T5. Force-kill

**Условия.** В середине 30-минутной записи — принудительно убить приложение из системного меню (swipe up). Подождать 10 секунд. Перезапустить.

**Метрики.**
- Предложен ли recovery-диалог "Continue / Discard"?
- Сколько секунд / точек потеряно?
- После Continue: трек продолжается без склеек?

**Acceptance.** Recovery-диалог появляется. Потеря данных ≤30 секунд (соответствует частоте flush'а).

---

### T6. Длинная сессия

**Условия.** Непрерывная запись 2 часа — комбинация прогулки, лёгкой пробежки, остановок.

**Метрики.**
- Расход батареи (% / час) — фото до/после
- Рост памяти (через Xcode Instruments / Android Profiler)
- Стабильность (без падений, без freeze'ов UI)
- Кол-во пропущенных секунд (по timestamp gap'ам в треке)

**Acceptance.**
- NFR-003: батарея ≤10% / час
- NFR-007: память ≤+100 MB
- NFR-004: 0 падений

---

### T7. Map performance

**Условия.** К 90-й минуте теста T6 (трек уже большой, ~5000+ точек): активно панорамировать, зумить, нажать "show all track".

**Метрики.**
- FPS (Flutter performance overlay / RN onJsFrameDrop)
- Время рендеринга кадра при zoom in/out
- Видимые задержки UI

**Acceptance.** ≥50 FPS на устройствах теста (NFR-006).

---

### T8. Background

**Условия.** Запустить запись → заблокировать телефон → положить в карман → ходить 30 минут → не открывать → разблокировать.

**Метрики.**
- Записаны ли все 30 минут? (gap'ы в треке)
- Notification (Android) активен всё время?
- Recovery если ОС убила процесс?
- Расход батареи относительно T6 (фон должен быть экономнее или сопоставимым)

**Acceptance.** ≥95% времени записано (потери ≤5%, NFR-005). Проверка на 3 устройствах (P0-D-02..04).

---

### T9. Точность площади на замкнутой петле

**Условия.** Намеренно сделать замкнутую петлю по контуру фигуры из T2 (например, обойти футбольное поле), но **в режиме движения** (бег / быстрая ходьба, не статически).

**Метрики.**
- Расчётная площадь vs реальная
- Срабатывание `ClosureDetector` на правильной точке

**Acceptance.** Отклонение ≤5% (NFR-002 в динамике).

---

### T10. Self-intersecting track (восьмёрка)

**Условия.** Намеренно нарисовать ногами "восьмёрку" — два касающихся круга.

**Метрики.**
- Что покажет приложение как площадь? (по shoelace со знаком даст разность; по подходу С — сумму)
- Падает ли приложение на самопересечении?
- Вывод warning в UI?

**Acceptance.** Не падает. Площадь — любое число, но `hasSelfIntersection: true` залогирован, в UI отображается warning.

---

## Сценарии Phase 1 (T11–T15) — добавлены к Phase 0 после `P1-M-01`

### T11. 60 минут с замыканием

Длительная пробежка, заведомо замкнутая (старт = финиш). Проверка стабильности pipeline + recovery после долгой работы + точности площади на длинном маршруте.

### T12. 60 минут без замыкания (буферный коридор)

Точка А → точка Б, без возврата. Проверка корректности `BufferedCorridorRenderer` (P1-H-*) и площади коридора.

### T13. 5 пробежек подряд за день

Старт-стоп несколько раз. Проверка отсутствия утечек памяти, корректности истории, корректности all-time territory layer (P1-L-02).

### T14. Переустановка приложения

Удалить → установить заново → проверить, что `auto-download домашней зоны` (P1-K-03) предлагается заново.

### T15. Смена часового пояса во время пробежки

Поездка между часовыми поясами с активной записью. Проверка корректности timestamp'ов (UTC хранение, локальное отображение).

---

## Шаблон отчёта (`REPORT_TEMPLATE.md`)

> **Plan 09 note:** этот шаблон остался от Phase 0. Для Phase 1 Plan 09
> достаточно строки в Per-Device Result Table выше + GPX. REPORT.md
> создавайте опционально, если прогон шёл нештатно (force-kill,
> OEM-killer, неожиданный gap в треке и т.п.).

Копировать в `tests/runs/<framework>/<test_id>/<run_id>/REPORT.md` для каждого прогона.

```markdown
# Test Report: <T_ID> — <короткое описание>

- **Framework:** RN | Flutter
- **App version / commit:** `<hash>`
- **Test ID:** T<N>
- **Run ID:** <YYYY-MM-DD-NN>
- **Date / time:** <ISO 8601>
- **Tester:** <имя>
- **Device:** <iPhone 14 Pro | Pixel 8 | Xiaomi 13 Pro>
- **OS version:** <iOS 17.4 | Android 14>
- **Battery start → end:** XX% → YY% (см. фото `battery_before.jpg` / `battery_after.jpg`)
- **Weather / GPS conditions:** clear sky / cloudy / rain | open / urban canyon | температура

## Pre-test checklist

- [ ] Устройство заряжено ≥80%
- [ ] Battery optimization для приложения отключена (Android)
- [ ] Background location permission = "Always"
- [ ] Авиарежим **выкл** (или **вкл** для T теста с offline)
- [ ] Скачан offline tile pack (если тест в зоне без сети)
- [ ] Параллельный референс запущен (Garmin / Strava): <да/нет, какой>

## Measurements

| Метрика | Целевое | Фактическое | ✅ / ❌ |
|---|---|---|---|
| Дистанция (наша)            | ?                | ? км            | |
| Дистанция (референс)        | ? (Garmin)       | ? км            | |
| Отклонение от референса     | ≤3% (NFR-001)    | ?%              | |
| Площадь расчётная           | ? (известная)    | ? м²            | |
| Отклонение площади          | ≤5% (NFR-002)    | ?%              | |
| Кол-во точек до фильтра     | —                | ?               | |
| Отброшено (accuracy)        | <15%             | ?               | |
| Отброшено (jump outlier)    | —                | ?               | |
| Расход батареи (%/час)      | ≤10% (NFR-003)   | ?               | |
| Рост памяти (MB)            | ≤100 (NFR-007)   | ?               | |
| Map FPS (худший)            | ≥50 (NFR-006)    | ?               | |
| Auto-pause срабатываний     | —                | ?               | |
| Recovery dialog появился?   | да (T5)          | да/нет          | |

## Артефакты

- [ ] `track.gpx` (экспорт)
- [ ] `log.json` (телеметрия pipeline)
- [ ] `screenshot_start.png`
- [ ] `screenshot_end.png`
- [ ] `battery_before.jpg`
- [ ] `battery_after.jpg`
- [ ] (для T8) `screenshot_notification.png`

## Заметки и аномалии

<свободный текст: что неожиданного, что хотелось бы проверить, баги>

## Решение

- [ ] PASS — acceptance criteria выполнены
- [ ] PASS WITH CAVEATS — выполнены, но есть warning'и (описать)
- [ ] FAIL — не выполнены (описать что не сработало, тикеты)
```

---

## Прогон по плану

| Задача           | Что делать                                          | Когда                           |
|------------------|-----------------------------------------------------|---------------------------------|
| `P0-D-02`        | T1–T10 на iPhone, оба фреймворка, в один день      | После завершения P0-B-* и P0-C-* |
| `P0-D-03`        | T1–T10 на Pixel, оба фреймворка                    | То же                           |
| `P0-D-04`        | T1–T10 на китайском Android, оба фреймворка        | То же                           |
| `P0-D-05`        | Заполнить decision matrix (ТЗ §2.6) → DECISION.md  | После всех прогонов             |
| `P1-M-02..03`    | Эталонные пробежки 5/10/21/30 км + анализ          | Phase 1                         |
| **PHASE1-01..04** (Plan 09 Tasks 2-4) | Per-device result tables выше — Pixel → iPhone → Chinese-Android | Phase 1 closure (после Plan 08 Task 4) |

---

## Если что-то не работает

- ❌ Permission диалог не появляется → проверить `Info.plist` / `AndroidManifest.xml` и runtime requestPermissions (FR-001)
- ❌ Точки не пишутся → SQLite WAL mode? `PRAGMA journal_mode=WAL;`
- ❌ Background не работает на Android → battery optimization, `FOREGROUND_SERVICE_LOCATION` permission, persistent notification
- ❌ FPS просел → проверить, что используется `LineLayer + GeoJsonSource` (НЕ `PolylineAnnotation`) и `setShape` без пересоздания источника (FR-022, FR-024)
- ❌ Площадь сильно расходится → проверить, что используется локальная плоская проекция, а не haversine-based площадь
- ❌ **Mapbox 401 при сборке** (gradle или pod install) → Plan 08 Task 4 не выполнен; `sk.` токен не в `~/.netrc` или `~/.gradle/gradle.properties`. См. `docs/SECRETS.md` §Rotation Playbook + `01-08-SUMMARY.md` §CHECKPOINT REQUIRED.
- ❌ **iOS T8 fail (≤95%)** → expo-task-manager foreground service может быть suppressed; на следующий foreground приложение проверит gap и продолжит, но **не интерполирует** — gap виден в треке (D-29). Документировать failure mode в Notes для ADR-0005.
- ❌ **Chinese-Android T8 fail при включённом Autostart** → accepted limitation per D-36; PHASE1-12 SLC может не помочь на Android (D-30 — нет SLC API в expo-location). Фиксируем в ADR-0005, добавляем in-app hint к Phase 4.
