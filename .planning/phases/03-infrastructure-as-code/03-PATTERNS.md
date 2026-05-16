# Phase 3: Infrastructure as Code — Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 33 (28 new + 5 modified/touched)
**Analogs found in repo:** 11 / 33 (greenfield Terraform/Ansible — большая часть требует external refs из RESEARCH.md)

---

## Файловая классификация

| Новый/модифицируемый файл | Роль | Поток данных | Ближайший аналог | Качество совпадения |
|---|---|---|---|---|
| **Terraform слой (greenfield)** | | | | |
| `infra/terraform/main.tf` | config | TF → cloud API | — (external: RESEARCH §Code Examples L745-760) | external-ref |
| `infra/terraform/backend.tf` | config | TF → S3 (Hetzner Object Storage) | — (external: RESEARCH §Pattern 5 L486-503) | external-ref |
| `infra/terraform/versions.tf` | config | TF version pin | — (external: HashiCorp std) | external-ref |
| `infra/terraform/variables.tf` | config | TF input vars | — (external: HashiCorp std) | external-ref |
| `infra/terraform/terraform.tfvars.example` | template | placeholder values | `.secrets/<env>/shared.yaml` (placeholder pattern) | partial |
| `infra/terraform/network.tf` (опц. v1.1) | config | TF → hcloud private network | — (external: hetznercloud/hcloud provider docs) | external-ref |
| `infra/terraform/firewall.tf` | config | TF → hcloud firewall API | — (external: RESEARCH §Pattern 6 L519-548) | external-ref |
| `infra/terraform/servers.tf` | config | TF → hcloud server API (+ import) | — (external: RESEARCH §Pattern 4 L429-451 + §Code L766-800) | external-ref |
| `infra/terraform/storage_box.tf` | config | TF → Storage Box API | — (external: hetznercloud/hcloud provider) | external-ref |
| `infra/terraform/object_storage_state.tf` | config | TF → S3 backend bucket | — (external: tutorial RESEARCH L505-516) | external-ref |
| `infra/terraform/outputs.tf` | config | TF outputs (IPs, hostnames) | — (external: HashiCorp std) | external-ref |
| `infra/terraform/tf-wrap.sh` | utility | shell → SOPS → terraform | `docs/RUNBOOKS/sops-edit.md §Deploy script` L330-354 | exact (decrypt pattern) |
| **Ansible слой (greenfield)** | | | | |
| `infra/ansible/ansible.cfg` | config | Ansible runtime | — (external: docs.ansible.com) | external-ref |
| `infra/ansible/site.yml` | playbook | Ansible → SSH/SFTP | — (external: RESEARCH §Code L717-741) | external-ref |
| `infra/ansible/inventory/dev/hosts.yml` | inventory | localhost only | — (external: Ansible inventory YAML std) | external-ref |
| `infra/ansible/inventory/staging/hosts.yml` | inventory | SSH target = staging-app-01 | — (external) | external-ref |
| `infra/ansible/inventory/prod/hosts.yml` | inventory | SSH target = 148.253.214.156 | — (external) | external-ref |
| `infra/ansible/inventory/sentry/hosts.yml` | inventory | SSH target = sentry-01 | — (external) | external-ref |
| `infra/ansible/group_vars/all.yml` | config | shared vars | — (external) | external-ref |
| `infra/ansible/group_vars/{staging,prod,sentry}.yml` | config | per-env vars (caddy_host, server_type) | `services/backend/gateway/Caddyfile.prod` L18,L27 (host pattern) | partial |
| `infra/ansible/roles/common/tasks/main.yml` | role | apt + SSH hardening | — (external: konstruktoid/ansible-role-hardening) | external-ref |
| `infra/ansible/roles/common/files/sshd_config_overrides` | template | sshd config drop-in | — (external: CIS L1 baseline) | external-ref |
| `infra/ansible/roles/docker/tasks/main.yml` | role | Docker Engine install | — (external: docs.docker.com/engine/install/ubuntu) | external-ref |
| `infra/ansible/roles/sport-stack/tasks/main.yml` | role | orchestration | `docs/RUNBOOKS/sops-edit.md §Deploy script` L330-354 | exact |
| `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml` | role | SOPS → tmpfs | `docs/RUNBOOKS/sops-edit.md §Deploy script` L344-346 + RESEARCH §Pattern 2 L329-376 | exact |
| `infra/ansible/roles/sport-stack/tasks/run_migrations.yml` | role | Ansible → docker compose run | `services/backend/docker-compose.prod.yml` L91-103 (`migrations` service) | exact |
| `infra/ansible/roles/sport-stack/tasks/smoke_probe.yml` | role | local_action HTTP probe | `services/backend/scripts/smoke_otp.py` L24,34-56 | exact |
| `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2` | template | systemd unit | — (external: RESEARCH §Pattern 1 L289-312) | external-ref |
| `infra/ansible/roles/sport-stack/templates/Caddyfile.j2` | template | Caddy config (per-env) | `services/backend/gateway/Caddyfile.prod` (ВЕСЬ ФАЙЛ) | exact |
| `infra/ansible/roles/sport-stack/handlers/main.yml` | role | systemd restart hook | — (external) | external-ref |
| `infra/ansible/roles/sentry-prep/tasks/main.yml` | role | base Sentry VPS prep | `infra/ansible/roles/docker/` (sibling, same wave) | partial |
| **Секреты (Phase 2 inheritance)** | | | | |
| `.secrets/dev/hetzner.yaml` (NEW) | secret-slot | SOPS-encrypted | `.secrets/dev/shared.yaml` | exact (slot pattern) |
| `.secrets/staging/hetzner.yaml` (NEW) | secret-slot | SOPS-encrypted | `.secrets/staging/shared.yaml` | exact |
| `.secrets/prod/hetzner.yaml` (NEW) | secret-slot | SOPS-encrypted | `.secrets/prod/shared.yaml` | exact |
| **Documentation** | | | | |
| `docs/RUNBOOKS/deploy.md` (NEW) | docs | markdown runbook | `docs/RUNBOOKS/sops-edit.md` (структура §1..§9) | exact (структурный шаблон) |
| **Существующие — modify only** | | | | |
| `.gitignore` | config | git ignore patterns | (modify existing — Phase 2 baseline) | — |
| `.sops.yaml` | config | SOPS recipients | (uchanged — auto-covers `.secrets/**/*.yaml`) | — |

