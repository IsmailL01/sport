# Running Ecosystem — Техническое задание

**Статус:** v0.1 — рабочий черновик
**Авторы:** продуктовая команда (2 разработчика)
**Целевой читатель:** разработчики, в т.ч. AI-агенты (Claude Code)
**Принцип документа:** каждая фаза самодостаточна, можно начинать строить, не дочитав до конца

---

## 0. Как читать этот документ

Документ описывает экосистему приложения для **полупрофессиональных бегунов**, но фокус v0.1 — на **Phase 0 (прототип для выбора фреймворка)**. Главы 3–10 задают рамку, чтобы решения, принятые в Phase 0, не привели в тупик через полгода.

Если ты Claude Code — начинай с раздела **§2** (Phase 0). Всё остальное — контекст и обязательства на будущее, которые надо учитывать в архитектуре прототипа, но не реализовывать в нём.

---

## 1. Видение продукта

Экосистема для полупрофессиональных бегунов: трекинг, тренировки, аналитика, интеграции с часами, тренер↔атлет, социальное. Конкуренты в нише — Strava, Garmin Connect, TrainingPeaks, Runalyze, Coros Training Hub. Дифференциаторы (предположительно — уточнить с заказчиком):

- **Открытость данных** — публичный API c дня 1, экспорт всего и всегда
- **Глубокая аналитика** уровня TrainingPeaks при UX уровня Strava
- **Игровая визуализация "зон" пробежки** — фишка, заявленная в исходном брифе

Ключевые ограничения, которые формируют архитектуру:
- Работа в офлайне обязательна (бегаем там, где нет связи)
- Точность данных критична — это полупрофи, они сравнивают с Garmin
- Часы — равноправный источник данных, не телефон
- Данные о здоровье → требования GDPR/HIPAA на старте

---

## 2. Phase 0 — Прототип для выбора фреймворка [ТЕКУЩАЯ ФАЗА]

### 2.1 Цель

Реализовать **одну и ту же функцию** на Expo React Native и на Flutter, прогнать одинаковые тесты в реальных условиях, выбрать фреймворк по измеримым метрикам, а не ощущениям.

**Срок:** 1–2 недели на каждый прототип, параллельно. Если есть ресурс — делать одновременно по одному человеку на фреймворк.

### 2.2 Скоуп прототипа

**Внутри:**
- Кнопка Start/Stop трекинга
- Запись GPS точек (1 Гц, адаптивно)
- Сглаживание (Kalman или EMA — обязательно одинаковое в обоих прототипах, чтобы сравнение было честным)
- Live-полилиния маршрута на карте
- Детект замыкания трека → закрашенный полигон + площадь в м²
- Если незамкнут — буферизированный коридор (маршрут "с шириной" 5м)
- Live-статистика: дистанция, время, текущая скорость, средний темп, площадь
- Авто-пауза при остановке
- Фоновая работа (экран выключен, телефон в кармане)
- Восстановление после force-kill приложения
- Локальное сохранение трека (SQLite)
- Экспорт GPX (для верификации сторонними инструментами)
- Сбор телеметрии прототипа: батарея, FPS карты, рост памяти, потери GPS

**Вне скоупа Phase 0:**
- Аутентификация
- Бэкенд (только локально + опциональный dummy POST в файл/консоль)
- Часы и BLE-датчики
- История пробежек (только текущая сессия)
- Социальные функции
- Темы оформления, сложный UI
- Тренировочные планы

### 2.3 Функциональные требования (FR)

| ID | Требование | Приёмка |
|---|---|---|
| FR-001 | Запросить разрешения на геолокацию (foreground + background) | Корректные диалоги iOS/Android, обработка отказа |
| FR-002 | Старт записи трека по кнопке | Точки появляются в БД и на карте через ≤2с |
| FR-003 | Сэмплинг GPS 1 Гц при движении, ↓ при остановке | Логируется фактическая частота |
| FR-004 | Фильтрация точек с accuracy > 20м | Точка отбрасывается, лог "discarded by accuracy" |
| FR-005 | Фильтрация скачков (>30м между точками при <5с интервале) | Точка отбрасывается, лог "discarded as outlier" |
| FR-006 | Сглаживание Kalman | См. §7.2 для параметров |
| FR-007 | Расчёт дистанции по гаверсинусу с накоплением | Ошибка ≤3% на эталонной 5км петле |
| FR-008 | Расчёт текущей скорости (скользящее окно 10с) | Логически адекватно, без скачков на >5 м/с |
| FR-009 | Расчёт темпа (мин/км) — обратная скорости | Скрыт при v < 0.5 м/с (будет ∞) |
| FR-010 | Авто-пауза при v<0.5 м/с в течение 5с | Иконка паузы, время не идёт |
| FR-011 | Авто-возобновление при v>1.5 м/с в течение 2с | Лог "auto-resumed" |
| FR-012 | Детект замыкания: dist(start, end) < 20м И длина трека > 200м | Лог + UI-индикатор |
| FR-013 | Расчёт площади при замыкании (см. §7.7) | Ошибка ≤5% на эталонной фигуре |
| FR-014 | Буферизированный коридор для незамкнутых треков (ширина 5м) | Видимая закрашенная полоса вокруг полилинии |
| FR-015 | Карта с тёмной/светлой подложкой, центрирование на пользователе | Mapbox или Google Maps — на выбор |
| FR-016 | Сохранение каждых 10 точек или каждых 30с в SQLite | Force-kill не теряет более 30с трека |
| FR-017 | При запуске приложения: предложить восстановить незавершённую сессию | Диалог "Continue / Discard" |
| FR-018 | Экспорт текущего трека в GPX | Файл валидируется внешним парсером (gpsbabel, online validator) |
| FR-019 | Stop трека: финальный пересчёт всех метрик, сохранение | Атомарное завершение сессии |
| FR-020 | Сбор телеметрии прототипа в файл | См. §2.5 — что измеряем |
| FR-021 | Использовать Mapbox с кастомным стилем (Mapbox Studio) | Стиль скачан из Studio, в коде указан только URL |
| FR-022 | Полилиния трека рисуется через LineLayer + GeoJsonSource (НЕ через PolylineAnnotation) | Проверка: 5000+ точек без падения FPS |
| FR-023 | Полигон зоны рисуется через FillLayer + GeoJsonSource | Аналогично |
| FR-024 | Live-обновление трека через update GeoJSON source, а не пересоздание | Замер в T7 |
| FR-025 | Базовый offline tile pack для домашней зоны 10км вокруг пользователя | Скачивание по кнопке, проверка работы в авиарежиме |
| FR-026 | MapAdapter абстракция (см. §3 принцип 10) | Все вызовы к Mapbox идут через интерфейс MapAdapter, замена на MapLibre — изменения только в одном файле |

