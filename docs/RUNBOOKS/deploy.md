# Deploy RUNBOOK — Running Ecosystem v1.0

> **Provider-agnostic.** Этот RUNBOOK подходит для любого SSH-accessible Linux VPS (Ubuntu 22.04/24.04 LTS рекомендуется). Конкретный провайдер (Hetzner / DigitalOcean / OVH / Vultr / Hostinger / etc.) — не имеет значения для процедур ниже. Cloud-API provisioning (Terraform) deferred to v1.1.
>
> **Scope:** Phase 3 v1.0 hardening deliverable. Ansible-driven deploy на existing prod VPS. Staging deferred to v1.1. Sentry separate-VPS — Phase 5.
>
> **Status:** First cutover landed **2026-05-17** (Plan 03-02 Wave 2 — INFRA-07 baseline `66.5s real` on `148.253.214.156`).

---

## 1. Dev workstation setup (one-time)

Что должно быть установлено на разработческой машине (Mac или Linux):

```bash
# 1.1. Ansible + community collections
brew install ansible                                      # macOS (Linux: apt install ansible-core)
ansible-galaxy collection install community.sops community.docker community.general ansible.posix

# 1.2. SOPS + age (Phase 2 inheritance)
brew install sops age
mkdir -p ~/.config/sops/age
# (один раз) если у тебя ещё нет age private key — сгенерируй и сохрани
#   age-keygen -o ~/.config/sops/age/keys.txt
# либо получи existing key из team handoff (Phase 2 RUNBOOK §Rotate-recipients).

# 1.3. Persistent env (direnv recommended; иначе добавь в ~/.zshrc или ~/.bashrc)
echo 'export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"' >> ~/.zshrc
source ~/.zshrc

# 1.4. Verify
sops -d .secrets/prod/shared.yaml >/dev/null && echo "SOPS OK"
ansible --version | head -1
```

**Notes:**
- macOS path для age key: `~/.config/sops/age/keys.txt` (XDG). SOPS по умолчанию ищет в `~/Library/Application Support/sops/age/keys.txt` — поэтому env var обязателен.
- Если SOPS decrypt вернул "no identity matched any of the recipients" — твой age pubkey не в `.sops.yaml` recipients list. Запроси у текущего admin'а `sops updatekeys`.

---

## 2. VPS provisioning (one-time per environment)

Procedure для нового VPS у любого провайдера:

1. **Spin up a Linux VPS** в провайдер UI.
   - **OS:** Ubuntu 24.04 LTS (или 22.04 LTS как fallback)
   - **Минимум:** 4 GB RAM, 2 vCPU, 40 GB SSD (для full stack 13 containers + Postgres data growth до 10 GB в первые месяцы closed-beta)
   - **Public IPv4** required
   - **SSH key auth** включи на стадии создания (привязать твой `~/.ssh/id_ed25519.pub` как root key)

2. **Get connection info from provider:**
   - Public IPv4 (`<vps-ip>`)
   - SSH user (typically `root` для cleanly-provisioned VPS, либо `ubuntu` для cloud-init flavored AMIs)

3. **Verify SSH from dev workstation:**
   ```bash
   ssh root@<vps-ip> 'echo OK && lsb_release -d'
   # Должен вывести: OK + Ubuntu 24.04.X LTS
   ```

4. **Update Ansible inventory:**
   ```bash
   # infra/ansible/inventory/prod/hosts.yml
   #   prod-app-01:
   #     ansible_host: <vps-ip>
   #     ansible_user: root            # bootstrap; switch to deploy after Wave 1
   #     ansible_python_interpreter: /usr/bin/python3
   ```

5. **(Optional) DNS:** Для v1.0 closed-beta используется `<vps-ip>.sslip.io` (auto-DNS-from-IP, zero ops cost). Real domain (e.g. `api.runningecosystem.com`) — v1.1.

---

## 3. First-time bootstrap (Wave 1 — common + docker + UFW)

```bash
cd infra/ansible
ansible-playbook -i inventory/prod --tags common,docker,ufw site.yml
```

**Что делает:** apt base packages, создаёт `deploy` user с `NOPASSWD: ALL` sudo (D-20 REVISED для solo-dev v1.0 — см. CONTEXT §D-20 REVISION), SSH hardening (PermitRootLogin no, PasswordAuthentication no), Docker Engine + Compose plugin, UFW с `limit 22/tcp` from anywhere (D-24 REVISED — key-only-auth + rate-limit как defense; survives ISP IP rotation) + `allow 443/tcp` + deny 80/4222/5432/6379/9000.

**После first-run:**

1. **Verify root SSH disabled, deploy works:**
   ```bash
   ssh deploy@<vps-ip> 'whoami && sudo whoami'   # → deploy / root
   ssh root@<vps-ip> 'echo SHOULD_FAIL'           # → Permission denied
   ```

2. **Switchover inventory** к `ansible_user: deploy` (раскомментируй deploy line, закомментируй/удали root line в `infra/ansible/inventory/prod/hosts.yml`).

