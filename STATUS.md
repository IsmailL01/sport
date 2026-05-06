# STATUS

Живой документ. Обновляется после каждой закрытой задачи.

## Текущая фаза

**Phase 0 — Foundation & Framework Selection**

Старт: 2026-05-06
Целевое окончание: _TBD_

## Задачи Phase 0

### Setup
- [x] `P0-A-01` Создание Mapbox-аккаунта и токенов
- [⏸] `P0-A-02` Кастомный стиль карты — отложен на Phase 1 по решению команды
- [~] `P0-A-03` GitHub репозитории — локально готово (git init + 2 commits); push в GitHub отложен (нужен `gh` CLI или ручное создание)
- [ ] `P0-A-04` Тестовые устройства — организационная задача (закупка/выдача)

### Прототип RN
- [x] `P0-B-01` Bootstrap RN-проекта — Android build verified
- [x] `P0-B-02` Карта Mapbox с user location — runtime подтверждён на планшете
- [~] `P0-B-03` Запись точек GPS — код готов (compile ✅); runtime: пройти 100м → 15-25 точек
- [~] `P0-B-04` Live полилиния — ShapeSource + LineLayer, обновление через update shape (compile ✅)
- [~] `P0-B-05` Замыкание + площадь — shoelace + локальная проекция (ТЗ §6.6); FillLayer полигона (compile ✅)
- [~] `P0-B-06` Background location — TaskManager + foregroundService notification (compile ✅); runtime тест T8
- [~] `P0-B-07` SQLite persistence — таблица points, batch flush 10 точек, recoverLast при старте (compile ✅)

### Прототип Flutter
- [x] `P0-C-01` Bootstrap Flutter-проекта — Android build verified
- [x] `P0-C-02` Карта Mapbox с user location — runtime подтверждён на планшете
- [~] `P0-C-03` Запись точек GPS — geolocator getPositionStream, riverpod NotifierProvider (compile ✅)
- [~] `P0-C-04` Live полилиния — GeoJsonSource + LineLayer, обновление через setStyleSourceProperty (compile ✅)
- [~] `P0-C-05` Замыкание + площадь — trackMetricsProvider + FillLayer (compile ✅)
- [~] `P0-C-06` Background location — AndroidSettings/AppleSettings с background config (compile ✅)
- [~] `P0-C-07` SQLite persistence — sqflite + path_provider, batch flush, recoverLast (compile ✅)

### Полевые тесты
- [x] `P0-D-01` Тестовый протокол на бумаге — [tests/FIELD_PROTOCOL.md](tests/FIELD_PROTOCOL.md)
- [ ] `P0-D-02` Прогон тестов на iPhone
- [ ] `P0-D-03` Прогон тестов на Pixel
- [ ] `P0-D-04` Прогон тестов на китайском Android
- [ ] `P0-D-05` Decision Matrix → DECISION.md

> **Обозначения:** `[x]` done, `[~]` partial (заблокировано user action), `[⏸]` отложено по решению, `[ ]` не начато.

## История

### 2026-05-06

- ✅ `P0-A-01` Создание Mapbox-аккаунта и токенов
  - Mapbox account: личный, владелец `dragon2015516@gmail.com`, username `iassd`
  - Созданы 3 токена: `dev-public`, `prod-public`, `server-secret`
  - iOS Bundle ID: `com.runningecosystem.mobile` (Android SHA-256 — TODO до `P0-B-01`/`P0-C-01`)
  - Mapbox style для Phase 0: стандартный `mapbox://styles/mapbox/outdoors-v12` (`P0-A-02` отложен)
  - Smoke-test через Mapbox Styles API: все 3 токена → HTTP 200
  - Подробности и метаданные: [docs/SECRETS.md](docs/SECRETS.md)
  - ⚠️ **Известные TODO** (зафиксированы в SECRETS.md):
    - `server-secret` создан как public (`pk.…`) вместо secret (`sk.…`) — пересоздать перед началом Phase 2
    - Все 3 токена однажды передавались в чат с AI — ротировать перед публичным релизом / биллингом
    - Android SHA-256 restriction добавить после bootstrap RN/Flutter проектов

- ⏸ `P0-A-02` Кастомный Mapbox Studio стиль — отложен на Phase 1 по решению; на прототипе используется стандартный `outdoors-v12`

