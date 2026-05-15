# SOPS Edit / Decrypt / Rotate Workflow

Краткий справочник для команды по работе с SOPS-зашифрованными `.secrets/**/*.yaml`. Перед любой ротацией секрета (см. `docs/SECRETS.md` §«Rotation Playbook»), обязательно работать через эти команды — никогда не редактировать ciphertext вручную.

> ⚠️ **Пререквизиты** — см. §1 «Environment Setup» ниже. Без `~/.config/sops/age/keys.txt` и установленных `sops` + `age` команды `sops` не работают.

> ⛔ **Не коммитить значения секретов** (CLAUDE.md): все примеры ниже используют placeholder'ы (`<value>` / `<new-token>`). НИ ОДНО реальное значение токена/пароля не должно попасть в этот документ, в сообщения коммита, в чат с AI, в issue/PR-описания. SOPS-encrypted в репо — единственное safe место хранения.

> 📌 **Версии (pinned, Phase 2 / SEC-02):**
> - `sops` v3.13.0
> - `age` v1.3.1
> - `.sops.yaml` recipient list — см. файл в корне репо.

---

## 1. Environment Setup

**Когда запускать:** один раз на новом dev-workstation после `git clone`. Идемпотентно — повторный запуск не вредит.

### Шаг 1.1. Установить tools

```bash
# macOS (homebrew):
brew install sops age

# Verify pinned versions:
sops --version    # ожидается: sops 3.13.0
age --version     # ожидается: 1.3.1
```

### Шаг 1.2. Создать age private key (per dev)

```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt
```

Команда выведет публичный ключ вида `age1...` — **сохраните его** для следующего шага.

### Шаг 1.3. Экспортировать `SOPS_AGE_KEY_FILE`

Добавить в `~/.zshrc` (или `~/.bashrc`):

```bash
export SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt
```

Перезагрузить shell: `exec $SHELL`.

### Шаг 1.4. Добавить публичный ключ в `.sops.yaml`

Передать публичный `age1...` ключ owner'у проекта (через защищённый канал — Signal / 1Password share). Owner добавит ключ в `.sops.yaml` recipient list и запустит `sops updatekeys` (см. §6 ниже) — после этого декриптовать `.secrets/**/*.yaml` смогут оба ключа.

### Шаг 1.5. Бэкап ключа (обязательно — Pitfall 4)

Каждый dev обязан иметь **минимум два независимых backup-копии** своего age private key:

1. **1Password sealed entry** — `Running Ecosystem / SOPS age key`. Прикреплён файл `keys.txt` или вложен plain text. Sealed = два-фактор для разблокировки.
2. **Encrypted USB physical backup** — зашифрованный USB-носитель в безопасном физическом месте. Filename: `sport-sops-age-key-<dev>-<date>.txt`.

Без минимум двух recipient'ов в `.sops.yaml` потеря одного ключа = catastrophic (см. §7 «Recovery»).

### Шаг 1.6. Smoke-test decrypt

```bash
sops -d .secrets/dev/shared.yaml | head -3
# Должны увидеть YAML-keys: POSTGRES_PASSWORD, JWT_SECRET, ...
```

