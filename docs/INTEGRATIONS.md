# INTEGRATIONS — приём активностей из внешних источников

Дата: 2026-05-06
Связанные файлы:
- Adapter contract: [src/health/HealthAdapter.ts](../apps/mobile-rn/src/health/HealthAdapter.ts)
- Реализации: [src/health/MockHealthAdapter.ts](../apps/mobile-rn/src/health/MockHealthAdapter.ts), [src/health/HealthConnectAdapter.ts](../apps/mobile-rn/src/health/HealthConnectAdapter.ts)
- DB: миграция v16 в [src/storage/database.ts](../apps/mobile-rn/src/storage/database.ts)

---

## 1. Что считается «источником»

Единая модель `sessions.source` — TEXT NOT NULL DEFAULT `'gps'`. Допустимые значения:

| `source` | Происхождение |
|---|---|
| `gps` | пользователь записал на этом устройстве через TrackerLive (по умолчанию) |
| `manual` | пользователь добавил вручную (заглушка, UI не сделан) |
| `watch_apple` / `watch_garmin` / `watch_polar` / `watch_suunto` / `watch_fitbit` / `watch_xiaomi` | live-импорт из часов |
| `trainer_ble` | BLE FTMS тренажёр (беговая дорожка, велоэргометр) |
| `healthkit` | импорт из Apple HealthKit |
| `health_connect` | импорт из Android Health Connect |
| `strava` / `garmin_connect` | OAuth-pull из платформ |

Дополнительная колонка `sessions.external_uuid TEXT` — уникальный ID источника на стороне внешней системы. Используется для дедупа: `UNIQUE(source, external_uuid)` (см. миграция v16).

---

## 2. Контракт `HealthAdapter`

Один interface — три стратегии импорта:

| Стратегия | Метод | Когда применяется |
|---|---|---|
| **Pull** | `pullSince(sinceMs)` | каждый app-foreground или manual «Синхронизировать» в Settings |
| **Push (webhook)** | backend → notifications-сервис → нативный push с тихим payload | внешняя платформа сообщает «новая активность» |
| **Live BLE** | `live*` методы (TODO) | подключение к датчику во время записи: HR, мощность, каденс, дистанция с дорожки |

В текущем раунде реализован только Pull (включая `pullSince`). Push и Live BLE — следующие итерации.

### Методы (минимум)

```ts
interface HealthAdapter {
  platform(): HealthPlatform;
  isAvailable(): Promise<boolean>;
  requestPermissions(scopes): Promise<boolean>;
  grantedScopes(): Promise<HealthPermissionScope[]>;
  writeWorkout(w: HealthWorkout): Promise<void>;
  readWorkouts(sinceMs: number): Promise<ImportedWorkout[]>;
  pullSince(sinceMs: number | null): Promise<ImportedWorkout[]>;
}
```

### `ImportedWorkout`

```ts
type ImportedWorkout = HealthWorkout & {
  source: HealthPlatform;  // apple-health | health-connect | mock
  sourceUuid: string;       // ID на стороне источника — для дедупа
};
```

---

## 3. Дедупликация

Принцип: **одна тренировка не засчитывается дважды**, даже если приходит из часов **и** из HealthKit, и **и** из Strava.

### Уровень БД

```sql
CREATE UNIQUE INDEX idx_sessions_source_external
  ON sessions (source, external_uuid)
  WHERE external_uuid IS NOT NULL;
```

Это гарантирует: после импорта `pullSince` следующий вызов с тем же `(source, sourceUuid)` пропустит INSERT (через `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` в репозитории — TODO).

### Уровень логики (best-effort)

Когда одна и та же тренировка приходит из **разных источников** (Watch + HealthKit), `(source, external_uuid)` будут разные. Чтобы их слить:

- Сравнить `startedAt` ±60s и `distanceM` ±5% → пометить duplicate, оставить «канонический» источник по приоритету:
  1. `gps` (наша запись — most trusted)
  2. `watch_*`
  3. `healthkit` / `health_connect`
  4. `strava` / `garmin_connect`

