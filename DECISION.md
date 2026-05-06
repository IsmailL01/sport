# Framework Decision

**Дата:** 2026-05-06
**Статус:** ✅ финализирован
**Решение:** **Expo React Native + TypeScript**

## TL;DR

Команда выбирает **Expo React Native** как основной мобильный фреймворк для всех фаз проекта (Phase 1+).

Прототип `apps/mobile_flutter/` архивируется. Активный код развивается в `apps/mobile-rn/` → переименовано в `apps/mobile/` после стабилизации.

## Контекст и метод

В Phase 0 (см. [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) §2) были реализованы **функционально идентичные** прототипы на Expo RN и Flutter:

- Чистая `src/` структура (domain, location, state, storage, util) — идентична
- Все 7 базовых фич Phase 0 (P0-B-01..07 / P0-C-01..07): bootstrap → карта → запись GPS → live полилиния → замыкание+площадь → SQLite persistence → background location

Оба собирали Android APK с встроенным Mapbox SDK. Карта рендерилась на физическом устройстве (планшет Android) — runtime подтверждён для **P0-B-02 / P0-C-02**.

## Decision matrix (ТЗ §2.6)

| Критерий | Вес | RN (Expo) | Flutter | Победитель |
|---|---|---|---|---|
| Background reliability | 25% | TBD: TaskManager + foregroundService notification, runtime тест T8 не проведён | TBD: AndroidSettings.foregroundNotificationConfig + AppleSettings, T8 не проведён | ⚖️ |
| Точность дистанции и площади | 20% | Идентичная реализация (haversine + локальная проекция + shoelace) — алгоритмы общие | то же | = |
| Расход батареи | 15% | TBD (T6) | TBD (T6) | ⚖️ |
| Map performance | 10% | community @rnmapbox/maps ^10.3 (FPS на 5000+ точек — TBD T7) | официальный mapbox_maps_flutter ^2.23 — формальное преимущество | Flutter (paper) |
| Стабильность | 10% | runtime тест на планшете прошёл | runtime тест на планшете прошёл | = |
| Скорость разработки | 10% | TS типизация + zustand → ~1.5x быстрее в нашем опыте Phase 0 | Dart + Riverpod codegen-free, но больше boilerplate (ConsumerStatefulWidget, copyWith) | RN |
| Зрелость + интеграции (BLE/HealthKit/HealthConnect/FIT) | 5% | expo-bluetooth, react-native-health, FIT — пакеты есть, но через community обёртки | flutter_blue_plus, health, FIT — также community | ⚖️ |
| Размер бандла | 5% | release APK 153 MB | debug APK 241 MB (release не собирался — нет signing config out of box) | RN |

> ⚠️ Полные T1–T10 тесты с decision matrix по числам **не проведены** в Phase 0 — отсутствуют 3 устройства (`P0-A-04`) и физический полевой прогон. Но — оба прототипа собрались, оба показали карту, оба прошли base flow → дальнейший выбор по «процессным» критериям (скорость, экосистема, опыт команды).

## Обоснование решения (RN)

1. **Скорость итерации.** В Phase 0 одинаковая фича-парность была реализована быстрее на RN: TS типизация ловит ошибки на compile, hot reload надёжнее, zustand минимально boilerplate vs Riverpod NotifierProvider + ConsumerStatefulWidget.

2. **Экосистема для бэкенда.** Backend проекта — Go (см. ТЗ §5). TS на клиенте даёт shared типы (через openapi-typescript / protobuf-ts генерацию), Dart требует отдельной кодогенерации.

3. **EAS Build / EAS Update.** Cloud-сборка через `eas build` снимает блокер «нет Xcode локально» (текущая ситуация). Flutter cloud-сборка возможна (Codemagic / Bitrise), но платная и менее интегрирована.

4. **Опыт команды.** Команда из 2 разработчиков с TypeScript опытом. Dart требует переучивания.

5. **Community packages риск принимаем.** `@rnmapbox/maps` — community-пакет, релизы могут отставать от Mapbox Native SDK. Митигация: `MapAdapter` абстракция (см. ТЗ §10.6, ADR-0002). Если ситуация ухудшится — миграция на MapLibre RN community plugin или native module.

## Что фиксируется

- **`apps/mobile-rn/`** — основной мобильный проект, развивается через Phase 1+.
- **`apps/mobile_flutter/`** — переименовывается в `apps/mobile_flutter.archived/`. Не удаляется: может пригодиться для:
  - Reference при подключении BLE / HealthConnect (если RN-пакет окажется хуже)
  - Native модулей (Kotlin/Swift код можно переиспользовать в RN bridges)
  - Sanity check архитектурных решений (доменная модель идентична → можно сравнить).
- **Phase 1 продолжает развитие RN-прототипа эволюционно**, не "с чистого листа":
  - Код прототипа Phase 0 уже структурирован по `src/` и не содержит грубых хаков.
  - Сделанная работа (Mapbox setup, токены, debug.keystore signing, ~/.netrc, gradle.properties) сохраняется и переиспользуется.
  - Phase 1 добавляет недостающее: MapAdapter абстракцию (ТЗ §10.6), Kalman filter (ТЗ §6.1), полную доменную модель (Activity, Track, Lap, SensorReading), pipeline (ТЗ §4.3), background reliability на 3 устройствах.

## Сценарий пересмотра

Решение пересматривается если:
- В Phase 1 background reliability на iOS/Android < 80% времени записи (NFR-005), и попытки fix через @rnmapbox/maps + expo-location не дают результата.
- Mapbox SDK Android via @rnmapbox/maps ломается при обновлении (release-mismatch с native Mapbox SDK).
- На 100k MAU расход Mapbox становится критичным и community-пакет блокирует переход на MapLibre.

В этом случае — Flutter прототип `apps/mobile_flutter.archived/` остаётся точкой быстрого фолбэка.

## Ссылки

- [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) §2.4 (правило архивации)
- [docs/RUNNING_ECOSYSTEM_TZ.md](docs/RUNNING_ECOSYSTEM_TZ.md) §2.6 (decision matrix), §10.6 (MapAdapter)
- [STATUS.md](STATUS.md) — Phase 0 история
- [docs/DECISIONS/0001-framework-react-native.md](docs/DECISIONS/0001-framework-react-native.md) — формальный ADR (этот документ — короткое summary)
