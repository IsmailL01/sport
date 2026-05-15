# SECRETS

Описание секретов проекта Running Ecosystem: какие есть, как получены, где хранятся, кто имеет доступ, и как ротировать при утечке.

> ⛔ **В этом файле нет реальных значений токенов.** Только метаданные. Реальные значения — в локальном `~/.netrc` / `~/.gradle/gradle.properties` / `.env` каждого разработчика (или в team password manager, когда выберем).

---

## Incident Log

История инцидентов и сканирований секретов. Любая (b)-класс находка (исторический реальный leak) запускает **ротацию**, а не переписывание истории git (D-12). Каждая запись содержит: дату, тип, описание, классификацию (Pitfall 7 taxonomy: a/b/c), статус, и ссылку на план ротации (если есть).

**Классификация (Pitfall 7):**
- **(a) intentional fixture** — ESLint guard / тестовый fixture, в allowlist scanner'ов
- **(b) historical real leak** — реальный токен в истории, требует ротации (D-12)
- **(c) false positive** — паттерн похож на секрет, но это документация/placeholder, добавляется в allowlist с комментарием

| Дата       | Тип               | Описание                                                                                                           | Класс | Статус                                                            | Ссылка               |
| ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------- | -------------------- |
| 2024-Q4    | Mapbox token chat | Mapbox public/secret token обсуждался в чате/тикетах до v1.0 territory refactor (pre-public-release era)            | (b)   | Pending rotation (Phase 2 / plan 02-04, gated on Mapbox dashboard) | `.planning/phases/02-secrets-and-config-hardening/02-04-PLAN-*.md` (TBD) |
| 2026-05-16 | Gitleaks history scan (`gitleaks detect --log-opts="--all"`, v8.30.1, config `.gitleaks.toml`) | Полный скан истории git на момент завершения 02-03 | (a)+(c) | **0 findings.** Артефакт: `docs/gitleaks-history-scan.json`. Allowlist `.planning/**/*.md` + `.secrets/**` + `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` отработал корректно. | `docs/gitleaks-history-scan.json` |
| 2026-05-16 | TruffleHog history scan (`trufflehog git file://. --config=.trufflehog/config.yaml`, v3.95.3, exclude `.planning/phases/_archive/.*`) | Полный скан истории git с верифицированными детекторами | (a)+(c) | **0 findings (verified).** Артефакт: `docs/trufflehog-history-scan.json` (нормализован в JSON array). | `docs/trufflehog-history-scan.json` |

**Действия по (b)-class находке (Mapbox pre-v1.0 leak):** Phase 2 / plan **02-04** (Mapbox dashboard rotation) — ротация public + secret token'ов через Mapbox dashboard, обновление `.secrets/<env>/mapbox.yaml` через SOPS (см. 02-01-SUMMARY.md scaffold), верификация в приложении и backend. Этот шаг `autonomous: false` — gated на ручное действие пользователя в Mapbox dashboard.

**Что НЕ делаем (D-12):** не запускаем `git filter-repo` / BFG для удаления токенов из истории. Old токен после ротации становится мёртвым (HTTP 401 на Mapbox API), даже если останется в git history архивных веток.

## Инвентарь токенов (Token Inventory)

### Mapbox

Проект использует **два класса Mapbox-токенов**. Различать их критично — путаница приводила к утечкам в Phase 0.