### 2.4 Нефункциональные требования (NFR)

| ID | Метрика | Целевое значение |
|---|---|---|
| NFR-001 | Ошибка дистанции на эталонной 5км петле | ≤ 3% |
| NFR-002 | Ошибка площади на футбольном поле (~7140 м²) | ≤ 5% |
| NFR-003 | Расход батареи в режиме записи, экран выключен | ≤ 10% / час |
| NFR-004 | Стабильность 2-часовой сессии | Без падений, без потери данных |
| NFR-005 | Background reliability (iOS + Android Pixel + Android Xiaomi/Samsung) | Запись продолжается ≥30 мин в фоне |
| NFR-006 | Map FPS при панорамировании во время записи | ≥ 50 fps на тесте 1000+ точек |
| NFR-007 | Рост памяти за 2-часовую сессию | ≤ 100 MB |
| NFR-008 | Время холодного старта приложения | ≤ 2с |
| NFR-009 | Размер APK / IPA | Не критично на прототипе, но логировать |

### 2.5 Тестовый протокол (одинаковый для обоих прототипов)

Тесты выполняются с одного и того же телефона в один день для каждого фреймворка, чтобы условия GPS совпадали. Минимум — два устройства: один iOS (iPhone 12+), один Android (Pixel 6+ ИЛИ китайский флагман с агрессивным управлением фоном).

**T1. Эталонная петля 5 км.**
Замерить заранее по Garmin/Strava сегменту с известной длиной. Пробежать/пройти 5 кругов. Метрики: дистанция, отклонение по итогу, отклонение покруговое.

**T2. Эталонная площадь.**
Обойти периметр прямоугольной фигуры известной площади (футбольное поле, баскетбольная площадка, парковая зона по спутнику). Метрика: расчётная площадь vs реальная.

**T3. Городской каньон.**
30 минут движения в плотной застройке (узкие улицы, высокие здания). Метрика: количество отброшенных точек, явные артефакты на маршруте.

**T4. Потеря сигнала.**
Пройти участок без GPS (тоннель, метро, подземный переход 100м+). Метрика: корректность обработки разрыва, нет ли "склейки через здания".

**T5. Force-kill.**
В середине 30-минутной записи убить приложение. Перезапустить. Метрика: предложено ли восстановление, сколько данных потеряно.

**T6. Длинная сессия.**
Непрерывная запись 2 часа с прогулкой/пробежкой. Метрика: батарея, память, стабильность, число пропущенных секунд.

**T7. Map performance.**
К 90-й минуте теста T6 попробовать активно панорамировать карту, зумить, показывать весь трек. Метрика: FPS (через onJsFrameDrop / Flutter performance overlay).

**T8. Background.**
Включить запись, заблокировать телефон, положить в карман, ходить 30 минут, не открывать. Метрика: записаны ли все 30 минут.

**T9. Точность площади на замкнутом маршруте.**
Намеренно сделать замкнутую петлю по контуру известной фигуры (см. T2), но **в режиме движения** (не статический обход). Метрика: ошибка площади.

**T10. Self-intersecting track.**
Намеренно нарисовать ногами "восьмёрку". Метрика: что покажет как площадь, не падает ли.

**Все запуски:**
- Логируются с timestamp в файл `/<framework>/<test>/<run>/log.json`
- GPX-экспорт для каждого
- Скриншоты карты в начале и в конце
- Фотография телефона до/после с состоянием батареи

### 2.6 Критерии выбора (decision matrix)

| Критерий | Вес | Как измеряем |
|---|---|---|
| Background reliability | 25% | T8 на трёх устройствах |
| Точность дистанции и площади | 20% | T1, T2, T9 |
| Расход батареи | 15% | T6 |
| Map performance | 10% | T7 |
| Стабильность (нет падений) | 10% | Все тесты |
| Скорость разработки прототипа | 10% | Часы на реализацию |
| Зрелость и совместимость с будущими интеграциями (BLE, нативные модули) | 5% | Проверить наличие пакетов: HealthKit/HealthConnect, BLE, FIT-парсер |
| Размер бандла и старт | 5% | NFR-008, NFR-009 |

Победитель определяется арифметически по сумме (метрика × вес). Если разница < 10% — выбираем по скорости разработки + субъективному опыту команды. Решение фиксируется письменно в `DECISION.md` с цифрами.

### 2.7 Спецификация Expo React Native прототипа

**Стек (версии — последние стабильные на момент старта, проверить во время старта):**
- Expo SDK (последний)
- EAS Build — обязательно, **не** Expo Go (фон не работает в Go)
- expo-location (foreground + background updates)
- expo-task-manager (background tasks)
- expo-sqlite (или op-sqlite — быстрее, проверить)
- @rnmapbox/maps (community-поддерживаемый, не официальный — учитываем в decision matrix как риск)
- react-native-mmkv (быстрая запись метрик телеметрии)
- zustand (state, минимум абстракций для прототипа)
- @turf/turf (геометрия: площадь, упрощение, буфер полилинии)
- react-native-reanimated (если нужны анимации)

