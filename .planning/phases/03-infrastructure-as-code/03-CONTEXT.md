# Phase 3: Infrastructure as Code — Context

**Gathered:** 2026-05-16
**Pivoted:** 2026-05-17 (см. ## ⚠ PIVOT NOTICE below — scope-cutting refactor)
**Status:** Ready for planning (post-pivot)
**Milestone:** v1.0 Production Readiness
**Workstream:** `backend` (STRICT after Phase 2 — Phase 2 → Phase 3 no-parallelization gate is now LIFTED; Ansible templates source from SOPS, not inline values)
**Mode:** Autonomous (`--auto`-equivalent per persistent no-questions instruction; mirrors Phase 2 CONTEXT posture)

## ⚠ D-24 REVISION (2026-05-17, post-Wave-1-second-recovery)

Original D-24 NEW: UFW SSH allow only от `dev_admin_ips/32` (single-IP allowlist). **Observed failure mode within 38 minutes of Wave 1 apply:** residential ISP rotated dev IP (`91.92.33.145` → `85.239.149.26`), silently locking dev out next SSH attempt — UFW dropped SYN packets from new IP, ssh client hung at "Connection timed out during banner exchange". Required out-of-band web-console recovery (twice in one session). Per-IP allowlist is fundamentally брittle для residential ISP solo dev.

**Revised D-24:** UFW SSH = `limit` action from anywhere (`rule: limit, port: 22, proto: tcp` — UFW's built-in rate-limit: 6 connections / 30s per source IP, blocks brute-force без locking-out legit users on IP rotation). Actual SSH defense-in-depth для solo-dev v1.0 closed-beta:
- SSH key-only auth (D-19 `PasswordAuthentication no`) — no password = no brute-force surface
- Root login disabled (D-19 `PermitRootLogin no`)
- ed25519 key (collision-resistant)
- UFW rate-limit (defense against script-kiddie SSH-scanner brute-forcers)

v1.1 follow-up: if static dev IP / VPN gateway / bastion host lands, re-narrow к per-IP allowlist (move `limit` → `allow from <ip>` per dev). Until then, key-only-auth is the SSH-layer defense; UFW rate-limit is the IP-layer defense. Tested 2026-05-17 — same lockout class survives ISP rotation (lockout vector eliminated). Removed `dev_admin_ips` group_var dependency from `roles/ufw/tasks/main.yml`.

## ⚠ D-20 REVISION (2026-05-17, post-Wave-1-first-run)

Original D-20 narrow sudoers (`NOPASSWD: /bin/systemctl, /usr/bin/docker, /usr/bin/docker compose, /bin/shred /run/sport.env` — 4 commands only) **broke Ansible day-2 ops** immediately after Wave 1 first-run + switchover к `ansible_user: deploy`. Ansible's `gather_facts`, apt, file copy, etc. tasks invoke `become: yes` → `sudo -i` (or `sudo -H -S -p`), none match the 4 whitelisted commands → "Missing sudo password" on every play. Revised: `deploy ALL=(ALL) NOPASSWD: ALL`. Actual defense for solo-dev v1.0 closed-beta = SSH key-only auth (D-19) + UFW SSH allow only от `dev_admin_ips/32` (D-24) + root login disabled (D-19) + ed25519 key; narrow sudoers added негативное value (blocked Ansible) для negligible additional security. v1.1 follow-up: revisit if team grows >1 dev — re-introduce narrow runtime sudoers + separate Ansible service account. Live VPS sudoers must be updated out-of-band before next ansible-playbook can land cleanly. Source updated в `roles/common/tasks/main.yml`.

## ⚠ PIVOT NOTICE (2026-05-17)

**Rationale (2 sentences):** Пользователь уточнил, что у него нет Hetzner Cloud account — есть «обычный VPS сервер» (provider-agnostic SSH-accessible Linux VPS). Все cloud-API-driven решения (Terraform с `hcloud` provider, Object Storage TF state, Storage Box, Hetzner Cloud Firewall, multi-VPS topology) теряют смысл — остаётся только Ansible-driven deploy на существующий VPS через SSH, UFW (OS-level firewall) вместо Hetzner Cloud Firewall, и provider-agnostic deploy RUNBOOK.

### SUPERSEDED Decisions (from original D-01..D-21)

| D-ID | Original assertion | Disposition |
|------|-------------------|-------------|
| **D-01** Ansible + Terraform | SUPERSEDED-PART | Только Ansible half остаётся; Terraform отбрасывается целиком (нет cloud API to call) |
| **D-02** 3-VPS Hetzner topology | SUPERSEDED | Single existing prod VPS теперь; staging deferred to v1.1, sentry-01 deferred to Phase 5 |
| **D-05** TF state backend | SUPERSEDED | Нет Terraform — нет state to back up |
| **D-06** Hetzner Cloud Firewall | SUPERSEDED → **UFW** | OS-level firewall (`community.general.ufw` module) replaces cloud-side firewall; same effective ports policy |
| **D-09** Sentry-01 separate VPS | SUPERSEDED | Deferred to Phase 5 (sentry-prep role lives там) |
| **D-10** Phase 3 provisions Sentry VPS | SUPERSEDED | Phase 5 owns Sentry VPS provisioning end-to-end |
| **D-11** Sentry VPS cx32→cx42 sizing | SUPERSEDED | Irrelevant — Phase 3 не provisioning'ит sentry-01 |

### KEPT Decisions (still in scope)

| D-ID | Assertion | Notes |
|------|-----------|-------|
| **D-03 (partial)** Inventory layout | KEPT for `dev/` + `prod/` only; `staging/` + `sentry/` dropped |
| **D-04** Docker-compose-on-systemd umbrella (`sport-stack.service`) | KEPT verbatim — single umbrella unit для 8 Go services + 4 stateful + caddy:2.8-alpine container |
| **D-07** NATS 4222 internal-only | KEPT — теперь enforced через UFW deny default-incoming |
| **D-08** MinIO 9000 internal-only via Caddy `s3.<vps-ip>.sslip.io` | KEPT — same Caddy reverse-proxy pattern, UFW deny 9000 public |
| **D-12** SOPS decrypt via `delegate_to: localhost` | KEPT — age key stays on dev workstation, никогда не на remote VPS |
| **D-13** `SOPS_AGE_KEY_FILE` env var → `~/.config/sops/age/keys.txt` | KEPT — documented in `docs/RUNBOOKS/deploy.md §1 Dev workstation setup` |
| **D-14** Migration via separate Ansible play (`docker compose run --rm migrate`) | KEPT verbatim |
| **D-15** `/run/sport.env` tmpfs (mode 0600) + `shred -u` on stop | KEPT |
| **D-16** Caddy stays containerized в docker-compose (`caddy:2.8-alpine`) | KEPT — NEVER apt-install (port 443 conflict) |
| **D-17** Caddyfile per-env via Jinja2 template | KEPT — `caddy_host` group_var feeds `{{ caddy_host }}` substitution |
| **D-18** sslip.io DNS для v1.0 closed beta | KEPT — works на любом VPS public IP (не Hetzner-specific) |
| **D-19** SSH hardening (`PermitRootLogin no`, `PasswordAuthentication no`) | KEPT — enforced через `sshd_config.d/99-hardening.conf` drop-in |
| **D-20** Narrow sudoers для `deploy` user | KEPT — same 4-command allow-list (`/bin/systemctl, /usr/bin/docker, /usr/bin/docker compose, /bin/shred /run/sport.env`) |
| **D-21** <60min INFRA-07 timing | KEPT — теперь measured on existing prod VPS first-clean Ansible-deploy (нет staging для baseline measurement) |

### NEW Decisions (post-pivot)

- **D-22 (NEW):** **Drop Terraform entirely.** Cloud-side provisioning not automated — single VPS exists already, no API to call. v1.1 may revisit if migrating to a cloud-API provider (Hetzner Cloud, AWS, Linode, DigitalOcean — at that point Terraform с appropriate provider может быть reintroduced).
- **D-23 (NEW):** **Single-VPS topology = existing prod only.** Staging deferred to v1.1 (manual spinup at provider's UI if needed). Sentry-01 deferred to Phase 5 (sentry-prep role будет создан там, включая решение colocate vs separate VPS).
- **D-24 (NEW):** **UFW (OS-level) replaces Hetzner Cloud Firewall.** Ansible's `community.general.ufw` module manages rules идемпотентно. Effective ports policy:
  - **Allow ingress:** 443/TCP from `0.0.0.0/0` (Caddy public), 22/TCP from `{{ dev_admin_ips }}` (group_var; admin SSH from dev workstation IPs only)
  - **Deny ingress (default):** all else, incl. 80/TCP (Caddy redirects via `redir 308`), 4222/TCP (NATS internal-only per D-07), 5432/TCP (Postgres internal), 6379/TCP (Redis internal), 9000/TCP (MinIO direct — served via Caddy at `s3.<vps-ip>.sslip.io`)
  - **Egress:** allow all (services need DNS, Mapbox API, Expo Push, OAuth providers, etc.)
- **D-25 (NEW):** **Provider-agnostic deploy RUNBOOK.** `docs/RUNBOOKS/deploy.md` uses `<vps-ip>` placeholders, formula "any SSH-accessible Linux VPS with sudo access" (Ubuntu 22.04 LTS or 24.04 LTS recommended; min 4 GB RAM, 2 vCPU, 40 GB SSD). Sections referencing Hetzner-specific UI / cloud-side provisioning are removed — replaced с "Spin up a Linux VPS at your provider of choice".
- **D-26 (NEW):** **SOPS slot для VPS access NOT needed.** SSH is key-based (Ansible reads `~/.ssh/id_ed25519` directly), no token to encrypt. Original CONTEXT.md `.secrets/<env>/hetzner.yaml` SOPS slot dropped; нет replacement. The 3 existing per-env SOPS files stay: `shared.yaml`, `mapbox.yaml`, `oauth.yaml`.

<domain>
## Phase Boundary

**What this phase delivers (post-pivot):** Move from "deploy by hand on the existing prod VPS via SSH + `git pull` + `/opt/sport/deploy.sh`" → to "Ansible playbooks idempotently install + configure the full backend stack на тот же VPS in <60 minutes from `git clone + ansible-playbook` alone, provider-agnostic. SSH is the only deploy seam; provider-side automation (Terraform / cloud APIs) deferred to v1.1 if migrating to a cloud-API provider."

**Two target environments (post-pivot):** `dev` (local docker-compose, untouched by Ansible) | `prod` (existing VPS, currently `148.253.214.156`).

**Deferred from Phase 3:**
- Staging environment → v1.1 (manual spinup at provider's UI if needed; Ansible inventory структура supports adding `staging/` group later)
- Sentry-01 separate VPS provisioning → Phase 5 (sentry-prep role + decision colocate vs separate VPS owned там)
- Terraform / cloud-API provisioning → v1.1 (if migrating to cloud-API provider)
- TF state backend → N/A while no Terraform
- Object Storage / Storage Box → N/A while no Terraform; pgBackRest backup target choice deferred to Phase 7

**Service inventory landing as containers under one systemd umbrella unit** (8 Go services, not 6 — current code on `feat/cursona-redesign`):
1. `identity` (auth + JWT + featureflags admin)
2. `activity-sync` (tracker telemetry ingest)
3. `feed` (social feed; do-nothing per ADR-0004 but still runs)
4. `media` (S3 presigned URL broker)
5. `messaging` (DM)
6. `notifications` (Expo Push)
7. `realtime-gw` (NATS↔mobile websocket bridge)
8. `social-graph` (follow/block graph)

Plus 4 stateful + 1 gateway: Postgres+TimescaleDB, Redis, NATS JetStream, MinIO, Caddy (containerized `caddy:2.8-alpine`).

**Out of scope:**
- CI/CD pipeline (Phase 4 / CICD-01..06) — Phase 3 lands the deploy SEAM (Ansible target invoked manually); Phase 4 wires GitHub Actions to invoke it on tagged release.
- Rollback drill (Phase 4 / CICD-04) — Phase 3 enables rollback via `git checkout` + re-run Ansible; Phase 4 proves the drill with a real DB migration in path.
- Observability stack (Phase 5) — sentry-01 VPS + Sentry self-hosted install + Prom + Grafana + structured logging.
- DB backup automation (Phase 7 / DB-01..05) — backup target choice deferred to Phase 7 (no Hetzner Storage Box assumption anymore).
- HSM-backed Terraform state secrets — irrelevant (no Terraform).
- Multi-region geographic expansion (v2.0 per user decision).
- Helm charts / K8s / ArgoCD — `services/backend/deploy/helm/` pre-v1.0 placeholder; v1.0 stays на docker-on-VPS via systemd umbrella + docker (per D-04).

</domain>

<scout_findings>
## Current State of Deploy (verified 2026-05-16 on `feat/cursona-redesign`; pivot context 2026-05-17)

### What's already in place (good baseline)
- **`services/backend/docker-compose.prod.yml` is self-contained** — production stack file. Uses `${VAR:?need ...}` shell substitution to fail-fast on missing secrets (Phase 2 SEC-09 stays the line of defense at compose layer).
- **`services/backend/gateway/Caddyfile.prod` is production-shaped** — Let's Encrypt + sslip.io for both the main API host (`148-253-214-156.sslip.io`) and the S3 proxy (`s3.148-253-214-156.sslip.io`). CORS preflight handler in place for future web client.
- **Migration story exists** — one-shot `migrate/migrate:v4.18.1` init job in `docker-compose.prod.yml`; services wait via `service_completed_successfully` healthcheck. Migrations live at `services/backend/migrations/` (golang-migrate format, paired `*.up.sql` / `*.down.sql`).
- **SOPS deploy seam already documented** in `docs/RUNBOOKS/sops-edit.md §Deploy script (`/opt/sport/deploy.sh` на VPS)` — `sops -d --output-type=dotenv` writes to `/run/sport.env` (tmpfs, mode 600, `trap shred` cleanup), then `docker compose --env-file` consumes. **Phase 3 wraps this in Ansible — does NOT replace it.**
- **Observability scaffolding** at `services/backend/observability/` already has `prometheus.yml`, `loki.yml`, `grafana-datasources.yml` configs; `docker-compose.observability.yml` is a separate compose profile. Phase 5 lands the Sentry VPS + observability stack install on top.
- **Smoke scripts** at `services/backend/scripts/smoke_*.py` already use `BASE_URL` env var defaulting to `https://148-253-214-156.sslip.io` — env toggle is just `BASE_URL=...` ENV.

### What's missing / broken (post-pivot scope)
- **No `infra/ansible/` directory yet.** Greenfield for Phase 3 — Ansible scaffold + roles to be created.
- **No GitHub Actions CI** (`.github/workflows/` does not exist). Phase 4 territory.
- **No UFW configuration documented.** Currently provider-side firewall rules unknown; Phase 3 introduces OS-level UFW as canonical (D-24).
- **No provider-agnostic deploy RUNBOOK.** `docs/RUNBOOKS/sops-edit.md` documents the SOPS edit + deploy.sh shape, but no canonical `docs/RUNBOOKS/deploy.md`. Phase 3 creates it (provider-agnostic per D-25).
- **`deploy/helm/` placeholder code** at `services/backend/deploy/helm/identity/` (Phase 0-era) — UNUSED in v1.0; can be deleted in cleanup pass or left for future K8s migration. Not consumed by Phase 3.

### Existing VPS state (current 2026-05-17)
- Single prod VPS exists at `148.253.214.156` (presumably reachable via SSH, sudo access already configured for current dev). Provider unknown / provider-agnostic per pivot.
- User-action checkpoint в NEW Plan 03-01 Task 0: confirm current VPS public IP + current SSH user + sudo access. Ansible inventory's `prod/hosts.yml` uses these values directly.
- No `deploy` user yet on prod (cutover в NEW Plan 03-03 Task 2 first runs bootstrap pass under `--user root` or current sudo-able user, then switches to `deploy`).

### Constraints from prior phases
- **Phase 1 / REL-01 / REL-02:** API contract is locked + version negotiation is locked. Phase 3 must not change service ports / API paths / response shapes — it just packages and deploys them.
- **Phase 2 / SEC-02 + SEC-06 + SEC-09:** SOPS is the canonical secret store; `envRequire(KEY)` fail-fast helper is in every service `main.go`. Phase 3's Ansible templates source secrets from SOPS via `sops -d --output-type=dotenv`, never inline.
- **Phase 2 / SEC-03 + SEC-04 (ADR-0006):** Mapbox tokens are в SOPS at `.secrets/{prod,dev}/mapbox.yaml`. (staging slot dropped per D-23 — staging deferred to v1.1.)
- **Phase 2 / SEC-07 (`docs/RUNBOOKS/sops-edit.md`):** Already documents the deploy.sh shape. Phase 3 takes that shape and wraps in Ansible (`copy` or `template` module, с `delegate_to: localhost` для `sops -d` step).
- **Phase 2 follow-up #3:** `~/.envrc` (direnv) для `SOPS_AGE_KEY_FILE` on macOS dev machines. Phase 3 includes this in the dev-onboarding section of `docs/RUNBOOKS/deploy.md` §1.

</scout_findings>

<decisions>
## Implementation Decisions (post-pivot — see ## ⚠ PIVOT NOTICE above for SUPERSEDED list)

### IaC Architecture (INFRA-01)

- **D-01 (PARTIAL — Ansible-only):** Ansible for software provisioning + configuration on existing VPS. Runs on dev workstation. **Terraform dropped entirely** (D-22).
- **D-03 (PARTIAL):** Inventory layout = `infra/ansible/inventory/{dev,prod}/`. `dev/` inventory points at `localhost` (no Ansible-managed services in dev; keep fast local docker-compose loop). `prod/` points at existing VPS. **`staging/` and `sentry/` dropped** (D-23).

### Containers vs Native Binaries on systemd (INFRA-01)

- **D-04 (KEPT):** Docker-on-systemd, NOT native Go binaries. Each service runs as a `docker compose up`-style container, but the **compose stack itself is managed by a single root systemd unit** (`sport-stack.service` → `ExecStart=/usr/bin/docker compose -f /opt/sport/services/backend/docker-compose.prod.yml --env-file /run/sport.env up`). Why:
  - Preserves the existing `Dockerfile`s and `docker-compose.prod.yml`.
  - systemd gives startup ordering (`After=docker.service network-online.target`), auto-restart (`Restart=on-failure`), boot-time guarantees.
  - Single systemd unit is simpler than 8 per-service units.

### Network Firewall (INFRA-05) — UFW

- **D-24 (NEW):** UFW (OS-level) replaces Hetzner Cloud Firewall. Ansible's `community.general.ufw` module manages rules idempotently. Effective policy (same as original D-06 but enforced one layer down):
  - **Ingress allow:** 443/TCP from `0.0.0.0/0`, 22/TCP from `{{ dev_admin_ips }}` (group_var list)
  - **Ingress deny (default):** 80, 4222 (NATS — D-07), 5432 (Postgres), 6379 (Redis), 9000 (MinIO — served via Caddy at `s3.<vps-ip>.sslip.io` per D-08)
  - **Egress allow:** all (services need outbound DNS, Mapbox API, Expo Push, OAuth providers)
- **D-07 (KEPT):** NATS 4222 INTERNAL-ONLY. Mobile clients connect to `realtime-gw` over WebSocket on 443 (Caddy proxies). UFW enforces no public 4222.
- **D-08 (KEPT):** MinIO S3 endpoint exposed via Caddy at `s3.<vps-ip>.sslip.io`. MinIO container port 9000 not directly exposed; presigned URLs flow through Caddy reverse-proxy. Already in place.

### Deploy Sequence + SOPS Wiring (INFRA-01 mechanics)

- **D-12 (KEPT):** Ansible runs `sops -d` locally on dev workstation (via `delegate_to: localhost` block) and templates the resulting plaintext `.env` to `/run/sport.env` on the target VPS using Ansible's `copy` module with `mode: '0600'` and `owner: deploy`. No SOPS binary needs to be on the VPS. Age key stays on dev workstation per Phase 2 D-04 strategy.
- **D-13 (KEPT):** `SOPS_AGE_KEY_FILE` env var pointing to `~/.config/sops/age/keys.txt` (the XDG path) is documented in `docs/RUNBOOKS/deploy.md §1 Dev workstation setup`. Phase 2 follow-up #3 (`~/.envrc` via direnv) is closed by Phase 3 documenting in RUNBOOK as a one-time dev-setup step.
- **D-14 (KEPT):** Migration step is a separate Ansible play that runs `docker compose -f docker-compose.prod.yml run --rm migrate` BEFORE bringing up the app services. The existing `migrate/migrate:v4.18.1` one-shot container is preserved.
- **D-15 (KEPT):** `/run/sport.env` is shredded by a systemd `ExecStopPost=` hook (`shred -u /run/sport.env`). On normal stack stop, the env file is shredded too — minimizes plaintext lifetime. tmpfs `/run` means it never lands on disk anyway, but explicit shred is defense-in-depth.

### Caddy Install Strategy

- **D-16 (KEPT — containerized):** Caddy stays containerized как `caddy:2.8-alpine` в `docker-compose.prod.yml` — NEVER apt-installed (port 443 conflict). Ansible role for Caddy is template-only (renders Caddyfile, triggers `docker compose restart gateway` handler).
- **D-17 (KEPT):** Caddyfile per environment via Jinja2 template. The existing `services/backend/gateway/Caddyfile.prod` becomes the prod template seed. `{{ caddy_host }}` group_var substitution.

### DNS Strategy

- **D-18 (KEPT):** sslip.io for v1.0 closed beta. Works on any VPS public IP (not provider-specific). Documented as v1.1 follow-up to register a real `<brand>.com` once user-onboarding ramps.

### Operational Boundaries

- **D-19 (KEPT):** SSH access via `~/.ssh/authorized_keys` provisioned by Ansible's `authorized_keys` task on every run (idempotent — `state: present`). Both devs (Ismail + DEV_B once delivered) in the `ansible_user`'s authorized_keys; root login disabled (`PermitRootLogin no`), password auth disabled (`PasswordAuthentication no`). Drop-in at `/etc/ssh/sshd_config.d/99-hardening.conf`.
- **D-20 (KEPT):** Deploy user `deploy` (not `root`) — sudoers `ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/docker, /usr/bin/docker compose, /bin/shred /run/sport.env`. Narrow sudo allowance; deploy user owns `/opt/sport/`.

### Deploy Timing Target (INFRA-07)

- **D-21 (KEPT — measurement target changed):** <60min target measured as `ansible-playbook site.yml -i inventory/prod` from a fresh-state Ansible deploy on existing prod VPS. Excludes provider-side VPS spinup (out of Phase 3 scope per D-22). Includes (where applicable on existing VPS): Docker install (~3min if not already installed) + image pulls (~5-10min for 8 services if cold-cache; ~30s warm) + Postgres+TimescaleDB init (if first time) + Caddy ACME refresh + smoke health probe. Realistic estimate on existing prod VPS first-clean Ansible-deploy: 5-15 min (image cache likely already warm since prod has been running manually). Documented в `docs/RUNBOOKS/deploy.md §9` with measured timing recorded after NEW Plan 03-03 Task 2 prod cutover.

</decisions>

<deferred>
## Deferred to Researcher

Originally 4 open questions; post-pivot only 1 substantive question remains and it's been answered via prior research:

1. ~~**Terraform state backend on Hetzner**~~ — N/A (no Terraform per D-22).
2. ~~**Hetzner Cloud Firewall + private network topology**~~ — N/A (no Hetzner Cloud per pivot; UFW replaces per D-24).
3. ~~**Sentry self-hosted CPU/RAM sizing on Hetzner**~~ — Deferred to Phase 5 (sentry-prep role lives there per D-09/D-10 SUPERSEDED).
4. **NATS exposure verification** — already verified via codebase scout (D-07 KEPT). No external NATS 4222 dependency confirmed.

</deferred>

<deferred_ideas>
## Out-of-Scope Ideas (Captured for Roadmap Backlog)

- **Real `<brand>.com` domain registration** — v1.1 once beta ramps.
- **Multi-AZ / multi-region deployment** — v2.0.
- **Bastion host for SSH** — v1.1 if VPS count > 5; v1.0 keeps direct SSH from dev IPs.
- **K8s migration / Helm charts revival** — undated.
- **Cloudflare in front of Caddy** — v1.1 for DDoS/CDN.
- **Migrate to cloud-API provider + reintroduce Terraform** — v1.1 (если pivoted back).
- **Staging environment** — v1.1 (manual spinup at provider's UI if needed; Ansible inventory структура supports adding `staging/` group later).
- **Per-service systemd units** — revisit if/when migrating off docker-compose.
- **Automated Mapbox EAS secret push** — Phase 11/12.
- **`/opt/sport/.env` disk-resident plaintext cleanup** — defense-in-depth fallback preserved через v1.0; Phase 4 (CICD-04) or v1.1 hygiene pass.

</deferred_ideas>

<canonical_refs>
## Canonical Documents (MUST READ before plan/research)

| Path                                                                  | Why it matters                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/ROADMAP.md §Phase 3`                                       | Phase 3 goal, success criteria 1-4 (post-pivot), INFRA-* mapping                                                                          |
| `.planning/REQUIREMENTS.md §INFRA-01..07`                             | Numbered requirement definitions (INFRA-02/04/06 deferred post-pivot)                                                                     |
| `.planning/phases/02-secrets-and-config-hardening/02-CONTEXT.md`      | Phase 2 decisions Phase 3 inherits (esp. SOPS deploy seam, master key, decrypt-at-deploy)                                                 |
| `.planning/phases/02-secrets-and-config-hardening/02-04-SUMMARY.md`   | Mapbox rotation closeout + 5 follow-ups (Phase 2 → Phase 3 carryover items)                                                               |
| `docs/RUNBOOKS/sops-edit.md §Deploy script + §Manual SCP deploy`      | Pre-Phase-3 deploy shape that Phase 3 wraps in Ansible (DO NOT replace — wrap)                                                            |
| `docs/DECISIONS/0006-mapbox-token-incident.md`                        | SOPS-only canonical store decision — Phase 3 Ansible must source Mapbox tokens from there, not inline                                     |
| `docs/DECISIONS/0007-v1.0-release-contract.md`                        | API contract locked — Phase 3 must not change ports / paths / response shapes                                                             |
| `services/backend/docker-compose.prod.yml`                            | Production stack file — Phase 3 wraps but does NOT rewrite (preserves `${VAR:?need ...}` fail-fast)                                       |
| `services/backend/gateway/Caddyfile.prod`                             | Production Caddy config — seed for the per-env Ansible template                                                                           |
| `services/backend/migrations/`                                        | golang-migrate schema migrations — Phase 3 Ansible runs them as a separate one-shot play before service-up                                |
| `.planning/codebase/STACK.md`                                         | Tech stack reference                                                                                                                       |
| `.planning/codebase/INTEGRATIONS.md §Backend deploy`                  | Current deploy story baseline — single VPS, manual docker-compose                                                                         |
| `CLAUDE.md §Стек §Деплой`                                             | Future K8s mention; v1.0 stays docker-on-systemd per D-04                                                                                 |

</canonical_refs>

<code_context>
## Reusable Assets

- **`docker-compose.prod.yml`** is the SEED for Phase 3's stack-systemd-unit. Ansible syncs the repo to `/opt/sport/` (via git clone — `{{ sport_repo_url }}` from `git remote get-url origin`); the systemd `ExecStart` references the compose file.
- **`gateway/Caddyfile.prod`** is the SEED for Phase 3's Caddyfile template — env-specific variables (`email`, `host`) become `{{ caddy_acme_email }}` / `{{ caddy_host }}` Jinja2 variables.
- **`scripts/smoke_*.py`** are the smoke probe seed for Phase 3 post-deploy verification — Ansible invokes `services/backend/scripts/smoke_otp.py` via `delegate_to: localhost` against the just-deployed `prod-app` via `BASE_URL=https://<vps-ip-with-dashes>.sslip.io`.
- **`services/backend/observability/*.yml`** stay UNTOUCHED in Phase 3 — Phase 5 owns the observability stack install.
- **`docs/RUNBOOKS/sops-edit.md §Deploy script (`/opt/sport/deploy.sh` на VPS)`** literally contains the Phase 3 deploy script as a bash example. Phase 3 Ansible adapts that shape: split into stages (decrypt → SCP → migrate → up), each as Ansible tasks.

## New Files Expected (post-pivot — Terraform tree deleted)

```
infra/
  ansible/
    ansible.cfg
    site.yml                          # entry playbook (per-env via -i)
    inventory/
      dev/hosts.yml                   # localhost (no Ansible-managed services)
      prod/hosts.yml                  # existing prod VPS (148.253.214.156 currently)
    group_vars/
      all.yml                         # ansible_user=deploy, dev_ssh_pubkeys map, sport_repo_url, dev_admin_ips
      prod.yml                        # env_name=prod, caddy_host=<vps-ip-with-dashes>.sslip.io, caddy_acme_email
    roles/
      common/                         # base packages, deploy user, ssh hardening drop-in
      docker/                         # Docker Engine + Compose plugin install
      ufw/                            # OS-level firewall rules (per D-24)
      sport-stack/                    # /opt/sport/ layout + sport-stack.service + SOPS decrypt + migration + smoke
docs/
  RUNBOOKS/
    deploy.md                         # NEW — INFRA-07 requirement; provider-agnostic; documented <60min fresh-deploy
```

**Removed (post-pivot — already deleted in commit `00bcb39`):**
- `infra/terraform/` (entire tree)
- `.secrets/<env>/hetzner.yaml` SOPS slot
- `.gitignore` Terraform section
- Plan files `03-01-PLAN.md` (Terraform scaffold) and `03-03b-PLAN.md` (sentry-prep role) — both removed

## Pitfalls to Avoid (Pre-Plan Heads-Up)

1. **Don't break the existing `148.253.214.156` VPS during cutover.** NEW Plan 03-03 (cutover) must include an explicit `docker compose down --remove-orphans` of the existing manual stack BEFORE Ansible play binds 443 (B4 mitigation). Otherwise port 443 conflict between existing `caddy:2.8-alpine` containerized stack и new Ansible-managed sport-stack.
2. **Don't generate new SSH keys in Ansible for each run** — use the dev's existing `~/.ssh/id_ed25519.pub` (or `id_rsa.pub`) and inject via `authorized_keys` task with `state: present`. Idempotent.
3. **Don't expose 4222 NATS / 5432 Postgres / 6379 Redis / 9000 MinIO** to the internet — UFW deny-by-default ingress (per D-24), defense-in-depth с docker network internal-only.
4. **Don't assume Ansible can `sops -d` on the remote VPS** — age key lives on dev workstation. Use `delegate_to: localhost` for the decrypt step, then `copy` to VPS.
5. **Don't apt-install Caddy** — port 443 conflict с containerized `caddy:2.8-alpine` (D-16 KEPT).
6. **Don't reintroduce Terraform without flagging** — pivot 2026-05-17 dropped it; if future plan adds it back, write ADR explaining motivation.

</code_context>

<dependencies>
## Plan-Level Dependencies (Within Phase 3, post-pivot)

Post-pivot 3-plan structure (renumbered from original 5-plan layout):

- **Wave 1 (sequential — must precede everything):**
  - **NEW `03-01`** (was `03-02`) — Ansible scaffold + `common` + `docker` + `caddy` (template-only) + `ufw` roles + dev/prod inventory + group_vars. User-action: DEV_B SSH+age pubkey delivery + User confirms current VPS IP + current SSH user (Plan 03-01 Task 0).
- **Wave 2 (sequential after Wave 1):**
  - **NEW `03-02`** (was `03-03a`) — `sport-stack` role: SOPS-decrypt-via-delegate + migration play + `sport-stack.service` systemd umbrella + smoke probe. Includes <60min INFRA-07 measurement on existing prod VPS (the only deploy target Phase 3 has).
- **Wave 3 (sequential after Wave 2):**
  - **NEW `03-03`** (was `03-04`) — Production cutover: explicit `docker compose down` of existing manual stack BEFORE Ansible UP (B4), provider-agnostic `docs/RUNBOOKS/deploy.md`, ROADMAP wording fix + REQUIREMENTS.md INFRA-* updates.

**Dropped:** `03-01` (Terraform scaffold) and `03-03b` (sentry-prep role) — both removed in commit `00bcb39`. No replacement: Terraform deferred to v1.1 (D-22), sentry-prep moved to Phase 5 (D-09/D-10 SUPERSEDED).

</dependencies>

<success_criteria>
## Phase 3 Acceptance (post-pivot — 4 criteria, was 7)

1. ✓ `infra/ansible/` playbooks idempotently install: containerized Caddy (`caddy:2.8-alpine` in compose per D-16) + Postgres+TimescaleDB + Redis + NATS JetStream + MinIO + all 8 Go service containers under single `sport-stack.service` systemd umbrella (per D-04) on the existing prod VPS.
2. ✓ Environments: `dev` (localhost docker-compose, no Ansible) + `prod` (existing VPS) with inventory in `infra/ansible/inventory/{dev,prod}/`. Staging deferred to v1.1.
3. ✓ UFW (OS-level) firewall rules explicit; no `0.0.0.0/0` except 443 Caddy + 22 from dev-IPs-only. NATS 4222 / Postgres 5432 / Redis 6379 / MinIO 9000 internal-only (deny ingress public).
4. ✓ Fresh deploy from `git clone` to all services running in <60 minutes (measured на existing prod VPS first-clean-Ansible-deploy; recorded in `docs/RUNBOOKS/deploy.md §9`).

**Deferred from Phase 3 success criteria (originally 5/6/7 of 7):**
- Terraform / cloud-API provisioning → v1.1
- Staging environment → v1.1
- Sentry VPS provisioning → Phase 5
- TF state backend → N/A while no Terraform
- Object Storage / Storage Box → N/A while no Terraform; pgBackRest backup target deferred to Phase 7

</success_criteria>

<user_checkpoints>
## Anticipated User-Action Checkpoints (post-pivot — was 2, now 2)

Phase 3 has 2 `autonomous: false` plans:

1. **NEW Plan 03-01 Task 0: User confirms current VPS public IP + current SSH user + sudo access** — User provides the existing VPS public IP (likely `148.253.214.156`) and the SSH user that has sudo on it. Ansible inventory's `prod/hosts.yml` uses these values directly (`ansible_host: <ip>`, `ansible_user: <ssh-user>` or `deploy` after bootstrap).
2. **NEW Plan 03-01 Task 2: DEV_B age pubkey + SSH pubkey delivery** — Phase 2 carry-over follow-up #5 (Add DEV_B age pubkey). Phase 3 also needs DEV_B's SSH pubkey для the `authorized_keys` task. User signals when DEV_B has provided both; Claude runs `sops updatekeys` (Phase 2 RUNBOOK §Rotate-recipients) + adds SSH pubkey to `group_vars/all.yml`.

**Hetzner API token user-action DROPPED** (D-22 / D-26 — no Hetzner Cloud, no token, no SOPS slot needed).

3. **NEW Plan 03-03 Task 2: Production cutover human-verify** — User confirms readiness for prod cutover (backup taken, controlled-blip downtime OK).

</user_checkpoints>
</content>
</invoke>