---

## Pattern Assignments

### Terraform layer

#### `infra/terraform/main.tf` + `versions.tf` (config, TF → cloud API)

**Аналог:** нет в репозитории (greenfield).
**External reference:** `.planning/phases/03-infrastructure-as-code/03-RESEARCH.md` §Code Examples lines 745-760 (Standard Stack §Core verified hetznercloud/hcloud `~> 1.62`, terraform `>= 1.11`).

**Stub (~10 lines):**
```hcl
# infra/terraform/main.tf — provider config
terraform {
  required_version = ">= 1.11"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.62"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token   # из SOPS .secrets/<env>/hetzner.yaml через tf-wrap.sh
}
```

---

#### `infra/terraform/backend.tf` (config, TF → S3 на Hetzner Object Storage)

**Аналог:** нет в репозитории.
**External reference:** RESEARCH.md §Pattern 5 lines 486-503 (Hetzner Object Storage + s3 backend + `use_lockfile = true`) + Pitfall 2 lines 614-622 (`skip_requesting_account_id`).

**Stub:**
```hcl
# infra/terraform/backend.tf
terraform {
  backend "s3" {
    bucket   = "running-ecosystem-tfstate"
    endpoint = "https://fsn1.your-objectstorage.com"
    key      = "infra/prod.tfstate"
    region   = "main"

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true   # CRITICAL — issue #36924
    use_lockfile                = true   # native S3 locking, TF ≥ 1.11
    force_path_style            = true   # Ceph-S3 compat
  }
}
```

**Critical gotcha (RESEARCH Pitfall 2 L617-621):** без `skip_requesting_account_id = true` `terraform init` зависает на 30s + fails ("Retrieving AWS account details").

---

#### `infra/terraform/servers.tf` (config, TF → hcloud_server + import)

**Аналог:** нет в репозитории.
**External reference:** RESEARCH.md §Pattern 4 lines 429-451 (prod_app_01 import) + §Code Examples lines 766-800 (sentry_01 CORRECTED sizing cx42).

**Stub:**
```hcl
# infra/terraform/servers.tf
resource "hcloud_server" "prod_app_01" {
  name         = "prod-app-01"
  server_type  = "cx32"             # verify against existing 148.253.214.156
  image        = "ubuntu-24.04"
  location     = "nbg1"
  ssh_keys     = [for k in hcloud_ssh_key.devs : k.id]
  firewall_ids = [hcloud_firewall.app.id]

  labels = { env = "prod", role = "app" }

  lifecycle {
    ignore_changes = [image, user_data]   # avoid destroy+recreate on attr drift
  }
}

resource "hcloud_server" "sentry_01" {
  name        = "sentry-01"
  server_type = "cx42"   # CORRECTED — Sentry needs 16GB RAM (Pitfall 1), не cx32
  # ... остальное идентично prod_app_01
}
```

**Critical workflow gotcha (RESEARCH Pitfall 10 L700-712):** HCL block ПЕРВЫМ, потом `terraform import`. Если import without HCL → next `apply` уничтожит prod (`"resource must be destroyed (no configuration)"`).

---

#### `infra/terraform/firewall.tf` (config, TF → hcloud_firewall)

**External reference:** RESEARCH.md §Pattern 6 lines 519-548.