**Конфигурация iOS** (`app.json`):
```json
{
  "ios": {
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "Нужно для трекинга пробежки",
      "NSLocationAlwaysAndWhenInUseUsageDescription": "Нужно для трекинга пробежки в фоне",
      "UIBackgroundModes": ["location", "fetch", "processing"]
    }
  }
}
```

**Конфигурация Android:**
```json
{
  "android": {
    "permissions": [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "WAKE_LOCK"
    ]
  }
}
```

**Известные риски RN:**
- expo-location в фоне на Android требует foreground service с persistent notification — нужно убедиться, что выживает при killer-приложениях OEM (особенно Xiaomi/Huawei)
- @rnmapbox/maps — community-проект, не от Mapbox. Релизы могут отставать от нативных SDK Mapbox. Проверить срок последнего релиза, наличие открытых критичных issues
- На больших полилиниях (5000+ точек) нужна правильная стратегия: только LineLayer + GeoJsonSource, обновлять источник через `setShape`/`updateSourceLayer`, а не пересоздавать
- JS-thread может пропускать update'ы в моменты GC — fallback на native module для критичных секций

### 2.8 Спецификация Flutter прототипа

**Стек:**
- Flutter (последний стабильный)
- geolocator (foreground) + flutter_background_service (foreground service Android, background mode iOS)
- ИЛИ background_locator_2 (более продвинутый, но менее активно поддерживается — проверить состояние)
- mapbox_maps_flutter (**официальный SDK от Mapbox**, текущая версия v11.x — плюс в копилку Flutter в нашем сравнении)
- sqflite (или drift для типизации — drift лучше, но избыточен для прототипа)
- riverpod (state)
- turf_dart (геометрия) или собственная реализация (в Dart shoelace на 20 строк пишется)
- battery_plus (телеметрия)

**Конфигурация iOS** (`Info.plist`):
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Нужно для трекинга пробежки</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Нужно для трекинга пробежки в фоне</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>fetch</string>
  <string>processing</string>
</array>
```

**Конфигурация Android** (`AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>

<service
    android:name="..."
    android:foregroundServiceType="location"
    android:exported="false"/>
```

**Известные риски Flutter:**
- mapbox_maps_flutter рендерится через PlatformView с нативным Metal (iOS) / OpenGL/Vulkan (Android) — на Android Hybrid Composition не всегда плавный, возможен AndroidView visibility lag
- В iOS background_locator_2 имеет ограничения по частоте при killed-state
- mapbox_maps_flutter требует CocoaPods netrc-конфигурации для приватного репозитория Mapbox на iOS — без этого build падает (известная "ловушка для новичков")
- Любое решение для постоянного foreground service на Android требует ручного тюнинга под OEM

### 2.9 Архитектура прототипа (одинаковая для обоих фреймворков)

```
┌──────────────────────────────────────────────────────────┐
│  UI Layer (Map + Stats + Controls)                       │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  State (zustand / riverpod)                              │
│  ActivityState, StatsState                               │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  Domain                                                  │
│  Track, Point, Stats, Pipeline                           │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  Pipeline                                                │
│  AccuracyFilter → Kalman → JumpFilter → Resampler →     │
│  TrackBuilder → MetricsCalculator → ClosureDetector →   │
│  AreaCalculator                                          │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  Adapters                                                │
│  LocationAdapter, StorageAdapter, TelemetrySink         │
└──────────────────────────────────────────────────────────┘
```

**Ключевая инвариантность:** доменная модель и pipeline должны быть идентичны на обоих фреймворках. Адаптеры — разные. Это нужно, чтобы при переходе с прототипа на полную версию сохранить ядро.

### 2.10 Acceptance criteria Phase 0

Прототип считается готовым к замерам, когда:
1. Все FR-001…FR-020 реализованы
2. Тестовый протокол T1…T10 успешно проходит хотя бы по одному разу на iOS и одному Android
3. Экспортируемый GPX валидируется внешним парсером
4. Площадь футбольного поля считается с ошибкой ≤5%
5. Логи телеметрии собираются для каждого теста

После этого — **5 рабочих дней замеров в реальных условиях**, потом DECISION.md.

---

## 3. Принципы архитектуры экосистемы (применять с дня 1)

Эти принципы влияют на прототип. Не реализуем в Phase 0, но **не нарушаем**:

1. **Domain-driven** — доменная модель чистая, без зависимостей от UI и БД
2. **Offline-first** — клиент работает без сети, sync позже через outbox-паттерн
3. **Sensor-agnostic** — GPS это один из источников данных, не "тот самый". Уже в прототипе LocationAdapter изолирован, чтобы потом подключить часы
4. **Time-series как first-class** — точки и сенсорные потоки это отдельная сущность с собственной схемой, не поля у Activity
5. **Явные контракты между компонентами** — protobuf для inter-service, типизированные DTO между слоями клиента
6. **Event-driven для асинхронной логики** — расчёт TSS, нотификации, агрегации — через события, не через цепочки вызовов
7. **Observability с дня 1** — логи структурированные (JSON), метрики, трейсы. На прототипе — хотя бы JSON-логи в файл
8. **Multi-tenant с дня 1** — даже если сейчас один пользователь, в схеме есть user_id и tenant_id
9. **Открытое API** — то что доступно нашему мобильному клиенту, должно быть доступно стороннему через тот же gateway
10. **MapAdapter абстракция** — никакой код домена, pipeline или бизнес-логики не импортирует Mapbox SDK напрямую. Всё взаимодействие с картой через `MapAdapter` интерфейс. На прототипе это 50 строк кода; через 2 года при необходимости миграции на MapLibre / самостоятельный тайл-сервер это сэкономит полугодовой рефакторинг. См. §10 для деталей

---

## 4. Архитектура мобильного приложения (после выбора фреймворка)

### 4.1 Слои

**Presentation** — экраны, компоненты, навигация. Тонкий слой, без бизнес-логики.

**State** — stores: ActivityStore, AuthStore, SettingsStore, SyncStore, SensorsStore. Один store — одна ответственность.

**Domain** — entities + use cases. Не зависит ни от чего ниже.

**Data** — репозитории, реализующие интерфейсы домена. Объединяют локальную БД и сетевые клиенты.

**Sensor layer** — LocationAdapter, BLEAdapter, HealthKitAdapter, HealthConnectAdapter. Платформо-специфичные модули.

**Sync layer** — outbox для исходящих, watermark для входящих. Конфликт-резолюция: LWW для метаданных активности, append-only для точек и сенсорных потоков.

### 4.2 Доменная модель (ключевые сущности)

```
User
  id, email, displayName, locale, timezone, createdAt