| Переменная окружения             | Тип (prefix) | Где живёт                                                                  | Bundle?       | Назначение                                                          |
|---------------------------------|--------------|----------------------------------------------------------------------------|---------------|---------------------------------------------------------------------|
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | Public (`pk.`) | `apps/mobile-rn/.env` (локально); попадает в JS-бандл через Metro          | ✅ ДА          | Рендер карты в приложении (`MapboxView`), Style/Tile/Fonts API      |
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`    | Secret (`sk.`) | `~/.netrc` (iOS Pods) + `~/.gradle/gradle.properties` (Android Gradle)     | ❌ **НЕТ**     | Build-time: скачивание Mapbox SDK при `pod install` и `gradle build` |

### Классификация (Classification rules)

**`pk.…` (public, bundle-safe):**
- Безопасен для бандла **только если** в Mapbox dashboard на токен повешены restrictions:
  - iOS Bundle ID: `com.runningecosystem.mobile`
  - Android SHA-256 fingerprint (debug keystore + production keystore — отдельные fingerprints)
- Без restrictions `pk.` теоретически тоже public, но утечка → возможность злоупотребления квотой нашего аккаунта со стороны.
- Scopes: только `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ` (дефолтные). **НЕ добавлять `OFFLINE:READ` / `TILESETS:READ` / `DOWNLOADS:READ` — это secret-scopes, на public-токене не работают** (см. P0-A-01 урок).

**`sk.…` (secret, build-time only):**
- НИКОГДА не попадает в JS-бандл. НИКОГДА не присваивается переменной с префиксом `EXPO_PUBLIC_*`.
- Хранится только в build-окружении разработчика:
  - **iOS:** `~/.netrc` (mode 600). CocoaPods `pod install` авторизуется через `~/.netrc` на `api.mapbox.com`.
  - **Android:** `~/.gradle/gradle.properties` (mode 600, **в `$HOME`, не в репозитории!**). Gradle подхватывает `MAPBOX_DOWNLOADS_TOKEN` из user-level gradle.properties.
- Scope: `DOWNLOADS:READ` для скачивания SDK; либо нужные серверные scopes (`TILESETS:READ`, `DATASETS:READ`) для backend-вызовов в Phase 2+.

**Правило:** Любой токен, классифицированный неправильно (например, `pk.` помечен «server-secret», или `sk.` случайно попал в `EXPO_PUBLIC_*`), считается **скомпрометированным** и подлежит немедленной ротации по playbook ниже.

---

## Rotation Playbook — Mapbox `sk.` token (4 шага, D-32)

Запускается при подозрении на утечку (попадание в чат, git history, issue, скриншот) **или** по плановому графику (раз в 6 месяцев).

### Шаг 1. Сгенерировать новый `sk.` в Mapbox dashboard

1. Открыть https://account.mapbox.com/access-tokens (sign in: владелец проекта, аккаунт `iassd` / `dragon2015516@gmail.com`).
2. **Create a token**. Имя: `sport-mobile-build-sk` (или с датой: `sport-mobile-build-sk-2026-05`).
3. Поставить галочку **«Secret access token»** — без неё префикс будет `pk.`, а значит токен НЕ secret (см. известную ошибку с `server-secret` ниже).
4. Scopes: `DOWNLOADS:READ` (обязательно для SDK download), `STYLES:READ`, `FONTS:READ`, `TILES:READ`, `DATASETS:LIST`, `DATASETS:READ` (для будущих серверных вызовов).
5. URL restrictions: пропустить (мобильные сборки идут через Bundle ID, не через URL).
6. **Create token** → скопировать `sk.…` (показывается **один раз**, после закрытия диалога восстановить нельзя).

Если требуется также новый `pk.` (например, старый pk. тоже скомпрометирован):
- Повторить шаги 1-4, **без** галочки «Secret access token».
- Scopes: только `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ`.
- **Restrictions (обязательно для public-токена):**
  - iOS Bundle ID: `com.runningecosystem.mobile`
  - Android SHA-256: см. fingerprint в разделе «TODO» ниже (debug + production).

### Шаг 2. Удалить старый утёкший токен

В Mapbox dashboard → списка access tokens:
- Найти старый `pk.` или `sk.`, помеченный как утёкший (например, `server-secret`, который ошибочно был `pk.`).
- **Кнопка «Delete»** → подтвердить.
- ⚠️ Удалять только **после** того, как новый токен подтверждён рабочим в dev-сборке (Шаг 4). Не оставлять оба активных одновременно дольше, чем нужно для проверки.

### Шаг 3. Сохранить новый `sk.` локально

**iOS — `~/.netrc`:**

```bash
# Открыть или создать файл:
nano ~/.netrc
# Добавить (или обновить существующую запись для api.mapbox.com):
```

```
machine api.mapbox.com
  login mapbox
  password sk.<новый-токен-сюда>