**Stub:**
```hcl
# infra/terraform/firewall.tf
resource "hcloud_firewall" "app" {
  name = "app-public"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]    # Caddy public
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.dev_admin_ips         # SSH dev-only
  }
  # NO 80, 4222, 5432, 6379, 9000 — все internal (RESEARCH D-07/D-08 verified)
}
```

---

#### `infra/terraform/tf-wrap.sh` (utility, shell → SOPS → terraform)

**Аналог:** `docs/RUNBOOKS/sops-edit.md` §Deploy script lines 330-354 (тот же `sops -d --output-type=dotenv` pattern + `trap shred`).

**Imports/header pattern** (sops-edit.md L335-341):
```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

ENV_FILE="$(mktemp /run/sport.env.XXXXXX)"   # /run = tmpfs (RAM-only)
trap "shred -u '$ENV_FILE' 2>/dev/null || rm -f '$ENV_FILE'" EXIT
```

**Core pattern (decrypt + invoke)** — РАЗВЕРНУТЬ ИЗ Phase 2 deploy.sh L344-352:
```bash
# infra/terraform/tf-wrap.sh — runs `terraform $@` с HCLOUD_TOKEN из SOPS
ENV="${TF_ENV:-prod}"
eval "$(sops -d --output-type=dotenv .secrets/${ENV}/hetzner.yaml | sed 's/^/export /')"
exec terraform "$@"
```

**Why copy from sops-edit.md:** уже verified pattern, использует ту же SOPS slot структуру (`.secrets/<env>/<group>.yaml`), `trap shred` гарантирует tmpfs cleanup.

---

### Ansible layer

#### `infra/ansible/site.yml` (playbook, Ansible orchestration entry)

**Аналог:** нет в репозитории.
**External reference:** RESEARCH.md §Code Examples lines 717-741.

**Stub:**
```yaml
# infra/ansible/site.yml
---
- name: Bootstrap base packages and SSH hardening
  hosts: app_servers:sentry
  become: true
  roles:
    - common
    - docker

- name: Deploy sport-stack to app servers
  hosts: app_servers
  become: true
  roles:
    - sport-stack
  tags: [deploy]

- name: Prep sentry VPS for Phase 5
  hosts: sentry
  become: true
  roles:
    - sentry-prep
  tags: [sentry]
```

---

#### `infra/ansible/roles/sport-stack/tasks/main.yml` (role, orchestration)

**Аналог:** `docs/RUNBOOKS/sops-edit.md §Deploy script` lines 330-354 — Phase 3 ВРАПИТ этот bash script в Ansible tasks (CONTEXT D-12, не replaces).

**Existing reference pattern** (sops-edit.md L344-352, bash deploy.sh):
```bash
# Decrypt + concat all 3 secret groups в один .env
sops -d --output-type=dotenv .secrets/prod/shared.yaml  > "$ENV_FILE"
sops -d --output-type=dotenv .secrets/prod/mapbox.yaml >> "$ENV_FILE"
sops -d --output-type=dotenv .secrets/prod/oauth.yaml  >> "$ENV_FILE"

docker-compose \
  -f services/backend/docker-compose.prod.yml \
  --env-file "$ENV_FILE" \
  up -d
```

**Ansible-вариант** (RESEARCH §Pattern 2 L329-376 + Pattern 3 L394-417):
```yaml
# infra/ansible/roles/sport-stack/tasks/main.yml
- import_tasks: decrypt_sops.yml      # delegate_to: localhost; writes /run/sport.env
- import_tasks: run_migrations.yml    # docker compose run --rm migrate
- name: Restart sport-stack systemd unit
  ansible.builtin.systemd:
    name: sport-stack.service
    state: restarted
    enabled: true
    daemon_reload: true
- import_tasks: smoke_probe.yml       # local_action curl/smoke_*.py
```

---

#### `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml` (SOPS → tmpfs)

**Аналог (concept):** `docs/RUNBOOKS/sops-edit.md §Deploy script` lines 343-346 (та же 3-group concat) + `.secrets/<env>/` структура.

**Pattern (RESEARCH §Pattern 2 L329-376):**
```yaml
- name: Decrypt SOPS secrets on controller (NEVER on remote VPS — D-12)
  delegate_to: localhost
  become: false                          # NO sudo on localhost
  block:
    - ansible.builtin.tempfile:
        state: file
        suffix: .env
      register: tmp_env

    - ansible.builtin.shell: |
        set -euo pipefail
        : > {{ tmp_env.path }}
        for f in shared mapbox oauth; do
          sops -d --output-type=dotenv .secrets/{{ env_name }}/${f}.yaml >> {{ tmp_env.path }}
        done
      args:
        chdir: "{{ playbook_dir }}/../.."
      environment:
        SOPS_AGE_KEY_FILE: "{{ lookup('env', 'SOPS_AGE_KEY_FILE') }}"
      no_log: true                       # CRITICAL — Pitfall 8

    - ansible.builtin.copy:
        src: "{{ tmp_env.path }}"
        dest: /run/sport.env             # tmpfs (RAM-only)
        owner: deploy
        group: deploy
        mode: '0600'
      no_log: true

  always:
    - delegate_to: localhost
      ansible.builtin.command: shred -u {{ tmp_env.path }}
      changed_when: false
      failed_when: false
```

