# `.secrets/` — SOPS-шифрованные секреты

Все файлы `.secrets/<env>/<group>.yaml` хранятся в git **зашифрованными** через
SOPS + age. Расшифровка — только на машинах, чьи age-публичные ключи
перечислены в `.sops.yaml` (recipients).

## Структура

```
.secrets/
├── README.md                  ← этот файл
├── dev/                       ← локальная разработка (docker-compose dev profile)
│   ├── shared.yaml            ← POSTGRES/JWT/MinIO/Expo/Caddy
│   ├── mapbox.yaml            ← MAPBOX_PUBLIC_TOKEN, MAPBOX_SECRET_TOKEN
│   └── oauth.yaml             ← STRAVA/GOOGLE/APPLE (placeholders в v1.0)
├── staging/                   ← staging-окружение (тот же набор ключей)
│   ├── shared.yaml
│   ├── mapbox.yaml
│   └── oauth.yaml
└── prod/                      ← production VPS (тот же набор ключей)
    ├── shared.yaml
    ├── mapbox.yaml
    └── oauth.yaml
```

## ВНИМАНИЕ — не редактировать YAML напрямую

Прямое редактирование (`vim .secrets/prod/shared.yaml`) **испортит ciphertext**.
Используй только `sops` для редактирования:

```bash
# Обычное редактирование (откроет $EDITOR с расшифрованным contents в /tmp,
# при сохранении SOPS зашифрует обратно поверх файла):
EDITOR=vim sops .secrets/prod/shared.yaml

# Decrypt в stdout (для проверки):
sops -d .secrets/dev/shared.yaml

# Decrypt в .env-формате (для docker-compose --env-file):
sops -d --output-type=dotenv .secrets/dev/shared.yaml > /tmp/dev.env

# Полный runbook появится в `docs/RUNBOOKS/sops-edit.md` (Plan 02-04).
```

## Pending DEV_B recipient

На момент создания (Plan 02-01) в `.sops.yaml` зарегистрирован только
**DEV_A**'s age public key. Когда DEV_B сгенерирует свою пару
(`age-keygen -o ~/.config/sops/age/keys.txt`) и передаст публичный ключ
(`age1...`) out-of-band, нужно:

1. Дописать его в `.sops.yaml` под комментарием `# TODO(DEV_B):`.
2. Выполнить ротацию (non-destructive — пере-обёртка DEK на новый список
   получателей, без re-encrypt плейнтекста):

   ```bash
   sops updatekeys .secrets/dev/*.yaml
   sops updatekeys .secrets/staging/*.yaml
   sops updatekeys .secrets/prod/*.yaml
   ```

3. Закоммитить изменённые `.secrets/**/*.yaml` (метаданные `sops.age.*`
   обновлены, ciphertext значений не тронут).

До этого момента — bus factor 1 (T-02-04). Backup приватного ключа DEV_A
лежит в 1Password sealed + USB (D-04).

## Кто может расшифровать

- **DEV_A** — `age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my`
- **DEV_B** — TODO, не зарегистрирован (см. выше)
- **CI deploy key** — будет добавлен в Phase 4 (deploy automation)

## Verification

```bash
# Smoke-test round-trip (catches Pitfall 1 — dotenv multi-line/$ regressions):
bash services/backend/scripts/secrets/verify_sops_roundtrip.sh --env dev
```
