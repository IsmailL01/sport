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

### 5.1. New tag → CI builds images → deploy via save/scp/load

Phase 4 CI/CD pipeline (`backend-cd.yml`) автоматически билдит, signs (cosign keyless), и attests (SLSA L2) образы при push tag `v*`. Образы залетают в GHCR (`ghcr.io/ismaill01/<svc>:<semver>`). Prod НЕ pull'ит из GHCR; controller (dev workstation) делает transfer.

```bash
# 5.1.1. Tag + push (triggers backend-cd.yml в GH Actions)
git tag v1.0.x
git push origin v1.0.x
gh run watch    # ~3-5 min for cosign sign + SLSA attest + GHCR push

# 5.1.2. Pre-flight: controller docker daemon up + GHCR login active
docker info >/dev/null && echo OK
gh auth token | docker login ghcr.io -u IsmailL01 --password-stdin

# 5.1.3. Deploy с image transfer
cd infra/ansible
SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt \
  ansible-playbook -i inventory/prod --tags sport-stack site.yml -e sport_stack_tag=v1.0.x

# Что произойдёт:
#  - rsync синхронизирует services/backend/ tree
#  - transfer_images.yml: controller docker pull (--platform=linux/amd64) → gh-attest verify →
#    docker save | gzip → synchronize tarballs → remote docker load (per service, 8 services)
#  - SOPS-decrypt + re-render /run/sport.env с SPORT_STACK_TAG=<semver-stripped>
#  - migrations one-shot (golang-migrate skips applied)
#  - sport-stack.service restart ONLY if systemd unit template changed
#  - smoke probe POST /auth/request-code → HTTP 200/202
```

Expected first-clean wall-clock: ~5-6 min (image transfer ~3-4 min + rest). Subsequent deploys with same tag: `transfer_images.yml` is idempotent if tarballs already on prod (synchronize copies only changed files); ~25-30s.

### 5.2. Config-only redeploy (no tag, no image change)

```bash
cd infra/ansible
ansible-playbook -i inventory/prod --tags sport-stack site.yml   # NO -e sport_stack_tag
```

Transfer-images block skips (`when: sport_stack_tag is defined and ... | length > 0`). Compose continues using last-loaded `${SPORT_STACK_TAG}` set in `/run/sport.env`.

### 5.3. Image rebuild fallback (если хочешь bypass GHCR)

```bash
# На VPS:
ssh deploy@<vps-ip> 'cd /opt/sport/services/backend && sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml build && sudo systemctl restart sport-stack.service'
```

Используется только если CI/CD pipeline недоступен; нет cosign signatures + SLSA attestation gate в этом сценарии.

---

## 6. Rollback (manual emergency)

### 6.1. Code-level rollback

```bash
make rollback v=<previous-tag-or-sha>     # automated — see §6.4 для шагов
```

Wraps: `git checkout` → preflight (images-present check) → `migrate down 1` → `ansible-playbook --skip-tags=run-migrations` → smoke probe.

### 6.2. DB migration rollback (если N+1 включал migration)

```bash
ssh deploy@<vps-ip> 'PASSWD=$(grep "^POSTGRES_PASSWORD=" /run/sport.env | cut -d= -f2-); \
  cd /opt/sport/services/backend && \
  sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml run --rm migrations \
  -path /migrations \
  -database "postgres://re:${PASSWD}@postgres:5432/running_ecosystem?sslmode=disable" \
  down 1'
```

**WARNING:** `down 1` откатывает ОДНУ migration. Если их было несколько в новой версии — повторить нужное количество раз. golang-migrate сохраняет порядок в schema_migrations table.

**WHY the inline PASSWD grep:** `/run/sport.env` содержит placeholder values с literal `<`, `>` (i.e. `APPLE_SIGN_IN_CLIENT_SECRET=<deferred-v1.1>`) которые ломают bash `set -a; . file` sourcing. Single-line grep экстракт работает корректно.

### 6.3. Emergency fallback к manual `/opt/sport/deploy.sh` flow

Если Ansible-driven deploy упёрся во что-то неразрешимое — fallback к manual scp/git pull + docker compose. Каталог `/opt/running-ecosystem/` остаётся на VPS как legacy после Phase 3 cutover (deprecated но не удалён); там лежит pre-cutover compose stack который можно поднять через `sudo docker compose --env-file .env.prod -f docker-compose.prod.yml up -d`.