**Critical gotchas (RESEARCH §Pattern 2 L380-385 + Pitfall 8 L686-691):**
- `no_log: true` обязательно — иначе plaintext в `~/.ansible.log`.
- `become: false` на `delegate_to: localhost` block — иначе `SOPS_AGE_KEY_FILE` env var пропадёт.
- `environment: SOPS_AGE_KEY_FILE` обязательно — Ansible не наследует env shell automatically.

---

#### `infra/ansible/roles/sport-stack/tasks/run_migrations.yml`

**Аналог:** `services/backend/docker-compose.prod.yml` lines 91-103 (`migrations` service definition — golang-migrate one-shot).

**Existing pattern excerpt (docker-compose.prod.yml L91-103):**
```yaml
migrations:
  image: migrate/migrate:v4.18.1
  container_name: re_migrations
  volumes:
    - ./migrations:/migrations:ro
  command:
    - -path=/migrations
    - -database=postgres://re:${POSTGRES_PASSWORD}@postgres:5432/running_ecosystem?sslmode=disable
    - up
  depends_on:
    postgres:
      condition: service_healthy
  restart: "no"
```

**Ansible wrapper (RESEARCH §Pattern 3 L394-417):**
```yaml
- name: Stop stack для clean migration (idempotent)
  ansible.builtin.systemd:
    name: sport-stack.service
    state: stopped
  failed_when: false

- name: Run schema migrations (one-shot golang-migrate)
  ansible.builtin.command:
    cmd: >
      docker compose -f /opt/sport/services/backend/docker-compose.prod.yml
      --env-file /run/sport.env
      run --rm migrations
  register: migrate_result
  changed_when: "'no change' not in migrate_result.stdout"
  failed_when: migrate_result.rc != 0
```

**Why this works:** existing `migrations` container уже idempotent + dirty-state-aware (golang-migrate); Ansible orchestrates ordering: stop → migrate → start.

---

#### `infra/ansible/roles/sport-stack/tasks/smoke_probe.yml`

**Аналог:** `services/backend/scripts/smoke_otp.py` lines 24, 34-56 (already env-driven через `BASE_URL`).

**Existing pattern (smoke_otp.py L24, L34-50):**
```python
BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")

def req(method, path, *, token=None, body=None):
    url = BASE + path
    h = {"Accept": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    # ... urllib.request.urlopen с timeout=30 ...
```

**Ansible wrapper:**
```yaml
- name: Run smoke probes (local_action — no remote Python deps needed)
  delegate_to: localhost
  ansible.builtin.command:
    cmd: python3 services/backend/scripts/smoke_otp.py
    chdir: "{{ playbook_dir }}/../.."
  environment:
    BASE_URL: "https://{{ caddy_host }}"
  changed_when: false
```

**Why local_action:** smoke_*.py использует stdlib только (urllib), но running тот же скрипт on dev workstation = zero remote Python install dependency.

---

#### `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2` (systemd unit template)

**Аналог:** нет в репозитории (current deploy = manual `/opt/sport/deploy.sh`, без systemd).
**External reference:** RESEARCH.md §Pattern 1 lines 289-312.

**Stub (15 lines):**
```ini
# /etc/systemd/system/sport-stack.service
[Unit]
Description=Running Ecosystem application stack
Requires=docker.service
After=docker.service network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=/opt/sport/services/backend
EnvironmentFile=/run/sport.env
ExecStartPre=/usr/bin/docker compose -f docker-compose.prod.yml pull
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
ExecStopPost=/bin/bash -c 'shred -u /run/sport.env 2>/dev/null || true'
Restart=on-failure
RestartSec=10s
TimeoutStartSec=600
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

**Critical gotchas (RESEARCH §Pattern 1 L316-320 + Pitfall 4 L634-640):**
- `docker compose` (space, plugin), НЕ `docker-compose` (dash, legacy Python) — Ubuntu 24.04 не имеет legacy binary.
- `Type=simple` + foreground `up` (NOT `up -d`) — иначе systemd теряет PID.
- `EnvironmentFile=/run/sport.env` — читается раз при start; SOPS decrypt должен быть ДО `systemctl start`.

---

#### `infra/ansible/roles/sport-stack/templates/Caddyfile.j2` (per-env Caddyfile)

**Аналог:** `services/backend/gateway/Caddyfile.prod` — ВЕСЬ ФАЙЛ (175 строк) копируется verbatim, параметризуется host через Jinja2.

**Existing pattern (Caddyfile.prod L9-11, L18, L27):**
```caddy
{
    email {env.CADDY_ACME_EMAIL}
}