Если возвращает `no key could decrypt the data` — проверьте:
- `SOPS_AGE_KEY_FILE` экспортирован и указывает на существующий файл (`echo $SOPS_AGE_KEY_FILE && cat $SOPS_AGE_KEY_FILE | head -1`).
- Публичный ключ из `keys.txt` присутствует в `.sops.yaml` recipient list (после `sops updatekeys` от owner'а).

---

## 2. Edit existing encrypted file

**Когда:** обновить значение существующего ключа в `.secrets/<env>/<group>.yaml` (например, ротация `JWT_SECRET`).

```bash
EDITOR=vim sops .secrets/prod/shared.yaml
```

Что происходит под капотом:
1. SOPS читает зашифрованный файл.
2. Декриптует в временный файл с расширением `.yaml` (для подсветки синтаксиса в editor'е).
3. Открывает editor (`$EDITOR` или vim по умолчанию).
4. После save (`:wq` в vim) — re-encrypt'ит in-place; временный plaintext-файл удаляется.

**Альтернативные editor'ы:**

```bash
EDITOR=nano sops .secrets/prod/shared.yaml      # nano
EDITOR='code --wait' sops .secrets/prod/shared.yaml   # VS Code (флаг --wait критичен!)
```

⚠️ **Не использовать editor'ы, которые форкаются** (без `--wait` или эквивалента) — SOPS вернётся к re-encrypt'у с пустым контентом, потенциально стирая секрет.

---

## 3. Create new encrypted file

**Когда:** добавить новую группу секретов (например, новый сервис со своим набором env-vars).

```bash
EDITOR=vim sops .secrets/prod/<new-group>.yaml
```

SOPS откроет пустой editor (с YAML-comment header). Введите содержимое в plain YAML:

```yaml
NEW_SERVICE_API_KEY: "<replace-via-openssl-rand-hex-32>"
NEW_SERVICE_ENDPOINT: "https://api.example.com"
```

После save — SOPS encrypt'ит весь файл согласно `.sops.yaml` `creation_rules` (path_regex `\.secrets/.*\.yaml$` → age recipient list).

**Альтернатива — programmatic create без editor'а:**

```bash
echo 'NEW_SERVICE_API_KEY: "<value>"' \
  | sops --encrypt --input-type yaml --output-type yaml /dev/stdin \
  > .secrets/prod/new-group.yaml
```

(Используется в скриптах автоматизации — но для интерактивной работы предпочтительнее §2-style edit-on-existing-empty-file.)

---

## 4. Decrypt to stdout (read-only)

**Когда:** прочитать значение в shell для одноразовой проверки. **НЕ для длительного держания plaintext'а в файле.**

```bash
sops -d .secrets/prod/shared.yaml
```

⚠️ **Не пайпить в файл, если не уверены, что path безопасен** — `sops -d ... > /tmp/foo.yaml` оставит plaintext до явного удаления. Если нужно — пайпить в `mktemp` + `trap shred` (см. §9 «Deploy sequence»).

**Извлечь одно значение** (без печати всего файла):

```bash
sops -d --extract '["JWT_SECRET"]' .secrets/prod/shared.yaml
```

В shell-скриптах безопаснее писать сразу в shell-переменную и `unset` после использования:

```bash
VAL=$(sops -d --extract '["JWT_SECRET"]' .secrets/prod/shared.yaml)
# ... use VAL ...
unset VAL
```

---

## 5. Decrypt as dotenv for deploy

**Когда:** деплой на VPS — `docker-compose --env-file` требует формат `KEY=value`.

```bash
sops -d --output-type=dotenv .secrets/prod/shared.yaml > /tmp/.env
```

⚠️ **Pitfall 1 guard (multi-line values + spaces).** Mode `--output-type=dotenv` **strip'ит newlines** из multi-line YAML values, заменяя их на пробелы — это **ломает PEM-сертификаты, P8 ключи и любые multi-line данные**. См. github.com/getsops/sops/issues/{724,784,1435,1951}.

**Текущий inventory (Phase 2)** — все 10 secret-типов single-line opaque strings (passwords, tokens, emails). **БЕЗОПАСНО** для dotenv. См. `02-RESEARCH.md` §Pitfall 1 + §A3 Assumption.

**Если в Phase 10 (iOS distribution P8 certificate) появится multi-line value:**

- НЕ использовать `--output-type=dotenv` для P8.
- Использовать `sops -d` (YAML output) + parse в Go через `os.ReadFile` после write в отдельный файл path.
- Хранить P8 в `.secrets/prod/ios-p8.yaml` (отдельная группа) — НЕ в `shared.yaml`.

**Smoke-test после первого encrypt'а** (рекомендуется):

```bash
sops -d --output-type=dotenv .secrets/dev/shared.yaml > /tmp/test.env
cat /tmp/test.env
# Все KEY=value lines должны быть однострочные, без embedded spaces в value.
shred -u /tmp/test.env  # cleanup
```

---

## 6. Rotate recipients (after `.sops.yaml` edited)

**Когда:**

- Добавлен новый dev (например, DEV_B по TODO в `.sops.yaml`).
- Заменён CI age key (Phase 4).
- Удалён dev из проекта.

⚠️ **Pitfall 8.** Используйте `sops updatekeys` — это **non-destructive** re-wrap data-encryption key против нового recipient list. **НЕ запускайте full re-encrypt** (`sops -r --in-place ...`) если только не удаляете recipient, который **не должен иметь past-access** к older versions encrypted-файла (но для v1.0 closed-beta с 2 devs и без terminations — `updatekeys` is sufficient).

### Шаг 6.1. Отредактировать `.sops.yaml`

```bash
$EDITOR .sops.yaml
# Добавить/удалить age1... ключ в recipient list (раздел `creation_rules` / `age:` array)
```

### Шаг 6.2. Запустить `sops updatekeys` на ВСЕ encrypted-файлы

```bash
find .secrets -name '*.yaml' -exec sops updatekeys -y {} \;
```

Флаг `-y` пропускает interactive confirmation per file.

### Шаг 6.3. Проверить diff

```bash
git diff .secrets/
```

Изменения должны быть **минимальными**: только recipient stanzas (раздел `sops:` в конце каждого YAML), НЕ value-блоки. Если каждая `enc:` строка изменилась — вы случайно запустили full re-encrypt, не `updatekeys`. Откатитесь (`git checkout .secrets/`) и повторите с `updatekeys`.

### Шаг 6.4. Verify, что новый recipient может decrypt

Передать ключи новому recipient'у; попросить запустить `sops -d .secrets/dev/shared.yaml | head -3` — должен вернуть plaintext, не error.

### Шаг 6.5. Commit

```bash
git add .secrets/ .sops.yaml
git commit -m "chore(secrets): rotate SOPS recipients (add DEV_B / remove DEV_X)"
```

---

## 7. Recovery — Lost age key

**Сценарий:** разработчик потерял `~/.config/sops/age/keys.txt` (диск умер, ноутбук украден, etc.) И не имеет backup'а (1Password lockout + USB lost одновременно).

⚠️ **Pitfall 4 trigger:** если потеряны ВСЕ ключи (оба dev'а + CI key), `.secrets/**/*.yaml` становятся unreadable навсегда. **Восстановление через age private key невозможно** (X25519 не имеет recovery без private key).

### Восстановление через backup (preferred)

1. **1Password sealed entry** → найти `Running Ecosystem / SOPS age key` → разблокировать sealed → восстановить `keys.txt` в `~/.config/sops/age/keys.txt`.
2. **Encrypted USB physical backup** → подключить → ввести passphrase → копировать `sport-sops-age-key-<dev>.txt` в `~/.config/sops/age/keys.txt`.
3. **`chmod 600 ~/.config/sops/age/keys.txt`** + smoke-test (`sops -d .secrets/dev/shared.yaml | head -3`).

### Восстановление через partner dev (если оба backup'а недоступны)

1. Partner dev (тот, у кого второй recipient ключ работает) генерирует **новый** age key для пострадавшего:
   ```bash
   age-keygen -o /tmp/sport-recovery-<dev>-keys.txt
   ```
2. Передаёт plaintext этого файла через защищённый канал (Signal / Telegram secret chat / 1Password share).
3. Пострадавший restored `keys.txt` в `~/.config/sops/age/keys.txt` + `chmod 600`.
4. Partner dev добавляет публичный ключ из нового `keys.txt` в `.sops.yaml` recipient list (см. §6 «Rotate recipients» выше) — Шаги 6.1-6.5.
5. **Старый утерянный ключ остаётся в `.sops.yaml`** до тех пор, пока не появится подтверждение, что он не утёк (например, encrypted disk физически уничтожен). В сценарии «laptop stolen» — заменить старый ключ на новый через `sops updatekeys` + удалить старый recipient stanza.

### Восстановление, когда потеряны ВСЕ recipient ключи

**Catastrophic.** Восстановление невозможно — `.secrets/**/*.yaml` мертвы. План:

1. Удалить `.secrets/**/*.yaml` из репо.
2. Сгенерировать новые age ключи для обоих devs (§1 Шаг 1.2).
3. Обновить `.sops.yaml` с новыми publicly-keys.
4. **Заново ввести ВСЕ значения секретов** (POSTGRES_PASSWORD, JWT_SECRET, MINIO creds, Mapbox tokens, и т.д.) через `sops` edit-on-empty (§3) — это требует ротации каждого секрета в источнике (Mapbox dashboard, Postgres `ALTER USER`, и т.д.).
5. Document инцидент в `docs/SECRETS.md` §«Incident Log».

**Mitigation на dawn'е:** минимум 2 recipient ключа с дня 1 (см. `.sops.yaml`); каждый recipient имеет 2 независимых backup-копии (1Password + USB).

---

## 8. Merge conflicts on encrypted YAML

**Сценарий:** два dev'а независимо отредактировали `.secrets/prod/shared.yaml` на параллельных branch'ах. На merge git produces 3-way conflict на encrypted blob — но merge-результат **GIBBERISH**, потому что conflict markers `<<<<<<<` оказываются внутри ciphertext.

⚠️ **Pitfall 5 trigger:** **никогда не resolve'ите ciphertext-конфликт вручную** — это leak (раскрытие encrypted-структуры) И повреждает MAC/IV блоки = decrypt-fail silently.

### Мера предотвращения (уже применена — Phase 2 / SEC-02)

В `.gitattributes` репо строка:

```
.secrets/**/*.yaml -text
```

→ Git **не пытается** делать 3-way text merge на этих файлах; конфликт выходит как «binary differ — выберите одну сторону».

### Resolve workflow

1. **Выбрать одну сторону** (`--ours` или `--theirs`):
   ```bash
   # Выбрать свою версию (текущую branch'у):
   git checkout --ours .secrets/prod/shared.yaml
   # ИЛИ выбрать ту, что в incoming branch'е:
   git checkout --theirs .secrets/prod/shared.yaml
   ```
2. **Re-apply «потерянные» изменения** через SOPS edit:
   ```bash
   EDITOR=vim sops .secrets/prod/shared.yaml
   # Открыть, добавить изменения из «отброшенной» стороны вручную, save.
   ```
3. **Verify decrypt success** прежде чем commit:
   ```bash
   sops -d --output-type=dotenv .secrets/prod/shared.yaml > /tmp/test.env
   cat /tmp/test.env  # должно быть N валидных KEY=value lines
   shred -u /tmp/test.env
   ```
4. **Commit**:
   ```bash
   git add .secrets/prod/shared.yaml
   git commit -m "fix(secrets): resolve merge conflict in shared.yaml (manual re-edit)"
   ```

### Если что-то пошло не так

**Warning sign:** `sops -d` после merge возвращает `Input string ... does not match sops' expected format` → conflict markers оказались в ciphertext. Откатитесь:

```bash
git checkout HEAD -- .secrets/prod/shared.yaml
# И начните §8 resolve workflow заново.
```

**Treat as compromise:** если conflict resolution занял больше чем один retry, ИЛИ есть подозрение, что ciphertext был частично виден через editor diff — рекомендуется treated-as-compromise rotation всех секретов в conflicted-файле, потому что ciphertext-structure leak редуцирует attacker'а workload (не критично, но prudent для high-value секретов вроде JWT_SECRET).

---

## 9. Deploy sequence (SCP-based prod deploy)

**Контекст:** Phase 2 закрывает SOPS-канонический store. Phase 3 (IaC) автоматизирует deploy через Ansible playbooks. До Phase 3 — manual SCP-based deploy per user redline (ADR-0007 §«SCP-throughout cross-cut»).

### Deploy script (`/opt/sport/deploy.sh` на VPS — landed по Phase 3)

```bash
#!/usr/bin/env bash
# /opt/sport/deploy.sh — runs on VPS после `git pull`
# Pre-Phase-3 ручной запуск; Phase 3 wraps в Ansible.

set -euo pipefail
umask 077

export SOPS_AGE_KEY_FILE=/etc/sops/age.key   # mode 400, owned by root

ENV_FILE="$(mktemp /run/sport.env.XXXXXX)"   # /run is tmpfs (RAM-only)
trap "shred -u '$ENV_FILE' 2>/dev/null || rm -f '$ENV_FILE'" EXIT

# Decrypt + concat all 3 secret groups в один .env
sops -d --output-type=dotenv .secrets/prod/shared.yaml  > "$ENV_FILE"
sops -d --output-type=dotenv .secrets/prod/mapbox.yaml >> "$ENV_FILE"
sops -d --output-type=dotenv .secrets/prod/oauth.yaml  >> "$ENV_FILE"

docker-compose \
  -f services/backend/docker-compose.prod.yml \
  --env-file "$ENV_FILE" \
  up -d

# trap shreds ENV_FILE on exit (success or error)
```

### Manual SCP-based deploy (до Phase 3 Ansible)

С dev-workstation:

```bash
# 1. На VPS: убедиться, что age-ключ доступен.
ssh deploy@<vps-host> 'ls -l /etc/sops/age.key'  # должен показать mode 400 owner root

# 2. С dev: pull изменения в репо на VPS.
ssh deploy@<vps-host> 'cd /opt/sport && git pull --ff-only origin feat/cursona-redesign'

# 3. Запустить deploy script:
ssh deploy@<vps-host> '/opt/sport/deploy.sh'

# 4. Verify:
ssh deploy@<vps-host> 'docker ps && curl -s localhost:8081/healthz'
```

### Why /run tmpfs

`/run` на Linux — RAM-backed tmpfs (никогда не пишется на диск). Если deploy crash'ит и `trap` не отработал, plaintext `.env` живёт только до reboot — никогда не lands в disk storage. Sensitive deployments дополнительно используют `umask 077` + `mode 600` после write, чтобы process'ы других UID не видели файл.

### SCP-based pure file deploy (без `git pull` на VPS)

Если репо на VPS отстаёт или target — другой host:

```bash
# С dev:
sops -d --output-type=dotenv .secrets/prod/shared.yaml  > /tmp/prod-shared.env
sops -d --output-type=dotenv .secrets/prod/mapbox.yaml >> /tmp/prod-shared.env
sops -d --output-type=dotenv .secrets/prod/oauth.yaml  >> /tmp/prod-shared.env

scp /tmp/prod-shared.env deploy@<vps>:/run/sport.env
shred -u /tmp/prod-shared.env

ssh deploy@<vps> 'docker-compose --env-file /run/sport.env -f /opt/sport/services/backend/docker-compose.prod.yml up -d && shred -u /run/sport.env'
```

⚠️ **Сразу `shred -u` плейнтекст файла** на обоих концах — дefault Mac `/tmp` не tmpfs, файл может пережить reboot.

---

## Cross-references

- **`docs/SECRETS.md`** — token inventory, classification rules, 10 rotation playbooks, Incident Log.
- **`docs/DECISIONS/0006-mapbox-token-incident.md`** — ADR-0006: Mapbox treated-as-compromise reset.
- **`docs/DECISIONS/0007-v1.0-release-contract.md`** §«SCP-throughout cross-cut» — deploy principle.
- **`.sops.yaml`** — age recipient list (creation_rules).
- **`.gitattributes`** — `.secrets/**/*.yaml -text` для Pitfall 5 mitigation.
- **`.planning/phases/02-secrets-and-config-hardening/02-RESEARCH.md`** §Pitfalls 1, 4, 5, 8 — детали upstream-known issues, на которые этот RUNBOOK реагирует.

---

_Phase: 02 Secrets & Config Hardening._
_Создан: 2026-05-16. Поправки — отдельный PR; для material-changes (например, age v2.0 breaking changes) — обновить версии в §1 и flag в SUMMARY._