Это **не сделано в текущем раунде** — нужно отдельное решение по UX (показать user'у «эта тренировка уже импортирована, обновить?»).

---

## 4. Маппинг метрик → формула валюты

`pullSince` возвращает `ImportedWorkout` с полями: `distanceM`, `calories`, `avgHrBpm`, `activityType`. На import-сайт:

```ts
const decision = decideCoinsForSession({
  kcalBurned: imported.calories ?? estimateCalories(imported),
  durationS: (imported.endedAt - imported.startedAt) / 1000,
  distanceM: imported.distanceM,
  activity: mapActivityType(imported.activityType),
  avgHrBpm: imported.avgHrBpm,
  coinsEarnedToday: walletDailyCounter,
});
```

То есть **одна формула** для GPS-записи и для импорта. Множитель в [src/domain/currency.ts](../apps/mobile-rn/src/domain/currency.ts) `ACTIVITY_MULTIPLIER` — единая точка истины.

---

## 5. Реализация: HealthConnect (Android — референс)

`HealthConnectAdapter` написан **stub-safe**: если native-пакет `react-native-health-connect` не установлен (Expo Go), все методы возвращают пустые / false. UI должен это уважать (показать disabled-state).

### Включение реального импорта

1. Добавить в `package.json`: `react-native-health-connect@^5`.
2. Добавить config plugin в `app.json` → `plugins`: `["react-native-health-connect"]`.
3. Прописать в `AndroidManifest.xml` permission decl (config plugin делает это сам).
4. Сделать dev/preview build (`eas build --profile development --platform android`).
5. На устройстве установить Health Connect (предустановлен с Android 14+).
6. В Settings ➜ добавить кнопку «Подключить Health Connect» — вызвать `requestPermissions(['read-workouts'])`.

После этого `pullSince(sinceMs)` начнёт возвращать реальные `ExerciseSession`-записи.

### iOS / HealthKit

`HealthKitAdapter` — TODO Phase 7.1. Контракт идентичен. Ожидаемая native-зависимость: `react-native-health` или `expo-health-kit`. Аналогично stub-safe.

---

## 6. Другие источники (планы)

| Источник | Способ | Когда |
|---|---|---|
| Strava | OAuth + Strava API `/athlete/activities` | P2 — нужен `client_id`/`secret` |
| Garmin Connect | OAuth 1.0a + Garmin Health API | P2 — gated API, нужна регистрация партнёра |
| Polar / Suunto / Coros | через Health Connect (Android) — они пушат туда | P1 — работает «бесплатно» через HC |
| Fitbit | OAuth + Fitbit Web API | P2 |
| BLE FTMS (тренажёры) | `react-native-ble-plx` + GATT FTMS-сервис | P2 |
| ANT+ | `react-native-ant-plus` (Android only) | P3 |

---

## 7. Backend (future)

Сейчас весь импорт — клиентский, в SQLite. Когда поднимем `integrations` микросервис:

- Server-side webhooks для Strava / Garmin (push-стратегия).
- Server-side OAuth callback handler.
- Дедуп на server-side (одна тренировка не появляется дважды, даже если два устройства user'а синхронизируют параллельно).
- Server применяет ту же `decideCoinsForSession` для согласованности с валютой.

Это — отдельный backend ADR. В этом раунде только клиент + контракт.

---

## 8. Тесты

Сейчас покрыто:
- `MockHealthAdapter` — 10 тестов в [src/__tests__/health.test.ts](../apps/mobile-rn/src/__tests__/health.test.ts) (scope gating, идемпотентность, sinceMs).

Не покрыто (Round 2):
- `HealthConnectAdapter` — мокать `react-native-health-connect`.
- Дедуп per-source (когда напишем repo-layer для import).
- E2E сценарий: import Mock → award coins → wallet баланс.

---

## 9. Безопасность OAuth-интеграций

**Правило**: никаких provider secrets (client_secret, refresh_token, master keys) на устройстве.

Mobile-приложение распространяется в виде APK / IPA — его можно декомпилировать. Любые поля, попадающие в `process.env.EXPO_PUBLIC_*`, запекаются в JS-бандл и доступны атакующему. Поэтому:

- **client_id** — публичный, можно держать на устройстве.
- **client_secret** — **ТОЛЬКО на backend**. Никогда не в `.env` mobile-проекта.
- **refresh_token** — **ТОЛЬКО на backend**. Mobile хранит только короткоживущий `access_token` + `athleteId/userId` для рефреша через backend-proxy.

Все провайдеры (Strava, Garmin, Fitbit, …) должны использовать PKCE-flow (RFC 7636), который не требует client_secret для обмена `code → access_token`.

### Backend endpoints для интеграций

Для каждого OAuth-провайдера backend выставляет два endpoint'а:

```
POST /api/integrations/{provider}/exchange
  body: { code, codeVerifier, deviceId }
  resp: { accessToken, expiresAtMs, athleteId }
  effect: backend держит refresh_token у себя в integrations_tokens table

POST /api/integrations/{provider}/refresh
  body: { athleteId, deviceId }
  resp: { accessToken, expiresAtMs }
  effect: backend дёргает provider refresh endpoint, возвращает новый access
```

Mobile-клиент **никогда** не вызывает напрямую `https://www.strava.com/oauth/token` — только через свой backend.

## 10. Открытые вопросы / следующие шаги

1. UI для «Подключить источник» в Settings (toggle + список granted scopes).
2. Repo-layer для импорта `importSessionsFromHealth(adapter, sinceMs)` — UPSERT в sessions с дедупом по `(source, external_uuid)`.
3. Manual entry: «Добавить тренировку вручную» — UI + `source='manual'`.
4. Decision: что делать когда одна тренировка приходит из двух источников. Дефолт — оставлять `gps` если есть, иначе первый по приоритету (см. §3).
5. Backend endpoints `/api/integrations/strava/{exchange,refresh}` (Round 4+).