- 🟡 `P0-A-03` GitHub репозитории — **локально готово, push отложен**
  - Структура монорепо: `apps/{mobile-rn, mobile_flutter}/`, `services/backend/`, `tests/`, `docs/{DECISIONS/}`, `.github/workflows/ci.yml`
  - `README.md`, `.gitignore` (Node + Flutter + macOS + .env), `.editorconfig`, `CODEOWNERS` (с TODO заполнить usernames)
  - `git init` + 2 commits на `main`
  - 🔄 TODO для пользователя: установить `gh` (`brew install gh`) или создать репо вручную в браузере → `git remote add origin … && git push -u origin main` → branch protection в GitHub UI

- ✅ `P0-D-01` Тестовый протокол на бумаге — [tests/FIELD_PROTOCOL.md](tests/FIELD_PROTOCOL.md)
  - 10 сценариев T1–T10 (Phase 0) + 5 для Phase 1 (T11–T15)
  - Шаблон отчёта с pre-test чеклистом и таблицей метрик

- ✅ `P0-B-01` Bootstrap Expo RN-проекта (`apps/mobile-rn`) — Android verified, iOS требует Xcode
  - Expo SDK 54.0.33, RN 0.81.5, React 19.1, TypeScript 5.9, blank-typescript template
  - Зависимости: `expo-location`, `expo-task-manager`, `expo-sqlite`, `@rnmapbox/maps ^10.3`, `react-native-mmkv ^4.3`, `zustand ^5.0`, `@turf/{turf,helpers,buffer,simplify} ^7.3`
  - `app.json` обновлён: bundleId `com.runningecosystem.mobile`, iOS `UIBackgroundModes [location, fetch, processing]`, Android `FOREGROUND_SERVICE_LOCATION` + `ACCESS_BACKGROUND_LOCATION`, config plugins (`expo-location`, `expo-task-manager`, `expo-sqlite`, `@rnmapbox/maps`)
  - `eas.json` создан: development / preview / production профили
  - `App.tsx` — bootstrap screen (тёмная тема, placeholder)
  - `.env.example` — `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`
  - ✅ `tsc --noEmit` — без ошибок
  - ✅ **Android build verified:** `./gradlew assembleDebug` → BUILD SUCCESSFUL 15m20s, app-debug.apk 215MB. Mapbox Android SDK успешно скачан через Maven с download token из `~/.gradle/gradle.properties`.
  - 🔄 TODO для запуска на iOS: установить **Xcode** из App Store (~7GB) либо использовать `eas build --platform ios` (cloud)

- ✅ `P0-C-01` Bootstrap Flutter-проекта (`apps/mobile_flutter`) — Android verified, iOS требует Xcode
  - Flutter, Dart 3.x, org `com.runningecosystem`, platforms `ios+android` (без web/desktop)
  - Зависимости: `mapbox_maps_flutter ^2.23`, `geolocator ^14`, `flutter_background_service ^5.1`, `sqflite ^2.4`, `path_provider ^2.1`, `flutter_riverpod ^3.3`
  - `ios/Runner/Info.plist`: NSLocation* descriptions + `UIBackgroundModes [location, fetch, processing]`
  - `android/app/src/main/AndroidManifest.xml`: ACCESS_*_LOCATION + FOREGROUND_SERVICE_LOCATION + service `id.flutter.flutter_background_service.BackgroundService` (foregroundServiceType=location)
  - `lib/main.dart` — bootstrap screen (тёмная Material 3 тема, placeholder)
  - `test/widget_test.dart` — smoke-тест ✅ (1 passed)
  - ✅ `flutter analyze` — No issues found, `flutter test` — 1 passed
  - ✅ **Android build verified:** `flutter build apk --debug` → ✓ Built app-debug.apk 215MB, 251s. Mapbox Android SDK успешно скачан.
  - 🛠 По ходу build пришлось пофиксить manifest merger конфликт между нашим `<service>` и тем что добавляет плагин `flutter_background_service` — добавлен `xmlns:tools` + `tools:replace="android:foregroundServiceType"`
  - 🔄 TODO для запуска на iOS: установить **Xcode** или использовать Codemagic/Bitrise (cloud)

### Sprints 1–5 — Phase 0 prototype features (P0-B/C-03..07)

Чистая структура `src/` (домен, location, state, storage, util, ui) — идентична на обоих фреймворках, см. ТЗ §2.9.