Athlete (расширяет User для бегуна)
  userId, weight, height, sex, birthDate,
  restingHR, maxHR, LTHR, FTP_run,
  zones: HRZone[], paceZones: PaceZone[]

Activity
  id, athleteId, startTime, endTime, duration,
  type (run/walk/treadmill/...), source (phone/garmin/strava),
  distance, avgPace, avgSpeed, calories,
  isClosed, area, areaCalculationMethod,
  weather, mood, notes,
  laps: Lap[]

Track (геометрия активности)
  activityId
  points: Point[]  -- хранится в TimescaleDB как time-series
  simplified: Point[]  -- для отрисовки

Point
  trackId, timestamp,
  latitude, longitude, altitude,
  accuracy, hAccuracy, vAccuracy,
  speed, heading,
  source (raw/kalman/interpolated)

Lap
  activityId, index, startTime, endTime,
  distance, avgPace, avgHR, type (auto/manual)

SensorReading (отдельный time-series)
  activityId, timestamp,
  type (hr/cadence/power/temperature/...),
  value, source (phone/wearable/external)

Workout (структурированная тренировка — V2)
  id, name, description,
  steps: WorkoutStep[]

WorkoutStep
  type (warmup/interval/recovery/cooldown),
  durationType (time/distance), durationValue,
  targetType (pace/hr/power), targetMin, targetMax

TrainingPlan (V2)
  id, athleteId, coachId,
  startDate, endDate, weeks: PlanWeek[]

Zone (HR/Pace/Power)
  athleteId, sport, type, index, lowerBound, upperBound, color
```

### 4.3 GPS pipeline (детально)

```
RawLocation
   ↓
[1] AccuracyFilter           — accuracy > 20м → drop
   ↓
[2] AltitudeReplacer         — если есть барометр, заменить altitude
   ↓
[3] KalmanFilter             — состояние [lat, lon, vlat, vlon]
   ↓
[4] JumpFilter               — dist > 30м при Δt < 5с → drop
   ↓
[5] MinSegmentFilter         — dist < 2м → не добавлять, накапливать
   ↓
[6] PauseDetector            — гистерезис v<0.5 5с / v>1.5 2с
   ↓
[7] TrackBuilder             — добавить точку в track
   ↓
[8] MetricsCalculator        — distance, speed (sliding window 10s), pace
   ↓
[9] ClosureDetector          — раз в 30с проверять дистанцию старт↔текущая
   ↓
[10] AreaCalculator (lazy)   — только при замыкании, или по запросу UI
   ↓
[11] Storage (every 10 pts or 30s)
   ↓
