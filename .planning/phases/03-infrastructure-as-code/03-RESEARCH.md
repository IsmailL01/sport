# Phase 3: Infrastructure as Code — Research

**Researched:** 2026-05-16
**Domain:** IaC (Ansible + Terraform) для Hetzner Cloud (multi-VPS dev/staging/prod/sentry, docker-compose-on-systemd, SOPS-decrypt-at-deploy)
**Confidence:** HIGH overall (Terraform/Ansible/Caddy/SOPS hard-verified via official docs + Hetzner community tutorials; **one significant correction** vs CONTEXT D-11 — Sentry RAM sizing)


## ⚠ SUPERSEDED SECTIONS (2026-05-17 pivot)

> **Pivot context:** Пользователь уточнил 2026-05-17 что у него нет Hetzner Cloud account — только провайдер-агностичный SSH-accessible Linux VPS. Все Terraform / Hetzner-Cloud-API / multi-VPS / Object-Storage / sentry-01 sections ниже SUPERSEDED. Что остаётся актуальным: Ansible best practices, SOPS via `delegate_to: localhost`, docker-compose-on-systemd umbrella unit (D-04), Caddy в compose (D-16 correction kept), `docker compose` space-form (D-04 correction kept), migration via one-shot `docker compose run --rm migrate` (D-14 kept), <60min deploy timing realism, `brew install ansible` (terraform install no longer needed). Полный pivot rationale + новые decisions D-22..D-26: см. `03-CONTEXT.md §## ⚠ PIVOT NOTICE`.

**SUPERSEDED sections (do not consume for active planning):**

