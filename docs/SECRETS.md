# SECRETS

Описание секретов проекта Running Ecosystem: какие есть, как получены, где хранятся, кто имеет доступ.

> ⛔ **В этом файле нет реальных значений токенов.** Только метаданные. Реальные значения — в локальном `~/.netrc` / `.env` каждого разработчика (или в team password manager, когда выберем).

---

## Mapbox

### Account

- **Тип:** личный аккаунт владельца проекта
  - 🔄 TODO: мигрировать на team-аккаунт когда появится финансирование / юр. лицо. Влияет на передачу ownership и единый биллинг.
- **Email владельца:** `dragon2015516@gmail.com`
- **Mapbox username:** `iassd` (публичная часть, видна в любом access-токене этого аккаунта)
- **Dashboard:** https://account.mapbox.com/

### Access tokens

| Имя              | Фактический тип | Должен быть | Scopes                                                            | Restrictions                                                              | Где используется                                                                                |
|------------------|-----------------|-------------|-------------------------------------------------------------------|---------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| ~~`dev-public`~~ | ~~Public (`pk.…`)~~ | — | ❌ **сломан** — добавлен `OFFLINE:READ`, который не разрешён на public token. Style API возвращает 200, но Tiles API → 403. | — | ⛔ **Не используется.** TODO: revoke в дашборде. |
| `dev-public-v2`  | Public (`pk.…`) ✅ | Public | Только дефолтные: `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ` | (без restrictions для теста; добавить SHA-256 + Bundle ID после успешного runtime) | RN/Flutter runtime: рендер карты в приложении (`MAPBOX_ACCESS_TOKEN` через `.env`)              |
| `prod-public`    | Public (`pk.…`) | Public      | `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `OFFLINE:READ`, `TILES:READ` (⚠️ возможно тоже сломан, проверить перед prod) | iOS Bundle ID: `com.runningecosystem.mobile`<br>Android SHA-256 (debug.keystore владельца): `B3:63:9A:C1:B7:D4:53:74:BF:A6:26:3C:C4:F5:99:6E:BA:C2:87:3E:DC:CA:9E:FB:27:A0:5D:7F:1F:C5:3D:24` | Production-сборки (в Phase 0 не используется; перед использованием — проверить через curl /tiles/) |
| `server-secret`  | ⚠️ Public (`pk.…`) — **ОШИБКА, пересоздать как Secret** | Secret (`sk.…`) | `STYLES:READ`, `TILESETS:READ`, `DATASETS:READ`                    | (нет — добавить IP-restriction когда появится staging)                    | Серверные вызовы Static Maps / Directions (Phase 2+)                                            |
| `dev-downloads`  | Secret (`sk.…`) ✅ | Secret      | `DOWNLOADS:READ`                                                  | (нет — secret token, доступен только после auth)                          | Скачивание Mapbox SDK при `pod install` (iOS) и `gradle build` (Android). Хранится в `~/.netrc` |

> Default public token из аккаунта **не использовать** — он не ограничен Bundle ID и его сложнее ротировать.

### ⚠️ Известные проблемы текущего стейта

1. **`dev-public` (первый) сломан и должен быть revoke'нут.** При создании ему добавили `OFFLINE:READ` scope — этот scope доступен только на secret-токенах (`sk.…`). Mapbox принимает токен на Style API (200), но на Tiles API возвращает 403 — карта рендерится белым фоном. Замена: `dev-public-v2` создан с дефолтными scopes (`STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ`) и **проверен через curl на /tiles/ → 200**.

2. **`server-secret` создан как public.** Префикс `pk.` означает public access token. Secret-токен Mapbox имеет префикс `sk.` и создаётся через UI с галочкой "Secret access token" — её и нужно поставить при пересоздании. Не критично для Phase 0 (серверные вызовы появятся только в Phase 2+), но **надо пересоздать перед началом работ по бэкенду**.

3. **`prod-public` создан с теми же кривыми scopes что и старый `dev-public`.** Скорее всего тоже сломан на /tiles/. Перед production-сборкой — проверить через curl, и если 403 — пересоздать с дефолтными scopes.

4. **Все 5 токенов однажды попали в чат с AI-ассистентом** (на этапе создания P0-A-01, `P0-B-01` netrc setup, и при диагностике 403 в P0-B-02). Для Phase 0 dev-работы не критично, но:
   - 🔒 Перед публичным релизом приложения и/или подключением биллинговой карты — **ротировать все токены** (revoke + создать новые в Mapbox dashboard).
   - 🔒 До тех пор не ставить эти токены на production-сборку.

### Verification

Smoke-test через Mapbox Styles API (выполнен 2026-05-06, P0-A-01):
```
curl "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=<token>"
```
Результат:
- `dev-public` → HTTP 200 ✅
- `prod-public` → HTTP 200 ✅
- `server-secret` → HTTP 200 ✅ (ожидаемо, потому что фактически он public)

Smoke-test download token (выполнен 2026-05-06, при настройке `~/.netrc`):
- `dev-downloads` → проверен через `expo prebuild --platform android` (P0-B-01): успешно, gradle.properties записан с placeholder `$RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (значение подставляется из env при runtime, в файл не утекает) ✅