[12] UI emit
```

### 4.4 Background стратегия

**iOS:**
- Когда приложение активно: `kCLLocationAccuracyBest`, distance filter 5м
- При уходе в фон: продолжаем тот же режим (UIBackgroundMode `location`)
- При killed state: `startMonitoringSignificantLocationChanges` как safety net (вернёт нас в фоне при значимом перемещении и мы возобновим обычный трек)
- Pause UI обновлений в фоне, но не pipeline — pipeline пишет в БД

**Android:**
- Foreground service с persistent notification (по закону Android 12+)
- WAKE_LOCK на время сессии
- FusedLocationProvider с `setIntervalMillis(1000)` и `setMinUpdateIntervalMillis(500)`
- Adaptive: если 5 минут v<0.3 м/с — переход в режим `BALANCED_POWER_ACCURACY` с интервалом 5с
- Документированная инструкция для пользователя по отключению battery optimization для нашего приложения (особенно Xiaomi/Huawei/Oppo)

### 4.5 Восстановление после kill

- Каждые 10 точек или 30с — flush в SQLite (`WAL` режим)
- При старте приложения: SELECT активную сессию, если есть — диалог "Continue / Discard"
- Continue: подгрузить последнее состояние Kalman + метрики, продолжить
- Discard: пометить как abandoned, оставить в БД для возможной отладки

---

## 5. Backend (микросервисы) — V1+

В Phase 0 ничего из этого не поднимается. Здесь — каркас, к которому приходим.

### 5.1 Каталог сервисов

| # | Сервис | Язык | Ответственность |
|---|---|---|---|
| 1 | API Gateway | Go | REST + GraphQL, аутентификация, rate limit, маршрутизация |
| 2 | Identity | Go | Регистрация, OAuth (Apple/Google), JWT, профили |
| 3 | Activity Ingest | Go | Приём live point streams (WebSocket + REST batch), валидация, raw store в S3 |
| 4 | Activity Processing | Go + C++/Rust для горячих путей | Фильтрация серверной стороной, расчёт метрик, площадей, упрощение для отрисовки |
| 5 | Track Storage | Go (на TimescaleDB) | API для time-series точек и сенсоров |
| 6 | Sensor Sync | Go | OAuth + webhooks для Garmin Connect, Strava, Polar Flow, Suunto, COROS, Wahoo, Apple Health (через клиента), Health Connect |
| 7 | Training Engine | Go + Python | Зоны, TSS/CTL/ATL/TSB, VO2max, race predictor |
| 8 | Plans & Coaching | Go | Тренировочные планы, coach↔athlete, шаринг |
| 9 | Social | Go | Клубы, сегменты, лидерборды, события |
| 10 | Feed | Go | Лента активностей, лайки, комментарии |
| 11 | Notification | Go | Push (FCM/APNs), email |
| 12 | Geo | Go + Rust | Heatmap, маршруты, тайлы, поиск гео-объектов |
| 13 | Media | Go | Фото/видео в активностях |
| 14 | Search | Go | OpenSearch wrapper, индексация активностей и сегментов |
| 15 | Billing | Go | Подписки, тарифы, RevenueCat/Stripe webhooks |
| 16 | Admin/BI | Go | Внутренние инструменты, аналитика для команды |

### 5.2 Хранилища

- **PostgreSQL** — метаданные (User, Activity, Plan, …)
- **TimescaleDB** (PostgreSQL extension) — точки и сенсорные потоки. Hypertable по `time`, partition по `activity_id`
- **ClickHouse** — аналитические агрегации, лидерборды, статистика для тренеров
- **Redis** — кеш, сессии, rate limit, leaderboard temp scores
- **S3-совместимое** (MinIO в dev) — raw FIT/GPX/TCX, медиа, экспорты
- **OpenSearch** — поиск (активности, сегменты, люди)
- **NATS JetStream** — events bus (предпочтительнее Kafka для нашего масштаба)

### 5.3 Контракты

- **gRPC + protobuf** между сервисами
- **REST + JSON** для public API mobile↔gateway (v1)
- **GraphQL** в gateway для агрегации в ленте (v2, опционально)
- **WebSocket** для live-tracking клиент→Activity Ingest
- **Все DTO версионированы**, breaking changes только через новый эндпоинт

### 5.4 Аутентификация

- Свой OIDC провайдер (или Keycloak / Ory Kratos)
- JWT access (15 мин) + refresh (30 дней)
- Sign in with Apple, Google
- В будущем — наш собственный публичный OAuth провайдер (как у Strava)

### 5.5 Observability

- **Prometheus** — метрики
- **Loki** — логи (структурированные JSON)
- **Tempo / Jaeger** — distributed tracing
- **Grafana** — дашборды
- **Sentry** — клиентские ошибки (мобильные + web)
- **PostHog** или собственный — продуктовая аналитика

### 5.6 Инфраструктура

- Dev: docker-compose со всеми сервисами и хранилищами
- Staging/Prod: Kubernetes (EKS / GKE / k3s в self-hosted варианте)
- IaC: Terraform + Helm
- CI/CD: GitHub Actions, образы в GHCR
- Secrets: SealedSecrets / external-secrets-operator

---

## 6. Tracking Engine (углублённо)

### 6.1 Калмановская фильтрация

**Состояние:** `[lat, lon, v_lat, v_lon]`

**Матрица перехода F** (Δt = время с предыдущего шага):
```
[1, 0, Δt, 0 ]
[0, 1, 0,  Δt]
[0, 0, 1,  0 ]
[0, 0, 0,  1 ]
```

**Матрица наблюдения H** (наблюдаем только координаты, скорость восстанавливаем):
```
[1, 0, 0, 0]
[0, 1, 0, 0]
```

**Ковариация измерения R** — адаптивная, на основе accuracy GPS:
```
R = diag(σ_lat², σ_lon²)
σ = accuracy / 111320  (метры → градусы широты приблизительно)
```

**Ковариация процесса Q** — настраивается под ожидаемое ускорение бегуна (0.5 м/с² разумно):
```
Q = q × [Δt⁴/4, 0, Δt³/2, 0;
          0, Δt⁴/4, 0, Δt³/2;
          Δt³/2, 0, Δt², 0;
          0, Δt³/2, 0, Δt²]
где q = 0.25 (м²/с⁴)
```

Реализация — стандартная Predict / Update. Из коробки в numpy за 50 строк, в Dart — 80, в TS — 80.

### 6.2 Дистанция

Гаверсинус достаточен (Vincenty избыточен для пробежки):
```
function haversineDistance(p1, p2):
    R = 6371000  // м
    φ1 = p1.lat × π/180
    φ2 = p2.lat × π/180
    Δφ = (p2.lat - p1.lat) × π/180
    Δλ = (p2.lon - p1.lon) × π/180
    a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)
    c = 2 × atan2(√a, √(1-a))
    return R × c
```

### 6.3 Скорость и темп

Скользящее окно 10 секунд для текущей скорости — иначе UI прыгает. Темп = 1/скорость, с маскированием при v<0.5 м/с.

### 6.4 Авто-пауза с гистерезисом

```
state = RUNNING
buffer = []  // последние 5с скоростей

on each new speed:
    buffer.append(speed)
    buffer.removeOlderThan(5s)
    
    if state == RUNNING and all(v < 0.5 for v in buffer):
        state = PAUSED
        emit "auto-paused"
    
    if state == PAUSED and all(v > 1.5 for v in last 2s):
        state = RUNNING
        emit "auto-resumed"
```

### 6.5 Замыкание

```
function isClosed(track):
    if length(track) < 200m:  // фильтр от ложных замыканий
        return false
    return distance(track.first, track.last) < 20m
