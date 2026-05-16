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
| 2024-Q4    | Mapbox token chat | Mapbox public/secret token обсуждался в чате/тикетах до v1.0 territory refactor (pre-public-release era)            | (b)   | **complete** — rotated 2026-05-16 (Plan 02-04); old `dev-public` / `prod-public` / `server-secret` deleted в Mapbox dashboard | `docs/DECISIONS/0006-mapbox-token-incident.md` |
| 2026-05-16 | Gitleaks history scan (`gitleaks detect --log-opts="--all"`, v8.30.1, config `.gitleaks.toml`) | Полный скан истории git на момент завершения 02-03 | (a)+(c) | **0 findings.** Артефакт: `docs/gitleaks-history-scan.json`. Allowlist `.planning/**/*.md` + `.secrets/**` + `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` отработал корректно. | `docs/gitleaks-history-scan.json` |
| 2026-05-16 | TruffleHog history scan (`trufflehog git file://. --config=.trufflehog/config.yaml`, v3.95.3, exclude `.planning/phases/_archive/.*`) | Полный скан истории git с верифицированными детекторами | (a)+(c) | **0 findings (verified).** Артефакт: `docs/trufflehog-history-scan.json` (нормализован в JSON array). | `docs/trufflehog-history-scan.json` |
| 2026-05-16 | Mapbox token rotation (Plan 02-04 / SEC-03+SEC-04) — single-token strategy: 1 shared `sk.` (build/CI) + 1 shared `pk.` (runtime) across prod/staging/dev | Закрытие (b)-class инцидента из строки выше. Новые токены созданы пользователем в Mapbox dashboard (account `iassd`); SOPS `.secrets/{prod,staging,dev}/mapbox.yaml` обновлены через `sops --set` (non-interactive); round-trip decrypt verified; curl smoke против Mapbox styles API → HTTP 200. Per-env split deferred to v1.1 (см. ADR-0006 §Сценарии пересмотра). | (b) closeout | **complete** 2026-05-16 — SOPS write + smoke green; старые `dev-public` / `prod-public` / `server-secret` revoked user'ом в Mapbox dashboard | `docs/DECISIONS/0006-mapbox-token-incident.md` |

**Действия по (b)-class находке (Mapbox pre-v1.0 leak):** **ЗАКРЫТО 2026-05-16** Phase 2 / plan **02-04** (Mapbox dashboard rotation) — ротация public + secret token'ов через Mapbox dashboard, обновление `.secrets/<env>/mapbox.yaml` через SOPS, верификация смока. Старые токены `dev-public` / `prod-public` / `server-secret` удалены пользователем в dashboard.

**Что НЕ делаем (D-12):** не запускаем `git filter-repo` / BFG для удаления токенов из истории. Old токен после ротации становится мёртвым (HTTP 401 на Mapbox API), даже если останется в git history архивных веток.

## Инвентарь токенов (Token Inventory)

### Полный реестр (v1.0)