s3.148-253-214-156.sslip.io {
    reverse_proxy minio:9000
    # ...
}

148-253-214-156.sslip.io {
    # ... 17 handle блоков для identity/activity-sync/notifications/realtime-gw/
    #     messaging/media/feed/social-graph/admin ...
}
```

**Jinja2 replacement (RESEARCH §Code L805-836):**
```caddy
# infra/ansible/roles/sport-stack/templates/Caddyfile.j2
{
    email {{ caddy_acme_email }}
}

s3.{{ caddy_host }} {
    reverse_proxy minio:9000
}

{{ caddy_host }} {
    # ... остальные 17 handle блоков КОПИРУЮТСЯ ВЕРБАТИМ из Caddyfile.prod L29-173 ...
}
```

**Per-env values:**
- `group_vars/staging.yml`: `caddy_host: "<staging-ip>.sslip.io"`, `caddy_acme_email: <ops-email>`
- `group_vars/prod.yml`: `caddy_host: "148-253-214-156.sslip.io"`
- `group_vars/sentry.yml`: `caddy_host: "sentry.<sentry-ip>.sslip.io"` (отдельный compose stub)

**CRITICAL D-16 override (RESEARCH §Pitfall 3 L624-632):** Caddy остаётся в **`docker-compose.prod.yml` контейнере** (`caddy:2.8-alpine`), НЕ apt-installed на хост. Ansible role syncs ТОЛЬКО `Caddyfile.j2` → `/opt/sport/services/backend/gateway/Caddyfile.prod` + triggers `docker compose restart gateway` через handler. Apt-install создаст port 443 conflict с containerized Caddy.

---

#### `infra/ansible/roles/common/tasks/main.yml` (base packages + SSH hardening)

**Аналог:** нет в репозитории.
**External reference:** RESEARCH §Don't Hand-Roll table L572 — recommend `konstruktoid/ansible-role-hardening` (CIS L1) OR lean custom (~30 lines).

**Stub (CIS-aligned):**
```yaml
- name: Apt update + base packages
  ansible.builtin.apt:
    name: [curl, gnupg, ca-certificates, ufw]
    update_cache: true
    cache_valid_time: 3600

- name: Create deploy user (non-root per D-20)
  ansible.builtin.user:
    name: deploy
    shell: /bin/bash
    groups: [docker, sudo]
    append: true

- name: Install authorized SSH keys для devs (D-19)
  ansible.posix.authorized_key:
    user: deploy
    state: present
    key: "{{ item }}"
  loop: "{{ dev_ssh_pubkeys }}"

- name: SSH hardening — PermitRootLogin no + PasswordAuthentication no
  ansible.builtin.copy:
    src: sshd_config_overrides
    dest: /etc/ssh/sshd_config.d/99-hardening.conf
    mode: '0644'
  notify: restart ssh

- name: Narrow sudoers для deploy user (D-20)
  ansible.builtin.copy:
    dest: /etc/sudoers.d/deploy
    content: |
      deploy ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/docker, /usr/bin/docker compose, /bin/shred /run/sport.env
    mode: '0440'
    validate: '/usr/sbin/visudo -cf %s'
```

---

#### `infra/ansible/roles/docker/tasks/main.yml` (Docker Engine install)

**External reference:** docs.docker.com/engine/install/ubuntu (RESEARCH §Don't Hand-Roll table) + `docker compose` plugin (Ubuntu 24.04 — Pitfall 4).

**Stub:** standard Docker apt repo bootstrap → install `docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin` → enable+start `docker.service`.

---

### Secrets (Phase 2 inheritance)

#### `.secrets/<env>/hetzner.yaml` (NEW slot — все 3 env)

**Аналог:** `.secrets/<env>/shared.yaml` — тот же SOPS-encrypted YAML формат, тот же recipient (`.sops.yaml` `creation_rules` уже покрывает `.secrets/.*\.yaml$`).

**Existing pattern (.secrets/dev/shared.yaml L1-14, ciphertext):**
```yaml
#ENC[AES256_GCM,data:...,iv:...,tag:...,type:comment]
IDENTITY_DB_URL: ENC[AES256_GCM,data:...,type:str]
S3_ACCESS_KEY: ENC[AES256_GCM,data:...,type:str]
S3_SECRET_KEY: ENC[AES256_GCM,data:...,type:str]
sops:
    age:
        - enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
            ...
            -----END AGE ENCRYPTED FILE-----
          recipient: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
    version: 3.13.0