```

### 6.6 Площадь — три подхода

#### Подход A. Полигон по треку (брифовский)

1. Упростить трек алгоритмом Дугласа-Пёкера, толерантность 5м
2. Найти центроид: `(mean_lat, mean_lon)`
3. Спроецировать все точки в локальную плоскость:
   ```
   x = (lon - lon0) × cos(lat0 × π/180) × R
   y = (lat - lat0) × R
   где R = 6371000
   ```
4. Применить shoelace:
   ```
   A = 0.5 × |Σ (x_i × y_{i+1} - x_{i+1} × y_i)|
   ```
5. Результат — в м²

Точность <1% для треков диаметром до 10 км. Для пробежек этого хватает.

#### Подход B. Буферизированный коридор (для незамкнутых)

1. Упростить трек (Дугласа-Пёкера, 5м)
2. Спроецировать в плоскость (как в A)
3. Buffer полилинии шириной 2.5м (через turf, JTS-аналог в Dart, либо свой алгоритм Minkowski)
4. Площадь буфера = shoelace

Этот подход всегда даёт что-то осмысленное — даже если бегун не вернулся в стартовую точку.

#### Подход C. Сеточное покрытие (на будущее, для геймификации)

1. Для каждой точки трека определить ячейку H3 (резолюция 11, ~25м edge) или собственную UTM-сетку
2. Зона = union ячеек
3. Площадь = count × cell_area

**Преимущества:**
- Робастно к самопересечениям
- Естественно расширяется в игру "захвати территорию"
- Легко агрегировать по пользователю / клубу

**Применение:** в Phase 0 — опционально (упрощённая UTM-сетка 10×10м), в V2 — как игровой режим.

### 6.7 Самопересечения

Если трек самопересекается (восьмёрка), shoelace даёт сумму со знаком — части полигона "вычитаются". Это **технически корректно** по математике, но **семантически странно** для пользователя.

Варианты обработки:
1. Detect самопересечение (Bentley-Ottmann), warning пользователю
2. Использовать абсолютное значение каждого "лепестка" отдельно (требует декомпозиции)
3. Fallback на coverage (Подход C) при самопересечении
4. Convex hull как очень грубый верхний предел

**Для прототипа:** используем Подход A с warning про самопересечение, плюс Подход B как fallback. Вычисление по обоим методам показываем в UI.

### 6.8 Высоты

GPS altitude шумит сильно. Если на устройстве есть барометр (iPhone 6+, флагманы Android) — использовать pressure altitude через CMAltimeter / Sensor.TYPE_PRESSURE. Калибровать по первой надёжной GPS-фиксации.

---

## 7. Часы и датчики (стратегия по фазам)

### 7.1 Фазирование

| Фаза | Что подключаем |
|---|---|
| Phase 0 | Только телефон |
| MVP | Apple HealthKit / Health Connect READ (импорт данных тренировок других приложений) |
| V1 | BLE HRM (стандартный GATT 0x180D), BLE foot pod (cadence) |
| V1.5 | Stryd (running power), кастомные foot pods |
| V2 | Garmin Connect ingest (OAuth + webhooks), Strava bidirectional |
| V2.5 | Polar Flow, Suunto, COROS, Wahoo (FIT-based) |
| V3 | Native Apple Watch (WatchOS), Native Wear OS |
| V3.5 | Garmin Connect IQ data field/app, SuuntoPlus |

### 7.2 Универсальный обмен

- **FIT** — главный формат для умных часов. Парсинг через FIT SDK от Garmin (есть Go-обёртки)
- **TCX** — fallback, простая XML структура
- **GPX** — самый простой, без сенсорных потоков
- **Свой бинарный формат** для live-стрима телефон↔backend (protobuf)

### 7.3 Apple Health / Health Connect

- На MVP только READ — импортируем чужие тренировки (если пользователь записал в Garmin приложении и оно синхронизировалось в Apple Health, мы это видим)
- WRITE — позже, чтобы наши тренировки появлялись в системном Health

---

## 8. Roadmap

### Phase 0 (1–3 недели)
Два прототипа, измерения, выбор фреймворка, DECISION.md.

### MVP (4–8 недель после Phase 0)
- Auth (email + Apple/Google)
- Запись пробежки на выбранном фреймворке
- Карта + полигон/коридор/площадь
- Локальное хранилище + sync с минимальным backend (Identity + Activity Ingest + Track Storage + Gateway)
- Профиль + история пробежек
- HealthKit/Health Connect READ
- Push о завершении синхронизации
- TestFlight / internal testing track

### V1 (3–4 месяца)
- BLE HRM
- Зоны пульса
- Базовый training load (TSS/rTSS)
- Маршруты (создание из истории, навигация)
- Сегменты + лидерборды (как у Strava)
- Strava bidirectional sync
- Клубы
- Web-вьювер активности (опционально)

### V2 (6–9 месяцев)
- Garmin Connect ingest
- Структурированные тренировки + голос
- Coach ↔ Athlete (роли, шаринг планов)
- Adaptive plans (на правилах, не ML)
- Stryd / running power
- HRV / Recovery score
- Race predictor (Riegel, Cameron)
- Подписка (Stripe/RevenueCat)

### V3 (12+ месяцев)
- Native watch apps
- AI-коуч
- Маркетплейс тренеров и планов
- Виртуальные забеги / челленджи
- Биллинг с тарифами

---

## 9. Стек (итог)

### Mobile
- Phase 0: оба варианта параллельно (см. §2.7, §2.8)
- После: один + нативные модули по необходимости

### Backend
- **Go** — основной для всех бизнес-сервисов
- **C++ или Rust** — горячие CPU-bound пути (фильтрация больших треков, тайлы, гео-вычисления, буфер полилиний)
- **Python** — спортивно-научные модели (TSS-подобные расчёты, VO2max, race predictor) и ML позже

### Хранилища
PostgreSQL, TimescaleDB, ClickHouse, Redis, S3 (MinIO в dev), OpenSearch, NATS JetStream.

### Инфра
Docker Compose (dev), Kubernetes (prod), Terraform, GitHub Actions, Prometheus/Loki/Tempo/Grafana, Sentry.

---

## 10. Картографический стек (Mapbox)

Картографический провайдер на старте — **Mapbox**. Раздел описывает что используем, как платим, какие ловушки и как защищаем себя от vendor lock-in.

### 11.1 Какие продукты Mapbox используем

| Продукт | Когда | Как биллится |
|---|---|---|
| Maps SDK for Mobile (iOS/Android через RN или Flutter) | Phase 0+ | MAU (Vector + Raster Tiles внутри MAU безлимитно) |
| Mapbox Studio (создание custom style) | Phase 0+ | Бесплатно для разработки |
| Static Maps API | MVP (превью пробежки в шаринге, push-нотификациях) | Per request |
| Map Matching API | V1 (опциональная привязка треков к дорогам) | Per request |
| Tilequery API | V1 (на каких дорожках/тропинках был трек) | Per request |
| Directions API | V1 (планировщик маршрута) | Per request |
| Isochrone API | V2 (показать "что в радиусе 30 минут бега") | Per request |
| Geocoding API (temporary) | MVP (поиск мест) | Per session/request |
| Tilesets API | V1 (наши собственные тайлы — heatmap клуба, сегменты) | Per processing/hosting |

**Что НЕ используем:**
- Navigation SDK — он для авто-навигации, тарифицируется по trip MAU, для бега избыточен и дорог
- Vision SDK, Movement Data, Traffic Data — нерелевантно

### 11.2 Mapbox MAU — что это и где ловушки

Mapbox считает MAU per-application/per-device, потому что не собирает cross-device идентификаторы ради приватности пользователей. Практические следствия:

- **Один пользователь на 2 устройствах = 2 MAU** (телефон + Apple Watch если будет watch app)
- **Переустановка приложения = новый MAU** (счётчик не персистится между установками)
- **CI/CD-пайплайн с эмуляторами = MAU** — при сборках на симуляторах с настоящим access token
- **Тестировщики — каждый эмулятор/устройство — отдельный MAU**

**Митигация:**
- Использовать отдельный публичный access token в production, отдельный в dev/CI (с отдельным free tier)
- Не запускать симуляторы с production-токеном в CI
- Ограничить токены по URL/Bundle ID/SHA-256 fingerprint в Mapbox dashboard

### 11.3 Offline-карты — отдельная статья

Это **критично** для бегунов: пробежка может быть в местах без связи, а карта нужна. Mapbox тарифицирует офлайн-карты отдельно по тайл-запросам, не входящим в MAU.

**Стратегия в нашем приложении:**
1. **Авто-загрузка домашней зоны** при первом старте — tile region 10 км вокруг места первого запуска, zoom 12-16. Один раз. Обновление раз в 30 дней.
2. **Manual download** — пользователь может выбрать регион перед поездкой/гонкой
3. **Размер пакета** — следить, чтобы не переходить лимит Mapbox в 750 тайлов на регион без enterprise. На zoom 16 это ~10×10 км.
4. **Логирование тайл-запросов** — у нас должен быть свой счётчик offline tile usage, чтобы вычислять стоимость на пользователя

### 11.4 Mapbox Studio — наш кастомный стиль

Стандартные стили Mapbox показывают POI ресторанов и АЗС, что для бегового приложения шум. Создаём собственный стиль:

- Базируемся на Mapbox Outdoors v12 (треки, тропы, рельеф)
- Скрываем POI ресторанов, отелей, АЗС
- Подсвечиваем pedestrian/cycle paths, parks, treadmills
- Добавляем рельеф (terrain) для крутых участков
- Тёмная и светлая темы

Хранится URL стиля (`mapbox://styles/yourorg/yourstyle`), приложение лишь ссылается. Изменения в дизайне катятся без релиза приложения.