```

```bash
chmod 600 ~/.netrc
```

**Android — `~/.gradle/gradle.properties` (НЕ `apps/mobile-rn/android/gradle.properties` — этот файл в репозитории!):**

```bash
nano ~/.gradle/gradle.properties
```

Добавить или обновить:
```
MAPBOX_DOWNLOADS_TOKEN=sk.<новый-токен-сюда>
```

```bash
chmod 600 ~/.gradle/gradle.properties
```

**Для Expo prebuild** (если нужно подставить `$RNMAPBOX_MAPS_DOWNLOAD_TOKEN` в `app.json` plugin config):
```bash
# В ~/.zshrc или per-session:
export RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.<новый-токен-сюда>
```

⛔ **НИКОГДА не писать `sk.` в:**
- `apps/mobile-rn/.env` (под `EXPO_PUBLIC_*` или любым другим именем — `.env` уходит в bundle через Metro).
- `apps/mobile-rn/android/gradle.properties` (в репозитории).
- Любой `*.tsx`/`*.ts`/`*.js` файл (даже как литерал — ESLint guard поймает, см. ниже).
- Чат / Issue / Slack / Telegram (даже в DM — ассистенты и пересылки могут утечь).

### Шаг 4. Пересобрать и проверить

```bash
# iOS:
cd apps/mobile-rn/ios
pod deintegrate && pod install
# должен пройти без 401 от api.mapbox.com — это и есть проверка нового sk.