```

**Workflow (RUNBOOK `sops-edit.md §2` + `.secrets/README.md` L33-43):**
```bash
# Create with placeholder + edit (auto-encrypts at save):
EDITOR=vim sops .secrets/prod/hetzner.yaml
# Type:
#   HCLOUD_TOKEN: REPLACE_ME
#   AWS_ACCESS_KEY_ID: REPLACE_ME       # для s3 backend
#   AWS_SECRET_ACCESS_KEY: REPLACE_ME
# Save → SOPS encrypts → commit
```

**User-action checkpoint (CONTEXT §user_checkpoints item 1):** Plan 03-01 Task 0 — user логинится в Hetzner Console, создаёт API token + Object Storage credentials, pastes через `sops set` или `EDITOR=vim sops`.

---

### Documentation

#### `docs/RUNBOOKS/deploy.md` (NEW — INFRA-07)

**Аналог:** `docs/RUNBOOKS/sops-edit.md` — структурный шаблон (9 numbered sections, русские headers per Phase 2 convention).

**Existing structure pattern (sops-edit.md grep — sections):**
```
## 1. Environment Setup
## 2. Edit existing encrypted file
## 3. Create new encrypted file
## 4. Decrypt to stdout (read-only)
## 5. Decrypt as dotenv for deploy
## 6. Rotate recipients (after `.sops.yaml` edited)
## 7. Recovery — Lost age key
## 8. Merge conflicts on encrypted YAML
## 9. Deploy sequence (SCP-based prod deploy)
---
## Cross-references
```

**Predicted sections для deploy.md:**
```
## 1. Dev workstation setup (brew install terraform/ansible + SOPS_AGE_KEY_FILE)
## 2. Hetzner Cloud account + Object Storage bucket bootstrap (USER ACTION)
## 3. Terraform init/plan/apply + import existing prod VPS
## 4. Ansible — first-run on staging-app-01 (measure <60min target)
## 5. Ansible — production deploy (cutover from manual /opt/sport/deploy.sh)
## 6. Smoke verification post-deploy
## 7. Rollback (git checkout + re-run Ansible; Phase 4 wraps в CI)
## 8. Recovery — lost TF state lock + force-unlock
## 9. Measured timing log (date, env, duration, notes)
---
## Cross-references
```

**Why copy structure from sops-edit.md:** доказано работающая структура для 2-dev команды; русские headers + per-stage commands + Critical gotchas + Cross-references раздел.

---

## Shared Patterns (cross-cutting)

### Pattern A: SOPS decrypt via tmpfs + trap shred

**Source:** `docs/RUNBOOKS/sops-edit.md` §Deploy script lines 335-353
**Apply to:** `infra/terraform/tf-wrap.sh`, `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml`

**Excerpt:**
```bash
set -euo pipefail
umask 077
export SOPS_AGE_KEY_FILE=/etc/sops/age.key   # OR ~/.config/sops/age/keys.txt на dev

ENV_FILE="$(mktemp /run/sport.env.XXXXXX)"   # /run = tmpfs (RAM-only, never lands on disk)
trap "shred -u '$ENV_FILE' 2>/dev/null || rm -f '$ENV_FILE'" EXIT

sops -d --output-type=dotenv .secrets/<env>/<group>.yaml >> "$ENV_FILE"
```

**Why critical:** plaintext lifetime constraints — `/run` tmpfs гарантирует no-disk-residue даже если `trap` не отработает; `umask 077` блокирует other-UID readers; `shred` overwrites memory pages.

---

### Pattern B: Fail-fast env var требования (preserved from existing compose)

**Source:** `services/backend/docker-compose.prod.yml` lines 19, 58-59, 113, 284 (множество `${VAR:?need ...}` форм)
**Apply to:** `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2` (через `EnvironmentFile=/run/sport.env` — compose поглощает + fail-fast'ит)

**Existing excerpt (docker-compose.prod.yml L19, L58-59):**
```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?need POSTGRES_PASSWORD}
MINIO_ROOT_USER: ${MINIO_ROOT_USER:?need MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?need MINIO_ROOT_PASSWORD}
```

**Why critical:** Phase 2 SEC-09 gate — compose fails-fast если `/run/sport.env` неполный, до того как services попытаются стартануть. Phase 3 systemd `ExecStart` наследует это поведение бесплатно.

---

### Pattern C: SOPS file slot structure (Phase 2 inheritance)

**Source:** `.secrets/<env>/{shared,mapbox,oauth}.yaml` + `.sops.yaml` `creation_rules`
**Apply to:** NEW `.secrets/<env>/hetzner.yaml` slot

**Existing pattern (.sops.yaml L24-26):**
```yaml
creation_rules:
  - path_regex: \.secrets/.*\.yaml$       # auto-covers any new file in .secrets/
    age: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
