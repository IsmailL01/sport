# Running Ecosystem — План разработки

**Версия:** v1.0
**Парный документ:** `RUNNING_ECOSYSTEM_TZ.md` (требования и архитектура)
**Этот документ:** последовательность работ, разбитая на фазы и атомарные задачи

---

## 0. Как использовать этот план

### 0.1 Принципы

1. **Phase 1 — это "карта и территория"**. Это вся первая часть приложения, единственное что увидит пользователь после первого запуска. Когда Phase 1 закончен — есть приложение, которое умеет: показать карту, записать пробежку, нарисовать территорию, сохранить, показать историю. Без аккаунтов, без облака, без часов, без социального
2. **Все остальные фазы (2–10) добавляют слои поверх**. Каждая фаза самодостаточна — продукт можно зарелизить и в конце Phase 1, и в конце Phase 4 — он будет работать
3. **Каждая задача имеет уникальный ID** вида `P1-B-03`. Этот ID можно отдавать агенту: "сделай задачу P1-B-03". Документ написан так, чтобы один ID = один разумный объём работы (несколько часов до 1-2 дней)
4. **Зависимости явные** — у каждой задачи указано "depends on". Не браться за задачу, пока не закрыты её зависимости
5. **Acceptance criteria проверяемые** — закрытие задачи требует прохождения этих критериев, не "ну вроде работает"

### 0.2 Условные обозначения

- **🎯 Цель** — что должно стать возможным после выполнения
- **📦 Скоуп** — что входит / не входит
- **✅ Готово когда** — приёмка
- **⚠️ Риски** — что может пойти не так
- **⏱ Effort** — S (≤4ч), M (½–2 дня), L (3–5 дней), XL (>5 дней)
- **🔗 Depends on** — какие задачи должны быть сделаны перед этой

### 0.3 Разделение труда (2 разработчика)

Условно: **Dev A** — клиентская часть (приложение, GPS pipeline, UI), **Dev B** — карта/гео/инфра (Mapbox, рендеринг, offline, позже бэкенд). Это не строгое разделение, в Phase 0–1 много пересечения. После Phase 2 Dev B уходит в бэкенд, Dev A продолжает по клиенту.

---

## 1. Big Picture

| Фаза | Название | Длительность | Что в результате есть у пользователя |
|---|---|---|---|
| **0** | Foundation & Framework Selection | 2 нед | Выбран фреймворк, инфра готова, Mapbox настроен |
| **1** | **Territory Core** | **6–8 нед** | **Записать пробежку → видеть свою территорию на карте → сохранить → видеть историю** |
| 2 | Account & Cloud Sync | 3–4 нед | Регистрация, облачный бэкап, синхронизация между устройствами |
| 3 | Production Backend | 4–5 нед | Полноценный бэкенд: микросервисы, observability, CI/CD |
| 4 | Profile & Stats | 2–3 нед | Профиль атлета, агрегированная статистика, цели |
| 5 | Sensors & HRM | 3–4 нед | Подключение пульсометра по BLE, зоны пульса |
| 6 | Training Engine | 5–6 нед | Структурированные тренировки, TSS/CTL/ATL, race predictor |
| 7 | Watch & Apple Health | 4–5 нед | Импорт с Apple Watch / Garmin, integrate с HealthKit/Health Connect |
| 8 | Social | 4–5 нед | Лента активностей, клубы, сегменты, лидерборды |
| 9 | Coaching & Plans | 5–6 нед | Тренер↔атлет, тренировочные планы |
| 10 | Premium & Marketplace | 3–4 нед | Подписки, маркетплейс планов |

**Итого до полноценной экосистемы:** ~12 месяцев чистой работы. С учётом реальности (бенчмарк, баги, отдых, неожиданности) — закладывать 18 месяцев на all-in MVP экосистемы.

---

## 2. Phase 0 — Foundation & Framework Selection

🎯 **Цель:** выбрать фреймворк по измеримым критериям, подготовить инфраструктуру разработки.

📦 **Скоуп:** мини-прототипы на двух фреймворках с **минимальным** скоупом (карта + GPS + полилиния), полевые тесты, сравнение, решение. **НИКАКОЙ работы по Phase 1 фичам — она начинается на победившем фреймворке с нуля.**

⏱ **Длительность:** 2 недели

### 2.1 Mapbox & Tooling Setup

#### `P0-A-01` Создание Mapbox-аккаунта и токенов
- Зарегистрироваться на mapbox.com (организационный аккаунт, не личный)
- Создать 3 access token: `dev-public`, `prod-public`, `server-secret`
- Ограничить токены по Bundle ID + SHA fingerprint в dashboard
- Сохранить secrets в локальном password manager (1Password / Bitwarden)
- Документировать процесс получения токенов в `docs/SECRETS.md`
- ⏱ S
- ✅ Готово когда: токены созданы, ограничены, задокументированы

#### `P0-A-02` Кастомный стиль карты (черновик)
- Создать стиль на базе Mapbox Outdoors v12 в Mapbox Studio
- Скрыть POI: рестораны, отели, АЗС
- Подсветить: pedestrian/cycle paths, parks, water
- Темная и светлая темы (один стиль с переключением)
- Сохранить URL стилей: `mapbox://styles/yourorg/running-light` и `running-dark`
- ⏱ M
- ✅ Готово когда: оба стиля доступны, корректно отображаются в Mapbox Studio Preview
- 💡 На прототипе сойдёт и стандартный Outdoors v12, можно отложить

#### `P0-A-03` GitHub репозитории
- Монорепо `running-app` с подпапками `apps/mobile-rn`, `apps/mobile-flutter`, `services/backend` (последняя пока пустая)
- README с описанием проекта и быстрого старта
- Branch protection на `main` (PR + review)
- `CODEOWNERS` файл (обоих разработчиков на всё)
- `.gitignore`, `.editorconfig`
- ⏱ S
- ✅ Готово когда: монорепо создано, оба разработчика имеют push, CI пустой шаблон работает

#### `P0-A-04` Тестовые устройства
- Минимум: 1 iPhone (iOS 16+), 1 Pixel (Android 13+), 1 китайский флагман (Xiaomi/Realme/Oppo — для теста OEM-killers)
- Зарядки, кабели, фитнес-наручник для телефона на пробежки
- ⏱ S
- ✅ Готово когда: все устройства в наличии, dev-mode включён

### 2.2 Прототип A — Expo React Native

#### `P0-B-01` Bootstrap RN-проекта
- `npx create-expo-app apps/mobile-rn --template default`
- Установка: `expo-location`, `expo-task-manager`, `@rnmapbox/maps`, `expo-sqlite`, `react-native-mmkv`, `zustand`, `@turf/turf`
- EAS Build конфиг (`eas.json` с development/preview/production)
- iOS: настроить Mapbox download token в `~/.netrc` для CocoaPods
- ⏱ M
- ✅ Готово когда: пустой проект собирается через EAS, запускается на iOS и Android

#### `P0-B-02` Карта Mapbox с user location
- MapView с custom стилем (или Outdoors v12)
- Permission flow для геолокации
- Location puck (синяя точка с пульсацией)
- Camera следует за пользователем
- ⏱ M
- ✅ Готово когда: запустить → разрешения → карта показывает мою позицию, follows me

#### `P0-B-03` Запись точек GPS
- Кнопка Start/Stop
- При Start: подписка на `expo-location` updates с `accuracy: BestForNavigation`, distanceInterval 5м
- Сохранение точек в массив в zustand store
- Лог в консоль: каждая точка
- ⏱ M
- ✅ Готово когда: пройти 100м → 15-25 точек в массиве

#### `P0-B-04` Live полилиния на карте
- ShapeSource + LineLayer (НЕ PolylineAnnotation)
- Обновление shape при добавлении точки в массив
- Стиль: толщина 6, цвет акцентный, line-cap round
- ⏱ M
- ✅ Готово когда: гулять → линия рисуется live, плавно

