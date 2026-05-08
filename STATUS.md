# STATUS

Живой документ. Обновляется после каждой закрытой задачи.

## Текущая фаза

**Phase 8 / E — Модерация (reports + audit + admin)** ✅ code-complete (backend + mobile + smoke)

Phase 0 закрыта — выбран Expo React Native, см. [DECISION.md](DECISION.md). Flutter архивирован в `apps/mobile_flutter.archived/`.

Phase 1–5 закрыты на code-level. Phase 6 / P6-A code-level done. Phase 6.5 polish done. Phase 7 scaffold (Mock health adapter). Phase 9 P9-A-01 plan generator. **Phase 3.1 production deploy на Hetzner-like VPS** (https://148-253-214-156.sslip.io) — Caddy HTTPS Let's Encrypt + Postgres+TimescaleDB.

**Phase 8 / A — Messenger MVP** ✅: 4 Go-сервиса (social-graph, messaging, realtime-gw, notifications) + NATS JetStream + Redis. Mobile A5 клиент: SQLite v8-v9, Realtime/Notifications adapters, 5 zustand stores, ChatsModal с 3 screens.

**Phase 8 / B — Groups + media** ✅: messaging extension (group conversations, member roles, reactions, replies, edits) + media сервис + MinIO с presigned PUT/GET через Caddy s3.148-253-214-156.sslip.io. Mobile: SQLite v10 (media columns), MediaAdapter, mediaUpload, NewGroupScreen, ChatSettingsScreen.

**Phase 8 / C — Stories** ✅: новый `feed` сервис (Go, port 8085), migration `0016_stories`, stories endpoints + cleanup-cron + NATS events. Mobile **`src/modules/stories/`** по новому модульному паттерну `{domain,storage,state,sync,ui}/index.ts`. SQLite v11.

**Phase 8 / D — Лента (posts/likes/comments)** ✅ code-complete:
- **Backend:** расширение `feed` сервиса (тот же контейнер). Migration `0017_feed_posts` (posts + post_likes + post_comments + триггеры для денормализованных like_count/comment_count). Endpoints: `POST/GET/DELETE /posts`, `POST/DELETE /posts/{id}/likes`, `POST/GET /posts/{id}/comments`, `DELETE /posts/{postId}/comments/{commentId}`, `GET /feed/home?cursor=` (cursor-pagination, chronological merge of self+followees). NATS events `feed.post.{created,liked,commented}.v1`.
- **Mobile:** `modules/feed/` по тому же модульному паттерну. Components: FeedScreen (FlatList с pull-to-refresh + infinite scroll), PostCard (text/photo/session-share), PostDetailScreen (пост + comments + composer), PostComposerScreen (text + photo через MediaAdapter), FeedModal (host modal). SQLite v12 (feed_posts + feed_comments + drafts). Offline-first drafts с retry. Auto-share: после Save пробежки prompt «Опубликовать в ленте?» → composeSession.
- **E2E smoke** (`services/backend/scripts/smoke_posts.py`, 14 шагов): register-2 → follow → upload → publish photo+text → feed/home → like/unlike → comment/uncomment → delete post → forbidden negative-test. Pass.

tsc clean, jest **253/253 passing** (+14 stories+feed).

**Phase 8 / E — Модерация (reports + audit + admin)** ✅ code-complete:
- **Backend:** расширение `social-graph` сервиса. Migration `0018_moderation` (reports + audit_log + indexes). Endpoints: `POST /reports`, `GET /reports/me`, `GET /admin/reports?status=`, `POST /admin/reports/{id}/resolve`. Admin gate через `profiles.global_role IN ('moderator','admin')` (чек в `requireAdmin`). Audit log: пишется на `report_opened`, `report_resolved`, `block_user`, `unblock_user` (best-effort, не fail-ит основное действие).
- **Mobile:** `modules/moderation/` по тому же модульному паттерну `{domain,sync,state,ui}/index.ts`. ReportSheet — bottom-sheet modal с radio-выбором причины (6 reasons из REPORT_REASONS) + опциональный textarea + submit с success-alert. Integration в PostCard (long-press → ActionSheet «Пожаловаться» / «Удалить» для своих) и ChatScreen (добавлена кнопка «⚠ Пожаловаться» в существующее long-press menu для чужих сообщений).
- **E2E smoke** (`services/backend/scripts/smoke_moderation.py`, 11 шагов): register-2 → publish post → submit report → my reports → 403 для non-admin → promote bob to admin via psql → admin queue → resolve → status updated → audit_log entries verified. Pass.

tsc clean, jest **265/265 passing** (+12 moderation).

**Phase 8 / F — Realtime + push для feed-событий** ✅:
- **Backend:** feed-сервис при like/comment публикует `event:feed.post.{liked,commented}` напрямую в `rt.user.{authorId}` (skip self-events). Realtime-gw (subscribed на `rt.user.{userId}` per WS) форвардит фрейм мгновенно. Notifications-сервис (subscribed на `rt.user.*`) распознаёт feed events и шлёт Expo Push с заголовком «❤ Новый лайк» / «💬 Комментарий», persist-ит in-app notification.
- **Mobile:** RealtimeAdapter получил типы `feed.post.liked` + `feed.post.commented`. useRealtimeStore диспетчер lazy-import-ит `modules/feed` и вызывает `applyLikeIncoming` / `applyCommentIncoming` — bump like/comment count в кэше без re-fetch.
- **E2E smoke** (`services/backend/scripts/smoke_realtime_feed.py`, 8 шагов): like/comment + verify in-app notification в SQL. Self-like skip verified. Pass.

Pipeline теперь end-to-end: action → DB → NATS rt.user.{authorId} → одновременно WS (если online) + Expo Push (если есть push token). Без новых контейнеров и миграций.

## Phase 1 progress

| Подсекция | Статус | Что готово |
|---|---|---|
| **P1-A** Setup | ✅ done | MapAdapter изоляция (`src/map/`), LocationAdapter interface + ExpoLocationAdapter, расширенный domain, SQLite v3 + миграции, sessionRepository, MapStore + SettingsStore с MMKV persist |
| **P1-A-01** Lint/format/jest | ✅ done | ESLint (с no-restricted-imports `@rnmapbox/maps` вне `src/map/`) + Prettier + jest-expo. 73 unit тестов passing. |
| **P1-B** MapScreen | 🟡 partial | App.tsx работает с MetricsBar; полный refactor (отдельный экран, hook структура) — P1-B-* в Phase 1.5 |
| **P1-C** Recording | 🟡 partial | activity store + ingestRawPoint работает; нет class SessionManager — Phase 1.5 |
| **P1-D** Live render | 🟡 partial | TrackLayer + ZoneLayer + CorridorLayer + HistoryTerritoryLayer работают; не реализовано: упрощение для больших треков (P1-D-04 — отложено до runtime замеров FPS на 5000+ pts) |
| **P1-E** Pipeline | ✅ done | Filter + Pipeline + AccuracyFilter + JumpFilter + MinSegmentFilter + KalmanFilter (2D с predict/update, q в правильных единицах) + PauseDetector. Покрытие ~93%. Интегрирован в LocationAdapter callback. |
| **P1-F** Метрики | ✅ done | DistanceCalculator (totalDistance), SpeedCalculator (sliding 10s, FR-008), PaceCalculator (1/speed с маской < 0.5 м/с, FR-009), Calories, MetricsBar UI. Покрытие 100%. |
| **P1-G** Closure + area | ✅ done | AreaCalculator + ClosureDetector + Douglas-Peucker + self-intersection (с проверкой closing edge polygon). Интегрирован в state: closureFired event, area + warnings. Покрытие 95%+. Нет: анимация при первом замыкании (P1-G-09 — нужен haptic + toast, отложено до runtime). |
| **P1-H** Buffered corridor | ✅ done | bufferTrack через @turf/buffer, CorridorLayer (FillLayer полупрозрачный); рендерится для незамкнутых треков, сменяется ZoneLayer'ом после замыкания |
| **P1-I** Background | 🟡 partial | foregroundService + UIBackgroundModes готовы; battery-optimization hint Alert (P1-I-04 минимум). Не реализовано: SignificantLocationChanges (P1-I-02 — нужен native module), adaptive sampling (P1-I-05) — отложено до runtime замеров |
| **P1-J** Lifecycle | ✅ done (минус summary screen) | Recovery dialog после старта app, Stop-confirmation Alert (Save/Discard), GPX-экспорт через RN Share API. Summary screen с большой картой (P1-J-05) — отложен на post-runtime |
| **P1-K** Offline tiles | ✅ done | downloadHomeRegion через Mapbox.offlineManager (10×10 км, zoom 12-16), автоматически вызывается при первом GPS fix через HomeRegionAutoDownload компонент. Manual region UI (P1-K-04) — отложен |
| **P1-L** History | ✅ done | useHistoryStore (sessions + closedSessionsPoints), HistoryModal (FlatList сессий со swipe-удалением), HistoryTerritoryLayer на карте (все закрытые сессии полупрозрачным синим) |
| **P1-M** Field testing | ⏳ TODO | T1–T15 на устройствах — на пользователя |

**Acceptance Phase 1** (см. ТЗ §3.15):
- ✅ P1-A..K реализованы и code-reviewed
- ✅ Покрытие тестами: pipeline ≥80% (93%), area ≥90% (95%+), domain/util — высокое
- ⏳ Полевые тесты M-01..M-03 — требуют физических устройств (P1-M)
- ⏳ Background reliability на 3 устройствах ≥95% — runtime, не code-level
- ⏳ Расход батареи ≤10%/ч — runtime
- ⏳ Авиарежим работает с offline pack — runtime (auto-download реализован)
- ✅ Crash recovery работает (recoverLast + dialog)

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

### 2026-05-07 — Phase 6 / P6-A: Training Engine (math + UI)

Реализована подсистема тренировочной нагрузки и прогнозирования:

| Файл | Что внутри |
|---|---|
| `src/domain/training/tss.ts` | `computeHrTSS` (HR-based), `computeRTSS` (pace-based, Daniels formula с IF в кубе), `bestTSS` (выбирает HR если есть данные, иначе rTSS), `averageHr`, `averagePaceFromTotals` |
| `src/domain/training/banister.ts` | `computePMC` — Banister рекуррентная модель CTL (τ=42d) и ATL (τ=7d), `tsbZone` 5-уровневая (fresh/optimal/neutral/fatigued/overreached), `buildDailyTSS` агрегация |
| `src/domain/training/lthr.ts` | `estimateLthrFromHistory` (95-й перцентиль avgHr из ≥30мин сессий), `estimateLthrPaceFromHistory` (5-й перцентиль среднего темпа = быстрейшие 5%) |
| `src/domain/training/racePredictor.ts` | `riegelPredict` (показатель 1.06), `cameronPredict` (адаптивный показатель 1.06/1.08/1.10 в зависимости от целевой дистанции), `bestPredict` choosing |
| `src/domain/training/vo2max.ts` | `vo2maxFromCooper12Min` (формула Купера), `vo2maxFrom5KTime` (Daniels VDOT-приближение), `vo2maxCategory` 5-уровневая по возрасту/полу |
| `src/domain/training/workout.ts` | `Workout`/`WorkoutStep` data model, `WORKOUT_LIBRARY` (4 предустановленных: easy-30min, intervals-5x400, tempo-40min, long-90min), `workoutTotalDurationS`, `resolveHrTargetBpm` |
| `src/state/training.ts` | `useTrainingStore` zustand: `recompute()` оценивает LTHR через эвристику (0.85 × maxHR), вычисляет TSS для всех завершённых сессий, строит PMC за 90 дней |
| `src/ui/TrainingModal.tsx` | 3 таба: **PMC** (CTL/ATL/TSB карточки + tsbZone hint + 30-дневный TSS bar chart + 90-дневный CTL/ATL trend chart + LTHR estimate), **Прогноз** (выбор distance + ввод времени → таблица предсказаний для всех остальных дистанций по Cameron), **Тренировки** (список WORKOUT_LIBRARY с цветовой меткой level и развёрнутым описанием шагов) |
| `src/__tests__/training.test.ts` | 36 unit-тестов всей training math |

**Тесты:** 146/146 passing (10 suites). tsc clean. ESLint config поломан после миграции на v9 (отдельная задача — `.eslintrc.json` нужно мигрировать на flat config), но функционально не критично.

**App.tsx интеграция:** добавлена кнопка `🏋 Тренировки` в правую колонку (между Статистикой и Историей), монтаж `<TrainingModal>` + `<WorkoutPlayer>` рядом с другими модалами. Когда workout активен — в правой колонке появляется зелёная кнопка с именем активной тренировки для возврата в плеер.

**P6-A-09 Workout Player** добавлен в этот же day:

| Файл | Что внутри |
|---|---|
| `src/domain/training/workoutSession.ts` | Pure state machine: `tickWorkout(state, workout, deltaS, deltaM)` авто-продвигает по шагам и repeats[], emit events (step-start/half/end/workout-complete); `skipStep` для ручного skip; `stepProgress` 0..1; `eventToVoiceText` локализованные строки для TTS |
| `src/state/workoutPlayer.ts` | zustand store + `attachWorkoutPlayerToActivity()` подписка на activityStore: на каждое изменение points вычисляется delta(time, distance) → `tickWorkout` → events → `speak()` |
| `src/util/speech.ts` | `SpeechAdapter` interface + noop default; expo-speech impl можно добавить через `setSpeechAdapter` без изменений в core |
| `src/ui/WorkoutPlayer.tsx` | Fullscreen modal: текущий шаг с прогрессбаром, target HR/pace/RPE с цветовой индикацией in-zone/out, секундомер шага, превью следующего, список всех шагов с галочками, SKIP/STOP кнопки, экран completion |
| `src/__tests__/workoutSession.test.ts` | 16 тестов state machine: time/distance progression, repeats, overshoot transfer, half-event, open-ended, skipStep, eventToVoiceText |

**Что НЕ входит в P6-A** (отложено):
- Real expo-speech voice TTS (сейчас noop по умолчанию — добавить нативный adapter и dep `expo-speech` тривиально, но нужен runtime test на устройстве)
- Real LTHR test wizard (30-минутный all-out)
- Реальный avgHr на сессию из sensor_readings (сейчас TODO в `state/training.ts` — Phase 5 хранит live HR, но не аггрегацию)
- ZRH (zone-based race predictor)
- Адаптивный план тренировок (нужна модель fitness-prediction)
- Backend Training Engine service (`P6-A-01`) — отложено до появления реального data inflow

### 2026-05-07 — Phase 7 / P7-A-01..03 scaffold: HealthAdapter abstraction

Sport-agnostic health platform abstraction (по тому же паттерну что
LocationAdapter и SensorAdapter): один контракт + Mock-first, real platform
impl за config plugin (отложено).

| Файл | Что внутри |
|---|---|
| `src/health/HealthAdapter.ts` | `HealthAdapter` interface (platform / isAvailable / requestPermissions / grantedScopes / writeWorkout / readWorkouts), типы `HealthWorkout` / `ImportedWorkout` / `HealthPermissionScope` |
| `src/health/MockHealthAdapter.ts` | In-memory impl: idempotent writeWorkout (по externalId), seedImports() для тестов сценария "пользователь связал часы" |
| `src/health/index.ts` | Singleton `getHealthAdapter()` + `setHealthAdapter()` для подмены в тестах |
| `src/health/sync.ts` | `writeSessionToHealth(sessionForHealth)` — no-throw helper, проверяет scope grant, выкатывает session как HealthWorkout с externalId=`local-<id>` |
| `src/__tests__/health.test.ts` | 10 тестов: scopes gating, идемпотентность, sinceMs filter, no-throw helper |

**App.tsx интеграция:** `handleStop > onPress(Сохранить)` вызывает `writeSessionToHealth` рядом с `triggerSync` — fire-and-forget, ошибки логируются. Сейчас Mock adapter — на устройстве запись пока ничего не делает (только в memory test buffer); в Phase 7.1 будет HealthKit/Health Connect adapter.

**Что НЕ входит в P7 scaffold** (Phase 7.1):
- HealthKitAdapter (через `react-native-health` или `expo-health-kit`) — нужен dev/preview build с config plugin
- HealthConnectAdapter (через `react-native-health-connect`) — Android 14+
- Strava OAuth bidirectional sync (P7-A-04) — нужен client_id/secret
- Garmin Connect (P7-A-05) — gated API
- FIT-парсер на бэкенде (P7-A-06)

### 2026-05-07 — Phase 6.5: per-km splits, HR aggregation, session detail, real TTS

Quality-of-life chunk поверх Phase 6: то что есть в любом современном беговом приложении.

| Файл | Что внутри |
|---|---|
| `src/domain/splits.ts` | `computeSplits(points)` per-km сплиты с линейной интерполяцией пересечения 1км границы, накопление avgHr (если HR enriched) и elevationGainM; `fastestAndSlowestKm` для подсветки лучшего/худшего |
| `src/__tests__/splits.test.ts` | 11 тестов: пустые входы, ровно 1км, 5км, partial split, HR averaging, elevation, переменный темп |
| `src/storage/database.ts` | Migration v6: `avg_hr_bpm`, `max_hr_bpm` колонки в sessions |
| `src/storage/sensorRepository.ts` | `aggregateHrForSession(sessionId)` — `AVG`/`MAX` query по sensor_readings type='hr' |
| `src/storage/sessionRepository.ts` | `finalizeSession` теперь принимает avgHrBpm/maxHrBpm и пишет их |
| `src/state/activity.ts` | `stop()` вызывает `aggregateHrForSession` и передаёт результат в `finalizeSession` |
| `src/state/training.ts` | TSS теперь считается с реальным `avgHrBpm` из session row (closes TODO Phase 5+); LTHR estimate берёт avgHr из ≥30мин сессий |
| `src/sync/syncEngine.ts` | LocalSessionRow + SELECT обновлены под новые колонки |
| `src/ui/SessionDetailModal.tsx` | Fullscreen view: header (дата) → map с TrackLayer/ZoneLayer → 6 metric tiles (distance/time/pace/avgHr/maxHr/area) → HR chart 60 buckets (если HR есть) → splits table с подсветкой fastest/slowest → Поделиться GPX |
| `src/ui/HistoryModal.tsx` | Tap на сессию открывает SessionDetailModal; `×`-кнопка вместо "Удалить" текста; HR badge в строке если avgHr есть |
| `src/util/speech.ts` (existing) | + `setSpeechAdapter` теперь принимает real impl |
| `src/util/expoSpeechAdapter.ts` | Реальный TTS через `expo-speech` (русский язык, rate 1.0); зарегистрирован в App.tsx side effect-ом |
| `package.json` | + `expo-speech ~14.0.8` |

**Тесты:** 172 → **183/183 passing** (+11 splits). TS clean.

**Что НЕ входит** (отложено):
- Strava OAuth bidirectional sync (P7-A-04)
- Garmin Connect (P7-A-05)
- Backend FIT parser (P7-A-06)
- Phase 8 social (feed, лайки, клубы, segments, leaderboards, zone wars)
- Splits over-time chart (line chart) — пока bar chart с downsampled 60 buckets
- HR-zone time breakdown в session detail

## Заметки

_Свободные заметки от разработчиков и от Claude — что неожиданно, что отложено, что требует внимания._