> Важно: smoke-test через `curl` **не проверяет** iOS Bundle ID restriction — Mapbox restrictions enforced only внутри SDK через специфические заголовки. Для проверки restriction нужна реальная мобильная сборка с правильным/неправильным Bundle ID — это сделается в `P0-B-02` / `P0-C-02`.

### Стандартный стиль карты для Phase 0

Используется стандартный стиль Mapbox Outdoors v12:
```
mapbox://styles/mapbox/outdoors-v12
```

Кастомный стиль (`P0-A-02`) отложен на Phase 1.

### Как настроить окружение (новый разработчик)

1. **Запросить токены** у владельца Mapbox-аккаунта через защищённый канал (Signal / Telegram secret chat / 1Password share):
   - `dev-public` — рантайм-токен для рендера карты
   - `dev-downloads` — для CocoaPods/Gradle (только `DOWNLOADS:READ`)

2. **Настроить `~/.netrc`** для `pod install` (iOS) и `gradle build` (Android):
   ```bash
   cat >> ~/.netrc <<'EOF'
   machine api.mapbox.com
     login mapbox
     password sk.<dev-downloads_token>
   EOF
   chmod 600 ~/.netrc
   ```

3. **Экспортировать env variable** для Expo prebuild:
   ```bash
   # В ~/.zshrc или per-session:
   export RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.<dev-downloads_token>
   ```

4. **Создать локальные `.env`-файлы** в проектах из `.env.example`:
   ```bash
   cd apps/mobile-rn && cp .env.example .env
   # Открыть .env, подставить значение dev-public в EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN

   cd apps/mobile_flutter && cp .env.example .env
   # Подставить dev-public в MAPBOX_ACCESS_TOKEN
   ```

   `.env` находится в `.gitignore` — НИКОГДА не коммитить.

### Ротация

- **Плановая:** раз в 6 месяцев — выпуск новых токенов, старые `revoke` через Mapbox dashboard.
- **Внеплановая:** при уходе разработчика, при подозрении на утечку, при публикации в публичный репозиторий по ошибке.
- 🔄 TODO: настроить календарный reminder на ротацию (Google Calendar / iCal).

### Известные TODO

- [ ] **Revoke старый `dev-public`** (тот что с `OFFLINE:READ`) в Mapbox dashboard — он сломан, не используется.
- [ ] **Пересоздать `prod-public` с дефолтными scopes** (или проверить текущий — если /tiles/ → 200, оставить).
- [ ] **Пересоздать `server-secret` как настоящий Secret-токен** (`sk.` prefix) — перед началом Phase 2 (бэкенд). При создании в Mapbox UI — поставить галочку "Secret access token".
- [ ] **Добавить URL restrictions на `dev-public-v2`** (когда runtime карта подтвердится): iOS Bundle ID `com.runningecosystem.mobile`, Android SHA-256 (см. ниже).
- [ ] **Ротировать все 5 токенов** — перед публичным релизом приложения / подключением биллинга (значения попадали в чат с AI).
- [ ] Перенос ownership Mapbox account на team-аккаунт (когда юр. возможно)
- [ ] Добавить Android SHA-256 fingerprints в restrictions `dev-public` и `prod-public` через Mapbox dashboard:
  - **Debug (этой машины):** SHA1 `CF:4B:EC:94:09:C2:6F:2C:65:27:2A:3A:A2:29:AF:F1:65:8D:B3:DA`, SHA-256 `B3:63:9A:C1:B7:D4:53:74:BF:A6:26:3C:C4:F5:99:6E:BA:C2:87:3E:DC:CA:9E:FB:27:A0:5D:7F:1F:C5:3D:24`
  - Получено через `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
  - 🔄 Когда появится второй разработчик — добавить его debug fingerprint
  - 🔄 Когда будет production release keystore — добавить production fingerprint
- [ ] Выбрать team password manager (1Password / Bitwarden), мигрировать секреты туда
- [ ] IP-restriction на `server-secret` при появлении staging-окружения
- [ ] Календарный reminder на 6-месячную ротацию
- [ ] Для CI (GitHub Actions) — добавить `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` и `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` в repository secrets

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