#### `P0-B-05` Замыкание + площадь
- Детект: `distance(first, last) < 20m && totalDistance > 200m`
- Проекция через @turf/projection в локальную плоскость
- Площадь через `@turf/area` (он сам сделает правильно для GeoJSON)
- FillLayer с прозрачностью 0.3
- Текст с площадью в м² на экране
- ⏱ M
- ✅ Готово когда: пройти круг 100м диаметром → видеть полигон + площадь ~7800 м²

#### `P0-B-06` Background location
- Регистрация TaskManager task
- iOS: `UIBackgroundModes: location`
- Android: foreground service через `expo-task-manager`, persistent notification
- Заблокировать телефон → пройти 5 минут → разблокировать → точки записаны
- ⏱ L
- ⚠️ Самый рискованный пункт RN-прототипа. Проверить на Pixel + китайском флагмане
- ✅ Готово когда: 30 минут в фоне → не более 5% потерянных точек

#### `P0-B-07` SQLite persistence
- Схема: одна таблица `points`, поля `id, session_id, lat, lon, ts, accuracy, speed`
- Запись каждые 10 точек или 30с
- При старте: load последний session_id, точки рисуются
- ⏱ M
- ✅ Готово когда: записать 5 минут, force-kill, перезапустить → точки восстановлены, можно "продолжить"

### 2.3 Прототип B — Flutter

Зеркальные задачи с теми же acceptance criteria.

#### `P0-C-01` Bootstrap Flutter-проекта
- `flutter create apps/mobile_flutter`
- Зависимости: `mapbox_maps_flutter`, `geolocator`, `flutter_background_service`, `sqflite`, `riverpod`, `turf` (или встроить shoelace)
- iOS: настроить netrc для Mapbox CocoaPods
- ⏱ M

#### `P0-C-02` Карта Mapbox с user location
Аналогично `P0-B-02`. ⏱ M

#### `P0-C-03` Запись точек GPS
Через `geolocator` stream, `accuracy: best`. ⏱ M

#### `P0-C-04` Live полилиния
GeoJsonSource + LineLayer (не PolylineAnnotation). Обновление через `updateGeoJSONSourceFeatures`. ⏱ M

#### `P0-C-05` Замыкание + площадь
Через `turf` или собственная реализация shoelace на 30 строк Dart. ⏱ M

#### `P0-C-06` Background location
- iOS: location background mode
- Android: `flutter_background_service` с foreground service location type
- ⏱ L
- ⚠️ Альтернативно `background_locator_2` — выбирать тот, что более активно поддерживается на момент старта

#### `P0-C-07` SQLite persistence
Через `sqflite`. Та же схема. ⏱ M

### 2.4 Полевые тесты

#### `P0-D-01` Тестовый протокол на бумаге
- Документ `tests/FIELD_PROTOCOL.md` с 10 сценариями (T1–T10 из ТЗ §2.5)
- Шаблон отчёта по каждому тесту: устройство, дата, погода, метрики, скриншоты, GPX
- ⏱ S

#### `P0-D-02` Прогон тестов на iPhone
- Все 10 сценариев на обоих фреймворках в один день
- Заполнить шаблоны
- ⏱ L (1 рабочий день в полях)

#### `P0-D-03` Прогон тестов на Pixel
То же. ⏱ L

#### `P0-D-04` Прогон тестов на китайском Android
То же — критично для оценки background reliability. ⏱ L

#### `P0-D-05` Decision Matrix
- Заполнить таблицу из ТЗ §2.6 числами
- Написать `DECISION.md` с рекомендацией и обоснованием
- ⏱ M
- ✅ Готово когда: фреймворк выбран, документ закоммичен, оба разработчика согласны

### 2.5 Acceptance Phase 0

Phase 0 закрыта когда:
1. Mapbox-аккаунт настроен, токены созданы и ограничены
2. Оба прототипа реализуют P0-B-01…P0-B-07 / P0-C-01…P0-C-07
3. Полевые тесты пройдены на трёх устройствах
4. `DECISION.md` зафиксировал выбранный фреймворк

**После этой точки:**
- Прототип проигравшего фреймворка архивируется (не удаляется — может пригодиться для нативных модулей)
- Прототип победителя **тоже архивируется**. Phase 1 начинается с чистого листа на победителе, чтобы не тащить хаки из прототипа в production-код

---

## 3. Phase 1 — Territory Core

🎯 **Главная цель проекта на этом этапе:**
**пользователь выходит на улицу с телефоном, нажимает Start, идёт/бежит, видит на карте Mapbox свою территорию (закрашенную зону) которая растёт по мере движения. Может остановиться, сохранить пробежку, открыть историю, увидеть все свои территории за всё время на одной карте.**

📦 **Что входит:**
- Карта Mapbox с кастомным стилем
- Запись GPS-трека в реальном времени
- Полная GPS pipeline (фильтры, Kalman, авто-пауза)
- Live-отрисовка трека и территории на карте
- Замкнутая зона (полигон) и буферизированный коридор (для незамкнутого)
- Метрики: дистанция, скорость, темп, время, площадь
- Background tracking
- Восстановление после kill приложения
- Локальное сохранение в SQLite
- История пробежек с визуализацией всех зон
- Offline tile pack для домашней зоны
- GPX экспорт для верификации

📦 **Что НЕ входит** (Phase 2+):
- Регистрация / аккаунты
- Бэкенд / синхронизация в облако
- Часы / BLE-датчики
- Социальные функции
- Тренировочный анализ (TSS, зоны, планы)

⏱ **Длительность:** 6–8 недель (1 разработчик может справиться, два — быстрее за счёт распараллеливания между подсекциями A–M)

### 3.1 Подсекции и их зависимости

```
1.A Setup ────┬─→ 1.B Map ────┬─→ 1.D Live render ─→ 1.G Polygon ─→ 1.H Buffer
              │              │
              └─→ 1.C GPS ───┴─→ 1.E Pipeline ─→ 1.F Metrics
                                    │
                                    └─→ 1.I Background

1.J Lifecycle ← (зависит от C, D, E)
1.K Offline tiles ← (зависит от B)
1.L History ← (зависит от J)
1.M Field testing ← (зависит от всего)
```

### 3.2 P1-A — Setup проекта

#### `P1-A-01` Чистый bootstrap на победившем фреймворке
- Новый проект, не на основе прототипа
- Те же зависимости, что в P0-B-01 / P0-C-01
- Структура папок:
  ```
  src/
    domain/        # сущности, value objects, ничего платформенного
    pipeline/      # GPS pipeline (фильтры, kalman, etc.)
    map/           # MapAdapter и реализации
    location/      # LocationAdapter и реализации
    storage/       # репозитории, SQLite
    state/         # store(s)
    ui/            # экраны, компоненты
    util/          # хелперы
  ```
- Линтер настроен strict (eslint+prettier для RN, dart analysis для Flutter)
- Pre-commit хук (husky / lefthook): линтер + форматирование
- ⏱ M
- ✅ Готово когда: пустой проект собирается, тесты `npm test` / `flutter test` проходят (даже если 0 тестов)

#### `P1-A-02` MapAdapter интерфейс
- Файл `src/map/MapAdapter.ts(.dart)` с интерфейсом из ТЗ §10.6
- Mock-реализация `InMemoryMapAdapter` для тестов
- Юнит-тесты на интерфейс (через mock)
- ⏱ M
- 🔗 P1-A-01

#### `P1-A-03` MapboxMapAdapter — реализация
- Реализация всех методов MapAdapter через Mapbox SDK
- Только инициализация, setStyle, setCamera. Остальное — после P1-D
- Конфигурация permissions iOS/Android (см. ТЗ §2.7/2.8)
- Обработка отсутствия токена → понятная ошибка для разработчика
- ⏱ M
- 🔗 P1-A-02