```

**Why critical:** **никаких изменений `.sops.yaml` НЕ требуется** для нового `hetzner.yaml` slot — regex автоматически покрывает. Только `EDITOR=vim sops .secrets/<env>/hetzner.yaml` создаёт + шифрует.

---

### Pattern D: env-driven smoke probe (existing baseline)

**Source:** `services/backend/scripts/smoke_otp.py` line 24 (+ все 9 smoke_*.py файлов same pattern)
**Apply to:** `infra/ansible/roles/sport-stack/tasks/smoke_probe.yml`

**Existing excerpt (smoke_otp.py L24):**
```python
BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")
```

**Why critical:** все 9 smoke scripts уже env-driven — Ansible просто экспортирует `BASE_URL=https://{{ caddy_host }}` перед `command: python3 smoke_*.py`. Никакой модификации smoke scripts не нужно.

---

### Pattern E: Caddy preserve verbatim + Jinja2 host parametrization

**Source:** `services/backend/gateway/Caddyfile.prod` (175 строк, 17 handle блоков)
**Apply to:** `infra/ansible/roles/sport-stack/templates/Caddyfile.j2`

**Replacement rule (только 2 параметра):**
- `{env.CADDY_ACME_EMAIL}` (L10) → `{{ caddy_acme_email }}` (Jinja2)
- `148-253-214-156.sslip.io` (L18, L27) → `{{ caddy_host }}` (Jinja2)
- ВСЕ остальные строки (handle blocks для identity/activity-sync/notifications/realtime-gw/messaging/media/feed/social-graph/admin) — копируются ВЕРБАТИМ.

---

## Anti-Patterns to Avoid (cross-cutting)

| Anti-pattern | Where it would surface | Mitigation source |
|---|---|---|
| `docker-compose` (dash, Python legacy) в systemd ExecStart | `sport-stack.service.j2` | RESEARCH Pitfall 4 L634-640 → use `docker compose` (space, plugin) |
| `Type=forking` + `up -d` в systemd | `sport-stack.service.j2` | RESEARCH §Pattern 1 L317 → `Type=simple` + foreground `up` |
| `sops -d` на remote VPS | любая Ansible task без `delegate_to: localhost` | CONTEXT Pitfall 6 + RESEARCH §Pattern 2 L325 |
| Apt-install Caddy при существующем `caddy:2.8-alpine` контейнере | `roles/caddy/` (отменяется per Pitfall 3) | RESEARCH Pitfall 3 L624-632 → keep Caddy in compose; role syncs Caddyfile only |
| `terraform apply` без import существующего prod VPS | `infra/terraform/servers.tf` Wave 1 | RESEARCH §Pattern 4 L423 + Pitfall 10 L700-712 |
| HCL block ОТСУТСТВУЕТ при `terraform import` | `terraform import` Wave 1 step | RESEARCH Pitfall 10 — HCL first, import second |
| Открытие 4222/5432/6379/9000 в Hetzner firewall | `infra/terraform/firewall.tf` | RESEARCH §Pattern 6 L540-545 — все internal |
| TF state в git | `.gitignore` миссит `terraform.tfstate*` | CONTEXT Pitfall 5; VALIDATION §Wave 0 line 55 |
| `no_log: false` (default) на decrypt/copy tasks | `decrypt_sops.yml` | RESEARCH Pitfall 8 L686-691 → `no_log: true` обязательно |
| `skip_requesting_account_id = false` для Hetzner Object Storage | `infra/terraform/backend.tf` | RESEARCH Pitfall 2 L614-622 → must be `true` |
| Sentry на `cx32` (8 GB RAM) | `infra/terraform/servers.tf` `sentry_01` | RESEARCH Pitfall 1 L602-612 → use `cx42` (16 GB) минимум |

---

## No Analog Found (greenfield — use external refs)

| File | Role | Data Flow | Reason | External reference |
|---|---|---|---|---|
| `infra/terraform/*.tf` (все 9 файлов) | config | TF → cloud API | Никаких Terraform файлов в репозитории не существует | RESEARCH §Code Examples L745-800 + Patterns 4-6 |
| `infra/ansible/site.yml` + `inventory/*/hosts.yml` + `group_vars/*.yml` | playbook/inventory/config | Ansible → SSH | Никаких Ansible файлов в репозитории не существует | RESEARCH §Code Examples L717-836 |
| `infra/ansible/roles/{common,docker,sentry-prep}/tasks/main.yml` | role | apt/docker install | Никаких роле-based Ansible structure не существует | docs.ansible.com + docs.docker.com/engine/install/ubuntu + RESEARCH §Don't Hand-Roll table L564-577 |
| `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2` | template | systemd unit | Нет существующих systemd units на VPS (manual deploy.sh model) | RESEARCH §Pattern 1 L289-312 |

**File-with-mixed-coverage:**
- `infra/ansible/roles/sport-stack/templates/Caddyfile.j2` — **exact codebase analog** (`gateway/Caddyfile.prod`) для тела, **external ref** для Jinja2 templating syntax (RESEARCH §Code L805-836).

---

## Metadata

