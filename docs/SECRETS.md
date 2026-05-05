# SECRETS

Описание секретов проекта Running Ecosystem: какие есть, как получены, где хранятся, кто имеет доступ.

> ⛔ **В этом файле нет реальных значений токенов.** Только метаданные. Реальные значения — в локальном `.env` каждого разработчика (или в team password manager, когда выберем).

---

## Mapbox

### Account

- **Тип:** личный аккаунт владельца проекта
  - 🔄 TODO: мигрировать на team-аккаунт когда появится финансирование / юр. лицо. Влияет на передачу ownership и единый биллинг.
- **Email владельца:** `dragon2015516@gmail.com`
- **Mapbox username:** `iassd` (публичная часть, видна в любом access-токене этого аккаунта)
- **Dashboard:** https://account.mapbox.com/

### Access tokens

| Имя             | Фактический тип | Должен быть | Scopes                                                            | Restrictions                                                              | Когда использовать                             |
|-----------------|-----------------|-------------|-------------------------------------------------------------------|---------------------------------------------------------------------------|------------------------------------------------|
| `dev-public`    | Public (`pk.…`) | Public      | `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `OFFLINE:READ`, `TILES:READ` | iOS Bundle ID: `com.runningecosystem.mobile`<br>Android SHA-256: **TODO** | Прототипы Phase 0 (RN + Flutter), dev-сборки   |
| `prod-public`   | Public (`pk.…`) | Public      | `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `OFFLINE:READ`, `TILES:READ` | iOS Bundle ID: `com.runningecosystem.mobile`<br>Android SHA-256: **TODO** | Production-сборки (в Phase 0 не используется)  |
| `server-secret` | ⚠️ Public (`pk.…`) — **ОШИБКА, пересоздать как Secret** | Secret (`sk.…`) | `STYLES:READ`, `TILESETS:READ`, `DATASETS:READ`                    | (нет — добавить IP-restriction когда появится staging)                    | Серверные вызовы Static Maps / Directions (Phase 2+) |

> Default public token из аккаунта **не использовать** — он не ограничен Bundle ID и его сложнее ротировать.

### ⚠️ Известные проблемы текущего стейта

1. **`server-secret` создан как public.** Префикс `pk.` означает public access token. Secret-токен Mapbox имеет префикс `sk.` и создаётся через UI с галочкой "Secret access token" — её и нужно поставить при пересоздании. Не критично для Phase 0 (серверные вызовы появятся только в Phase 2+), но **надо пересоздать перед началом работ по бэкенду**.

2. **Все 3 токена однажды попали в чат с AI-ассистентом** (на этапе создания P0-A-01). Для Phase 0 dev-работы не критично — токены ограничены iOS Bundle ID, скоупы минимальны, биллинг под контролем. Но:
   - 🔒 Перед публичным релизом приложения и/или подключением биллинговой карты — **ротировать все 3 токена** (revoke + создать новые).
   - 🔒 До тех пор не ставить эти токены на production-сборку.

### Verification (P0-A-01)

Smoke-test через Mapbox Styles API (выполнен 2026-05-06):
```
curl "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=<token>"
```
Результат:
- `dev-public` → HTTP 200 ✅
- `prod-public` → HTTP 200 ✅
- `server-secret` → HTTP 200 ✅ (ожидаемо, потому что фактически он public)

> Важно: smoke-test через `curl` **не проверяет** iOS Bundle ID restriction — Mapbox restrictions enforced only внутри SDK через специфические заголовки. Для проверки restriction нужна реальная мобильная сборка с правильным/неправильным Bundle ID — это сделается в `P0-B-02` / `P0-C-02`.

### Стандартный стиль карты для Phase 0

Используется стандартный стиль Mapbox Outdoors v12:
```
mapbox://styles/mapbox/outdoors-v12
```

Кастомный стиль (`P0-A-02`) отложен на Phase 1 (см. [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) §2.1).

### Как получить токен (новый разработчик)

1. Запросить `dev-public` у владельца Mapbox-аккаунта через защищённый канал (Signal, Telegram secret chat, или однократный share-link через 1Password).
2. Сохранить значение в локальный `.env` (файл появится в репозитории на этапе `P0-A-03` / `P0-B-01` / `P0-C-01`):
   ```
   MAPBOX_ACCESS_TOKEN=<значение_dev-public>
   ```
3. **Никогда** не коммитить `.env` в git. Проверить, что `.env` есть в `.gitignore`.
4. Для iOS-сборок дополнительно нужен Mapbox **download token** в `~/.netrc` (для CocoaPods, см. [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) `P0-B-01`). Получается отдельно через https://account.mapbox.com/access-tokens/ → "Create a token" с scope `DOWNLOADS:READ`.

### Ротация

- **Плановая:** раз в 6 месяцев — выпуск новых токенов, старые `revoke` через Mapbox dashboard.
- **Внеплановая:** при уходе разработчика, при подозрении на утечку, при публикации в публичный репозиторий по ошибке.
- 🔄 TODO: настроить календарный reminder на ротацию (Google Calendar / iCal).

### Известные TODO

- [ ] **Пересоздать `server-secret` как настоящий Secret-токен** (`sk.` prefix) — перед началом Phase 2 (бэкенд). При создании в Mapbox UI — поставить галочку "Secret access token".
- [ ] **Ротировать все 3 текущих токена** — перед публичным релизом приложения / подключением биллинга (значения попадали в чат с AI).
- [ ] Перенос ownership Mapbox account на team-аккаунт (когда юр. возможно)
- [ ] Добавить Android SHA-256 fingerprint в restrictions `dev-public` и `prod-public` после `P0-B-01` / `P0-C-01` (когда сгенерируются debug certificates)
- [ ] Выбрать team password manager (1Password / Bitwarden), мигрировать секреты туда
- [ ] IP-restriction на `server-secret` при появлении staging-окружения
- [ ] Календарный reminder на 6-месячную ротацию

---

## Будущие секреты (заглушки)

Здесь будут описаны секреты, которые появятся в следующих фазах:

- **Apple Developer Program** — credentials для App Store deploy (Phase 0 / EAS Build)
- **Google Play Console** — service account JSON для Play Store deploy (Phase 0 / EAS Build)
- **Sentry** — DSN для клиентских ошибок (Phase 2+)
- **OAuth (Apple, Google, Strava, Garmin)** — client_id / client_secret (Phase 2 / 7)
- **Stripe / RevenueCat** — API keys (Phase 10)
- **PostgreSQL / TimescaleDB / ClickHouse / Redis** — connection strings (Phase 2+)
- **JWT signing key** — для Identity service (Phase 2+)

Каждый секрет добавляется в этот файл вместе с задачей, которая его вводит.