#### `P1-A-04` LocationAdapter интерфейс
- Файл `src/location/LocationAdapter.ts(.dart)`
- Интерфейс:
  ```
  interface LocationAdapter {
    requestPermissions(): Promise<PermissionResult>
    startUpdates(config: LocationConfig): Stream<RawLocation>
    stopUpdates(): void
    getCurrentPosition(): Promise<RawLocation>
  }
  ```
- Mock-реализация `MockLocationAdapter` (читает из заранее записанного GPX и эмулирует поток)
- ⏱ M
- 🔗 P1-A-01

#### `P1-A-05` PlatformLocationAdapter — реализация
- Через expo-location (RN) или geolocator (Flutter)
- Конфиг: интервал, точность, distance filter
- Обработка отказа в разрешениях
- ⏱ M
- 🔗 P1-A-04

#### `P1-A-06` Доменные сущности
- `RawLocation`, `Point`, `Track`, `Session`, `Stats`, `Pause`
- Чистые data-классы, без зависимостей
- Юнит-тесты (создание, сравнение, сериализация)
- ⏱ M
- 🔗 P1-A-01

#### `P1-A-07` SQLite-схема
- Миграция 001:
  - `sessions(id, started_at, ended_at, is_closed, distance_m, area_m2, calc_method)`
  - `points(id, session_id, ts, lat, lon, alt, accuracy, speed, source)`
  - индекс `points(session_id, ts)`
- Класс `Database` (singleton) с миграциями
- ⏱ M
- 🔗 P1-A-01

#### `P1-A-08` Репозитории
- `SessionRepository`: createSession, finalizeSession, getById, listAll
- `PointRepository`: appendPoint(s), loadForSession
- Интерфейсы в `src/domain`, реализация в `src/storage`
- ⏱ M
- 🔗 P1-A-06, P1-A-07

#### `P1-A-09` State management
- `ActivityStore`: state машины сессии (Idle / Recording / Paused / Stopped)
- `MapStore`: камера, стиль (light/dark), interaction state
- `SettingsStore`: единицы измерения, тема, ID домашней зоны
- Подключение persistence где нужно (SettingsStore через MMKV / shared_preferences)
- ⏱ M
- 🔗 P1-A-06

### 3.3 P1-B — Карта на экране

#### `P1-B-01` Главный экран с картой на весь экран
- Один экран `MapScreen`, занимает весь viewport
- Использование MapAdapter (через DI / контекст)
- Дефолтная позиция: последняя известная или геоцентр Европы
- ⏱ M
- 🔗 P1-A-03

#### `P1-B-02` Permission flow
- При первом запуске: модалка с объяснением "зачем нам геолокация"
- Кнопка "Дать разрешение" → системный диалог
- Если отказ: экран-blocker с инструкцией пойти в настройки
- Background permission запрашиваем **только** после Start (не при первом запуске — иначе iOS отклонит)
- ⏱ M
- 🔗 P1-A-05, P1-B-01

#### `P1-B-03` Location puck (точка пользователя)
- Через MapAdapter.setLocationPuck
- Стиль: пульсирующая синяя точка с heading
- Авто-обновление при movement (без Start трекинга — просто follow)
- ⏱ S
- 🔗 P1-B-01

#### `P1-B-04` Управление камерой
- Кнопки на UI:
  - 🎯 "Center on me" — центрировать и зум 16
  - 🗺 "Show all track" — fit bounds текущего трека
- Auto-follow режим: когда трекинг идёт, камера следует за пользователем (можно отключить, если пользователь сам подвигал карту)
- ⏱ M
- 🔗 P1-B-01

#### `P1-B-05` Переключение темы карты
- Кнопка / settings: light / dark / auto (по системной)
- При смене темы вызывается `MapAdapter.setStyle(...)`
- ⏱ S
- 🔗 P1-B-01

#### `P1-B-06` UI элементы поверх карты
- Bottom sheet с метриками (см. P1-F-04) — пока пустая заглушка
- Floating action button "Start" в центре снизу
- Top bar: кнопка профиля (заглушка), название
- ⏱ M
- 🔗 P1-B-01

### 3.4 P1-C — Запись GPS-точек

#### `P1-C-01` SessionManager
- Класс с методами `start()`, `pause()`, `resume()`, `stop()`, `discard()`
- Внутри: state машина, подписка на LocationAdapter, отправка точек в pipeline (пока заглушка — просто складывает)
- Эмитит события: `pointAdded`, `stateChanged`
- ⏱ L
- 🔗 P1-A-04, P1-A-09

#### `P1-C-02` Старт/стоп через UI
- Кнопка Start (FAB) → SessionManager.start()
- В состоянии Recording: FAB меняется на Pause + Stop
- Pause → resume → stop → подтверждение → save
- ⏱ M
- 🔗 P1-C-01, P1-B-06

#### `P1-C-03` Запрос background permission в момент старта
- Перед стартом проверка background permission
- Если нет — модалка "Для записи в фоне нужно ‘всегда’ разрешение", кнопка "Настройки"
- ⏱ S
- 🔗 P1-C-01

#### `P1-C-04` Базовая персистентность точек
- В SessionManager: каждые N=10 точек или каждые T=30с — flush через PointRepository
- При старте сессии создаётся запись в `sessions`
- При stop — finalize: запись `ended_at`, метрик
- ⏱ M
- 🔗 P1-A-08, P1-C-01

#### `P1-C-05` Проверка точности GPS до старта
- Перед стартом: ждать первую точку с accuracy < 20м (или таймаут 10с)
- Если за 10с не получили — alert "GPS сигнал слабый, продолжить?" (start/cancel)
- ⏱ S
- 🔗 P1-C-01

### 3.5 P1-D — Live-отрисовка на карте

**🚨 Это критичная подсекция для производительности. Сделать аккуратно.**

#### `P1-D-01` Расширить MapAdapter методами для слоёв
- Добавить в интерфейс:
  - `addOrUpdateGeoJsonSource(id, geojson)`
  - `removeSource(id)`
  - `addLineLayer(id, sourceId, paint)`
  - `addFillLayer(id, sourceId, paint)`
  - `addCircleLayer(id, sourceId, paint)`
  - `removeLayer(id)`
  - `getLayer(id)` — для проверки существования
- Реализация в MapboxMapAdapter
- Юнит-тесты на InMemoryMapAdapter
- ⏱ M
- 🔗 P1-A-03

#### `P1-D-02` TrackRenderer
- Класс, который слушает SessionManager и обновляет источник `track-active` на карте
- Создание источника при старте сессии (пустой LineString)
- Обновление при каждом новом point (или batched раз в 200мс)
- Удаление источника при stop
- ⏱ L
- 🔗 P1-D-01, P1-C-01

#### `P1-D-03` Стилизация линии
- LineLayer:
  - line-color: акцентный (свой brand color)
  - line-width: интерполяция по zoom (`["interpolate", ["linear"], ["zoom"], 10, 2, 18, 8]`)
  - line-cap: round, line-join: round
  - line-opacity: 0.9
- ⏱ S
- 🔗 P1-D-02

#### `P1-D-04` Стратегия обновления при больших треках
- Если точек > 1000: каждое обновление сначала упрощать (Дугласа-Пёкер, толерантность 2м для рендера), полная версия в БД
- Для активного трека достаточно обновлять только последние 100 точек, остальные — статичный источник
- ⏱ L
- 🔗 P1-D-02