# Android:
cd apps/mobile-rn/android
./gradlew :app:clean :app:assembleDebug
# должен собраться без ошибки авторизации на скачивании Mapbox SDK
```

Затем:
1. Запустить dev-build на реальном устройстве.
2. Открыть экран с картой → тайлы должны грузиться (это проверка `pk.` runtime-токена).
3. Только **после успеха** п.1-2 — вернуться к Шагу 2 и удалить старый утёкший токен (если ещё не удалён).
4. Дописать запись в раздел «Rotation Log» внизу этого файла: дата, кто ротировал, причина (одна строка, **без значений токенов**).

---

## Storage Rules (правила хранения)

| Где                                            | Что лежит                                                                                  | Mode | В репо? |
|------------------------------------------------|---------------------------------------------------------------------------------------------|------|---------|
| `~/.netrc`                                     | Mapbox `sk.` через `machine api.mapbox.com / login mapbox / password sk.…`                  | 600  | ❌       |
| `~/.gradle/gradle.properties`                  | `MAPBOX_DOWNLOADS_TOKEN=sk.…`                                                               | 600  | ❌       |
| `apps/mobile-rn/.env` (per-developer)          | `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.…` (public, OK to live в `.env`)                        | -    | ❌ (в `.gitignore`) |
| `apps/mobile-rn/.env.example`                  | Только placeholder'ы (`pk.xxx`, `sk.replace-via-...`), без реальных значений                | -    | ✅      |
| `apps/mobile-rn/android/gradle.properties`     | **Не для секретов.** Только non-secret build flags.                                          | -    | ✅      |

Правила:
- `~/.netrc` и `~/.gradle/gradle.properties` **должны иметь mode 600** (`chmod 600 <file>`), иначе CocoaPods / Gradle игнорируют файл из соображений безопасности.
- `.env` файлы **в репо**: только `EXPO_PUBLIC_*` и другие public-переменные. **НИКОГДА не добавлять ключ с суффиксом `_SECRET`** — ESLint guard (см. ниже) и code review должны это блокировать.
- При новом разработчике: запрос токенов идёт через защищённый канал (Signal / Telegram secret chat / 1Password share — когда появится).

---

## Incident Response (что делать при обнаружении утечки)

**Триггеры:**
- Токен попал в чат с AI-ассистентом / Slack / Telegram / Issue / pull request.
- Токен найден в git history (через `git log -p | grep -E 'sk\.[A-Za-z0-9_-]{40,}'`).
- Токен опубликован в публичном репозитории по ошибке.
- Mapbox dashboard показывает аномальный traffic-spike на токене.

**Что делать:**
1. **Считать токен скомпрометированным** — независимо от того, public или secret.
2. **Сразу ротировать** по playbook выше (4 шага). Не ждать «удобного момента» — каждая минута увеличивает риск.
3. Проверить логи в Mapbox dashboard за период от последнего гарантированно-чистого момента до ротации: аномальные spikes / requests из неожиданных регионов.
4. Если это второй+ инцидент по одному и тому же типу ошибки (например, повторная утечка `sk.` в чат) — создать ADR в `docs/DECISIONS/` с описанием root cause и process-fix (примеры: pre-commit hook, mandatory chat sanitizer, etc.).
5. Обновить «Rotation Log» внизу — дата, причина (без значений токенов).

**Не делать:**
- Не переписывать git history (`git filter-branch` / BFG) для удаления старого токена. Старый токен уже скомпрометирован, важно его revoke в dashboard — а git history самой по себе не делает токен валидным после revoke.
- Не оставлять старый токен активным «на всякий случай». В playbook есть момент проверки нового — только после неё удалять старый. Двух одновременно активных секретов — это удвоенная атакующая поверхность.

---

## Guard Rails (ESLint guard, PHASE1-13 / D-33)

В `apps/mobile-rn/.eslintrc.json` добавлено правило `no-restricted-syntax` с двумя AST-селекторами:

1. **MemberExpression на `process.env.EXPO_PUBLIC_*_SECRET`:**
   ```
   "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_.*_SECRET$/]"
   ```
   Падает с сообщением: «Secrets must NOT be exposed via EXPO_PUBLIC_* — they ship in the bundle. Use ~/.netrc / ~/.gradle/gradle.properties at build time.»

2. **Literal со значением, начинающимся на `sk.` длиной ≥40 символов** (формат настоящих Mapbox secret-токенов):
   ```
   "Literal[value=/^sk\\.[A-Za-z0-9._-]{40,}/]"
   ```
   Падает с сообщением: «Hard-coded Mapbox sk. secret detected. Move to ~/.netrc / ~/.gradle/gradle.properties.»

Длина `{40,}` нужна, чтобы UI-строки вида `'sk-button'`, `'sk-card'` не давали ложных срабатываний (Pitfall 6 из RESEARCH.md).

**Файл fixture для верификации правила:** `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts`. Содержит обе антипаттерн-строки и исключён из основного lint-прогона через `.eslintignore` (иначе CI падал бы навсегда). Проверка работоспособности правила — отдельный прогон:
```
cd apps/mobile-rn
npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts
# должен выйти с non-zero и оба сообщения должны появиться
```

CI запускает `npm run lint` на каждом PR — любая регрессия (новое `process.env.EXPO_PUBLIC_*_SECRET` или захардкоженный `sk.…`) блокируется на этапе CI.

---

## Аккаунт Mapbox

- **Тип:** личный аккаунт владельца проекта
  - 🔄 TODO: мигрировать на team-аккаунт когда появится финансирование / юр. лицо. Влияет на передачу ownership и единый биллинг.
- **Email владельца:** `dragon2015516@gmail.com`
- **Mapbox username:** `iassd` (публичная часть, видна в любом access-токене этого аккаунта)
- **Dashboard:** https://account.mapbox.com/

---

## Текущий стейт токенов (на 2026-05-14)

| Имя              | Фактический тип | Должен быть | Scopes                                                            | Restrictions                                                              | Где используется                                                                                |
|------------------|-----------------|-------------|-------------------------------------------------------------------|---------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| ~~`dev-public`~~ | ~~Public (`pk.…`)~~ | — | ❌ **сломан** — добавлен `OFFLINE:READ`, который не разрешён на public token. Style API возвращает 200, но Tiles API → 403. | — | ⛔ **Не используется.** TODO: revoke в дашборде. |
| `dev-public-v2`  | Public (`pk.…`) ✅ | Public | Только дефолтные: `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ` | (без restrictions для теста; добавить SHA-256 + Bundle ID после успешного runtime) | RN/Flutter runtime: рендер карты в приложении (`MAPBOX_ACCESS_TOKEN` через `.env`)              |
| `prod-public`    | Public (`pk.…`) | Public      | `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `OFFLINE:READ`, `TILES:READ` (⚠️ возможно тоже сломан, проверить перед prod) | iOS Bundle ID: `com.runningecosystem.mobile`<br>Android SHA-256 (debug.keystore владельца): `B3:63:9A:C1:B7:D4:53:74:BF:A6:26:3C:C4:F5:99:6E:BA:C2:87:3E:DC:CA:9E:FB:27:A0:5D:7F:1F:C5:3D:24` | Production-сборки (в Phase 0 не используется; перед использованием — проверить через curl /tiles/) |
| `server-secret`  | ⚠️ Public (`pk.…`) — **ОШИБКА, пересоздать как Secret через playbook выше** | Secret (`sk.…`) | `STYLES:READ`, `TILESETS:READ`, `DATASETS:READ`                    | (нет — добавить IP-restriction когда появится staging)                    | Серверные вызовы Static Maps / Directions (Phase 2+)                                            |
| `dev-downloads`  | Secret (`sk.…`) ✅ | Secret      | `DOWNLOADS:READ`                                                  | (нет — secret token, доступен только после auth)                          | Скачивание Mapbox SDK при `pod install` (iOS) и `gradle build` (Android). Хранится в `~/.netrc` |