### 6.4. Drill execution log — CICD-04 (closed 2026-05-18)

**Цель:** доказать что rollback path (code revert + DB migration down) работает на реальном проде с реальной schema mutation.

**Scenario:** two backward-compat drill migrations:
- `9990_drill_metadata_col` — ADD COLUMN users.metadata JSONB DEFAULT NULL
- `9991_drill_drop_metadata_col` — DROP COLUMN users.metadata

Tags `v1.0.0-rc.test-a` (схема state A — only 9990) и `v1.0.0-rc.test-b` (state B — 9990+9991) указывают на разные SHA с соответствующими migration tree subsets. Локальный тег `v1.0.0-rc.test-a` retargeted для приёма транзитной cherry-pick (Ansible `transfer_images.yml` + Makefile fixes); GHCR images остаются tag-string-matched (CD не re-run).

| Stage | Action | Wall-clock | users.metadata | schema_migrations.version | Smoke |
|---|---|---|---|---|---|
| Pre-drill backup | `pg_dump` ~65 KB на /tmp/pre-drill-backup-20260518-174447.sql.gz | ~5s | absent | 21 | n/a |
| Deploy A | `ansible-playbook -e sport_stack_tag=v1.0.0-rc.test-a` (save/scp/load + migrate up 9990) | ~5 min | **PRESENT ✓** | 9990 | HTTP 202 |
| Deploy B | `-e sport_stack_tag=v1.0.0-rc.test-b` (migrate up 9991) | ~5 min | **ABSENT ✓** | 9991 | HTTP 202 |
| Rollback step 3 | `migrate down 1` (revert 9991) | 20ms | PRESENT | 9990 | n/a |
| Rollback steps 4-6 | ansible re-deploy `--skip-tags=run-migrations` + smoke | ~25s | **PRESENT ✓** | 9990 | HTTP 202 (internal) + HTTP 200 (external /healthz) |

**Verdict: DRILL PASS** — CICD-04 acceptance closed. Backward-compat schema design + `--skip-tags=run-migrations` + image pre-flight check make rollback recoverable in <2 min for fresh-migration scenario.

### 6.5. Deferred — direct GHCR pull from prod (v1.0.1 follow-up)

Текущий flow: controller-side `docker pull` → `cosign verify` → `docker save | gzip` → `synchronize` → remote `docker load`. Prod НЕ pull'ит из GHCR (нет network auth setup).

**Что блокирует direct GHCR pull from prod:**
- GHCR personal-account package visibility flip требует web UI (REST API не поддерживает `PATCH /user/packages/container/<name>/visibility`)
- Если packages приватные — prod VPS получит 401 без `docker login ghcr.io` с PAT
- Setting up long-lived PAT на проде = security debt (rotation, secret-of-secret problem)

**v1.0.1 follow-up options:**
- (a) Flip all 8 packages public via web UI (one-shot manual; eliminates auth complexity)
- (b) Generate short-lived registry token via `gh auth token` + push to prod via Ansible `delegate_to: localhost` template
- (c) Stay with save/scp/load (current) — works, just adds ~5 min wall-clock per deploy

See ROADMAP backlog — debt item "GHCR pull auth setup".

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

## 10. Branch protection setup (Phase 4 / CICD-06)

> **SEQUENCE GUARD CRITICAL** (RESEARCH Pitfall 1): Enable branch protection ONLY AFTER first green CI run на backend-ci.yml. Enabling before = lockout (cannot merge fixes если required check has never passed).

### 10.1. Initial setup

Run from dev workstation после Plan 04-02 first green CI:

```bash
./scripts/setup-branch-protection.sh
# OR с explicit namespace:
# ./scripts/setup-branch-protection.sh <alt-namespace>/sport main
```

Effects:
- `main` branch protected: **8 required status checks** must pass before merge:
  - `Test (Go 1.25)`, `Lint (golangci-lint v2)`, `SAST (gosec)`, `Vuln (govulncheck)`, `SAST (semgrep)`, `Secrets (gitleaks + trufflehog — PR diff)`, `Docker build (no push, verify)`, `Guard (no :latest)`
- **0 required reviewers** (solo dev admin self-approves PRs — D-20)
- **No force-push** к main (`allow_force_pushes: false`)
- **No branch deletion** (`allow_deletions: false`)
- **Conversation resolution required** (PR comments must be resolved before merge)
- **`enforce_admins: false`** (solo dev emergency-override path; v1.1 flips к `true` when DEV_B onboards)