| Section | Reason |
|---------|--------|
| §Summary — paragraphs о Hetzner Object Storage / D-05 closure / Sentry RAM correction | SUPERSEDED — no Terraform, sentry-01 deferred to Phase 5 |
| §Architectural Responsibility Map — "Cloud resource lifecycle (Terraform)" row | SUPERSEDED — no Terraform |
| §User Constraints §Locked Decisions — D-01 (Terraform half), D-02 (3-VPS topology), D-05 (TF state), D-06 (Hetzner Cloud Firewall), D-09/D-10/D-11 (Sentry VPS) | SUPERSEDED — see 03-CONTEXT.md §PIVOT NOTICE |
| §Phase Requirements — INFRA-02, INFRA-04, INFRA-06 rows | SUPERSEDED — deferred to v1.1 (INFRA-02/04) or Phase 5 (INFRA-06) |
| §Standard Stack — Terraform, hcloud provider, Hetzner Object Storage, Hetzner Storage Box | SUPERSEDED — no Terraform, no Hetzner Cloud |
| §Alternatives Considered — Hetzner Object Storage S3 backend rows | SUPERSEDED — no Terraform |
| §Standard Stack §Installation — `brew install terraform` | SUPERSEDED — only `brew install ansible` needed |
| §Architecture Patterns §System Architecture Diagram — Terraform + Hetzner Object Storage + multi-VPS topology | SUPERSEDED — single VPS, no Terraform |
| §Architecture Patterns §Recommended Project Structure — `infra/terraform/` tree, `infra/ansible/inventory/{staging,sentry}/`, `sentry-prep` role | SUPERSEDED — Terraform tree deleted (commit `00bcb39`), staging/sentry inventory groups dropped |
| §Pattern 4: Terraform import existing prod VPS | SUPERSEDED — no Terraform |
| §Pattern 5: Hetzner Object Storage Terraform backend (D-05) | SUPERSEDED — no Terraform |
| §Pattern 6: Hetzner Cloud Firewall (D-06) | SUPERSEDED — UFW replaces (see new §UFW section below in §Don't Hand-Roll context) |
| §Anti-Patterns — "Terraform state в git", "`terraform apply` без `terraform import`", "Каскадное удаление firewall rules через `terraform destroy`" rows | SUPERSEDED — no Terraform |
| §Don't Hand-Roll — "TF state file locking", "Per-VPS firewall management (hcloud_firewall)", "Hetzner DNS automation" rows | SUPERSEDED — replace UFW row added below |
| §Runtime State Inventory — references к "Terraform import должен НЕ трогать данные" | SUPERSEDED partial — backup перед cutover still applies, Terraform reference dropped |
| §Pitfall 1: Sentry RAM sizing — D-11 CX42 correction | SUPERSEDED — sentry-01 deferred to Phase 5; correction will land там |
| §Pitfall 2: Hetzner S3 backend skip_requesting_account_id | SUPERSEDED — no Terraform |
| §Pitfall 5: Hetzner Storage Box ≠ Object Storage — D-05 misnomer | SUPERSEDED — no Terraform |
| §Pitfall 7: SSH key drift after terraform import | SUPERSEDED — no Terraform |
| §Pitfall 10: terraform import пишет state, НЕ HCL | SUPERSEDED — no Terraform |
| §Code Examples §Sample infra/terraform/main.tf | SUPERSEDED — no Terraform |
| §Code Examples §Sample hcloud_server + hcloud_firewall for sentry-01 | SUPERSEDED — sentry-01 deferred to Phase 5 |

**KEPT sections (still active for planning):**

- §Architecture Patterns §Pattern 1: docker-compose-on-systemd umbrella (D-04 — verified, KEPT)
- §Architecture Patterns §Pattern 2: SOPS decrypt via `delegate_to: localhost` (D-12 — KEPT)
- §Architecture Patterns §Pattern 3: Migration as separate Ansible play (D-14 — KEPT)
- §Anti-Patterns — `docker-compose` dash form, `Type=forking` + `up -d`, `sops -d` on remote VPS, inline secrets в Ansible vars
- §Don't Hand-Roll — SOPS decrypt, Caddy install + ACME, systemd unit для docker-compose, schema migrations, SSH hardening (mostly KEPT)
- §Pitfall 3: Caddy в compose vs apt-installed (D-16 correction — KEPT, port 443 conflict)
- §Pitfall 4: `docker compose` vs `docker-compose` ExecStart path (KEPT — Ubuntu 24.04 plugin form)
- §Pitfall 6: <60min INFRA-07 timing realism (KEPT — adapted for "first-clean-Ansible-deploy on existing prod VPS")
- §Pitfall 8: `no_log: true` без SOPS plaintext leak (KEPT)
- §Pitfall 9: `migrate` container parallel races (KEPT — single-VPS, no races)
- §Sample `infra/ansible/site.yml` (KEPT, but `sentry` host group dropped post-pivot)
- §Sample Caddyfile.j2 template (KEPT)

### NEW Section: §UFW (community.general.ufw) — replaces Pattern 6 Hetzner Cloud Firewall

**What:** Ansible's `community.general.ufw` module manages Ubuntu's UFW (Uncomplicated Firewall) idempotently. UFW is OS-level (configures iptables under the hood) — works on any Linux VPS, no provider API dependency.

**When to use:** Phase 3 post-pivot (D-24) — provider-agnostic OS-level firewall replacing Hetzner Cloud Firewall.

**Example pattern** (will be implemented in NEW Plan 03-01 `roles/ufw/`):

```yaml
# infra/ansible/roles/ufw/tasks/main.yml
- name: Set UFW default policies
  community.general.ufw:
    direction: "{{ item.direction }}"
    policy: "{{ item.policy }}"
  loop:
    - { direction: incoming, policy: deny }
    - { direction: outgoing, policy: allow }

- name: Allow Caddy HTTPS (443) from anywhere
  community.general.ufw:
    rule: allow
    port: '443'
    proto: tcp

- name: Allow SSH from dev admin IPs only
  community.general.ufw:
    rule: allow
    port: '22'
    proto: tcp
    src: "{{ item }}"
  loop: "{{ dev_admin_ips }}"

- name: Enable UFW
  community.general.ufw:
    state: enabled
```

**Effective ports policy (matches original D-06):**

| Port | Direction | Source | Disposition |
|------|-----------|--------|-------------|
| 443/TCP | in | 0.0.0.0/0 | allow (Caddy public) |
| 22/TCP | in | `{{ dev_admin_ips }}` (group_var) | allow (admin SSH from dev IPs) |
| 80/TCP | in | * | deny (Caddy redirects via `redir 308`) |
| 4222/TCP (NATS) | in | * | deny (internal-only per D-07) |
| 5432/TCP (Postgres) | in | * | deny (internal-only) |
| 6379/TCP (Redis) | in | * | deny (internal-only) |
| 9000/TCP (MinIO) | in | * | deny (served via Caddy `s3.<vps-ip>.sslip.io` per D-08) |
| * | out | * | allow (services need DNS, Mapbox API, Expo Push, OAuth providers) |

**Critical gotchas:**
- `community.general.ufw` requires UFW package installed first — add `ufw` to `common_packages` в `common` role defaults.
- `state: enabled` is the last task — enabling UFW BEFORE allowing SSH locks Ansible out (Ansible runs via SSH).
- Verify rules via `ufw status numbered` on the remote VPS post-apply.

[CITED: docs.ansible.com/ansible/latest/collections/community/general/ufw_module.html]

---

## Summary

Phase 3 строит IaC seam поверх уже работающего production stack на `148.253.214.156`. Все 21 CONTEXT-decision устойчивы при проверке кроме **D-11 (Sentry VPS sizing)** — Sentry self-hosted 2026 требует **минимум 16 GB RAM + 4 vCPU + 16 GB swap** (источник: develop.sentry.dev/self-hosted), а CONTEXT предполагал CX32 (8 GB). Это блокирует Phase 5 если не исправлено — рекомендуется **CX42 (8 vCPU / 16 GB / 160 GB SSD)** для `sentry-01`.

Hetzner Object Storage (S3-compatible, eu-central-1) **поддерживает Terraform `s3` backend** с native locking через `use_lockfile = true` (S3 conditional writes), при условии трёх skip-флагов: `skip_credentials_validation`, `skip_metadata_api_check`, `skip_region_validation`. Это **проще и надёжнее** чем `terraform-backend-git` (branch-as-lock pattern) и **возможнее** чем Storage Box (SFTP/WebDAV — нет conditional writes, нет locking). **D-05 закрывается: Hetzner Object Storage + `s3` backend + `use_lockfile = true`.**

NATS exposure verified — никаких external clients нет: `realtime-gw/cmd/server/main.go:44` хардкодит `nats://nats:4222` internal, mobile app не содержит ни одной ссылки на 4222 (только `/ws` WebSocket через Caddy). **D-07 подтверждается: NATS остаётся internal-only, никакого `4222` в Hetzner firewall.**

Docker-compose-on-systemd (D-04) — sound pattern, подтверждён множеством production-ready guides (`Restart=on-failure` + `Requires=docker.service` + `WorkingDirectory=` + `ExecStart=/usr/bin/docker compose ... up`). Главный gotcha: `docker compose` (новый CLI plugin) vs `docker-compose` (legacy Python) — на Ubuntu 24.04+ canonical форма `docker compose` (без дефиса).

**Primary recommendation:** Wave-структура из CONTEXT остаётся корректной, но **Plan 03-01 Task 0 должен включать installation check для `terraform` и `ansible`** на dev-workstation (на тестовом dev-machine они отсутствуют) + **`sentry-01` server_type меняется с `cx32` на `cx42`** (или `ccx13` dedicated CPU для consistent IOPS).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cloud resource lifecycle (VPS, network, firewall, Storage Box, Object Storage) | **Terraform** | — | Stateful, нужен reconciliation против Hetzner API |
| Software install + config on VPS (Caddy, Docker, deploy user, ssh hardening) | **Ansible** | — | Convergent/idempotent, без state-file |
| Stack orchestration (8 Go services + Postgres + Redis + NATS + MinIO) | **docker-compose** | systemd (supervises compose) | Preserves existing `docker-compose.prod.yml` |
| Service supervision (auto-restart, boot ordering) | **systemd** (`sport-stack.service`) | docker (internal restart_policy) | systemd выше docker = system-level guarantees |
| Secret decrypt at deploy | **SOPS on dev workstation** | Ansible `copy` to remote tmpfs | Age key стоит на dev, не на VPS (Phase 2 D-04) |
| Migration orchestration | **Ansible play** (sequential) | `migrate/migrate:v4.18.1` one-shot container | Ansible enforces ordering: decrypt → migrate → up |
| TLS termination + reverse proxy | **Caddy** (apt-installed) | systemd (caddy.service) | Existing Caddyfile preserved |
| Smoke verification post-deploy | **Ansible local_action** | `services/backend/scripts/smoke_*.py` | Existing scripts already env-driven |

## User Constraints (from CONTEXT.md)

### Locked Decisions (от CONTEXT D-01..D-21, **с одной коррекцией ниже**)

- **D-01:** Ansible (software) + Terraform (cloud resources) — split разделён по природе problem (convergent vs stateful).
- **D-02:** Single Hetzner project; 3 VPS: `prod-app-01` (existing `148.253.214.156`, **terraform import**), `staging-app-01` (new), `sentry-01` (new) + Hetzner Storage Box.
- **D-03:** Inventory layout `infra/ansible/inventory/{dev,staging,prod,sentry}/`. `dev/` указывает на localhost (no Ansible-managed services in dev).
- **D-04:** **Docker-compose-on-systemd umbrella unit (`sport-stack.service`)** — НЕ per-service native binaries. (Verified sound — см. Architecture Patterns ниже.)
- **D-05:** TF state backend — **РЕЗЕРВИРОВАНО ИССЛЕДОВАТЕЛЕМ:** Hetzner Object Storage + Terraform `s3` backend + `use_lockfile = true`. (См. §Standard Stack ниже.)
- **D-06..D-08:** Hetzner Cloud Firewall declared в Terraform; **NATS 4222 internal-only** (verified); MinIO через Caddy `s3.<ip>.sslip.io`.
- **D-09..D-11:** Sentry-01 separate VPS + separate Caddy + separate ACME. **D-11 КОРРЕКЦИЯ:** Sentry RAM требование — **16 GB минимум** (не 8 GB как в CONTEXT). Recommended: `cx42` (8 vCPU / 16 GB) или `ccx13` (2 dedicated vCPU / 8 GB — недостаточно RAM), либо **`ccx23` (4 dedicated vCPU / 16 GB)** для лучшего IOPS-стабильности.
- **D-12..D-15:** SOPS `delegate_to: localhost` для decrypt + `copy` to `/run/sport.env` (tmpfs, mode 0600, owner deploy); `/run/sport.env` shredded на `ExecStopPost=`.
- **D-16..D-17:** Caddy hand-rolled Ansible role (~50 lines), per-env Caddyfile через Jinja2 template.
- **D-18:** sslip.io DNS для v1.0 closed beta; per-VPS-IP-based subdomain для Sentry.
- **D-19..D-20:** `deploy` user (не root) с narrow sudoers; ssh hardening (`PermitRootLogin no`, `PasswordAuthentication no`).
- **D-21:** <60min target измеряется от `ansible-playbook site.yml -i inventory/prod` на fresh Hetzner VPS post-Terraform.

### Claude's Discretion

- Конкретные Ansible role versions / community.sops collection version pins (lean: latest stable на момент Wave 2).
- Конкретный Terraform version pin (lean: `>= 1.11`, требуется для `use_lockfile`).
- Конкретный `hetznercloud/hcloud` provider pin (lean: `~> 1.62`, latest на 2026-04-28).
- Specific Ansible inventory format (lean: `hosts.yml` YAML, не INI — лучше читается + поддерживает group_vars inline).
- Whether to use `community.sops.sops` lookup plugin vs raw `command: sops -d` (lean: **raw `command: sops -d --output-type=dotenv`** via `delegate_to: localhost` — соответствует existing `docs/RUNBOOKS/sops-edit.md §Deploy script`; collection adds dependency surface без benefit для opaque dotenv format).
- Whether `sport-stack.service` ExecStart использует `docker compose ... up` (foreground, recommended для systemd Type=simple) vs `docker compose ... up -d` (detached, требует Type=oneshot или forking) — **lean: foreground `up` + Type=simple** для cleaner systemd integration.

### Deferred Ideas (OUT OF SCOPE — не исследовалось)

- Real `<brand>.com` DNS — v1.1.
- Multi-AZ — v2.0.
- Bastion host — v1.1 if VPS>5.
- K8s migration / Helm — undated.
- Cloudflare in front of Caddy — v1.1.
- Terraform Cloud / Spacelift — v1.1+.
- Per-service systemd units — revisit if/when off docker-compose.
- Automated Mapbox EAS secret push — Phase 11/12.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **INFRA-01** | `infra/ansible/` idempotently installs Caddy + Postgres+TimescaleDB + Redis + NATS + MinIO + 8 Go service units | Single `sport-stack.service` systemd unit wraps existing `docker-compose.prod.yml`; preserves `migrations` one-shot container with `service_completed_successfully`. См. §Architecture Pattern 1. |
| **INFRA-02** | `infra/terraform/` manages Hetzner cloud resources | `hetznercloud/hcloud` provider v1.62.0 stable; `hcloud_server` + `hcloud_firewall` + `hcloud_network` + `hcloud_ssh_key` resources cover all needs. См. §Standard Stack. |
| **INFRA-03** | Environments dev/staging/prod with inventory in `infra/ansible/inventory/{env}/` | Standard Ansible pattern (verified — Ansible 2026 best practices); add `sentry/` as 4th group consumed by `sentry-prep` role. |
| **INFRA-04** | Terraform state in Hetzner Storage Box with remote locking; never in repo | **CORRECTION TO ROADMAP TEXT:** Hetzner Storage Box (SFTP/WebDAV) cannot host TF state with locking — нет conditional writes. **Use Hetzner Object Storage** (S3-compatible) + `s3` backend + `use_lockfile = true`. См. §Standard Stack §Pitfall 5. |
| **INFRA-05** | Network firewall rules explicit; no `0.0.0.0/0` except documented | `hcloud_firewall` with stateful rules; per-VPS attached; SSH 22/TCP restricted to `dev_admin_ips` var. NATS 4222 NEVER exposed (verified). |
| **INFRA-06** | Separate VPS provisioned для Sentry с separate DNS + ACME cert | Sentry-01 как отдельный `hcloud_server` + отдельный `hcloud_firewall`. **CORRECTION D-11:** server_type = `cx42` или `ccx23`, не `cx32`. См. §Pitfall 7. |
| **INFRA-07** | Fresh deploy from `git clone` to all services running <60min (measured, docs/RUNBOOKS/deploy.md) | Realistic estimate: 20-40 min cold, 5-10 min warm. См. §Pitfall 6 timing breakdown. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Terraform | `>= 1.11` (verify with `terraform version`) | IaC for Hetzner Cloud resources | `use_lockfile` для S3 backend стабилен с 1.11 ([VERIFIED: HashiCorp blog](https://www.anantacloud.com/post/no-more-dynamodb-native-s3-locking-now-available-in-terraform-1-11-and-later)) |
| `hetznercloud/hcloud` provider | `~> 1.62` (latest 1.62.0 — 2026-04-28) | Hetzner Cloud API | Official provider ([VERIFIED: registry.terraform.io](https://registry.terraform.io/providers/hetznercloud/hcloud/latest)) |
| Ansible | `>= 2.16` (collections-aware) | Configuration management | Industry standard; community.sops requires ≥ 2.16 |
| `community.sops` collection | latest stable | SOPS integration (optional — см. discretion) | Official Ansible Galaxy collection ([CITED: docs.ansible.com](https://docs.ansible.com/ansible/latest/collections/community/sops/docsite/guide.html)) |
| Caddy v2 | apt-installed stable (auto-updates from cloudsmith repo) | TLS termination + reverse proxy | Single binary, ACME automatic, existing prod Caddyfile preserved ([CITED: caddyserver.com/docs/install](https://caddyserver.com/docs/install)) |
| Docker Engine | `>= 24.0` | Container runtime | Already in use; Compose plugin (`docker compose`, no dash) is canonical on Ubuntu 24.04+ |
| Docker Compose plugin | `>= 2.32.2` | Stack orchestration | Required by Phase 5 Sentry (Sentry docs minimum) ([CITED: develop.sentry.dev/self-hosted](https://develop.sentry.dev/self-hosted/)) |
| `migrate/migrate` | `v4.18.1` (already pinned in compose) | DB migration runner | Existing one-shot init container preserved |
| `sops` | `v3.13.0` (Phase 2 pinned) | Secret decrypt | Already installed на dev workstation (verified) |
| `age` | `v1.3.1` (Phase 2 pinned) | SOPS backend | Already installed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Hetzner Object Storage | n/a (managed service) | Terraform state backend | Per D-05 — НЕ Storage Box |
| Hetzner Storage Box | BX10 (smallest, 1 TB) | Phase 7 pgBackRest target | Provisioned in Phase 3, consumed Phase 7 |
| timescaledb container | `timescale/timescaledb:2.17.2-pg16` | DB | Already pinned in compose; не трогать |
| MinIO container | `minio/minio:RELEASE.2025-01-20T14-49-07Z` | S3 storage | Already pinned; не трогать |
| Caddy container OR apt-installed? | **Discuss:** existing compose использует `caddy:2.8-alpine` container. CONTEXT D-16 предполагает apt-installed (для systemd-native). | **Lean: keep `caddy:2.8-alpine` in compose** — это уже работает, апт-install Caddy создаст конфликт с containerized Caddy on port 443. **CORRECTION TO CONTEXT D-16:** Caddy остаётся в docker-compose, Ansible Caddy role становится not-needed — assert через container management только. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hetzner Object Storage (S3 backend) | Hetzner Storage Box (HTTP backend) | Storage Box не поддерживает conditional writes → нет state locking → unsafe для 2-dev; **REJECTED** |
| Hetzner Object Storage (S3 backend) | `terraform-backend-git` (private repo) | Branch-as-lock pattern сложнее в setup + требует 2-й Git repo (operational overhead для 2-dev команды); Object Storage проще; **REJECTED** |
| Docker-compose-on-systemd (D-04) | 8 separate native systemd units | Без isolation от libc differences; 8× deploy story; CONTEXT D-04 rationale стоит |
| Ansible community.sops collection | Raw `command: sops -d` через `delegate_to: localhost` | Collection добавляет dependency surface; raw command соответствует existing `docs/RUNBOOKS/sops-edit.md`; **PREFER raw command** |
| Hand-rolled Caddy Ansible role (D-16) | Keep `caddy:2.8-alpine` container в docker-compose | **CORRECTION:** хост-installed Caddy создаст port 443 conflict; **PREFER container** (отмена D-16) |
| CX32 для Sentry (D-11) | CX42 (8 vCPU / 16 GB) или CCX23 (4 dedicated / 16 GB) | Sentry require 16 GB; CX32 недостаточно; **CORRECTION** |

**Installation (dev workstation, one-time):**
```bash
# macOS (homebrew):
brew install terraform ansible
# Verify:
terraform version    # expect: >= 1.11
ansible --version    # expect: >= 2.16

# Optional — community.sops collection (если решено его использовать):
ansible-galaxy collection install community.sops
```

**Version verification (run перед commit'ом плана):**
```bash
brew info terraform | grep "stable"
brew info ansible   | grep "stable"
# Hetzner provider:
curl -s https://api.github.com/repos/hetznercloud/terraform-provider-hcloud/releases/latest | jq -r .tag_name
```

[VERIFIED: dev workstation 2026-05-16] `terraform` и `ansible` **НЕ установлены** локально. Это блокирует Plan 03-01 Task 0 — добавить install-check шаг.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DEVELOPER WORKSTATION                            │
│                                                                     │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Terraform │  │   Ansible    │  │  SOPS + age key (~/.config│  │
│  │  CLI 1.11+ │  │  2.16+ CLI   │  │  /sops/age/keys.txt)      │  │
│  └─────┬──────┘  └──────┬───────┘  └──────────┬────────────────┘  │
└────────┼─────────────────┼──────────────────────┼──────────────────┘
         │                 │                      │
         │ (1) terraform   │ (2) ansible-playbook │ (3) sops -d
         │     apply       │     site.yml         │     (delegate_to:
         ▼                 │     -i prod          │      localhost)
   ┌──────────────┐        │                      │
   │  Hetzner     │        │                      │
   │  Object      │◄───────┤ tfstate              │
   │  Storage     │        │ (s3 backend +        │
   │  (state +    │        │  use_lockfile)       │
   │   lock file) │        │                      │
   └──────────────┘        │                      │
         │                 │                      │
         │ (1) provisions  │                      │
         ▼                 ▼                      │
   ┌──────────────────────────────────────────────┼──────────────────┐
   │                  HETZNER CLOUD                                  │
   │                                                                 │
   │  ┌────────────────┐  ┌────────────────┐ ┌─────────────────┐    │
   │  │  prod-app-01   │  │ staging-app-01 │ │   sentry-01     │    │
   │  │  (existing,    │  │  (new, CX22)   │ │ (new, CX42      │    │
   │  │   imported,    │  │                │ │  per corrected  │    │
   │  │   CX22/32)     │  │                │ │  Sentry sizing) │    │
   │  │                │  │                │ │                 │    │
   │  │  Caddy:443     │  │  Caddy:443     │ │  Caddy:443      │    │
   │  │  + 8 Go svcs   │  │  + 8 Go svcs   │ │  (Phase 5 lands │    │
   │  │  + Postgres    │  │  + Postgres    │ │   Sentry stack) │    │
   │  │  + Redis       │  │  + Redis       │ │                 │    │
   │  │  + NATS        │  │  + NATS        │ │                 │    │
   │  │  + MinIO       │  │  + MinIO       │ │                 │    │
   │  │  + migrations  │  │  + migrations  │ │                 │    │
   │  │  init job      │  │  init job      │ │                 │    │
   │  │  (one-shot)    │  │  (one-shot)    │ │                 │    │
   │  └────────┬───────┘  └────────┬───────┘ └────────┬────────┘    │
   │           │  systemd: sport-stack.service        │             │
   │           │  ExecStart=docker compose ... up     │             │
   │           │  /run/sport.env (tmpfs, mode 0600,   │             │
   │           │   shredded ExecStopPost)             │             │
   │           │                                       │             │
   │  ┌────────┴─────────────────┐                    │             │
   │  │ hcloud_firewall:         │                    │             │
   │  │   ingress 443/TCP 0/0    │                    │             │
   │  │   ingress 22/TCP dev_IPs │                    │             │
   │  │   egress  all            │                    │             │
   │  └──────────────────────────┘                    │             │
   │                                                   │             │
   │  ┌────────────────────────────────────────────────┴─────────┐  │
   │  │  Hetzner Storage Box (BX10) — Phase 7 pgBackRest target  │  │
   │  └──────────────────────────────────────────────────────────┘  │
   └─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS via sslip.io
                              ▼
                       ┌──────────────┐
                       │  Mobile App  │
                       │  (EAS prod)  │
                       └──────────────┘
```

**Data flow trace (deploy via Ansible):**
1. Dev запускает `ansible-playbook -i inventory/prod site.yml` на workstation.
2. Ansible play `0_decrypt`: `delegate_to: localhost` + `command: sops -d --output-type=dotenv .secrets/prod/{shared,mapbox,oauth}.yaml > /tmp/sport.env`.
3. Ansible play `1_copy_env`: `copy` module пушит `/tmp/sport.env` → `/run/sport.env` на remote VPS (mode 0600, owner deploy).
4. Ansible play `2_migrate`: `command: docker compose -f /opt/sport/docker-compose.prod.yml --env-file /run/sport.env run --rm migrate` (waits for completion).
5. Ansible play `3_systemctl_restart`: `systemd: name=sport-stack state=restarted`.
6. Ansible play `4_smoke`: `local_action: command: python services/backend/scripts/smoke_otp.py` with `BASE_URL=https://<env>-host.sslip.io`.
7. Ansible play `5_cleanup`: `delegate_to: localhost` + `command: shred -u /tmp/sport.env`.

### Recommended Project Structure

```
infra/
├── ansible/
│   ├── site.yml                          # entry playbook (per-env via -i)
│   ├── ansible.cfg                       # roles_path, inventory, ssh_args
│   ├── inventory/
│   │   ├── dev/hosts.yml                 # localhost only (no Ansible-managed)
│   │   ├── staging/hosts.yml             # staging-app-01
│   │   ├── prod/hosts.yml                # prod-app-01
│   │   └── sentry/hosts.yml              # sentry-01
│   ├── group_vars/
│   │   ├── all.yml                       # dev_admin_ips, ansible_user=deploy
│   │   ├── staging.yml                   # caddy_host=staging-host.sslip.io
│   │   ├── prod.yml                      # caddy_host=148-253-214-156.sslip.io
│   │   └── sentry.yml                    # sentry-specific vars
│   ├── roles/
│   │   ├── common/                       # base packages, deploy user, ssh hardening
│   │   │   ├── tasks/main.yml
│   │   │   ├── handlers/main.yml         # restart ssh
│   │   │   ├── defaults/main.yml         # user-facing vars
│   │   │   └── files/sshd_config_overrides
│   │   ├── docker/                       # Docker Engine + Compose plugin install
│   │   │   ├── tasks/main.yml
│   │   │   └── defaults/main.yml
│   │   ├── sport-stack/                  # /opt/sport/ + sport-stack.service + deploy seq
│   │   │   ├── tasks/main.yml            # copy compose file, render sport-stack.service
│   │   │   ├── tasks/decrypt_sops.yml    # delegate_to: localhost
│   │   │   ├── tasks/run_migrations.yml  # docker compose run --rm migrate
│   │   │   ├── tasks/smoke_probe.yml
│   │   │   ├── templates/sport-stack.service.j2
│   │   │   ├── templates/Caddyfile.j2    # per-env Caddyfile (uses caddy_host var)
│   │   │   ├── handlers/main.yml         # restart sport-stack
│   │   │   └── defaults/main.yml
│   │   └── sentry-prep/                  # base VPS for Phase 5 Sentry install
│   │       ├── tasks/main.yml            # docker install + 443 firewall + Caddy seed
│   │       └── defaults/main.yml
│   └── playbooks/
│       ├── deploy.yml                    # main app deploy
│       ├── bootstrap.yml                 # first-time setup (deploy user, ssh)
│       └── smoke.yml                     # standalone smoke run
└── terraform/
    ├── main.tf                           # provider {hcloud} + locals
    ├── backend.tf                        # s3 backend против Hetzner Object Storage
    ├── versions.tf                       # required_version + provider pins
    ├── variables.tf                      # hcloud_token, dev_ssh_pubkeys, region
    ├── terraform.tfvars.example          # template; real tfvars gitignored
    ├── network.tf                        # hcloud_network (optional v1.1)
    ├── firewall.tf                       # per-VPS hcloud_firewall
    ├── servers.tf                        # prod_app_01 (imported), staging_app_01, sentry_01
    ├── storage_box.tf                    # Phase 7 pgBackRest target
    ├── object_storage_state.tf           # TF state bucket (chicken-and-egg: created manually first)
    └── outputs.tf                        # IPs, hostnames для Ansible inventory consumption

docs/
└── RUNBOOKS/
    └── deploy.md                         # NEW — INFRA-07; measured <60min + step-by-step
```

### Pattern 1: docker-compose-on-systemd umbrella unit (D-04 verified)

**What:** Один systemd unit (`sport-stack.service`) запускает `docker compose ... up` как foreground process. systemd супервизирует compose-runner; docker-compose сам супервизирует 8 containers через их `restart: unless-stopped`.

**When to use:** Multi-service Docker stack где (1) per-service Docker `restart_policy` уже работает, (2) хочется system-level boot guarantees, (3) не хочется писать 8 systemd units.

**Example:**
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

[CITED: bootvar.com/systemd-service-for-docker-compose, dev.to/dohost docker-systemd guide]

**Critical gotchas:**
- `docker compose` (space, plugin) vs `docker-compose` (dash, legacy Python) — Ubuntu 24.04+ ships только plugin form. Use `docker compose` everywhere.
- `Type=simple` + foreground `up` (NOT `up -d`) — иначе systemd теряет PID и не может правильно restart.
- `EnvironmentFile=/run/sport.env` — systemd читает раз при service start; SOPS decrypt должен закончиться ДО `systemctl start`.
- `WorkingDirectory=` обязательно для relative paths в compose file.

### Pattern 2: SOPS decrypt via `delegate_to: localhost`

**What:** Sensitive decrypt happens на dev workstation (где живёт age key); ciphertext-on-rest никогда не покидает encrypted state; только plaintext-in-flight через SSH-tunneled `copy` task.

**When to use:** Когда age key стоит ТОЛЬКО на dev workstation (per Phase 2 D-04 master key strategy), а target VPS не должен иметь decrypt capability.

**Example:**
```yaml
# infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml
- name: Decrypt SOPS secrets on controller
  delegate_to: localhost
  become: false
  vars:
    sops_files:
      - shared
      - mapbox
      - oauth
  block:
    - name: Create temporary env file on controller
      ansible.builtin.tempfile:
        state: file
        suffix: .env
      register: tmp_env

    - name: Decrypt and concatenate all SOPS files
      ansible.builtin.shell: |
        set -euo pipefail
        : > {{ tmp_env.path }}
        for f in {{ sops_files | join(' ') }}; do
          sops -d --output-type=dotenv .secrets/{{ env_name }}/${f}.yaml >> {{ tmp_env.path }}
        done
      args:
        chdir: "{{ playbook_dir }}/../.."   # repo root
      environment:
        SOPS_AGE_KEY_FILE: "{{ lookup('env', 'SOPS_AGE_KEY_FILE') }}"
      changed_when: false
      no_log: true     # CRITICAL: don't log plaintext

    - name: Copy decrypted env to remote VPS
      ansible.builtin.copy:
        src: "{{ tmp_env.path }}"
        dest: /run/sport.env
        owner: deploy
        group: deploy
        mode: '0600'
      no_log: true

  always:
    - name: Shred temp env on controller
      delegate_to: localhost
      become: false
      ansible.builtin.command: shred -u {{ tmp_env.path }}
      changed_when: false
      failed_when: false
```

[CITED: docs.ansible.com/ansible/latest/playbook_guide/playbooks_delegation.html, docs.ansible.com/ansible/latest/collections/community/sops/docsite/guide.html]

**Critical gotchas:**
- `no_log: true` обязательно на decrypt + copy tasks — иначе plaintext попадёт в `ansible.log` или CI artifact.
- `become: false` на `delegate_to: localhost` block — Ansible иначе будет пытаться `sudo` локально (и `SOPS_AGE_KEY_FILE` в env пропадёт).
- `environment: SOPS_AGE_KEY_FILE` обязательно — Ansible не наследует env vars из dev shell automatically. Verify через `lookup('env', ...)`.
- **Pitfall 1 (Phase 2 §5):** `--output-type=dotenv` strip'ит newlines из multi-line values. Для v1.0 single-line secrets — безопасно. **Если Phase 10 P8 cert приземлится в SOPS — НЕ через dotenv path.**

### Pattern 3: Migration as separate Ansible play (D-14)

**What:** Перед запуском stack — отдельный one-shot `docker compose run --rm migrate` который читает `service_completed_successfully` healthcheck из существующего `docker-compose.prod.yml`.

**When to use:** Когда schema migrations должны выполняться при каждом deploy, но никогда параллельно с running services.

**Example:**
```yaml
# infra/ansible/roles/sport-stack/tasks/run_migrations.yml
- name: Stop current stack (если запущен — для clean migration)
  ansible.builtin.systemd:
    name: sport-stack.service
    state: stopped
  failed_when: false   # OK если не запущен

- name: Run schema migrations (golang-migrate one-shot)
  ansible.builtin.command:
    cmd: >
      docker compose -f /opt/sport/services/backend/docker-compose.prod.yml
      --env-file /run/sport.env
      run --rm migrate
  register: migrate_result
  changed_when: "'no change' not in migrate_result.stdout"
  failed_when: migrate_result.rc != 0

- name: Start stack after successful migration
  ansible.builtin.systemd:
    name: sport-stack.service
    state: started
    enabled: true
    daemon_reload: true
```

[VERIFIED: services/backend/docker-compose.prod.yml lines 91-103 — existing `migrations` service uses `migrate/migrate:v4.18.1` + `-path=/migrations -database=... up`]

### Pattern 4: Terraform import existing prod VPS

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

**What:** Существующий `148.253.214.156` VPS уже работает; запуск `terraform apply` без import'а удалит и пересоздаст его (zero-downtime требование сломано). Import первым шагом, потом `plan` reconciles drift.

**When to use:** Brownfield migration существующей infrastructure под Terraform управление.

**Example:**
```hcl
# infra/terraform/servers.tf
resource "hcloud_server" "prod_app_01" {
  name        = "prod-app-01"
  server_type = "cx32"                    # ← verify against actual Hetzner dashboard
  image       = "ubuntu-24.04"            # ← verify
  location    = "nbg1"                    # ← verify (Nuremberg)
  ssh_keys    = [hcloud_ssh_key.dev_a.id, hcloud_ssh_key.dev_b.id]
  firewall_ids = [hcloud_firewall.app.id]

  labels = {
    env  = "prod"
    role = "app"
  }

  # Critical: lifecycle to suppress drift on attributes that can't be changed post-create
  lifecycle {
    ignore_changes = [
      image,      # rebuild required to change; treat as one-shot
      user_data,  # not used post-bootstrap
    ]
  }
}
```

**Import command** (Plan 03-02 Wave 1):
```bash
# Get the server ID from Hetzner Cloud Console UI первый раз
# (TF не может его discover'нуть без API call — это chicken-and-egg)
SERVER_ID=$(hcloud server list -o columns=id,name | grep prod-app-01 | awk '{print $1}')

# Import:
terraform import hcloud_server.prod_app_01 "$SERVER_ID"

# Plan — увидите drift:
terraform plan
# Ожидаемый drift:
#   - server_type если не совпадает с tfvars
#   - labels (если не были set вручную, TF добавит)
#   - firewall_ids (если firewall был attached manually)
#   - ssh_keys (если пересоздавался — IDs изменились)
```

[CITED: registry.terraform.io/providers/hetznercloud/hcloud/latest/docs/resources/server, scalr.com/learning-center/the-ultimate-guide-to-terraform-import]

**Critical gotchas:**
- `import` пишет state, НЕ HCL — нужно прописать `resource` block вручную ДО `import`. Verified against Hetzner provider docs.
- `terraform import` (imperative) vs `import {}` block (Terraform 1.5+, declarative) — для одного VPS imperative проще; для bulk используйте `import` blocks.
- `lifecycle { ignore_changes = [...] }` критично для `image` и `user_data` — иначе TF может попытаться destroy+recreate на первом apply.

### Pattern 5: Hetzner Object Storage Terraform backend (D-05 resolution)

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

**What:** Hetzner Object Storage — S3-compatible (Ceph-S3 implementation). Terraform `s3` backend поддерживает её через 3 skip-флага + `use_lockfile = true` (S3-native locking, Terraform 1.11+).

**When to use:** TF state для multi-dev команды; нужен conditional writes для lock primitive; нельзя в git/storage box.

**Example:**
```hcl
# infra/terraform/backend.tf
terraform {
  required_version = ">= 1.11"
  backend "s3" {
    bucket   = "running-ecosystem-tfstate"
    endpoint = "https://fsn1.your-objectstorage.com"     # Falkenstein region
    key      = "infra/prod.tfstate"
    region   = "main"                                    # mandatory but ignored by Hetzner

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true                   # CRITICAL: fixes issue #36924

    use_lockfile = true                                  # S3-native locking via If-None-Match
    force_path_style = true                              # Ceph-S3 compatibility
  }
}
```

[VERIFIED: oliverjakobi.com/posts/opentofu-s3-backend-hetzner-storage/, community.hetzner.com/tutorials/howto-hcloud-s3-terraform-backend/, github.com/hashicorp/terraform/issues/36924]

**Credentials:** export `AWS_ACCESS_KEY_ID` и `AWS_SECRET_ACCESS_KEY` (Hetzner Object Storage credentials, не AWS) перед `terraform init`. Положить в SOPS `.secrets/dev/hetzner.yaml` для общедоступности команде (это уже Phase 2 D-04 pattern для других секретов).

**Bootstrap chicken-and-egg:** TF state bucket нужно создать вручную через Hetzner Cloud Console UI ДО первого `terraform init` (TF не может создать собственный backend). Document this в Plan 03-01 Task 0 как USER ACTION.

**Critical gotchas:**
- `skip_requesting_account_id = true` — критично, иначе Terraform пытается контактировать `sts.eu-central.amazonaws.com` и failes timeout. [VERIFIED: github.com/hashicorp/terraform/issues/36924]
- `use_lockfile = true` требует Terraform `>= 1.11` (`>= 1.10` помечает experimental).
- `force_path_style = true` обязательно для Ceph-S3 (Hetzner's implementation).

### Pattern 6: Hetzner Cloud Firewall (D-06)

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

**Example:**
```hcl
# infra/terraform/firewall.tf
resource "hcloud_firewall" "app" {
  name = "app-public"

  # Ingress: HTTPS public + SSH dev-only
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.dev_admin_ips           # ← per-dev /32 IPs from tfvars
  }

  # NO port 80 — Caddy redirects via internal logic
  # NO port 4222 (NATS internal-only — verified)
  # NO port 5432 (Postgres internal-only)
  # NO port 6379 (Redis internal-only)
  # NO port 9000 (MinIO behind Caddy)

  # Hetzner default egress is allow-all unless explicit rules — we want all-egress
  # (services need outbound DNS, Mapbox API, Expo Push, Strava API, ACME LE)
}
```

[CITED: registry.terraform.io/providers/hetznercloud/hcloud/latest/docs/resources/firewall, blog.jklug.work/cloud/terraform-hetzner/]

### Anti-Patterns to Avoid

- **`docker-compose` (dash) command in systemd ExecStart** — Ubuntu 24.04+ не имеет legacy binary; use `docker compose` (space, plugin).
- **`Type=forking` + `up -d`** in sport-stack.service — systemd теряет PID, не может корректно restart. Use `Type=simple` + foreground `up`.
- **`sops -d` on remote VPS** — age key не должен покидать dev workstation. Use `delegate_to: localhost`.
- **`PolylineAnnotation` / `AnnotationManager`** — N/A для Phase 3 (mobile concern, см. ТЗ §10.5).
- **Terraform state в git** — INFRA-04 explicit. Use Hetzner Object Storage.
- **Inline secrets в Ansible vars** — все секреты через SOPS-decrypt path. Phase 2 SEC-09 gate.
- **`terraform apply` без `terraform import` существующего prod VPS** — destroy+recreate = production downtime. Plan 03-02 Wave 1 owns import.
- **Каскадное удаление firewall rules через `terraform destroy`** — Hetzner firewall может остаться attached к serverу даже после destroy resource. Use `terraform state rm` если нужен force-detach.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TF state file locking | Custom flock-on-NFS scheme | Hetzner Object Storage + `use_lockfile = true` | S3 conditional writes гарантированы atomically; flock на NFS не работает надёжно |
| SOPS decrypt в Ansible | Custom Python script | `community.sops` collection OR raw `command: sops -d` | Both are well-tested; custom code = new attack surface |
| Caddy install + ACME | Custom Nginx + certbot + cron renewal | Caddy (apt-installed или container) | Caddy = single binary, automatic ACME, < 50 lines конфига; built-for-purpose |
| systemd unit для docker-compose | Custom bash wrapper script | Native systemd unit с `ExecStart=docker compose ... up` | systemd супервизирует — auto-restart, journalctl, dependency ordering |
| Schema migrations orchestration | Custom Go script wrapping psql | `migrate/migrate:v4.18.1` one-shot container + Ansible play sequencing | golang-migrate handles up/down/dirty-state recovery; existing in compose |
| Per-VPS firewall management | Custom iptables через Ansible | `hcloud_firewall` Terraform resource | Hetzner stateful firewall = infrastructure-level, applies BEFORE traffic reaches VM |
| SSH hardening (PermitRootLogin etc.) | Custom `lineinfile` tasks | `ansible-collections/community.general` + standard role pattern OR existing role like `konstruktoid/ansible-role-hardening` | Standard pattern; CIS-aligned defaults |
| Hetzner DNS automation | Custom API calls | sslip.io zero-config (v1.0) → `hetznerdns/hetznerdns` provider (v1.1) | sslip.io free, auto-DNS-from-IP; eliminates entire problem for closed beta |

**Key insight:** В Phase 3 почти всё уже существует как готовый компонент — задача интеграции и orchestration'а, не строительства с нуля. Единственный действительно custom код — это Jinja2 template для `sport-stack.service` и per-env Caddyfile, оба тривиальные.

## Runtime State Inventory

> Phase 3 — это **greenfield для infra**, но содержит один **brownfield элемент:** существующий `148.253.214.156` VPS уже работает.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **Postgres data volume** на existing VPS (`/var/lib/docker/volumes/backend_postgres_data/`) — содержит R0..R19 migrations applied + production data | **PRESERVE.** Terraform import должен НЕ трогать данные. Plan 03-04 (cutover) включает backup перед первым Ansible deploy в качестве safety net. |
| Stored data | **MinIO data volume** (`backend_minio_data`) — пользовательские uploads (если есть на момент Phase 3) | PRESERVE — backup перед cutover. |
| Live service config | **Caddy ACME state** в `caddy_data` volume — Let's Encrypt cert + private key. Восстанавливаемо через re-issuance но ACME rate limits применяются (5 certs/week/domain). | PRESERVE — миграция должна сохранить `caddy_data` volume чтобы не triggerить ACME re-issue. |
| Live service config | **NATS JetStream state** в `nats_data` volume — текущая retention в compose 7d. На момент Phase 3 нет critical persisted streams (notifications + messaging outbox; pre-v1.0 stage). | PRESERVE (low risk); если потеряется — pending notifications/messages потеряются, не catastrophic. |
| OS-registered state | **None.** Existing prod VPS не использует systemd для compose — на момент Phase 2 deploy ручной через `/opt/sport/deploy.sh`. Нет cron jobs, нет systemd timers, нет Task Scheduler. | После Phase 3 cutover — добавится `sport-stack.service`. Migration: stop manual deploy, enable systemd unit. |
| OS-registered state | **SSH authorized_keys** на existing VPS — содержит хотя бы dev_A pubkey. | Ansible `common` role добавит dev_B и enforces `state: present` (idempotent). |
| Secrets/env vars | **`/opt/sport/.env`** на existing VPS (вероятно — нужно verify в Plan 03-04 Task 0) — содержит plaintext `${POSTGRES_PASSWORD}`, `${JWT_SECRET}`, etc. Phase 2 deploy seam (`sops-edit.md §Deploy script`) уже описывает `/run/sport.env` tmpfs path как replacement. | **MIGRATE.** Plan 03-04 cutover: deploy via Ansible (which writes `/run/sport.env` tmpfs); `shred -u /opt/sport/.env` (old disk-resident plaintext). |
| Secrets/env vars | **`SOPS_AGE_KEY_FILE`** на dev workstation (Phase 2 closed). | UNCHANGED — Ansible reads from env at runtime. |
| Build artifacts | **Docker images cached on existing VPS** (`re_identity`, `re_activity_sync`, etc.) — built by `docker compose build`. | PRESERVE для first incremental Ansible deploy (5-10min target depends on image cache hit). Cold deploy (`docker system prune -a` first) — для measuring INFRA-07 <60min target. |
| Build artifacts | **`/opt/sport/`** repo checkout на existing VPS — needs `git pull` parity with `feat/cursona-redesign` for Ansible deploy to source compose file. | Ansible `sport-stack` role does `git pull` OR `synchronize` module pushes repo subset (compose + migrations). Lean: `git pull` on remote (simpler; Phase 2 deploy seam already does this). |

**Nothing found in category:**
- Stored data category — нет ClickHouse (planned but не deployed); нет TimescaleDB hypertables outside `migrations` (R3-R4 add session_hr + session_calories — verify, not used сейчас).
- ChromaDB / vector stores — N/A для running ecosystem.

## Common Pitfalls

### Pitfall 1: Sentry RAM sizing — CONTEXT D-11 wrong (HIGH severity)

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

**What goes wrong:** CONTEXT D-11 предполагает CX32 (4 vCPU / 8 GB RAM) для sentry-01. Sentry self-hosted **минимум 16 GB RAM + 16 GB swap + 4 CPU cores** ([CITED: develop.sentry.dev/self-hosted](https://develop.sentry.dev/self-hosted/) — "Minimum 16 GB RAM (with 16 GB swap), 32 GB recommended for optimal performance"). На CX32 Sentry container OOM-killed.

**Why it happens:** Старые Sentry docs (2020-2022) говорили 8 GB; новые requirements bumped в 2024-2025 из-за ClickHouse + Snuba + Symbolicator weight.

**How to avoid:** Use **CX42** (8 vCPU / 16 GB / 160 GB SSD, ~€16.40/mo) OR **CCX23** (4 dedicated vCPU / 16 GB / 240 GB SSD, ~€44/mo — лучше для consistent IOPS если IOPS-bound). Update CONTEXT D-11 + Terraform `servers.tf`.

**Warning signs:** Sentry web UI freezes / 502 errors во время event ingestion bursts → `docker stats` показывает OOM kills на `sentry-snuba-api` или `sentry-clickhouse`.

[VERIFIED via 2 sources: develop.sentry.dev/self-hosted + github.com/getsentry/self-hosted README ("Minimum 16 GB RAM")]

### Pitfall 2: Hetzner S3 backend `skip_requesting_account_id` missing

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

**What goes wrong:** Без `skip_requesting_account_id = true` Terraform пытается контактировать AWS STS endpoint (`sts.eu-central.amazonaws.com`) для discovery AWS account ID — это fails timeout (Hetzner не AWS), и `terraform init` падает с `AWS account ID not previously found`.

**Why it happens:** Default S3 backend behavior assumes real AWS. Other skip-флаги (`skip_credentials_validation`, `skip_metadata_api_check`, `skip_region_validation`) не покрывают этот specific call.

**How to avoid:** Always include `skip_requesting_account_id = true` в Hetzner Object Storage backend config. [VERIFIED: github.com/hashicorp/terraform/issues/36924]

**Warning signs:** `terraform init` зависает на 30s, потом fails с "Retrieving AWS account details" error.

### Pitfall 3: Caddy in compose vs apt-installed — port 443 conflict

**What goes wrong:** CONTEXT D-16 предполагает apt-installed Caddy + hand-rolled Ansible role. Существующий `docker-compose.prod.yml` lines 272-295 запускает Caddy как `caddy:2.8-alpine` container с `ports: ["80:80", "443:443"]`. Если оба активны — port conflict, второй failes startup.

**How to avoid:** **Choose one:** либо (a) keep Caddy в compose (recommended — already works, less moving parts) и Ansible role становится "configure Caddyfile only" (no install), либо (b) remove Caddy из compose + apt-install (требует docker-compose.prod.yml edit + risk to existing prod). **Lean (a):** keep container, Ansible role syncs Caddyfile template + triggers `docker compose restart gateway` on change.

**Warning signs:** `systemctl status caddy` показывает "Address already in use"; `docker ps` показывает `re_gateway` already bound on 443.

**Override D-16 in plan:** Caddy остаётся в compose. Ansible role "caddy" → "gateway-config" (renders Caddyfile.j2 → `/opt/sport/services/backend/gateway/Caddyfile.prod`).

### Pitfall 4: `docker compose` vs `docker-compose` ExecStart path

**What goes wrong:** systemd unit с `ExecStart=/usr/bin/docker-compose ...` (dash, legacy Python) не работает на Ubuntu 24.04 (default cloud-init image для Hetzner), потому что там только plugin form `docker compose` (space). Service fails startup.

**How to avoid:** ВСЕГДА используйте `docker compose` (space, plugin). Plan 03-03a systemd template должен использовать `/usr/bin/docker compose` (это путь к docker binary, который инициирует compose plugin sub-command).

**Verify:** `which docker-compose` → "not found" на Ubuntu 24.04 cloud-init. `docker compose version` → "Docker Compose version v2.x.y".

### Pitfall 5: Hetzner Storage Box ≠ Object Storage — D-05 misnomer

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

**What goes wrong:** ROADMAP §Phase 3 success criterion 4 says "Terraform state in Hetzner **Storage Box**". Storage Box — это SFTP/WebDAV product (no S3 API, no conditional writes), НЕ годится для TF state with locking. CONTEXT D-05 правильно flag'нул this как researcher question.

**How to avoid:** Use **Hetzner Object Storage** (separate product, S3-compatible, eu-central-1 + nbg1 + fsn1 regions, billed separately) для TF state. Storage Box остаётся для Phase 7 pgBackRest target (SFTP подходит для pgBackRest).

**Update needed:**
- `.planning/REQUIREMENTS.md §INFRA-04` — fix "Storage Box" → "Object Storage" (or planner notes deviation in 03-01-PLAN).
- `.planning/ROADMAP.md §Phase 3 success criteria #4` — same fix.

[VERIFIED: docs.hetzner.com/storage/object-storage/ (S3-compatible, supports conditional writes) vs docs.hetzner.com/storage/storage-box/ (SFTP/WebDAV/Samba, no S3 API)]

### Pitfall 6: <60min INFRA-07 timing — realism check

**What goes wrong:** Naive estimate "ansible-playbook + docker compose up = done" игнорирует cold-cache image pulls + ACME issuance + Postgres+Timescale init + dependency healthcheck delays. Реальный first-deploy: 20-40 min; incremental: 5-10 min.

**Realistic budget breakdown (cold deploy):**

| Step | Time | Notes |
|------|------|-------|
| Terraform apply (VPS create) | 30-60s | Hetzner provisioning is fast |
| `cloud-init` + first SSH ready | 60-120s | wait for sshd |
| Ansible `common` role (apt update + base packages) | 60-120s | apt-get update + install |
| Ansible `docker` role (Docker Engine install) | 120-180s | ~5-8 apt deps |
| `git clone` + repo checkout | 10-30s | depends on repo size |
| `docker compose pull` (8 service images cold) | 5-10 min | ~500MB total assume slow network |
| `docker compose run --rm migrate` (first run, all migrations) | 30-60s | 19 migrations including timescale ext |
| Caddy ACME initial cert issuance | 5-15s | HTTP-01 challenge, ~3 requests |
| Postgres + Timescale init + service healthcheck waits | 30-60s | `pg_isready` + service `depends_on` |
| Smoke probe (3-5 endpoint hits) | 5-10s | sequential HTTP |
| **TOTAL cold** | **~15-25 min** | well under 60min budget |
| **TOTAL incremental (cached images, no migrations needed)** | **~3-5 min** | optimistic |

**How to avoid overrun:** Pre-pull images в `bootstrap.yml` (one-time pre-deploy step) если cold-network slow.

### Pitfall 7: SSH key drift after first `terraform import`

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

**What goes wrong:** Hetzner Cloud Console UI позволяет attach SSH keys to server на create-time только. Если existing prod VPS был создан с SSH keys IDs `[A, B]` но `tfvars` указывают `[B, C]` — `terraform plan` после import показывает diff requiring server re-create.

**How to avoid:** Plan 03-02 Wave 1 (terraform import) включает Task 1.5: dump current SSH key IDs from Hetzner Console, sync into `terraform.tfvars` before first `terraform plan`. Use `lifecycle { ignore_changes = [ssh_keys] }` если pristine sync невозможен.

**Warning signs:** `terraform plan` shows "must replace this resource" на prod-app-01. STOP — это destroy+recreate = production downtime.

### Pitfall 8: `no_log: true` без него SOPS plaintext leaks в `ansible.log`

**What goes wrong:** Default Ansible logs registered output (`register: tmp_env`) + module args. Если `copy` task без `no_log: true` — plaintext env content попадёт в `~/.ansible.log` OR в CI workflow output.

**How to avoid:** All decrypt + copy tasks: `no_log: true`. Verify через `ansible-playbook -vvv` test run — confirm task output redacts.

**Warning signs:** Greps на `JWT_SECRET=` или `POSTGRES_PASSWORD=` в `~/.ansible.log` finds matches.

### Pitfall 9: `migrate` container running parallel в multi-pod scenarios

**What goes wrong:** Не applicable для v1.0 (single-VPS-per-env), но в Phase 7 zero-downtime migration story если multi-replica deploy lands — два `migrate` containers могут race. golang-migrate dirty state guard prevents data corruption но requires manual `migrate force <ver>` recovery.

**How to avoid:** Phase 3 — single-VPS, нет races. Documented для Phase 7 readiness.

### Pitfall 10: `terraform import` пишет state, НЕ HCL

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

**What goes wrong:** `terraform import hcloud_server.prod_app_01 <id>` пишет в state file, но если `resource "hcloud_server" "prod_app_01" {}` block НЕ существует в HCL — import succeeds, но following `plan` показывает "resource must be destroyed (no configuration)" → next `apply` уничтожит prod.

**How to avoid:** **HCL FIRST**, import second. Plan 03-02 Wave 1 sequence:
1. Write `servers.tf` with `prod_app_01` resource block (placeholder attrs).
2. Run `terraform plan` — должен показать "1 to add" (sanity check; not apply!).
3. Get server ID from Hetzner Console.
4. Run `terraform import`.
5. Run `terraform plan` — должен показать drift items (server_type/labels/etc.).
6. Sync HCL with actual values until `plan` clean.
7. Apply (no-op verification).

**Warning signs:** "1 to destroy, 1 to add" after import — STOP, HCL is missing or wrong.

## Code Examples

### Sample `infra/ansible/site.yml` (entry playbook)

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

### Sample `infra/terraform/main.tf`

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

```hcl
# infra/terraform/main.tf
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
  token = var.hcloud_token   # from SOPS-decrypted env var HCLOUD_TOKEN
}
```

### Sample `hcloud_server` + `hcloud_firewall` for sentry-01 (CORRECTED sizing)

> **SUPERSEDED 2026-05-17 — pivot to provider-agnostic VPS scope. See CONTEXT.md §PIVOT NOTICE.**

```hcl
# infra/terraform/servers.tf
resource "hcloud_server" "sentry_01" {
  name        = "sentry-01"
  server_type = "cx42"               # CORRECTED from D-11 cx32 — Sentry needs 16 GB RAM
  image       = "ubuntu-24.04"
  location    = "nbg1"
  ssh_keys    = [for k in hcloud_ssh_key.devs : k.id]
  firewall_ids = [hcloud_firewall.sentry_public.id]

  labels = {
    env  = "sentry"
    role = "observability"
  }

  lifecycle {
    ignore_changes = [image]
  }
}

resource "hcloud_firewall" "sentry_public" {
  name = "sentry-public"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.dev_admin_ips
  }
}
```

### Sample Caddyfile.j2 template (per-env)

```caddy
# infra/ansible/roles/sport-stack/templates/Caddyfile.j2
{
    email {{ caddy_acme_email }}
}

s3.{{ caddy_host }} {
    reverse_proxy minio:9000
    log { output stdout; format json }
}

{{ caddy_host }} {
    @cors_preflight method OPTIONS
    header @cors_preflight Access-Control-Allow-Origin "*"
    header @cors_preflight Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    header @cors_preflight Access-Control-Allow-Headers "Authorization, Content-Type"
    respond @cors_preflight 204
    header Access-Control-Allow-Origin "*"

    handle /healthz {
        respond `{"status":"ok"}` 200
    }

    # ... rest copied verbatim from services/backend/gateway/Caddyfile.prod ...
}
```

`caddy_host` per-env values:
- `staging.yml`: `caddy_host: "<staging-ip>.sslip.io"`
- `prod.yml`: `caddy_host: "148-253-214-156.sslip.io"`

[VERIFIED: services/backend/gateway/Caddyfile.prod — existing prod Caddyfile уже в правильной форме; только надо параметризировать host через Jinja2]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Terraform `s3` backend + DynamoDB lock table | `s3` backend + `use_lockfile = true` (S3 conditional writes) | Terraform 1.10 experimental, 1.11 stable (2025) | No DynamoDB needed → works with non-AWS S3-compatible like Hetzner |
| `docker-compose` (Python, dash) | `docker compose` (Go plugin, space) | Docker Engine 20.10+ deprecated, removed in default Ubuntu 24.04 | ExecStart paths must update |
| Sentry self-hosted 8 GB RAM minimum | 16 GB + 16 GB swap | Bumped in 2024 (ClickHouse + Snuba weight) | CONTEXT D-11 cx32 → cx42/ccx23 correction |
| Ansible 2.9 `community.general` для SOPS | `community.sops` collection (separate, 2026 latest) | Collection split 2021; matures 2026 | Lookup plugin patterns updated |
| Caddy v1 (Go modules from source) | Caddy v2 (apt repo, single binary) | 2020 | Hetzner Ubuntu 24.04 has `caddy` in cloudsmith apt repo |

**Deprecated/outdated:**
- `docker-compose` (Python) — removed in Ubuntu 24.04+; use `docker compose` plugin.
- DynamoDB for TF state locking on non-AWS S3 — replaced by `use_lockfile = true`.
- `image = "ubuntu-22.04"` для new VPS — Hetzner default cloud-init image теперь `ubuntu-24.04`.
- Sentry "8 GB minimum" из старых guides — теперь 16 GB.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Ansible's own `assert` + `command`/`uri` modules + existing Python smoke scripts (`services/backend/scripts/smoke_*.py`) |
| Config file | None (Ansible playbook self-contained); smoke scripts use `pytest` indirectly via Phase 1 baseline |
| Quick run command | `ansible-playbook -i inventory/staging playbooks/smoke.yml` |
| Full suite command | `cd infra/ansible && ansible-playbook -i inventory/staging site.yml --check --diff` (dry-run) + actual deploy + smoke + `terraform plan` no-diff check |
| Phase gate | Idempotent deploy + smoke green + `terraform plan` shows zero diff after `apply` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Ansible idempotently installs Caddy/Postgres/Redis/NATS/MinIO/8 Go services | Integration | `ansible-playbook site.yml && ansible-playbook site.yml` (second run = "0 changed") | Wave 0 — `infra/ansible/playbooks/test_idempotency.yml` |
| INFRA-02 | Terraform manages all Hetzner resources | Smoke | `cd infra/terraform && terraform plan` shows zero diff after apply | Wave 0 — `infra/terraform/` does not exist yet |
| INFRA-03 | dev/staging/prod inventories exist + parse | Lint | `ansible-inventory -i inventory/{env} --list` returns valid JSON | Wave 0 |
| INFRA-04 | TF state in Hetzner Object Storage with locking | Manual | `terraform init` succeeds; `terraform force-unlock` test on lock; lockfile object visible via `aws s3 ls --endpoint=...` | Manual — documented in deploy.md |
| INFRA-05 | Firewall rules explicit; verified no extra ports open | Integration | `nmap -p 1-65535 <vps-ip>` shows only 443+22 open; `nmap -p 4222,5432,6379` shows filtered | Wave 0 — `infra/ansible/playbooks/verify_firewall.yml` |
| INFRA-06 | Separate Sentry VPS provisioned, DNS resolves, Caddy serves 443 | Smoke | `curl -fsSL https://sentry.<ip>.sslip.io/healthz` returns 200 (Caddy seed page) | Wave 0 |
| INFRA-07 | Fresh deploy <60min from `git clone` to all services running | Manual measurement | `time ansible-playbook -i inventory/staging site.yml` on fresh VPS; smoke probe all endpoints | Manual — recorded in `docs/RUNBOOKS/deploy.md` |

### Sampling Rate

- **Per task commit:** `ansible-lint infra/ansible/` + `terraform fmt -check infra/terraform/` + `terraform validate` (fast lint)
- **Per wave merge:** Full `ansible-playbook --check --diff` dry-run + `terraform plan` (no apply) — verifies no regressions in IaC manifests
- **Phase gate:** Cold deploy on **fresh staging VPS** + smoke green + idempotency rerun shows 0 changes + `terraform plan` zero-diff after apply + measured timing recorded в `docs/RUNBOOKS/deploy.md`

### Wave 0 Gaps

- [ ] `infra/ansible/` directory + `ansible.cfg` + linting config (`ansible-lint`)
- [ ] `infra/terraform/` directory + `terraform fmt`-compatible files
- [ ] `infra/ansible/playbooks/test_idempotency.yml` — runs main playbook twice, asserts second run zero changed
- [ ] `infra/ansible/playbooks/verify_firewall.yml` — `nmap` ingress probe + assert expected ports only
- [ ] `infra/ansible/playbooks/smoke.yml` — wraps existing `services/backend/scripts/smoke_*.py` for both envs
- [ ] `terraform` binary install on dev workstation (`brew install terraform`)
- [ ] `ansible` binary install on dev workstation (`brew install ansible`)
- [ ] (Optional) `ansible-lint` install (`pip install ansible-lint`)
- [ ] (Optional) `pre-commit` hook для `terraform fmt` + `ansible-lint` (extension к Phase 2 SEC-08 pre-commit config)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Phase 3 explicitly designs infra-layer architecture (VPS topology, network segmentation) |
| V2 Authentication | indirect | Phase 3 hardens SSH (no password auth, deploy user); JWT auth itself is Phase 2/6 territory |
| V3 Session Management | n/a | Sessions are app-layer, не Phase 3 |
| V4 Access Control | yes | Hetzner Cloud Firewall = network-layer ACL; deploy user sudoers narrow allowlist |
| V5 Input Validation | n/a | Phase 3 doesn't process user input |
| V6 Cryptography | yes | TLS termination (Caddy + LE ACME); SOPS encryption-at-rest (Phase 2 inheritance) |
| V7 Errors & Logging | partial | systemd journal for stack logs; secrets must NOT log (Pitfall 8) |
| V8 Data Protection | yes | `/run/sport.env` tmpfs (RAM-only) + `shred -u` ExecStopPost; no plaintext-at-rest |
| V9 Communications | yes | TLS 1.2+ enforced by Caddy default; no plaintext HTTP egress except ACME challenge |
| V10 Malicious Code | n/a | (CI/Phase 4 territory) |
| V14 Configuration | yes | All config через SOPS; no defaults that bypass security (PermitRootLogin no, etc.) |

### Known Threat Patterns for IaC + multi-VPS topology

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSH brute-force на public 22 | Information Disclosure / Elevation | `PasswordAuthentication no` + key-only auth + `fail2ban` (lean: skip fail2ban for v1.0; firewall restricts 22 to dev IPs anyway) |
| Stolen Hetzner API token → infra takeover | Tampering / Elevation | Token в SOPS; rotation playbook в `docs/SECRETS.md`; no committed in tfvars |
| TF state file leak (contains plaintext attribute values) | Information Disclosure | State в private Hetzner Object Storage (auth-required); bucket policy denies anonymous; encryption at rest |
| Misconfigured firewall opens internal port (4222, 5432) | Information Disclosure | Default-deny + explicit allow; `nmap` probe в CI (Phase 4); D-07 verified NATS internal-only |
| Plaintext secret leak via `ansible.log` | Information Disclosure | `no_log: true` на all decrypt tasks; CI log redaction |
| Stale TF state lock blocks команду | DoS | `terraform force-unlock <lock-id>` documented в `docs/RUNBOOKS/deploy.md` |
| Compromise of one dev's age key → all secrets compromise | Elevation | Phase 2 D-04: 2-key threshold (rotate via `sops updatekeys`); USB + 1Password backups |
| Compromise of `deploy` sudoers → root via docker socket | Elevation | Narrow sudoers (`/bin/systemctl`, `/usr/bin/docker`, `/bin/shred /run/sport.env`); docker socket access still risk (acceptable for v1.0 single-tenant scale) |
| Image supply-chain attack (compromised `migrate/migrate:v4.18.1`) | Tampering | Phase 4 CICD-02 pins to SHA256 digests; Phase 3 inherits this when CI lands (currently pinned by tag, not digest — known v1.0 gap) |

## Project Constraints (from CLAUDE.md)

CLAUDE.md существует в /Users/ismail/Desktop/projects/sport/CLAUDE.md. Phase 3 — backend infra, не mobile/domain code, поэтому большинство ТЗ-rules (MapAdapter, sensor-agnostic, offline-first) **не применимы**. Применимые directives:

- **«Не коммитить секреты — токены идут через `.env` / native keystore»** — Phase 3 преserves: все секреты SOPS-encrypted; `/run/sport.env` tmpfs+shred; `terraform.tfvars` gitignored; HCLOUD_TOKEN сource'ится через SOPS.
- **«Multi-tenant с дня 1 — даже если сейчас один пользователь, в схеме есть `user_id`»** — N/A для Phase 3 (infra layer); Phase 7 DB-03 owns `user_id` migration.
- **«Stack: Backend Go (основное); БД: PostgreSQL + TimescaleDB; Брокер: NATS JetStream»** — preserved (compose использует timescaledb 2.17.2-pg16, nats 2.11).
- **«Деплой: K8s, Helm, ArgoCD»** — **deviation flagged** in CONTEXT §domain. Phase 3 stays на docker-on-systemd per D-04. K8s migration not in v1.0 scope.
- **Russian-language headers** for ADRs and RUNBOOKs (per Phase 2 pattern). Apply to `docs/RUNBOOKS/deploy.md` if planner creates it.
- **«При неуверенности — спроси команду»** — Phase 3 уже autonomous mode (Phase 2 → Phase 3 carryover); все ambiguities resolved через CONTEXT + RESEARCH, не stop'ить.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `terraform` (CLI) | All Plan 03-01..02 | ✗ | — | `brew install terraform` (Plan 03-01 Task 0) |
| `ansible` (CLI) | All Plan 03-02..04 | ✗ | — | `brew install ansible` (Plan 03-01 Task 0) |
| `sops` | Plan 03-03a deploy seq | ✓ | 3.13.0 | — (Phase 2 installed) |
| `age` | Plan 03-03a (SOPS backend) | ✓ | 1.3.1 | — (Phase 2 installed) |
| `docker` (local for testing compose) | Optional smoke testing | ✓ | 27.4.0 | — |
| `hcloud` CLI (optional) | Plan 03-02 — get server IDs | ? | — | Hetzner Cloud Console UI fallback (Plan 03-01 Task 0 manual lookup) |
| `nmap` (optional, for firewall verify) | Plan 03-02 verify_firewall.yml | ? | — | `brew install nmap` OR skip automated probe; manual `curl` test |
| `ansible-lint` (optional) | Wave 0 CI | ? | — | `pip install ansible-lint`; skip if optional |
| Hetzner Cloud account | All of Phase 3 | ? | — | **USER ACTION** — Plan 03-01 Task 0 checkpoint |
| Hetzner Object Storage bucket | TF backend | ✗ | — | **USER ACTION** — manually create через Hetzner Console UI; document credentials в SOPS |

**Missing dependencies with no fallback:**
- Hetzner Cloud account access + API token → blocks everything; Plan 03-01 Task 0 user checkpoint.
- Hetzner Object Storage bucket pre-creation → blocks `terraform init`; manual UI step; document.

**Missing dependencies with fallback:**
- `terraform`/`ansible` CLI → install via brew (Plan 03-01 Task 0).
- `hcloud` CLI / `nmap` / `ansible-lint` → optional; documented manual fallbacks.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Existing prod VPS на `148.253.214.156` is a Hetzner Cloud (not Hetzner Robot dedicated, not other provider) | Throughout | Если это Hetzner Robot — нет `hcloud` API; cannot Terraform-manage. **VERIFY in Plan 03-01 Task 0** через Hetzner Console login. |
| A2 | Existing prod VPS image is `ubuntu-22.04` или `ubuntu-24.04` (cloud-init Debian-family) | Pattern 1, Pitfall 4 | Если другой distro (Rocky, Alma, Arch) — `apt`-based Ansible roles need rewrite. **VERIFY via SSH `cat /etc/os-release`.** |
| A3 | Hetzner Object Storage available в same project как Cloud VPS | Standard Stack | Hetzner может require separate Object Storage subscription. Verify в Hetzner Console UI на Plan 03-01 Task 0. |
| A4 | sslip.io будет available на 2026-05-17 (free public service) | DNS Strategy | If sslip.io shutters — нужен `nip.io` или self-hosted DNS. Low risk (active since 2018). |
| A5 | Existing `caddy:2.8-alpine` container на prod не имеет custom config beyond `gateway/Caddyfile.prod` | Pitfall 3 | If kustom modifications — Ansible role overwrites might break prod. Plan 03-04 cutover должен `diff` существующий Caddyfile vs Ansible template. |
| A6 | Sentry self-hosted minimum requirements не понизятся к моменту Phase 5 execution | Pitfall 1 | Низкая вероятность — Sentry trending UP в resource needs (ClickHouse heavyweight). |
| A7 | Hetzner `eu-central` regions (nbg1, fsn1, hel1) Object Storage doesn't change pricing model в Q3 2026 | Standard Stack | Low risk; verified pricing as of 2026-04 latest tutorial. |
| A8 | `realtime-gw` is the ONLY service that needs NATS in v1.0 mobile flow (i.e., no future mobile-direct-to-NATS in scope) | D-07 verification | Low risk — verified против code 2026-05-16 (`grep '4222' apps/mobile-rn/src/` → 0 results). |
| A9 | DEV_B SSH public key will be provided by Phase 3 execution start | D-19 | Если DEV_B unavailable — only DEV_A in `authorized_keys`; Phase 3 still functional. Plan 03-02 Task X documents fallback. |

## Open Questions

1. **Should `staging-app-01` use cheaper CX22 or match prod CX32?**
   - What we know: closed beta = low traffic; CX22 (2 vCPU / 4 GB) likely sufficient.
   - What's unclear: ClickHouse/TimescaleDB memory pressure at staging if pgBackRest restore drill runs там.
   - Recommendation: **CX22** для staging (~€4/mo) — sufficient для Phase 21 soak. Если smoke test показывает OOM — upsize.

2. **Hetzner private network — share между staging + prod? (Deferred Q2)**
   - What we know: 2 small VPS scale; no inter-VPS RPC required в v1.0.
   - What's unclear: Phase 5 (Sentry) — does prod ship sentry events to `sentry-01` via private network OR public HTTPS?
   - Recommendation: **No shared private network для v1.0** — keep VPS isolated. Sentry events ride public HTTPS (Sentry SDK supports it natively). v1.1 reconsider if private mesh emerges.

3. **`hcloud` CLI install — required dependency or optional?**
   - What we know: Plan 03-02 needs server IDs; can get from UI manually.
   - What's unclear: Is CLI install friction worth optionality?
   - Recommendation: **Optional** — document UI fallback in Plan 03-01 Task 0.

4. **Where does `HCLOUD_TOKEN` live for `terraform apply` invocation?**
   - What we know: SOPS-encrypted in `.secrets/<env>/hetzner.yaml` per CONTEXT §user_checkpoints.
   - What's unclear: Decrypt path — `direnv` + `sops -d --extract '["HCLOUD_TOKEN"]'`? Wrapper script `infra/terraform/tf` that sources from SOPS?
   - Recommendation: **Wrapper script** `infra/terraform/tf-wrap.sh` that does `eval $(sops -d --output-type=dotenv .secrets/<env>/hetzner.yaml | sed 's/^/export /')` then exec `terraform "$@"`. Documented в `docs/RUNBOOKS/deploy.md`.

## Sources

### Primary (HIGH confidence)

- [Sentry self-hosted system requirements (develop.sentry.dev)](https://develop.sentry.dev/self-hosted/) — 16 GB RAM + 4 CPU + 16 GB swap minimum
- [Terraform `s3` backend documentation (HashiCorp)](https://developer.hashicorp.com/terraform/language/backend/s3) — `use_lockfile`, skip_* flags
- [Hetzner Object Storage docs](https://docs.hetzner.com/storage/object-storage/) — S3-compatible API
- [Hetzner Storage Box docs](https://docs.hetzner.com/storage/storage-box/) — SFTP/WebDAV (not S3, no locking)
- [Hetzner Community: Use Hetzner S3 as a Terraform Backend](https://community.hetzner.com/tutorials/howto-hcloud-s3-terraform-backend/) — official Hetzner tutorial
- [hetznercloud/hcloud Terraform provider docs (registry.terraform.io)](https://registry.terraform.io/providers/hetznercloud/hcloud/latest) — v1.62.0 latest (2026-04-28)
- [hcloud_server resource docs](https://registry.terraform.io/providers/hetznercloud/hcloud/latest/docs/resources/server) — import syntax + attributes
- [hcloud_firewall resource docs](https://registry.terraform.io/providers/hetznercloud/hcloud/latest/docs/resources/firewall) — rule syntax
- [Caddy install docs (caddyserver.com/docs/install)](https://caddyserver.com/docs/install) — official apt repo via cloudsmith
- [Ansible delegate_to docs (docs.ansible.com)](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_delegation.html) — controller-side task execution
- [community.sops Ansible collection guide](https://docs.ansible.com/ansible/latest/collections/community/sops/docsite/guide.html) — SOPS integration
- [golang-migrate (github.com/golang-migrate/migrate)](https://github.com/golang-migrate/migrate) — migration tool already in compose
- [services/backend/docker-compose.prod.yml](file:///Users/ismail/Desktop/projects/sport/services/backend/docker-compose.prod.yml) — verified inline
- [services/backend/gateway/Caddyfile.prod](file:///Users/ismail/Desktop/projects/sport/services/backend/gateway/Caddyfile.prod) — verified inline
- [services/backend/realtime-gw/cmd/server/main.go:44](file:///Users/ismail/Desktop/projects/sport/services/backend/realtime-gw/cmd/server/main.go) — verified NATS internal-only via grep

### Secondary (MEDIUM confidence)

- [Oliver Jakobi: OpenTofu S3 backend Hetzner storage](https://oliverjakobi.com/posts/opentofu-s3-backend-hetzner-storage/) — working code block (cross-verified vs Hetzner tutorial)
- [github.com/hashicorp/terraform/issues/36924](https://github.com/hashicorp/terraform/issues/36924) — `skip_requesting_account_id` requirement for Hetzner
- [Bootvar: docker-compose systemd guide](https://bootvar.com/systemd-service-for-docker-compose/) — ExecStart pattern (cross-verified vs DoHost)
- [Hetzner Cloud private networking with Tailscale](https://onatm.dev/2026/01/28/private-networking-on-hetzner-cloud-with-tailscale/) — multi-VPS isolation patterns
- [Hetzner pricing/specs CX32/CX42 (costgoat.com, sparecores.com)](https://sparecores.com/server/hcloud/cx32) — cross-verified VPS sizing
- [S3 native state locking explainer (bschaatsbergen.com)](https://www.bschaatsbergen.com/s3-native-state-locking) — `use_lockfile` semantics
- [Ansible roles best practices (ansiblebyexample.com, oneuptime.com)](https://www.ansiblebyexample.com/articles/ansible-roles-explained-structure-best-practices) — defaults/ vs vars/ pattern

### Tertiary (LOW confidence — flagged for re-verification before Plan execution)

- Exact `hetznercloud/hcloud` provider v1.62.0 attribute completeness for `hcloud_firewall` rules (cross-verify через `terraform providers schema -json` once installed)
- `community.sops` collection version pin при actual install
- Caddy v2 latest stable version in cloudsmith apt repo as of 2026-05

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — versions verified via npm/brew/github releases; Terraform backend syntax verified via 2 independent Hetzner tutorials + HashiCorp provider docs + GitHub issue thread.
- Architecture: **HIGH** — docker-compose-on-systemd verified via 4 production guides; SOPS `delegate_to: localhost` pattern verified via official Ansible docs.
- Pitfalls: **HIGH** — Sentry RAM (Pitfall 1) verified via official Sentry docs + GitHub README; Hetzner `skip_requesting_account_id` (Pitfall 2) verified via official HashiCorp issue #36924; Storage Box vs Object Storage (Pitfall 5) verified via Hetzner's own docs distinguishing the two products.
- Runtime State Inventory: **MEDIUM** — based on inline code reading + Phase 2 inheritance; some items (Caddy ACME state preservation) are inferred from compose volumes, not directly verified via SSH on prod.

**Critical CONTEXT corrections needed (planner must address):**
1. **D-11 RAM sizing:** `cx32` → `cx42` (или `ccx23`) для sentry-01.
2. **D-16 Caddy install:** apt-installed + Ansible role → **keep `caddy:2.8-alpine` в compose**, Ansible role syncs Caddyfile template only.
3. **D-05 backend product:** "Hetzner Storage Box" → "Hetzner Object Storage" — REQUIREMENTS.md INFRA-04 + ROADMAP §Phase 3 success criterion 4 wording fix.
4. **D-04 systemd ExecStart:** must use `docker compose` (space, plugin), не `docker-compose` (dash).

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (30 days; Hetzner provider versions stable, Sentry requirements могут bumps в minor versions — re-check перед Phase 5 если this RESEARCH.md older than 30 days)

## RESEARCH COMPLETE