> Default public token из аккаунта **не использовать** — он не ограничен Bundle ID и его сложнее ротировать.

### ⚠️ Известные проблемы текущего стейта

1. **`dev-public` (первый) сломан и должен быть revoke'нут.** При создании ему добавили `OFFLINE:READ` scope — этот scope доступен только на secret-токенах (`sk.…`). Mapbox принимает токен на Style API (200), но на Tiles API возвращает 403 — карта рендерится белым фоном. Замена: `dev-public-v2` создан с дефолтными scopes (`STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ`) и **проверен через curl на /tiles/ → 200**.

2. **`server-secret` создан как public.** Префикс `pk.` означает public access token. Secret-токен Mapbox имеет префикс `sk.` и создаётся через UI с галочкой "Secret access token" — её и нужно поставить при пересоздании. Не критично для Phase 0 (серверные вызовы появятся только в Phase 2+), но **PHASE1-13 закрывает это**: ротация по playbook выше происходит сейчас (как часть закрытия Phase 1).

3. **`prod-public` создан с теми же кривыми scopes что и старый `dev-public`.** Скорее всего тоже сломан на /tiles/. Перед production-сборкой — проверить через curl, и если 403 — пересоздать с дефолтными scopes.

4. **Все 5 токенов однажды попали в чат с AI-ассистентом** (на этапе создания P0-A-01, `P0-B-01` netrc setup, и при диагностике 403 в P0-B-02). Для Phase 0 dev-работы не критично, но:
   - 🔒 PHASE1-13 трактует это как утечку → ротация по playbook выше прямо сейчас (Task 4 этого плана — user action).
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
   - `dev-public-v2` — рантайм-токен для рендера карты (`pk.…`)
   - `dev-downloads` — для CocoaPods/Gradle (только `DOWNLOADS:READ`, `sk.…`)

2. **Настроить `~/.netrc`** для `pod install` (iOS):
   ```bash
   cat >> ~/.netrc <<'EOF'
   machine api.mapbox.com
     login mapbox
     password sk.<dev-downloads_token>
   EOF
   chmod 600 ~/.netrc
   ```

3. **Настроить `~/.gradle/gradle.properties`** для Android Gradle (НЕ файл в репо):
   ```bash
   mkdir -p ~/.gradle
   cat >> ~/.gradle/gradle.properties <<'EOF'
   MAPBOX_DOWNLOADS_TOKEN=sk.<dev-downloads_token>
   EOF
   chmod 600 ~/.gradle/gradle.properties
   ```

4. **Экспортировать env variable** для Expo prebuild:
   ```bash
   # В ~/.zshrc или per-session:
   export RNMAPBOX_MAPS_DOWNLOAD_TOKEN=sk.<dev-downloads_token>
   ```

5. **Создать локальные `.env`-файлы** в проектах из `.env.example`:
   ```bash
   cd apps/mobile-rn && cp .env.example .env
   # Открыть .env, подставить значение dev-public-v2 в EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
   ```

   `.env` находится в `.gitignore` — НИКОГДА не коммитить.

### Известные TODO