3. **Verify idempotency (2nd run shows `changed=0`):**
   ```bash
   ansible-playbook -i inventory/prod --tags common,docker,ufw site.yml
   # PLAY RECAP должен показать: changed=0
   ```

**Lockout risks (mitigated by task ordering):**
- `authorized_keys` для deploy ставится BEFORE `sshd_config` hardening drop-in (если бы наоборот → root SSH disabled + deploy key ещё не authorized → SSH locked out)
- UFW `allow 22 limit` ставится BEFORE `ufw enable` (если бы наоборот → UFW deny default + 22 не allow'нут → SSH locked out)

**Recovery if locked out:** провайдер web-console / KVM-over-IP → diagnose via journalctl, fix, restart ssh. Procedure preserved в `.planning/phases/03-infrastructure-as-code/03-01-SUMMARY.md` §Recovery iterations.

---

## 4. First-time deploy of sport-stack (Wave 2)

Это полный bootstrap нового стека после Wave 1 закрыт.

### 4.1. Pre-flight checks

```bash
# Все обязательные env vars в SOPS (если нет — добавь via `EDITOR=vim sops .secrets/prod/shared.yaml`)
sops -d .secrets/prod/shared.yaml | grep -E "^(JWT_SECRET|POSTGRES_PASSWORD|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD|CADDY_ACME_EMAIL):" | wc -l
# Должно вернуть 5
```

### 4.2. (Только при cutover c existing manual stack) Тормозим старый стек

Если на VPS уже работает manual stack (запущенный предыдущим `/opt/sport/deploy.sh` flow) — освободи порты 80+443 перед Ansible:

```bash
# Variant A: docker compose down (если env-vars доступны):
ssh deploy@<vps-ip> 'cd /opt/running-ecosystem && sudo docker compose --env-file .env.prod -f docker-compose.prod.yml down --remove-orphans'

# Variant B: direct stop (если env-vars недоступны — typical case):
ssh deploy@<vps-ip> 'CONTAINERS="re_gateway re_identity re_activity_sync re_feed re_media re_messaging re_notifications re_realtime_gw re_social_graph re_postgres re_redis re_nats re_minio"; sudo docker stop $CONTAINERS; sudo docker rm $CONTAINERS'

# Verify gateway gone (port 443 released):
ssh deploy@<vps-ip> 'sudo docker ps --filter name=re_gateway --format "{{.Names}}"'   # empty = ok
```

**Volumes preserved** через `name: running-ecosystem` pin в `docker-compose.prod.yml` — новый sport-stack umbrella использует те же volumes (см. Phase 3 [03-02-SUMMARY.md §LIVE CUTOVER ADDENDUM]).

### 4.3. Ansible deploy + timing measurement

```bash
cd infra/ansible
/usr/bin/time -p ansible-playbook -i inventory/prod --tags sport-stack site.yml 2>&1 | tee /tmp/cutover-timing.log

# Wall-clock verdict (programmatic — derive PASS/FAIL from real-line):
awk '/^real/ { secs=$2+0; if (secs>3600) {print "FAIL: " secs "s (> 60min INFRA-07 target)"; exit 1} else print "PASS: " secs "s" }' /tmp/cutover-timing.log
```

Expected first-clean run: `~60-90s` (post-cutover; cached layers shorten subsequent runs к ~20s).

### 4.4. Post-deploy verification

```bash
ssh deploy@<vps-ip> 'sudo systemctl is-active sport-stack.service'   # → active
ssh deploy@<vps-ip> 'sudo docker ps --filter name=re_ --format "table {{.Names}}\t{{.Status}}"'   # → 13 containers up

# Auth flow smoke (HTTP 202 expected):
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" \
  -X POST https://<vps-ip>.sslip.io/auth/request-code \
  -H "Content-Type: application/json" -d '{"email":"smoke@local.test"}'
```

---

## 5. Routine deploy (после code change)

```bash
# 5.1. Commit + push code changes (если используешь git как deploy source — пока что нет remote, Ansible rsync'ит worktree напрямую)

# 5.2. Re-run sport-stack tag — idempotent, only changed bits redeploy
cd infra/ansible
ansible-playbook -i inventory/prod --tags sport-stack site.yml

# Что произойдёт:
#  - rsync синхронизирует services/backend/ tree (только diff)
#  - SOPS-decrypt + re-render /run/sport.env (idempotent unless secrets changed)
#  - migrations one-shot container (golang-migrate skips applied)
#  - sport-stack.service restart ТОЛЬКО если systemd unit template changed
#  - smoke probe verify

# 5.3. Ожидаемый output: PLAY RECAP: changed=0 or 1 (migration always reports changed)
```

**Image rebuild (если Dockerfile changed):**
```bash
# На VPS:
ssh deploy@<vps-ip> 'cd /opt/sport/services/backend && sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml build && sudo systemctl restart sport-stack.service'
```

---

## 6. Rollback (manual emergency)

> v1.0 не имеет CI-driven rollback drill (Phase 4 owner). Для v1.0 closed-beta — manual.

### 6.1. Code-level rollback

```bash
# В worktree: переключаемся на предыдущий tag/commit
git checkout <previous-tag-or-sha>

# Re-deploy:
cd infra/ansible
ansible-playbook -i inventory/prod --tags sport-stack site.yml
```

### 6.2. DB migration rollback (если N+1 включал migration)

```bash
ssh deploy@<vps-ip> 'cd /opt/sport/services/backend && sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml run --rm migrations down 1'
```

**WARNING:** `down 1` откатывает ОДНУ migration. Если их было несколько в новой версии — повторить нужное количество раз. golang-migrate сохраняет порядок в schema_migrations table.

### 6.3. Emergency fallback к manual `/opt/sport/deploy.sh` flow

Если Ansible-driven deploy упёрся во что-то неразрешимое — fallback к manual scp/git pull + docker compose. Каталог `/opt/running-ecosystem/` остаётся на VPS как legacy после Phase 3 cutover (deprecated но не удалён); там лежит pre-cutover compose stack который можно поднять через `sudo docker compose --env-file .env.prod -f docker-compose.prod.yml up -d`.

**Phase 4** (CI/CD) проведёт rollback drill с реальной DB migration в path → CICD-04 acceptance.

---

## 7. Failure modes (troubleshooting)

| Симптом | Вероятная причина | Fix |
|---------|-------------------|-----|
| `Missing sudo password` от Ansible | `ansible_user: deploy` но sudoers ещё narrow (Plan 03-01 не закрыт или D-20 не revised) | `ssh deploy@<vps-ip> 'sudo /usr/bin/docker run --rm -v /etc/sudoers.d:/sudoers alpine sh -c "echo \"deploy ALL=(ALL) NOPASSWD: ALL\" > /sudoers/deploy && chmod 0440 /sudoers/deploy"'` (uses already-whitelisted docker для re-write) |
| `SSH: Connection timed out during banner exchange` | sshd wedged — обычно duplicate Subsystem в drop-in | Out-of-band console → `sed -i '/^Subsystem sftp/d' /etc/ssh/sshd_config.d/99-hardening.conf && systemctl restart ssh` |
| SSH полностью dropped после ansible run | UFW per-IP allowlist + dev IP rotated (D-24 original) | Use D-24 REVISED (`ufw limit 22/tcp` from anywhere); recovery: web-console → `ufw allow from <new-dev-ip> to any port 22 && ufw delete <old rule>` |
| `error while interpolating ... required variable ... missing a value` | SOPS slot не содержит нужный key | `EDITOR=vim sops .secrets/prod/shared.yaml` → add the missing key (extract from existing `.env.prod` if migrating) |
| `docker compose run --rm migrations` падает на CONNECT | Postgres контейнер not healthy yet (race condition) | retry; либо добавь `wait_for` в migration play на :5432 |
| Caddy serves HTTP 503 / SSL handshake fails | Let's Encrypt ACME issuance в progress (~30-60s после first-run) | wait 60s; check `sudo docker logs re_gateway` для ACME progress |
| `sport-stack.service` в restart loop с empty `/run/sport.env` | D-15 original ExecStopPost shred wiped env (now FIXED in service.j2) | `systemctl stop sport-stack && ansible-playbook -i inventory/prod --tags sport-stack site.yml` re-renders env + starts |
| Plaintext secret в bash transcript / git history | Случайный echo / cat / sops decrypt без `--extract` | Rotate the leaked secret immediately; gitleaks pre-commit hook blocks git commits (Phase 2 SEC-08) |

---

## 8. Provider-specific notes

> **v1.0 placeholder.** Для closed-beta провайдер-agnostic; никаких специфичных шагов нет. v1.1+ may add subsections per провайдер:

- **Hetzner Cloud:** rescue mode procedure, hcloud CLI hints, Object Storage bucket creation for v1.1 TF state migration
- **DigitalOcean:** Recovery Console workflow, doctl CLI, Spaces bucket
- **OVH:** IPMI access, vRack network primer
- **Vultr / Hostinger / другие:** TBD on demand

Currently все procedures выше — provider-agnostic.

---

## 9. Measured timing (INFRA-07 acceptance)

| Run | Date | Type | real wall-clock | Notes |
|-----|------|------|-----------------|-------|
| Wave 2 Cutover Run #3 | 2026-05-17 11:17:31Z | First-clean deploy (post-SOPS-gap-fix) | **66.5s** | Plan 03-02 — full sport-stack deploy + smoke. INFRA-07 baseline. |
| Wave 2 Cutover Run #4 | 2026-05-17 11:18:51Z | Idempotency re-run | 21s | `changed=1` (golang-migrate only). |

**INFRA-07 target:** `<60 min`. **Actual baseline:** `66.5s`. **Margin:** 53.5×.

Future re-measurements (incremental deploys, fresh-VPS baselines, Phase 4 CI integration timing) — record in this table.

---

*RUNBOOK created: 2026-05-17 — Phase 3 Plan 03-03 Task 1*
*Provider-agnostic per CONTEXT D-25*
*Owner: solo dev (Ismail)*