Реализованные фичи (compile-зелёные на обоих, runtime acceptance — требует полевой тест на устройстве):

| Подсистема | RN | Flutter | Idiomatic API |
|---|---|---|---|
| Domain types | `src/domain/types.ts` | `lib/src/domain/types.dart` | `RawPoint`, `ActivityState`, `Session` |
| Location | `expo-location` + `expo-task-manager` (background TaskManager) | `geolocator` + `AndroidSettings`/`AppleSettings` (foreground service notification) | `LocationAdapter.start/stop/requestBackgroundPermission` |
| State | `zustand` store + buffer | `riverpod` `NotifierProvider` + buffer | start, stop, addPoint, reset, recoverLast |
| Storage | `expo-sqlite` (sync API + WAL) | `sqflite` + `path_provider` | `appendPoints` (batch tx), `loadPointsForSession`, `getLastSessionId`, `deleteSession` |
| Geo | `src/util/geo.ts` (Math.haversine, локальная проекция, shoelace) | `lib/src/util/geo.dart` (dart:math) | identical signatures |
| GeoJSON | `pointsToLineString`, `pointsToPolygon` (auto-close ring) | `pointsToLineStringJson`, `pointsToPolygonJson` (через jsonEncode) | identical |
| Map render | `<ShapeSource>` + `<LineLayer>` (track) + `<FillLayer>` (zone) | `GeoJsonSource` + `LineLayer` (track) + `FillLayer` (zone, под track-line через `LayerPosition.below`) | live update без пересоздания source (FR-024) |
| UI | Stats card (state, время, дистанция, точки, accuracy, area), FAB Start/Stop/Reset | то же через `ConsumerWidget` + `StatelessWidget` | dark theme `#0F1419`, accent `#10B981` |

Persistence flow:
- На каждом Start: новая `session_id = Date.now()`, чистый buffer
- На каждом 10-м point: batch INSERT в БД (transaction)
- На Stop: force flush buffer
- На Reset: DELETE WHERE session_id = ?
- На app launch: SELECT MAX(session_id) → load points → state = `stopped` (показ предыдущей сессии)

#### 🔄 Что осталось до закрытия Phase 0

- **P0-D-02..04** (полевые тесты T1–T10 на iPhone / Pixel / китайском Android): требует физических устройств (`P0-A-04`).
- **P0-D-05** (DECISION.md): после полевых тестов — заполнить decision matrix из ТЗ §2.6.
- **iOS** прототипы: блокировано отсутствием Xcode.app.
- **GitHub repo + push**: `gh` CLI не установлен.

#### 🔄 Открытые TODO для пользователя (блокеры дальнейших задач)

1. **iOS toolchain** — `Xcode.app` не установлен (есть только CommandLineTools). Без Xcode iOS-сборки невозможны локально. Варианты:
   - **Установить Xcode** из Mac App Store (~7GB, несколько часов скачки) — позволит локально запускать iOS Simulator + физический iPhone
   - **EAS Build (cloud)** для RN — `eas build --profile development --platform ios` (требует Apple Developer account $99/год для signing)
   - **Codemagic / Bitrise** для Flutter — аналогично cloud build
   - **Только Android** для Phase 0 — проще всего; принять, что прототип проигравшего фреймворка по iOS не тестируется до Phase 1

2. **GitHub репо** — `gh` CLI не установлен. Варианты:
   - `brew install gh && gh auth login && gh repo create runningecosystem/running-app --private --source=. --push` (предпочтительно)
   - Либо вручную в браузере: создать пустое репо `running-app` → `git remote add origin git@github.com:<owner>/running-app.git && git push -u origin main`
   - В обоих случаях: добавить второго разработчика как collaborator + branch protection на `main` (требовать PR + review + CI passing)

3. **Тестовые устройства** (`P0-A-04`) — организационно: 1 iPhone (iOS 16+), 1 Pixel (Android 13+), 1 китайский флагман.

4. **Android SHA-256 fingerprint** для Mapbox token restrictions — debug.keystore уже сгенерирован при build'е. Получить fingerprint:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA-256
   ```
   Добавить значение в Mapbox dashboard на токенах `dev-public` и `prod-public`.

5. **CODEOWNERS** — заполнить GitHub usernames обоих разработчиков в [CODEOWNERS](CODEOWNERS).

## Заметки

_Свободные заметки от разработчиков и от Claude — что неожиданно, что отложено, что требует внимания._