#### `P1-D-05` Performance тест с синтетическим треком
- Генератор: 5000 точек по случайной траектории
- Замер FPS при панорамировании / зуме (через Flutter performance overlay / RN's onJsFrameDrop)
- Целевой показатель: ≥50 FPS на тестовых устройствах
- Если не дотягивает — оптимизировать (упрощение более агрессивное, или offload в native)
- ⏱ M
- 🔗 P1-D-04

#### `P1-D-06` Вторичный слой "all-time territory"
- Источник `track-history` отдельный от активного
- Заполняется при загрузке экрана (см. P1-L-02) — все точки всех прошлых сессий, в виде union полигонов
- Стиль: полупрозрачная заливка с обводкой
- ⏱ M
- 🔗 P1-D-01

### 3.6 P1-E — GPS Pipeline

#### `P1-E-01` Базовый класс Pipeline
- Композиция фильтров: `Pipeline(filters: Filter[])`, метод `process(rawLocation): Point | null`
- Каждый фильтр имеет интерфейс: `apply(input: Point): Point | null`
- Если любой фильтр возвращает null — точка отбрасывается
- Логирование: какой фильтр отбросил, причина
- ⏱ M
- 🔗 P1-A-06

#### `P1-E-02` AccuracyFilter
- Если `accuracy > 20м` → отбросить
- Конфигурируемый порог
- ⏱ S
- 🔗 P1-E-01

#### `P1-E-03` JumpFilter (outlier detection)
- Если `distance(prev, current) > 30м && (current.ts - prev.ts) < 5s` → отбросить
- Использует haversine для дистанции
- ⏱ S
- 🔗 P1-E-01

#### `P1-E-04` MinSegmentFilter
- Если `distance(lastAccepted, current) < 2м` → отбросить (накапливаем но не добавляем в трек)
- ⏱ S
- 🔗 P1-E-01

#### `P1-E-05` KalmanFilter — реализация
- 2D-калман: state `[lat, lon, v_lat, v_lon]`
- Матрицы F, H, Q, R по формулам ТЗ §6.1
- Адаптивный R по accuracy GPS
- Юнит-тесты:
  - 100 точек на прямой со шумом → линия после фильтра прямая (отклонение < 1м)
  - Резкий outlier → демпфирован
- ⏱ L
- 🔗 P1-E-01

#### `P1-E-06` PauseDetector
- Гистерезис: paused если 5с подряд `v < 0.5 м/с`, resumed если 2с подряд `v > 1.5 м/с`
- Возвращает событие, не отбрасывает точки
- Юнит-тесты на разные сценарии (start moving, slow down, full stop, resume)
- ⏱ M
- 🔗 P1-E-01

#### `P1-E-07` Композиция всей pipeline
- Порядок: `AccuracyFilter → KalmanFilter → JumpFilter → MinSegmentFilter → PauseDetector → output`
- Wire с SessionManager: SessionManager пропускает точки через pipeline перед сохранением
- ⏱ M
- 🔗 P1-E-02..06

#### `P1-E-08` Замена точки фильтром vs отбрасывание
- AccuracyFilter, JumpFilter, MinSegmentFilter — отбрасывают
- KalmanFilter — заменяет (помечает `source: kalman`)
- PauseDetector — не меняет, но эмитит событие
- Все события логируются
- ⏱ S
- 🔗 P1-E-07

#### `P1-E-09` Тесты pipeline на реальных GPX
- Подготовить 3 GPX-файла из реальных пробежек (можно из прототипа Phase 0 или экспортированных из Strava)
- Прогнать через MockLocationAdapter → Pipeline
- Сравнить: до и после фильтрации
- ⏱ M
- 🔗 P1-E-07

### 3.7 P1-F — Метрики

#### `P1-F-01` DistanceCalculator
- Аккумулирует общую дистанцию по haversine между последовательными точками
- Сбрасывается при старте сессии
- ⏱ S
- 🔗 P1-A-06

#### `P1-F-02` SpeedCalculator
- Текущая скорость = средняя по последним 10с
- Скользящее окно реализовано через ring buffer
- Возвращает 0 если нет данных за окно
- ⏱ M
- 🔗 P1-A-06

#### `P1-F-03` PaceCalculator
- pace = 1 / speed (мин/км)
- Маскируется (`null`) если speed < 0.5 м/с
- Форматирование "5:23" из секунд
- ⏱ S
- 🔗 P1-F-02

#### `P1-F-04` MetricsBar UI
- Bottom sheet (или фиксированная панель) с 4 метриками:
  - Время (mm:ss или hh:mm:ss)
  - Дистанция (км, 2 знака)
  - Темп (мин/км)
  - Площадь (м² или га, динамически)
- Обновление 1 раз в секунду
- ⏱ M
- 🔗 P1-B-06, P1-F-01..03

#### `P1-F-05` Калории (опционально для Phase 1)
- Простая формула из ТЗ §6: `weight * distance_km * 1.036`
- Поле "вес" в Settings (по умолчанию 70 кг)
- ⏱ S
- 🔗 P1-F-01, P1-A-09

### 3.8 P1-G — Замыкание и полигон территории

#### `P1-G-01` ClosureDetector
- Раз в 30с проверять: `distance(first, last) < 20m && totalDistance > 200m`
- Эмитит событие `closureDetected`
- Не отбрасывает данные, только сигнал
- ⏱ S
- 🔗 P1-A-06

#### `P1-G-02` Локальная плоская проекция
- Утилита `LocalPlane.project(points): {x, y}[]`
- Центр = центроид всех точек
- Формула:
  ```
  x = (lon - lon0) * cos(lat0 * π/180) * R
  y = (lat - lat0) * R
  где R = 6371000
  ```
- Юнит-тест: точки на расстоянии 100м по широте дают y=100 (±1м)
- ⏱ S
- 🔗 P1-A-06

#### `P1-G-03` Дугласа-Пёкер упрощение
- Реализация / использовать @turf/simplify (RN) / собственная реализация (Flutter)
- Толерантность параметризуема (по умолчанию 5м)
- Юнит-тесты на простых треках
- ⏱ M
- 🔗 P1-A-06

#### `P1-G-04` Shoelace area
- На точках в локальной плоскости из P1-G-02
- Формула из ТЗ §6.6
- Возвращает площадь в м²
- Юнит-тест: квадрат 100×100 → 10000 м² (точно, без округлений)
- ⏱ S
- 🔗 P1-G-02

#### `P1-G-05` Самопересечения — детект и предупреждение
- Алгоритм: для каждой пары не-соседних рёбер проверка пересечения
- Для трека до 1000 точек (после Дугласа-Пёкер) допустимо O(n²)
- Если пересечение найдено — флаг `hasSelfIntersection`
- ⏱ M
- 🔗 P1-G-03

#### `P1-G-06` AreaCalculator (фасад)
- На вход: список точек
- Внутри: упрощение → проекция → проверка самопересечений → shoelace
- Возвращает: `{ area_m2, method: 'shoelace_simple' | 'shoelace_with_warning', warnings: [...] }`
- ⏱ M
- 🔗 P1-G-03..05

#### `P1-G-07` Подключение к SessionManager
- При событии `closureDetected` → расчёт area → сохранить в state и в БД
- Перерасчёт каждые 30с пока сессия не остановлена (пока пользователь продолжает накручивать круги)
- ⏱ M
- 🔗 P1-G-01, P1-G-06

#### `P1-G-08` Отрисовка полигона
- При наличии closed track → создать источник `territory-active` с polygon feature
- FillLayer:
  - fill-color: акцентный цвет с прозрачностью
  - fill-opacity: 0.3
- LineLayer поверх с обводкой полигона
- ⏱ M
- 🔗 P1-G-07, P1-D-01

#### `P1-G-09` Анимация появления полигона
- При первой детекции замыкания → fade-in fillLayer (через `["interpolate", ["linear"], ["zoom"], ...]` — нет, fadeIn делается через анимацию opacity через setStyleProperty)
- Лёгкая haptic feedback при замыкании
- Toast "Зона захвачена! 12,500 м²"
- ⏱ M
- 🔗 P1-G-08

#### `P1-G-10` Тесты area calculation
- 5 эталонных GPX (квадраты, круги, восьмёрка, неровный путь, длинный)
- Для каждого: записанная фактическая площадь
- Юнит-тест прогоняет через AreaCalculator и сравнивает (допуск 5%)
- ⏱ M
- 🔗 P1-G-06

### 3.9 P1-H — Буферизированный коридор

#### `P1-H-01` Полилиния-buffer алгоритм
- Если трек НЕ замкнут — рисуем коридор шириной 5м вокруг полилинии
- Использовать `@turf/buffer` (RN) или `dart_turf` (Flutter), либо свой Minkowski sum
- На вход: GeoJSON LineString, на выход: GeoJSON Polygon
- ⏱ M
- 🔗 P1-G-02

#### `P1-H-02` BufferedCorridorRenderer
- Создание источника `territory-corridor` (отдельный от `territory-active`)
- Обновление при каждых N=20 новых точек (не каждую — buffer дорогой)
- ⏱ M
- 🔗 P1-H-01, P1-D-01

#### `P1-H-03` Стилизация коридора
- FillLayer с такой же фолклорной заливкой как у полигона, но чуть прозрачнее (0.2)
- ⏱ S
- 🔗 P1-H-02

#### `P1-H-04` Переключение между корридором и полигоном
- Если `isClosed === true` → показываем полигон, скрываем коридор
- Если `isClosed === false` → показываем коридор
- В UI: лейбл "Открытая зона: X м²" (площадь коридора) или "Закрытая зона: X м²" (площадь полигона)
- ⏱ S
- 🔗 P1-H-02, P1-G-08

#### `P1-H-05` Площадь коридора
- = площадь буфер-полигона через shoelace
- Сохраняется отдельным полем `corridor_area_m2` в БД
- ⏱ S
- 🔗 P1-H-01, P1-G-04

### 3.10 P1-I — Background tracking

**🚨 Самая хрупкая часть приложения. Тестировать на 3+ устройствах.**

#### `P1-I-01` iOS background mode
- В Info.plist: `UIBackgroundModes: location, fetch, processing`
- Description-strings (ТЗ §2.7)
- При уходе в фон — продолжаем тот же режим updates (`distanceFilter`, `kCLLocationAccuracyBest`)
- Тест: записать → заблокировать → 10 минут гулять → разблокировать → точки записаны
- ⏱ M
- 🔗 P1-C-01

#### `P1-I-02` iOS Significant Location Changes (safety net)
- Подписка на SignificantLocationChanges параллельно с обычным трекингом
- Если приложение убито — система может разбудить нас при значимом перемещении
- При пробуждении: проверить, есть ли активная сессия, восстановить
- ⏱ M
- 🔗 P1-I-01

#### `P1-I-03` Android foreground service
- Через `expo-task-manager` (RN) или `flutter_background_service` (Flutter)
- Persistent notification: "Запись пробежки... 5:23 / 1.2 км"
- Notification обновляется раз в 10с
- ⏱ L
- 🔗 P1-C-01

#### `P1-I-04` Android battery optimization
- Документ для пользователя: "Как отключить battery optimization для нашего приложения"
- Скриншоты для Pixel, Samsung, Xiaomi, Huawei, Oppo
- При первом старте — рекомендация перейти в этот документ
- Программно: попытка request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (но не во всех OEM работает)
- ⏱ M
- 🔗 P1-I-03

#### `P1-I-05` Adaptive sampling rate
- Если 5 минут v < 0.3 м/с → переключиться на режим `BALANCED_POWER_ACCURACY` с интервалом 5с
- При движении → обратно на high accuracy
- Тест: батарея за час в режиме записи
- ⏱ M
- 🔗 P1-I-01, P1-I-03

#### `P1-I-06` UI индикатор background record
- Если приложение в фоне → когда возвращаемся, показать "Записано в фоне: X минут, Y точек"
- Если потеряны точки — предупреждение
- ⏱ S
- 🔗 P1-I-01, P1-I-03

### 3.11 P1-J — Lifecycle сессии

#### `P1-J-01` Session state machine
- States: Idle / Recording / Paused / Stopping / Saved / Discarded
- Transitions с валидацией (нельзя из Idle сразу в Saved)
- ⏱ M
- 🔗 P1-A-09, P1-C-01

#### `P1-J-02` Crash recovery — детекция
- При старте приложения: SELECT сессий где `ended_at IS NULL`
- Если найдена — переходим к recovery flow
- ⏱ S
- 🔗 P1-A-08

#### `P1-J-03` Recovery dialog
- Модалка: "Найдена незавершённая пробежка от 14:32. Продолжить или удалить?"
- Continue: восстановить state Kalman из последней точки + продолжить запись
- Discard: пометить session как `discarded`, оставить в БД
- ⏱ M
- 🔗 P1-J-02

#### `P1-J-04` Stop confirmation flow
- Stop → "Save with name?" / "Discard?"
- Save: модалка с автогенерированным именем "Утренняя пробежка 2026-05-05" + поле для редактирования + опциональное поле "заметка"
- ⏱ M
- 🔗 P1-J-01

#### `P1-J-05` Финальная статистика
- Экран после Save: красивый summary с большой картой и метриками
- Кнопки: "Поделиться" (заглушка пока), "Закрыть"
- ⏱ M
- 🔗 P1-J-04

#### `P1-J-06` GPX-экспорт
- Сериализация Track в GPX-формат
- Кнопка "Export GPX" в session details
- Сохранение в Files (iOS) / Downloads (Android)
- Валидация через external tool (gpsbabel) — отдельный manual тест
- ⏱ M
- 🔗 P1-J-05

### 3.12 P1-K — Offline tile pack

#### `P1-K-01` MapAdapter методы для offline
- В интерфейс:
  - `downloadOfflineRegion(region: OfflineRegion): Promise<DownloadHandle>`
  - `listOfflineRegions(): Promise<OfflineRegion[]>`
  - `deleteOfflineRegion(id: string): Promise<void>`
  - `getDownloadProgress(handle: DownloadHandle): Stream<Progress>`
- ⏱ M
- 🔗 P1-A-02

#### `P1-K-02` MapboxMapAdapter — реализация offline
- Через нативные API Mapbox (TileStore / OfflineRegion в зависимости от SDK версии)
- Параметры: bbox, zoom range (12-16 по умолчанию), styles
- ⏱ L
- 🔗 P1-K-01

#### `P1-K-03` Auto-download домашней зоны
- При первом успешном GPS fix:
  - Запомнить как home location (в Settings)
  - Автоматически скачать tile region 10×10 км вокруг
  - Прогресс-индикатор в UI (можно ненавязчивый)
- Раз в 30 дней — обновление
- ⏱ M
- 🔗 P1-K-02

#### `P1-K-04` Manual region download UI
- Settings → Offline Maps → "Add region"
- Карта с возможностью выделить bbox (drag rectangle)
- Estimated size перед загрузкой
- Список скачанных регионов с возможностью удаления
- ⏱ L
- 🔗 P1-K-02

#### `P1-K-05` Тест работы в авиарежиме
- Manual: записать пробежку с включённым авиарежимом в зоне offline pack
- Проверить: карта подгружается, трек рисуется, метрики работают
- ⏱ S
- 🔗 P1-K-03

### 3.13 P1-L — История пробежек

#### `P1-L-01` Экран списка пробежек
- Доступ из bottom navigation или drawer
- Список карточек: дата, дистанция, площадь, маленькая превью карты (статичное изображение или мини-MapView)
- Сортировка по дате (новые сверху)
- Pull-to-refresh
- ⏱ L
- 🔗 P1-A-08

#### `P1-L-02` All-time territory на главной карте
- При открытии MapScreen: загрузить **simplified geometry** всех закрытых сессий
- Объединить (union) полигоны через @turf/union или нативный JTS-аналог
- Отрисовать как `territory-history` слой (см. P1-D-06)
- Кешировать результат (recompute только если новая сессия добавилась)
- ⏱ L
- 🔗 P1-D-06, P1-A-08

#### `P1-L-03` Просмотр одной пробежки
- Тап по карточке → детальный экран
- Карта с треком и зоной
- Метрики: всё что есть
- График высот (если barometer)
- Темп по сегментам (км-сплиты)
- Кнопки: Export GPX, Delete
- ⏱ L
- 🔗 P1-L-01

#### `P1-L-04` Удаление пробежки
- Свайп на карточке → confirm → удаление из БД
- Recompute all-time territory
- ⏱ S
- 🔗 P1-L-01

#### `P1-L-05` Поиск/фильтр
- Опционально для Phase 1: фильтр по дате (день/неделя/месяц/год)
- Поиск по названию сессии
- ⏱ M (можно отложить)
- 🔗 P1-L-01

### 3.14 P1-M — Полевое тестирование Phase 1

#### `P1-M-01` Сценарии тестирования (документ)
- Расширить `tests/FIELD_PROTOCOL.md` сценариями для Phase 1:
  - Все T1–T10 из Phase 0
  - T11: пробежка 60 минут с замыканием
  - T12: пробежка 60 минут без замыкания (буферный коридор)
  - T13: 5 пробежек подряд за день — корректность истории
  - T14: переустановка приложения (offline pack должен предлагаться скачать заново)
  - T15: смена часового пояса (поездка) во время пробежки
- ⏱ M
- 🔗 P1-J-05

#### `P1-M-02` Эталонные пробежки
- Минимум 5 пробежек разной длины (1км, 5км, 10км, 21км, 30км+)
- Замкнутые и незамкнутые
- В разных условиях (день/вечер/ночь, ясно/дождь, город/парк/лес)
- Параллельная запись на Garmin/референсное приложение для сравнения метрик
- ⏱ XL (растянуто на 2 недели)
- 🔗 P1-J-05

#### `P1-M-03` Анализ результатов
- Spreadsheet с метриками: дистанция (наша vs Garmin), площадь (расчётная vs замеренная вручную)
- Графики отклонений
- ⏱ M
- 🔗 P1-M-02

#### `P1-M-04` Bugfixing итерация
- 1-2 недели на закрытие найденных багов
- ⏱ L
- 🔗 P1-M-03

### 3.15 Acceptance Phase 1

#### Phase 1 — Acceptance Status: 🟡 CODE-COMPLETE, FIELD-TESTS DEFERRED (2026-05-14)

Phase 1 acceptance criteria (ТЗ §3.15) verified through GSD plans 01-10 (`.planning/phases/01-validate-close-territory-core/`). Code-level shipped 2026-05-14 на ветке `feat/cursona-redesign`; field validation **deferred** — см. [ADR-0005](DECISIONS/0005-phase-1-field-test-outcomes.md).

| Criterion | Status | Evidence |
|-----------|--------|----------|
| 1. Все P1-A..P1-K реализованы и code-reviewed | ✅ shipped | P-ID counterparts ниже + GSD Plans 01-10 SUMMARYs |
| 2. Покрытие тестами: pipeline ≥80% / area ≥90% / core ≥50% | ✅ pipeline 93% / area 95%+ / core высокое (536/536 jest passing) | [`01-01-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-01-SUMMARY.md) (sessionRepository integration tests) + смежные |
| 3. Полевые тесты M-01..M-03 (дистанция ≤3%, площадь ≤5%, NFR-001/002) | ⏳ **DEFERRED** | [`tests/FIELD_PROTOCOL.md`](../tests/FIELD_PROTOCOL.md) Per-Device tables + [ADR-0005](DECISIONS/0005-phase-1-field-test-outcomes.md) |
| 4. Background reliability на 3 устройствах ≥95% (NFR-005) | ⏳ **DEFERRED** | T8 protocol готов; runtime test pending — см. ADR-0005 |
| 5. Расход батареи ≤10%/ч (NFR-003) | ⏳ **DEFERRED** | T6 protocol готов; runtime test pending — см. ADR-0005 |
| 6. Авиарежим с offline pack | ✅ code + manual picker | [`01-06-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-06-SUMMARY.md) (RegionPickerScreen + bounds-order bug fix) |
| 7. Crash recovery на iOS и Android | ✅ shipped | recoverLast + dialog + R7 functional-set race-fix |

**Per-P-ID code-level closure mapping (через GSD Phase 1 plans):**

- **P1-B** (MapScreen hook refactor) — ✅ closed via PHASE1-06 ([`01-02-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-02-SUMMARY.md))
- **P1-C** (SessionManager extraction) — ✅ closed via PHASE1-07 ([`01-01-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-01-SUMMARY.md)). Phase A (gradual cutover) done; Phase B (closure detection inside manager) deferred.
- **P1-D-04** (big-track simplification) — ✅ closed via PHASE1-05 ([`01-05-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-05-SUMMARY.md))
- **P1-G-09** (closure haptic + toast) — ✅ closed via PHASE1-08 ([`01-03-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-03-SUMMARY.md))
- **P1-I-02** (SignificantLocationChanges iOS) — ✅ closed via PHASE1-12 ([`01-07-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-07-SUMMARY.md)). Android SLC не реализован (expo-location API gap, D-30).
- **P1-I-05** (adaptive GPS sampling) — ✅ closed via PHASE1-11 ([`01-07-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-07-SUMMARY.md))
- **P1-J-05** (summary screen с большой картой) — ✅ closed via PHASE1-09 ([`01-04-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-04-SUMMARY.md))
- **P1-K-04** (manual offline region UI) — ✅ closed via PHASE1-10 ([`01-06-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-06-SUMMARY.md))
- **Security cross-cutting (Mapbox token rotation + ESLint guard)** — 🟡 partial: code-side closed via PHASE1-13 Tasks 1-3 (commits `79b5aa0`, `a7da532`); Task 4 (Mapbox dashboard rotation, owner-driven) ⏳ deferred — см. [`01-08-SUMMARY.md`](../.planning/phases/01-validate-close-territory-core/01-08-SUMMARY.md) §CHECKPOINT REQUIRED.
- **P1-M (field testing T1-T15)** — ⏳ **DEFERRED**. Protocol scaffold готов в [`tests/FIELD_PROTOCOL.md`](../tests/FIELD_PROTOCOL.md) (PHASE1-01..04 / Plan 09 Task 1, commit `c1af7c7`); per-device runs pending. См. [ADR-0005](DECISIONS/0005-phase-1-field-test-outcomes.md) §«Список user actions».

**Accepted limitations и full deferred-state context:** [ADR-0005](DECISIONS/0005-phase-1-field-test-outcomes.md) — deferred-aware closure ADR с explicit checklist для разблокирования formal closure.

**Status note (2026-05-14):** Phase 1 НЕ formally closed. Phase 2 (Real Health Integrations) может стартовать на code-level, но production release Phase 2 features должен дождаться formal closure Phase 1 (см. ADR-0005 Consequences).

**На точке formal closure Phase 1 у нас есть полностью функциональное приложение, которое можно показывать тестовым пользователям и собирать обратную связь.**

---

## 4. Phase 2 — Account & Cloud Sync

🎯 **Цель:** регистрация пользователя, бэкап данных в облако, синхронизация между устройствами.

📦 **Скоуп:**
- Регистрация / login (email + Apple/Google)
- Минимальный бэкенд: Identity service + Activity Sync service
- Двусторонняя синхронизация: точки и сессии
- Conflict resolution (LWW для метаданных, append-only для точек)
- Offline-first: запись локально → sync когда есть сеть

📦 **НЕ входит:** полноценная экосистема микросервисов (Phase 3), социальные функции, тренировки.

⏱ **Длительность:** 3–4 недели

### 4.1 Бэкенд минимальный

| Задача | Описание | ⏱ |
|---|---|---|
| `P2-A-01` | Бутстрап монорепо backend, Go workspaces | M |
| `P2-A-02` | Identity service (Go): регистрация/login email, JWT, refresh tokens | L |
| `P2-A-03` | Sign in with Apple, Google OAuth | M |
| `P2-A-04` | Activity Sync service (Go): CRUD сессий и точек | L |
| `P2-A-05` | PostgreSQL schema + миграции (sqlc / atlas) | M |
| `P2-A-06` | TimescaleDB для points hypertable | M |
| `P2-A-07` | Docker compose для локальной разработки | M |
| `P2-A-08` | API Gateway (минимальный — NGINX или caddy + JWT validate) | M |
| `P2-A-09` | Деплой на staging (single VPS / Hetzner / Render) | M |
| `P2-A-10` | OpenAPI спецификация | M |

### 4.2 Клиент: auth и sync

| Задача | Описание | ⏱ |
|---|---|---|
| `P2-B-01` | UI auth: login, register, forgot password | L |
| `P2-B-02` | Хранение JWT/refresh в keychain / encrypted storage | M |
| `P2-B-03` | API client (auto-refresh tokens) | M |
| `P2-B-04` | Sync engine: outbox pattern для исходящих | L |
| `P2-B-05` | Миграция guest → registered (после регистрации синкаем все локальные пробежки) | M |
| `P2-B-06` | Watermark для входящих (с какого момента pull) | M |
| `P2-B-07` | Conflict resolution rules | M |
| `P2-B-08` | UI sync status (последняя синхронизация, кол-во unsynced) | S |
| `P2-B-09` | Тест: запись офлайн → онлайн → синхронизация | M |
| `P2-B-10` | Тест: 2 устройства одного юзера → пробежка с одного → видна на другом | M |

### 4.3 Acceptance Phase 2

- Зарегистрироваться → залогиниться на втором устройстве → видеть свою историю
- Записать пробежку офлайн → подключиться к сети → пробежка появилась в облаке
- Удалить и переустановить приложение → войти → история восстановилась

---

## 5. Phase 3 — Production Backend

🎯 **Цель:** разбить минимальный бэкенд из Phase 2 на полноценную микросервисную архитектуру с production-стандартами.

📦 **Скоуп:** все 16 сервисов из ТЗ §5.1, observability, CI/CD, K8s, IaC. Не наполняем сервисы фичами — только структура и базовые контракты.

⏱ **Длительность:** 4–5 недель

### 5.1 Инфраструктура

| Задача | Описание | ⏱ |
|---|---|---|
| `P3-A-01` | Terraform для AWS / Hetzner Cloud (выбрать провайдера) | L |
| `P3-A-02` | EKS / managed K8s кластер | M |
| `P3-A-03` | RDS PostgreSQL + TimescaleDB | M |
| `P3-A-04` | ClickHouse cluster | M |
| `P3-A-05` | Redis (managed или self-hosted) | S |
| `P3-A-06` | S3 / MinIO для блобов | S |
| `P3-A-07` | NATS JetStream для события | M |
| `P3-A-08` | Helm charts для всех сервисов | L |
| `P3-A-09` | ArgoCD / Flux для GitOps деплоя | M |
| `P3-A-10` | Secrets management (external-secrets-operator + AWS SM) | M |

### 5.2 Observability

| Задача | Описание | ⏱ |
|---|---|---|
| `P3-B-01` | Prometheus + Grafana | M |
| `P3-B-02` | Loki для логов | M |
| `P3-B-03` | Tempo / Jaeger для трейсов | M |
| `P3-B-04` | Дашборды для каждого сервиса | M |
| `P3-B-05` | Alerting (PagerDuty / Opsgenie / простой email) | S |
| `P3-B-06` | Sentry для клиентских ошибок | S |

### 5.3 Сервисы — выделение из монолита Phase 2

| Задача | Описание | ⏱ |
|---|---|---|
| `P3-C-01` | API Gateway service (Go, full implementation) | L |
| `P3-C-02` | Identity service — production-ready (rate limiting, audit log) | M |
| `P3-C-03` | Activity Ingest — отделить от Sync | M |
| `P3-C-04` | Activity Processing — горячий путь на C++/Rust для больших треков | XL |
| `P3-C-05` | Track Storage service (TimescaleDB-фасад) | M |
| `P3-C-06` | Notification service (FCM + APNs) | M |
| `P3-C-07` | Media service (S3 wrapper) — для будущих фото активностей | M |
| `P3-C-08` | gRPC контракты между сервисами | L |
| `P3-C-09` | Тесты: полный flow через gateway работает на k8s staging | L |

### 5.4 CI/CD

| Задача | Описание | ⏱ |
|---|---|---|
| `P3-D-01` | GitHub Actions workflows: build, test, push images | M |
| `P3-D-02` | Release process: tag → build → deploy staging → manual promote prod | M |
| `P3-D-03` | E2E тесты на staging (Playwright или интеграционные) | L |
| `P3-D-04` | Mobile CI: EAS Build / Codemagic для iOS+Android | M |

### 5.5 Acceptance Phase 3

- Все 16 сервисов задеплоены на K8s
- Метрики, логи, трейсы видны в Grafana
- Релиз → автоматическая выкатка staging → ручное подтверждение прод
- Latency P50 API < 100мс, P99 < 500мс
- Зеленый CI на PR обязателен для мержа

---

## 6. Phase 4 — Profile & Stats

🎯 **Цель:** профиль атлета с физическими параметрами, агрегированная статистика, цели.

⏱ **Длительность:** 2–3 недели

### Задачи

| Задача | Описание | ⏱ |
|---|---|---|
| `P4-A-01` | Athlete profile: вес, рост, пол, дата рождения, restingHR, maxHR | M |
| `P4-A-02` | Расчёт зон по умолчанию (HR zones по %HRmax, pace zones) | M |
| `P4-A-03` | Settings: единицы измерения (км/мили), темп vs скорость, неделя начинается с... | M |
| `P4-A-04` | Stats screen: сводка за неделю / месяц / год | L |
| `P4-A-05` | Графики: дистанция по неделям, темп по неделям | M |
| `P4-A-06` | Цели (goals): месячная дистанция, кол-во тренировок | M |
| `P4-A-07` | Achievement / streaks (бегаешь N дней подряд) | M |
| `P4-A-08` | Backend: Stats service (Go), агрегация в ClickHouse | L |

---

## 7. Phase 5 — Sensors & HRM

🎯 **Цель:** подключение пульсометра по BLE, отображение пульса live, расчёт зон.

⏱ **Длительность:** 3–4 недели

### Задачи

| Задача | Описание | ⏱ |
|---|---|---|
| `P5-A-01` | BLE adapter (нативный модуль RN или Flutter package) | L |
| `P5-A-02` | Сканирование и подключение к HRM (стандарт GATT 0x180D) | M |
| `P5-A-03` | Парсинг heart rate measurement characteristic | S |
| `P5-A-04` | SensorReading time-series: схема и хранение | M |
| `P5-A-05` | Live HR на UI во время записи | M |
| `P5-A-06` | Привязка HR-семплов к Point по timestamp | M |
| `P5-A-07` | HR zones расчёт (5 зон по умолчанию) | M |
| `P5-A-08` | UI: цветной градиент трека по HR-зонам | M |
| `P5-A-09` | Stride sensor (foot pod) — каденс | M |
| `P5-A-10` | Backend: расширение Track Storage для sensor streams | M |

---

## 8. Phase 6 — Training Engine

🎯 **Цель:** структурированные тренировки, training load (TSS/CTL/ATL/TSB), race predictor.

⏱ **Длительность:** 5–6 недель

### Задачи (краткий список, детально расписать ближе к старту)

| Задача | Описание | ⏱ |
|---|---|---|
| `P6-A-01` | Training Engine service (Go + Python для моделей) | L |
| `P6-A-02` | TSS / rTSS расчёт | M |
| `P6-A-03` | CTL / ATL / TSB модель Banister | M |
| `P6-A-04` | Performance Management Chart UI | L |
| `P6-A-05` | LTHR estimation из последних данных | M |
| `P6-A-06` | VO2max estimation | M |
| `P6-A-07` | Race predictor (Riegel, Cameron) | M |
| `P6-A-08` | Workout structure (warmup/intervals/recovery/cooldown) | L |
| `P6-A-09` | Workout player с голосовыми командами | XL |
| `P6-A-10` | Workout library | L |

---

## 9. Phase 7 — Watch & Apple Health

🎯 **Цель:** интеграции с Apple HealthKit, Health Connect (Android), Strava, Garmin Connect.

⏱ **Длительность:** 4–5 недель

| Задача | Описание | ⏱ |
|---|---|---|
| `P7-A-01` | HealthKit READ: импорт workouts | L |
| `P7-A-02` | HealthKit WRITE: наши тренировки в Apple Health | M |
| `P7-A-03` | Health Connect (Android) — аналогично | L |
| `P7-A-04` | Strava OAuth + bidirectional sync | XL |
| `P7-A-05` | Garmin Connect ingest (OAuth + webhooks) | XL |
| `P7-A-06` | FIT-парсер на бэкенде | L |
| `P7-A-07` | Sensor Sync service на бэкенде | L |

---

## 10. Phase 8 — Social

| Задача | Описание | ⏱ |
|---|---|---|
| `P8-A-01` | Feed service | L |
| `P8-A-02` | Лента активностей | M |
| `P8-A-03` | Лайки и комменты | M |
| `P8-A-04` | Подписки на пользователей | M |
| `P8-A-05` | Клубы | L |
| `P8-A-06` | Сегменты (определённый участок) | XL |
| `P8-A-07` | Лидерборды по сегментам | L |
| `P8-A-08` | "Захват территории" гейм-механика (zone wars) | XL |

⏱ **Длительность:** 4–5 недель

---

## 11. Phase 9 — Coaching & Plans

| Задача | Описание | ⏱ |
|---|---|---|
| `P9-A-01` | Coach role в Identity | M |
| `P9-A-02` | Coach ↔ Athlete связь, шаринг данных | L |
| `P9-A-03` | Training plan создание (drag&drop конструктор) | XL |
| `P9-A-04` | Plan execution: применение плана в календаре атлета | L |
| `P9-A-05` | Coach view: дашборд по своим атлетам | L |
| `P9-A-06` | Комменты и фидбек на конкретные тренировки | M |

⏱ **Длительность:** 5–6 недель

---

## 12. Phase 10 — Premium & Marketplace

| Задача | Описание | ⏱ |
|---|---|---|
| `P10-A-01` | Stripe / RevenueCat интеграция | L |
| `P10-A-02` | Тарифы: Free / Pro / Coach | M |
| `P10-A-03` | Feature gating | M |
| `P10-A-04` | Маркетплейс планов | XL |
| `P10-A-05` | Receipt validation | M |

⏱ **Длительность:** 3–4 недели

---

## 13. Cross-cutting concerns

Эти темы не привязаны к конкретной фазе — работа над ними идёт параллельно в каждой фазе.

### 13.1 Безопасность

- TLS везде (Let's Encrypt / cert-manager)
- Secrets only via vault, никогда в репо
- Аудит зависимостей (Dependabot, Snyk)
- Penetration test перед публичным релизом
- Bug bounty программа после публичного релиза
- GDPR compliance: consent flow, data export, right to be forgotten

### 13.2 Privacy

- Privacy zones — пользователь может скрыть участки трека рядом с домом / работой (как в Strava)
- Контроль видимости: private / followers / public для каждой пробежки
- Не передавать персональные данные третьим сторонам без consent
- Локальная обработка где возможно

### 13.3 Performance

- Mobile: LCP < 2с, FPS карты ≥50
- Backend: P99 API latency < 500мс
- Тесты на регрессию производительности в CI

### 13.4 Tests

- Unit ≥80% в pipeline, ≥90% в area calc, ≥60% в общем
- Integration tests для каждого сервиса
- E2E тесты для критичных flow (regsiter → record → save → see in history)
- Manual field testing перед каждым релизом

### 13.5 Документация

- API docs — OpenAPI, авто-генерация
- Internal docs — README в каждом сервисе/модуле
- User-facing — справка в приложении, FAQ
- Decision records (ADR) для значимых решений

### 13.6 Локализация

- С Phase 1 — на русском только (домашний рынок)
- Phase 2 — добавление i18n инфраструктуры (i18next / Flutter intl), wrap всех строк
- Phase 6+ — английский
- Дальше — по запросу рынка (немецкий, испанский, итальянский)

---

## 14. Метрики успеха проекта

### 14.1 Phase 1 success metrics
- 2 разработчика записывают свои пробежки нашим приложением вместо Strava — каждый день
- Площадь территории совпадает с фактической ±5%
- Дистанция совпадает с Garmin ±3%
- Crash-free sessions ≥99%

### 14.2 Public launch (после Phase 4)
- 1000 регистраций в первый месяц
- D7 retention ≥30%
- Среднее количество пробежек на активного пользователя в неделю ≥2

### 14.3 Серьёзный продукт (после Phase 6+)
- 10k MAU
- Платных подписок ≥5%
- NPS ≥40
- Coach использование (после Phase 9) — минимум 50 коучей

---

## 15. Риски проекта

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| Background tracking не работает на 30% Android-устройств (OEM killers) | Высокая | Критическое | Тесты на 5+ устройствах в Phase 0; гайды для пользователей; в worst case — рекомендация iOS |
| Mapbox cost вырастает с ростом юзеров | Средняя | Высокое | MapAdapter абстракция → миграция на MapLibre при необходимости; enterprise deal с Mapbox при 50k+ MAU |
| Конкуренты (Strava и др.) убьют дифференциатор | Средняя | Среднее | Фокус на territory game-механике, которая в Strava отсутствует |
| Один из 2 разработчиков уходит | Низкая | Высокое | Documentation discipline; не привязываться к экзотическому стеку |
| GDPR/regulatory issues | Низкая | Высокое | Privacy by design с дня 1; консультация с юристом перед публичным запуском |
| Накопленный технический долг тормозит после Phase 6 | Высокая | Высокое | Refactor sprints раз в 3 месяца; жёсткий PR review |
| iOS background reliability падает после iOS update | Средняя | Высокое | Public beta tester'ы для iOS beta; быстрый bugfix process |

---

## 16. Глоссарий ID-задач

ID формат: `P<phase>-<section>-<number>`. Примеры:
- `P0-B-01` — Phase 0, секция B (RN-прототип), задача 01
- `P1-G-04` — Phase 1, секция G (Closure & polygon), задача 04
- `P3-A-02` — Phase 3, секция A (Infrastructure), задача 02

При работе с Claude Code: можно сказать "выполни задачу P1-E-05" — модель найдёт её в этом документе и реализует. Это удобнее, чем копировать текст задачи.

---

## Изменения

- v1.0 — первая версия плана. Phase 1 (Territory Core) расписана детально с 80+ задачами; остальные фазы — высокоуровневая разбивка