### 11.5 Производительность с большими треками

Базовое правило: **никаких PolylineAnnotation для трека**. Это видно в обоих SDK: для большого количества аннотаций (сотни и тысячи) используются style layers вместо AnnotationManager — это даёт значительно лучшую производительность.

**Правильный подход:**
1. Один `GeoJsonSource` для активного трека
2. `LineLayer` поверх него с интерполяцией ширины по zoom
3. Live-обновление: добавлять новые точки в источник через `updateGeoJSONSourceFeatures` (Flutter) / `setShape` (RN), **не пересоздавая** источник
4. Простификация Дугласа-Пёкера каждые N точек на копии для отрисовки (полная версия — в БД), толерантность зависит от zoom

**Для замкнутого полигона зоны:**
- Отдельный `GeoJsonSource` с polygon feature
- `FillLayer` с прозрачностью 0.3
- `LineLayer` поверх с обводкой

**Для буферизированного коридора (незамкнутый трек):**
- Через turf.buffer на полилинии → polygon → FillLayer

### 11.6 MapAdapter — защита от vendor lock-in

Mapbox при росте до 100к+ MAU становится статьёй расходов в десятки тысяч долларов в год. Нужен запасной аэродром.

**Архитектурное правило:** код домена и pipeline никогда не импортирует Mapbox SDK напрямую. Только через `MapAdapter`:

```typescript
interface MapAdapter {
  initMap(config: MapConfig): Promise<MapHandle>
  setStyle(styleUrl: string): Promise<void>
  setCamera(camera: Camera, animated: boolean): void
  
  addOrUpdateGeoJsonSource(id: string, geojson: GeoJSON): void
  removeSource(id: string): void
  
  addLineLayer(id: string, sourceId: string, paint: LinePaint): void
  addFillLayer(id: string, sourceId: string, paint: FillPaint): void
  addCircleLayer(id: string, sourceId: string, paint: CirclePaint): void
  removeLayer(id: string): void
  
  setLocationPuck(puck: LocationPuckConfig): void
  
  downloadOfflineRegion(region: OfflineRegion): Promise<DownloadHandle>
  listOfflineRegions(): Promise<OfflineRegion[]>
  deleteOfflineRegion(id: string): Promise<void>
}
```