**Analog search scope:**
- `/Users/ismail/Desktop/projects/sport/services/backend/` (compose, gateway, migrations, scripts, observability)
- `/Users/ismail/Desktop/projects/sport/.secrets/` (SOPS slot pattern)
- `/Users/ismail/Desktop/projects/sport/docs/RUNBOOKS/` (existing runbook structure)
- `/Users/ismail/Desktop/projects/sport/.sops.yaml`, `.gitignore` (Phase 2 config inheritance)
- `/Users/ismail/Desktop/projects/sport/infra/` — **не существует** (greenfield confirmed)

**Files scanned in detail:**
1. `services/backend/docker-compose.prod.yml` (304 lines — read 1-120 + 260-304)
2. `services/backend/gateway/Caddyfile.prod` (175 lines — full)
3. `services/backend/scripts/smoke_otp.py` (read 1-60)
4. `docs/RUNBOOKS/sops-edit.md` (411 lines — read §9 deploy lines 324-396 + section index grep)
5. `.sops.yaml` (27 lines — full)
6. `.secrets/dev/shared.yaml` (40 lines — ciphertext format)
7. `.secrets/README.md` (read 1-50)
8. `.gitignore` (read 1-40)
9. `03-CONTEXT.md` (291 lines — full)
10. `03-RESEARCH.md` (read in 3 chunks: 1-400, 400-800, 800-1000 — total ~1000 lines)
11. `03-VALIDATION.md` (85 lines — full)
12. `CLAUDE.md` (79 lines — full)

**Pattern extraction date:** 2026-05-16

**Files-to-create count breakdown:**
- 11 Terraform (.tf + .sh + .tfvars.example)
- 19 Ansible (site.yml + 4 inventory + 4 group_vars + 5 roles × tasks/templates/handlers)
- 3 SOPS secret slots (`.secrets/{dev,staging,prod}/hetzner.yaml`)
- 1 doc (`docs/RUNBOOKS/deploy.md`)
- 1 .gitignore patch
= **35 file touches** (28 new files + 7 modified — `.gitignore` + 6 в existing dirs untouched per "preserve" patterns)

---

## PATTERN MAPPING COMPLETE

**Phase:** 3 — Infrastructure as Code (Ansible + Terraform для Hetzner Cloud)
**Files classified:** 33 (28 new + 5 modified/preserved)
**Analogs found:** 11 / 33 (33%) — large external-ref share является expected для greenfield IaC

### Coverage

- Files with exact analog: 8 (Caddyfile.j2 ← Caddyfile.prod; decrypt_sops.yml ← sops-edit.md; run_migrations.yml ← compose migrations service; smoke_probe.yml ← smoke_otp.py BASE_URL pattern; 3 × `.secrets/<env>/hetzner.yaml` ← `.secrets/<env>/shared.yaml`; `deploy.md` ← `sops-edit.md` structure; `tf-wrap.sh` ← deploy.sh L335-352)
- Files with role-match/partial analog: 3 (`terraform.tfvars.example` ← `.secrets/` placeholder pattern; `group_vars/*.yml` ← Caddyfile.prod host pattern; `sentry-prep/` ← `docker/` role sibling)
- Files with no analog (external refs): 22 (Terraform греenfield × 9 + Ansible greenfield × 13)

### Key Patterns Identified

1. **SOPS decrypt via tmpfs + `trap shred`** — единственный канонический способ для plaintext-in-flight (sops-edit.md L335-353 ← apply ко всем Ansible decrypt tasks + tf-wrap.sh).
2. **Fail-fast `${VAR:?need ...}` сохраняется** — compose-layer защита (docker-compose.prod.yml L19, L58-59, L113, L284) переживает systemd обёртку без изменений; Phase 2 SEC-09 gate inherited free.
3. **Caddy остаётся в compose, НЕ apt-installed** — D-16 override per RESEARCH Pitfall 3; роль "caddy" становится "render Caddyfile template only" + `docker compose restart gateway` handler.
4. **Smoke probes уже env-driven** — `BASE_URL` (smoke_*.py L24) = Ansible export-only, no script changes.
5. **`.sops.yaml` regex `\.secrets/.*\.yaml$`** автоматически покрывает new `hetzner.yaml` slot — никаких изменений в SOPS config не требуется для Phase 3.
6. **HCL-first + `terraform import` second** — критическое sequencing для prod VPS brownfield (Pitfall 10), Plan 03-02 Wave 1 sequence: write HCL → sanity plan → get server ID → import → reconcile drift → clean plan → apply.

### File Created

`/Users/ismail/Desktop/projects/sport/.planning/phases/03-infrastructure-as-code/03-PATTERNS.md`

### Ready for Planning

Pattern mapping completed. Planner может ссылаться на:
- 8 exact analogs из репозитория (concrete excerpts with file:line)
- 22 external refs из RESEARCH.md §Code Examples / §Patterns 1-6 / §Pitfalls 1-10
- 5 cross-cutting shared patterns (A-E)
- 11 anti-patterns с explicit mitigation refs