- [ ] **Revoke старый `dev-public`** (тот что с `OFFLINE:READ`) в Mapbox dashboard — он сломан, не используется.
- [ ] **Пересоздать `prod-public` с дефолтными scopes** (или проверить текущий — если /tiles/ → 200, оставить).
- [ ] **Пересоздать `server-secret` как настоящий Secret-токен** (`sk.` prefix) — закрывается PHASE1-13 Task 4 (user action). При создании в Mapbox UI — поставить галочку "Secret access token".
- [ ] **Добавить URL restrictions на `dev-public-v2`** (когда runtime карта подтвердится): iOS Bundle ID `com.runningecosystem.mobile`, Android SHA-256 (см. ниже).
- [ ] **Ротировать все 5 токенов** — закрывается PHASE1-13 Task 4 (см. playbook выше).
- [ ] Перенос ownership Mapbox account на team-аккаунт (когда юр. возможно)
- [ ] Добавить Android SHA-256 fingerprints в restrictions `dev-public-v2` и `prod-public` через Mapbox dashboard:
  - **Debug (этой машины):** SHA1 `CF:4B:EC:94:09:C2:6F:2C:65:27:2A:3A:A2:29:AF:F1:65:8D:B3:DA`, SHA-256 `B3:63:9A:C1:B7:D4:53:74:BF:A6:26:3C:C4:F5:99:6E:BA:C2:87:3E:DC:CA:9E:FB:27:A0:5D:7F:1F:C5:3D:24`
  - Получено через `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
  - 🔄 Когда появится второй разработчик — добавить его debug fingerprint
  - 🔄 Когда будет production release keystore — добавить production fingerprint
- [ ] Выбрать team password manager (1Password / Bitwarden), мигрировать секреты туда
- [ ] IP-restriction на `server-secret` при появлении staging-окружения
- [ ] Календарный reminder на 6-месячную ротацию
- [ ] Для CI (GitHub Actions) — добавить `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` и `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` в repository secrets

---

## История ротаций (Rotation Log)

| Дата       | Кто        | Причина / результат                                                   |
|------------|------------|------------------------------------------------------------------------|
| 2026-05-06 | Owner       | Создан `dev-public-v2` (замена сломанного `dev-public` с `OFFLINE:READ`) |
| 2026-05-14 | _pending_   | _PHASE1-13 Task 4: ротация `server-secret` → настоящий `sk.…` + ревью restrictions. Запись будет добавлена после выполнения._ |

---

## Аудит истории на утечки (PHASE1-13 / D-34)

Выполнено 2026-05-14:

```
git grep -nE 'EXPO_PUBLIC_.*_SECRET' -- apps/mobile-rn/ docs/
```
Результат: единственное упоминание — `docs/REVIEW_ROUNDS_1-3.md:22` (review-record прошлой ошибки в `StravaAdapter.ts`, описывающий, что было исправлено). **В runtime-коде упоминаний нет.** Историческая ошибка задокументирована, не лечим переписыванием git history.

```
git grep -nE 'sk\.[A-Za-z0-9_-]{40,}' -- apps/mobile-rn/ docs/
```
Результат: пусто. Реальных `sk.` токенов в репозитории нет (только placeholder'ы в `.env.example`, `*.md` плановых файлах, и fake-token в lint-fixture).

```
git log --all --oneline -- apps/mobile-rn/.env
```
Результат: пусто. Файл `.env` никогда не коммитился (защищён через `.gitignore` с начала проекта).

**Вывод:** исторических утечек реальных `sk.` токенов в git нет. Единственный канал утечки — чат с AI-ассистентом (документировано в Phase 0); митигируется ротацией всех 5 токенов в Task 4 этого плана.

---

## Будущие секреты (заглушки)

Здесь будут описаны секреты, которые появятся в следующих фазах:

- **Apple Developer Program** — credentials для App Store deploy (Phase 0 / EAS Build)
- **Google Play Console** — service account JSON для Play Store deploy (Phase 0 / EAS Build)
- **Sentry** — DSN для клиентских ошибок (Phase 2+)
- **OAuth (Apple, Google, Strava, Garmin)** — client_id (public) + client_secret (через backend-proxy, **никогда** на устройстве — см. R1 из `docs/REVIEW_ROUNDS_1-3.md` + ADR-0003)
- **Stripe / RevenueCat** — API keys (Phase 10)
- **PostgreSQL / TimescaleDB / ClickHouse / Redis** — connection strings (Phase 2+)
- **JWT signing key** — для Identity service (Phase 2+)

Каждый секрет добавляется в этот файл вместе с задачей, которая его вводит.