Реализация на Phase 0: `MapboxMapAdapter`. На случай миграции — пишется `MapLibreMapAdapter` (тот же интерфейс) и весь остальной код не трогается.

**Куда мигрировать в крайнем случае:**
- **MapLibre GL Native** — open-source форк Mapbox GL Native (от 2020, когда Mapbox закрыл код v2). Бесплатен, нужен свой тайл-сервер
- **Свой тайл-сервер** — TileServer GL + OpenMapTiles + OSM данные. Хостинг ~$50/мес на старте, ~$500-1000/мес на 100к MAU. В разы дешевле Mapbox на масштабе
- **Google Maps** — нежелательно (хуже офлайн, дороже на масштабе, меньше кастомизации)

### 11.7 Безопасность токенов

Public access token идёт в приложение — он публичен, и это нормально, **если** он ограничен:
- Ограничение по Bundle ID (iOS) и SHA-256 fingerprint (Android) в dashboard Mapbox
- URL restrictions для веб-клиента (если будет)
- Только нужные scopes (Maps:Read, Offline:Read для мобильного)
- Secret token (для серверных вызовов Static Maps, Directions из бэкенда) хранится в HashiCorp Vault или AWS Secrets Manager, **никогда** в репозитории
- Ротация токенов раз в 6 месяцев

### 11.8 Стоимость — оценочно

Mapbox имеет free tier на Maps SDK (точные цифры см. на mapbox.com/pricing — меняются), после которого начинается оплата за MAU. Грубый порядок для оценки:

| Юзеров | Месячная стоимость Map SDK | Net offline cost (доп.) | Итог/мес |
|---|---|---|---|
| 1k | $0 (free tier) | $0 | $0 |
| 10k | $0–50 | ~$10 | ~$50 |
| 50k | ~$250 | ~$50 | ~$300 |
| 100k | ~$500 | ~$150 | ~$650 |
| 500k | ~$2500+ (нужен enterprise deal) | ~$1000 | ~$3500+ |

**На 50k MAU и больше — обязательный triggers для:**
1. Переговоров с Mapbox sales о enterprise discount
2. Серьёзной оценки миграции на MapLibre + self-hosted tiles

**В finance-плане проекта** (вне этого ТЗ, но напоминание): закладывать рост Mapbox-стоимости в unit economics.

### 11.9 Что делает прототип Phase 0 относительно карты

- Кастомный стиль Mapbox Studio (можно начать со стандартного Outdoors v12, потом перейти на свой)
- LineLayer для трека (обновляется live через GeoJSON source)
- FillLayer для замкнутой зоны
- FillLayer для буферизированного коридора (если незамкнут)
- Auto-download региона 10км вокруг старта первой пробежки
- Камера: следование за пользователем + кнопка "вид всей пробежки"
- Метрики: FPS при 5000+ точек на треке (T7)

---

## 11. Глоссарий

- **TSS** — Training Stress Score, нагрузка тренировки
- **rTSS** — running TSS (на основе темпа и LTHR)
- **CTL** — Chronic Training Load, фитнес (42-дневное среднее TSS)
- **ATL** — Acute Training Load, усталость (7-дневное среднее TSS)
- **TSB** — Training Stress Balance, форма (CTL − ATL)
- **LTHR** — Lactate Threshold Heart Rate, пульс лактатного порога
- **VO2max** — максимальное потребление кислорода
- **FIT/TCX/GPX** — форматы экспорта тренировок
- **MET** — Metabolic Equivalent of Task, для расчёта калорий
- **H3** — гексагональная гео-сетка от Uber
- **MAU** — Monthly Active User, основная единица биллинга Mapbox
- **MapLibre** — open-source форк Mapbox GL Native (после закрытия исходников Mapbox в 2020), запасной вариант при росте стоимости
- **GeoJsonSource / LineLayer / FillLayer** — компоненты Mapbox style spec для эффективной отрисовки большого числа фич
- **Tile Region (Mapbox)** — сохранённый офлайн-пак тайлов для конкретной географической области

---

## Приложение A. Тестовые маршруты для Phase 0

**T1, эталон 5 км:**
- Стадион 400м × 12.5 кругов = 5 км (нужен только если есть доступ)
- Или замеренный на Garmin сегмент в Strava (брать с >1000 attempts для надёжности)

**T2, эталон площади:**
- Футбольное поле FIFA: 105×68 = 7140 м²
- Стандартное баскетбольное поле: 28×15 = 420 м²
- Парк прямоугольный с известным периметром (мерить по спутнику в Google Earth)

**T3, городской каньон:** на местности команды (Frankfurt am Main у пользователя — Bockenheim или Bahnhofsviertel подойдут)

**T4, тоннель:** ближайшая Tunnel/U-Bahn, выйти-зайти

**T8, background:** просто 30-минутная прогулка с заблокированным телефоном по обычному маршруту

---

## Приложение B. Открытые ресурсы

- **H3:** https://h3geo.org
- **turf.js:** https://turfjs.org (буферы, площадь, упрощение)
- **Garmin FIT SDK:** https://developer.garmin.com/fit
- **Strava API:** https://developers.strava.com
- **Apple HealthKit:** https://developer.apple.com/documentation/healthkit
- **Health Connect:** https://developer.android.com/health-and-fitness/guides/health-connect
- **Mapbox:** https://docs.mapbox.com
- Runalyze (open-source трекер с TSS/CTL/ATL логикой) для reference: https://github.com/Runalyze/Runalyze

---

## Изменения

- v0.1 — первичный черновик. Решения по неоднозначностям зафиксированы в §0 и пометками "уточнить с заказчиком"
- v0.2 — зафиксирован картографический стек: Mapbox (раздел §10). Добавлены FR-021…FR-026 для прототипа. Введён принцип MapAdapter абстракции (§3.10). Обновлены §2.7/§2.8 с конкретными SDK. Глоссарий пополнен Mapbox-терминами