10 типов секретов в проекте по состоянию на Phase 2 (см. `02-CONTEXT.md` §scout_findings #45). Каждая запись имеет playbook ротации ниже — см. соответствующий `## Rotation Playbook —`.

| #  | Тип секрета                                | Env-var name (или PRIMARY)                          | Где в SOPS                                    | Bundle? | Назначение / Playbook                                           |
| -- | ------------------------------------------ | --------------------------------------------------- | --------------------------------------------- | ------- | --------------------------------------------------------------- |
| 1  | Mapbox `sk.` (CI/build-time SDK)           | `MAPBOX_DOWNLOADS_TOKEN`                            | `.secrets/{dev,staging,prod}/mapbox.yaml`     | ❌ НЕТ   | iOS `pod install` + Android `gradle build` SDK download; см. §Mapbox `sk.` playbook ниже |
| 2  | Mapbox `pk.` (runtime, per-env)            | `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`                   | `.secrets/{dev,staging,prod}/mapbox.yaml`     | ✅ ДА    | Рендер карты в приложении; см. §Mapbox `pk.` playbook            |
| 3  | Postgres password                          | `POSTGRES_PASSWORD` (+ per-service `*_DB_URL`)      | `.secrets/{dev,staging,prod}/shared.yaml`     | ❌ НЕТ   | Auth для Postgres + TimescaleDB; см. §POSTGRES_PASSWORD playbook |
| 4  | JWT signing secret (≥32 байта)             | `IDENTITY_JWT_SECRET`                               | `.secrets/{dev,staging,prod}/shared.yaml`     | ❌ НЕТ   | Подпись/верификация identity JWT; см. §JWT_SECRET playbook       |
| 5  | MinIO root credentials (paired)            | `MINIO_ROOT_USER` + `MINIO_ROOT_PASSWORD`           | `.secrets/{dev,staging,prod}/shared.yaml`     | ❌ НЕТ   | Admin auth для MinIO; см. §MINIO_ROOT_* playbook                 |
| 6  | Expo push access token                     | `EXPO_ACCESS_TOKEN`                                 | `.secrets/{dev,staging,prod}/shared.yaml`     | ❌ НЕТ   | Push-уведомления notifications service (optional); см. §EXPO_ACCESS_TOKEN playbook |
| 7  | Caddy ACME email                           | `CADDY_ACME_EMAIL`                                  | `.secrets/{dev,staging,prod}/shared.yaml`     | ❌ НЕТ   | Let's Encrypt account email — не секрет, но deploy-config; см. §CADDY_ACME_EMAIL playbook |
| 8  | OAuth client secrets (Strava + future)     | `STRAVA_CLIENT_SECRET` (+ Google/Apple deferred)    | `.secrets/{dev,staging,prod}/oauth.yaml`      | ❌ НЕТ   | OAuth confidential client flow; см. §OAuth client secrets playbook |
| 9  | SOPS master key (per dev)                  | `SOPS_AGE_KEY_FILE` → `~/.config/sops/age/keys.txt` | НЕ в SOPS (это сам ключ!)                     | ❌ НЕТ   | Decrypt-key для всех `.secrets/**/*.yaml`; см. §SOPS_AGE_KEY playbook |
| 10 | NATS auth                                   | (NATS_AUTH_TOKEN — deferred v1.1)                   | (deferred — v1.1)                              | ❌ НЕТ   | Auth для NATS брокера; см. §NATS auth playbook (deferred-v1.1 stub) |

> **Канонический store** — SOPS-encrypted `.secrets/{dev,staging,prod}/<group>.yaml`. Локальные dev-копии (`~/.netrc`, `~/.gradle/gradle.properties`, `apps/mobile-rn/.env`) — derived state, sync-from-SOPS не наоборот.

> **Не в SOPS:** SOPS master key (#9) сам по себе — он живёт в `~/.config/sops/age/keys.txt` (плюс 1Password sealed + USB backup per dev). NATS auth (#10) deferred v1.1 — текущее состояние: NATS открыт на Docker-сети без AuthN, acceptable для v1.0 closed-beta.

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

## Rotation Playbook — Mapbox `pk.` token (4 шага)

Запускается при подозрении на утечку (попадание `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` в чат / git history / EAS Build logs / screenshot бандла), **или** по плановому графику (раз в 6 месяцев — fallback per RESEARCH Pitfall 9), **или** при смене Bundle ID / SHA-256 fingerprint (например, новый release keystore).

`pk.` тоже public, но утечка → возможность злоупотребления квотой нашего Mapbox-аккаунта со стороны. **Per-env separation** (prod / staging / dev) изолирует blast radius.

### Шаг 1. Создать новый `pk.` в Mapbox dashboard

1. Открыть https://account.mapbox.com/access-tokens (sign in: `iassd` / `dragon2015516@gmail.com`).
2. **Create a token**. Имя: `sport-mobile-runtime-pk-{prod|staging|dev}-<YYYY-MM>`.
3. **НЕ ставить** галочку «Secret access token» — иначе префикс будет `sk.`, а нам нужен public.
4. Scopes: только `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ`. **НЕ добавлять** `OFFLINE:READ` / `TILESETS:READ` / `DOWNLOADS:READ` (secret-scopes сломаны на public-токене — урок P0-A-01).
5. **Restrictions** (см. ADR-0006 §Митигации):
   - **(A) Available**: iOS Bundle ID `com.runningecosystem.mobile` + Android SHA-256 fingerprint (debug + production keystores).
   - **(B) Partial**: применить доступный subset.
   - **(C) Unavailable**: оставить без restrictions, полагаясь на scope minimization + 6-month rotation schedule (auto-tracked в §«История ротаций»).
6. **Create token** → скопировать `pk.…` (показывается **один раз**).

### Шаг 2. Обновить SOPS

```bash
EDITOR=vim sops .secrets/<env>/mapbox.yaml
# Под ключом EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: вставить новое pk. значение, save.
```

См. `docs/RUNBOOKS/sops-edit.md` §2 «Edit existing encrypted file».

### Шаг 3. Deploy

См. `docs/RUNBOOKS/sops-edit.md` §9 «Deploy sequence (SCP-based prod deploy)». Для mobile-side EAS Build (Phase 11/12 deferred) — env-var inject через `eas secret:create`.

### Шаг 4. Validation

```bash
PK_NEW=$(sops -d --extract '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"]' .secrets/<env>/mapbox.yaml)
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=$PK_NEW"
unset PK_NEW
# Expected: 200 (или 403 если применена Bundle ID restriction — это SUCCESS, не failure:
# curl делает запрос не из бандла, поэтому Bundle ID-restricted токен 403'ится — то и нужно).
```

После validation — **revoke старый `pk.`** в dashboard (`Delete` button); дописать запись в §«История ротаций» (дата, кто, причина).

---

## Rotation Playbook — POSTGRES_PASSWORD (4 шага)

Запускается при подозрении на утечку (попадание в чат / log / dump) **или** по плановому графику (раз в 12 месяцев) **или** при увольнении dev'а, имевшего SSH-доступ к VPS.

### Шаг 1. Создать новый пароль

```bash
# Сгенерировать 32-byte random (base64-safe):
NEW_PG_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)
# НЕ echo $NEW_PG_PASSWORD — сразу пайпить в next step.
```

### Шаг 2. Обновить Postgres через `ALTER USER`

```bash
# На VPS (или через SSH tunnel):
psql -h <pg-host> -U postgres -d postgres \
  -c "ALTER USER sport_app WITH PASSWORD '$NEW_PG_PASSWORD';"
```

⚠️ **НЕ** запускать с `-W` (prompt-for-password) или с `PGPASSWORD=` в shell history — sensitive. Использовать `~/.pgpass` file (mode 600) для auth.

### Шаг 3. Обновить SOPS

```bash
EDITOR=vim sops .secrets/prod/shared.yaml
# Под POSTGRES_PASSWORD: вставить $NEW_PG_PASSWORD значение.
# Если per-service *_DB_URL содержит пароль (postgres://user:PWD@host/db) —
# обновить и эти ключи (IDENTITY_DB_URL, FEED_DB_URL, ...).
```

См. `docs/RUNBOOKS/sops-edit.md` §2.

Не забыть `unset NEW_PG_PASSWORD` после успешного SOPS-write.

### Шаг 4. Deploy + validation

```bash
# Deploy per docs/RUNBOOKS/sops-edit.md §9.
# Validation — каждый Go-сервис должен переподключиться к Postgres с новым паролем:
ssh deploy@<vps> 'docker logs sport_identity 2>&1 | tail -20 | grep "db connected"'
# Если видим "db connected" — миграция прошла.
# Если "password authentication failed" — откатиться (psql ALTER USER на старый пароль)
# и debug.
```

После validation — **отозвать старый пароль** (Postgres не имеет revoke per se; `ALTER USER` уже заменил его). Записать в §«История ротаций».

---

## Rotation Playbook — JWT_SECRET (4 шага)

Запускается при подозрении на утечку **или** по плановому графику (раз в 12 месяцев).

⚠️ **Последствие ротации:** все signed JWTs становятся invalid → все mobile-users re-login forced (refresh tokens не работают, потому что Identity service не сможет verify их подпись).

### Шаг 1. Сгенерировать новый ≥32-байтный secret

```bash
# 32 bytes (64 hex chars) — минимум по pkg/auth/jwt.go:43-46 (≥32 bytes):
NEW_JWT_SECRET=$(openssl rand -hex 32)
```

### Шаг 2. Обновить SOPS

```bash
EDITOR=vim sops .secrets/prod/shared.yaml
# Под IDENTITY_JWT_SECRET: вставить $NEW_JWT_SECRET значение.
```

См. `docs/RUNBOOKS/sops-edit.md` §2. `unset NEW_JWT_SECRET` после.

### Шаг 3. Deploy

См. `docs/RUNBOOKS/sops-edit.md` §9. **Координация:** все 8 backend-сервисов используют тот же `IDENTITY_JWT_SECRET` для verify (см. PATTERNS.md per-service migration list) — deploy ВСЕХ сервисов одновременно во избежание split-state (часть сервисов на старом secret, часть на новом → JWT verification fail случайным образом).

### Шаг 4. Validation

```bash
# Smoke: запросить /auth/request-code → /auth/verify-code → получить access token →
# обратиться к protected endpoint (например, /api/v1/me):
curl -sS -X POST https://<api>/auth/request-code -d '{"email":"smoke@example.com"}'
# затем verify-code, затем authenticated /me request.
# Если /me возвращает 200 — новый JWT_SECRET работает.
# Если 401 на любом сервисе — split-state; redeploy всех сразу.
```

После validation — **forced logout всех users** (frontend получит 401 от /me на старом access token; refresh-token flow вернёт 401 от refresh endpoint; user перенаправляется на login screen). Записать в §«История ротаций».

---

## Rotation Playbook — MINIO_ROOT_USER + MINIO_ROOT_PASSWORD (paired, 5 шагов)

Запускается при подозрении на утечку **или** по плановому графику (раз в 12 месяцев). **Paired rotation** — обе credentials меняются вместе (одно без другого не имеет смысла).

### Шаг 1. Сгенерировать новые credentials

```bash
NEW_MINIO_USER="sport_minio_$(openssl rand -hex 4)"     # e.g., sport_minio_a3f9
NEW_MINIO_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)
```

### Шаг 2. Обновить MinIO

**Вариант A — MinIO admin API** (preferred, no downtime):

```bash
# Подключиться существующим mc (MinIO Client) к серверу:
mc alias set sport-minio https://<minio-host> <OLD_USER> <OLD_PASSWORD>
# Создать новый root-like service-account:
mc admin user add sport-minio "$NEW_MINIO_USER" "$NEW_MINIO_PASSWORD"
mc admin policy attach sport-minio consoleAdmin --user "$NEW_MINIO_USER"
# Verify новый user работает:
mc alias set sport-minio-new https://<minio-host> "$NEW_MINIO_USER" "$NEW_MINIO_PASSWORD"
mc admin info sport-minio-new
# Только после verify — удалить старого:
mc admin user remove sport-minio <OLD_USER>
```

**Вариант B — Container restart** (downtime ~30s):

```bash
# Обновить SOPS (Шаг 3 ниже), затем:
docker-compose -f services/backend/docker-compose.prod.yml \
  --env-file /run/sport.env restart minio
# При restart MinIO видит новые MINIO_ROOT_USER + MINIO_ROOT_PASSWORD env-vars и пересоздаёт root user.
```

⚠️ **Внимание:** при варианте B существующие presigned URLs (S3 signed URLs для media uploads) остаются валидными до их истечения (Media service использует presigned URLs с 15-min TTL — Phase 8/Media). Не вызывает массового re-auth для пользователей.

### Шаг 3. Обновить SOPS

```bash
EDITOR=vim sops .secrets/prod/shared.yaml
# Под MINIO_ROOT_USER: $NEW_MINIO_USER
# Под MINIO_ROOT_PASSWORD: $NEW_MINIO_PASSWORD
```

### Шаг 4. Deploy + validation

```bash
# Deploy per docs/RUNBOOKS/sops-edit.md §9.
# Validation — Media service должен переподключиться к MinIO:
ssh deploy@<vps> 'docker logs sport_media 2>&1 | tail -20 | grep -i "minio\|s3"'
# "S3 client initialized" / "bucket exists" — миграция прошла.
```

### Шаг 5. `unset` shell-variables

```bash
unset NEW_MINIO_USER NEW_MINIO_PASSWORD
history -d $(history 1 | awk '{print $1}')  # delete last history entry (mc alias set ...)
```

Записать в §«История ротаций» (одна строка, **без значений**: «MINIO root creds rotated, paired»).

---

## Rotation Playbook — EXPO_ACCESS_TOKEN (4 шага)

Запускается при подозрении на утечку (попадание в чат / GitHub Actions log) **или** по плановому графику (раз в 12 месяцев) **или** при смене Expo organization owner'а.

⚠️ **Optional secret:** notifications service использует `${EXPO_ACCESS_TOKEN:-}` (empty default) — сервис стартует и без него (push fanout = no-op). Ротация не блокирует deploy.

### Шаг 1. Регенерировать в Expo dashboard

1. Открыть https://expo.dev/accounts/<org>/settings/access-tokens.
2. **Revoke** старый token (если виден).
3. **Create new token**. Имя: `sport-notifications-push-<YYYY-MM>`. Scope: project access (наш Expo project).
4. Скопировать новое значение (показывается один раз).

### Шаг 2. Обновить SOPS

```bash
EDITOR=vim sops .secrets/prod/shared.yaml
# Под EXPO_ACCESS_TOKEN: вставить новое значение.
```

См. `docs/RUNBOOKS/sops-edit.md` §2.

### Шаг 3. Deploy

См. `docs/RUNBOOKS/sops-edit.md` §9. notifications service подхватит новый токен на restart.

### Шаг 4. Validation

```bash
# Trigger тестового push-уведомления (через admin UI или dev script):
ssh deploy@<vps> 'docker logs sport_notifications 2>&1 | tail -20 | grep -i "push\|expo"'
# "push fanout: 1 sent" — токен работает.
# "expo: 401 unauthorized" — токен сломан, откатиться.
```

Записать в §«История ротаций».

---

## Rotation Playbook — CADDY_ACME_EMAIL (3 шага)

⚠️ **Не секрет, deploy-config.** CADDY_ACME_EMAIL — email-адрес для Let's Encrypt account (`tos: agreed`). Меняется при смене ops-owner'а. Playbook здесь для целостности процесса (per RESEARCH §Open Q1 — annotate "deploy config, not a secret per se").

### Шаг 1. Подтвердить новый email

Запросить у нового ops-owner'а email-адрес, который согласен принимать Let's Encrypt expiration alerts (за ~14 дней до cert expiry).

### Шаг 2. Обновить SOPS

```bash
EDITOR=vim sops .secrets/prod/shared.yaml
# Под CADDY_ACME_EMAIL: новый адрес.
```

См. `docs/RUNBOOKS/sops-edit.md` §2.

### Шаг 3. Deploy + validation

См. `docs/RUNBOOKS/sops-edit.md` §9. Caddy перезагрузит ACME account на email change (NO cert re-issue — связь между Let's Encrypt account и outstanding certs сохраняется).

```bash
ssh deploy@<vps> 'docker logs sport_caddy 2>&1 | tail -20 | grep -i "acme\|tls\|email"'
# "ACME email updated" или silent success — обновление прошло.
```

Записать в §«История ротаций».

---

## Rotation Playbook — OAuth client secrets (4 шага)

Покрывает: **STRAVA_CLIENT_SECRET** (HEALTH-04, Phase 11/12 active integration) + **GOOGLE_OAUTH_CLIENT_SECRET** + **APPLE_SIGN_IN_CLIENT_SECRET** (deferred v1.1+ per ADR-0003 / HEALTH-01..03).

Запускается при подозрении на утечку **или** при смене OAuth provider credentials (например, Strava требует ротации при изменении redirect URI).

### Шаг 1. Регенерировать в OAuth provider dashboard

**Strava** (active в Phase 11/12):
1. Открыть https://www.strava.com/settings/api.
2. **Reset Client Secret** (генерирует новое значение, инвалидирует старое immediately).
3. Скопировать новое `Client Secret`.

**Google** (deferred v1.1):
1. Открыть Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.
2. **Reset Client Secret** на нашем OAuth client.
3. Скопировать.

**Apple Sign In** (deferred v1.1):
1. Apple Developer → Certificates, Identifiers & Profiles → Keys.
2. Создать новый Sign In with Apple key (приватный JWT, multi-line!).
3. Скопировать private key file (`.p8`) — **multi-line — special handling per Pitfall 1** (см. `docs/RUNBOOKS/sops-edit.md` §5).

### Шаг 2. Обновить SOPS

```bash
EDITOR=vim sops .secrets/prod/oauth.yaml
# Под соответствующим ключом — вставить новое значение.
# Apple .p8 — multi-line; используйте YAML block scalar (|-) и НЕ декриптуйте
# через --output-type=dotenv (см. Pitfall 1).
```

См. `docs/RUNBOOKS/sops-edit.md` §2.

### Шаг 3. Deploy

См. `docs/RUNBOOKS/sops-edit.md` §9. **Last-mile координация:** sessions, использующие OAuth-link (например, Strava-connected accounts), сохраняются — `client_secret` используется только при initial OAuth code-exchange. Existing refresh-tokens продолжают работать.

### Шаг 4. Validation

```bash
# Smoke: trigger новый OAuth flow (например, "Connect Strava" в mobile UI):
# 1. User clicks Connect Strava
# 2. Backend exchanges authorization_code via NEW client_secret
# 3. Если backend получает access_token → ротация прошла.
# 4. Если backend получает "invalid_client" → новый client_secret не подхвачен.
ssh deploy@<vps> 'docker logs sport_identity 2>&1 | tail -20 | grep -i "strava\|oauth"'
```

Записать в §«История ротаций».

---

## Rotation Playbook — SOPS_AGE_KEY (recipient rotation, 5 шагов)

Запускается при:
- Уходе dev'а из проекта (его recipient key больше не должен иметь access).
- Подозрении на компрометацию dev workstation (age private key мог утечь).
- Добавлении нового dev'а или CI-runner'а (Phase 4 wires CI key).
- По плановому графику (раз в 24 месяца — long cycle, потому что age key — long-lived material).

⚠️ **Pitfall 8 trigger:** используйте `sops updatekeys` для **recipient rotation** (re-wrap data-encryption key без изменения value-блоков). НЕ запускайте `sops -r --in-place` (полный re-encrypt) — это создаст огромный diff и может стереть значения при ошибке.

### Шаг 1. Сгенерировать новый age key (для нового dev'а или для замены утёкшего)

Новый dev (или affected dev при замене):

```bash
# См. docs/RUNBOOKS/sops-edit.md §1.2:
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt
# Скопировать публичный age1... — передать project owner'у через защищённый канал.
```

### Шаг 2. Обновить `.sops.yaml` recipient list

```bash
$EDITOR .sops.yaml
# Добавить новый age1... ключ в creation_rules / age: array;
# ИЛИ удалить старый ключ (при уходе dev'а или утечке).
```

### Шаг 3. Запустить `sops updatekeys`

```bash
# Re-wrap data-encryption key против нового recipient list ВО ВСЕХ encrypted-файлах:
find .secrets -name '*.yaml' -exec sops updatekeys -y {} \;
```

См. `docs/RUNBOOKS/sops-edit.md` §6.

### Шаг 4. Diff check

```bash
git diff .secrets/
# Должен показать ТОЛЬКО изменения recipient stanzas (раздел `sops:` в конце каждого
# encrypted-файла). НЕ value-блоки. Если каждая enc: строка изменилась — был запущен
# full re-encrypt по ошибке → откатиться (git checkout .secrets/) + повторить с updatekeys.
```

### Шаг 5. Commit + verify-from-new-recipient

```bash
git add .secrets/ .sops.yaml
git commit -m "chore(secrets): rotate SOPS recipients (add/remove <DEV>)"
```

Передать новому recipient'у: попросить запустить `sops -d .secrets/dev/shared.yaml | head -3` — должен вернуть plaintext (не error). Если decrypt-fail — recipient stanza не была обновлена; повторить §3.

### Special case — insider-threat (compromised dev needs FULL revoke)

Для v1.0 closed-beta с 2 devs и без terminations — `sops updatekeys` достаточен. Если в будущем нужен **полный data-key rotation** (например, dev ушёл со злоумышлением, имея доступ к past versions через git history): дополнительно к §3 запустить:

```bash
find .secrets -name '*.yaml' -exec sops --rotate --in-place {} \;
# Это создаст новый data-encryption key для каждого файла → past-versions в git
# по-прежнему decrypt'ятся со старого ключа compromised-dev, но любой commit ПОСЛЕ
# rotation defeats his decrypt.
```

⚠️ Это **destructive** — past plaintext через git history всё равно доступен compromised-dev'у. Полный response = ротация ВСЕХ затронутых секретов (Postgres, JWT, MinIO, OAuth — каждый по своему playbook'у) + revoke его SSH key на VPS.

Записать в §«История ротаций».

---

## Rotation Playbook — NATS auth (deferred v1.1)

**Статус:** Out of scope — v1.1.

**Текущее состояние (v1.0 closed-beta):** NATS-брокер открыт на Docker network (`docker-compose.prod.yml` service `nats`) без AuthN. Internal-only доступность через Docker network принята для v1.0 single-VPS deploy (RESEARCH §«Architectural Responsibility Map» + CONTEXT D-20).

**Чем закрыта attack surface (v1.0):**
- Docker network isolation — NATS не expose'нут наружу VPS (no `ports:` mapping в compose).
- Firewall на VPS уровне (`ufw` / `iptables`) — внешние подключения к Docker internal IP заблокированы.
- Все 8 backend-сервисов на той же VPS — нет cross-VPS NATS-трафика для перехвата.

**Когда reactivate playbook (v1.1 triggers):**
- Multi-region deploy lands (NATS-трафик идёт через WAN).
- Любой сервис уезжает с единого VPS (cross-host NATS).
- Public NATS endpoint появляется (для third-party integrations).

**Шаги playbook'а (v1.1, скетч для будущего себя):**
1. Сгенерировать NATS auth token (`openssl rand -base64 32`) **или** NATS NKey/user JWT (см. nats-server `auth` config).
2. Обновить `.secrets/{dev,staging,prod}/shared.yaml` под новым ключом `NATS_AUTH_TOKEN`.
3. Обновить `services/backend/nats.conf` с `authorization: { token: "$NATS_AUTH_TOKEN" }`.
4. Обновить ВСЕ Go-сервисы: `nats.Connect(url, nats.Token("$NATS_AUTH_TOKEN"))`.
5. Deploy ВСЕХ сервисов одновременно (split-state = service-bus down).
6. Validation: проверить, что producers + consumers всех 8 сервисов подключаются успешно.

**Сейчас (v1.0):** ничего не делать; NATS работает как unauth'd internal bus. Если в Phase 21 soak surfaces что-то требующее изоляции — flag в Incident Log + создать v1.1 phase для NATS auth migration.

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