Idempotent — re-run после changing required checks is safe (`gh api PUT` overwrites).

### 10.2. Verify protection state

```bash
gh api repos/IsmailL01/sport/branches/main/protection --jq '{
  required_status_checks_count: (.required_status_checks.contexts | length),
  required_reviewers: .required_pull_request_reviews.required_approving_review_count,
  enforce_admins: .enforce_admins.enabled,
  allow_force_pushes: .allow_force_pushes.enabled,
  allow_deletions: .allow_deletions.enabled,
  conversation_resolution: .required_conversation_resolution.enabled,
  contexts: .required_status_checks.contexts
}'
```

Expected: `required_status_checks_count: 8`, `required_reviewers: 0`, `allow_force_pushes: false`, `allow_deletions: false`, `enforce_admins: false`.

**Full contract check (boolean):**
```bash
gh api repos/IsmailL01/sport/branches/main/protection --jq '
  (.required_status_checks.contexts | length == 8)
  and (.required_pull_request_reviews.required_approving_review_count == 0)
  and (.allow_force_pushes.enabled == false)
  and (.allow_deletions.enabled == false)
  and (.enforce_admins.enabled == false)
'
# Expected: true
```

**NOTE:** parens around each comparison are MANDATORY — without them jq pipes the contexts array through `length == 8 and <next>` and tries to access `.next` on the array (which gives `expected an object but got: array`).

### 10.3. Bypass procedure (incident response)

Если incident requires immediate merge bypass (revert breaks CI temporarily; hotfix needs к ship NOW):

**Preferred path — temporarily disable specific check:**
```bash
# Disable single check (e.g., temporarily ignore SAST gosec):
gh api -X PATCH repos/IsmailL01/sport/branches/main/protection/required_status_checks \
  --field 'contexts[]=Test (Go 1.25)' \
  --field 'contexts[]=Lint (golangci-lint v2)' \
  --field 'contexts[]=Vuln (govulncheck)' \
  --field 'contexts[]=SAST (semgrep)' \
  --field 'contexts[]=Secrets (gitleaks + trufflehog — PR diff)' \
  --field 'contexts[]=Docker build (no push, verify)' \
  --field 'contexts[]=Guard (no :latest)'
# Merge the PR
# Re-enable: re-run ./scripts/setup-branch-protection.sh
```

**Last-resort path — disable protection entirely (use ONLY если above fails):**
```bash
gh api -X DELETE repos/IsmailL01/sport/branches/main/protection
# ... merge fix ...
# IMMEDIATELY re-apply: ./scripts/setup-branch-protection.sh
```

**NEVER recommended:** `git push --force` к main — `allow_force_pushes: false` so this fails anyway (intentional safety net).

### 10.4. Change procedure (add/remove required check)

1. Update `.github/workflows/backend-ci.yml` (or backend-cd.yml) с new job + verify it runs green на smoke PR
2. Update `scripts/setup-branch-protection.sh` JSON body — add/remove job's `name:` string in `contexts` array
3. Re-run `./scripts/setup-branch-protection.sh` (idempotent — overwrites previous config)
4. Verify via §10.2 — context list reflects update

### 10.5. Smoke test (verify protection actually blocks unverified merges)

Periodically (after major workflow changes):

```bash
git checkout -b chore/protection-smoke
echo "<!-- smoke -->" >> docs/RUNBOOKS/deploy.md
git commit -am "chore: protection smoke test"
git push -u origin chore/protection-smoke
gh pr create --base main --head chore/protection-smoke --title "smoke" --body "verify protection blocks until checks pass"
# Open PR в browser:
# — Expected: "Merge pull request" disabled с "Required statuses must pass before merging"
# — After CI green: button enables (proves end-to-end works)
# Then close OR merge then delete branch.
```

---

## 11. Deployment freeze toggle (Phase 4 / CICD-05) — *populated by Plan 04-06*

---

*RUNBOOK created: 2026-05-17 — Phase 3 Plan 03-03 Task 1*
*§5+§6 rewritten: 2026-05-18 — Phase 4 Plan 04-04 (save/scp/load + drill log)*
*§10 added: 2026-05-18 — Phase 4 Plan 04-05 (branch protection)*
*Provider-agnostic per CONTEXT D-25*
*Owner: solo dev (Ismail)*
