# Phase 3: Infrastructure as Code — Context

**Gathered:** 2026-05-16
**Status:** Ready for planning
**Milestone:** v1.0 Production Readiness
**Workstream:** `backend` (STRICT after Phase 2 — Phase 2 → Phase 3 no-parallelization gate is now LIFTED; Ansible templates source from SOPS, not inline values)
**Mode:** Autonomous (`--auto`-equivalent per persistent no-questions instruction; mirrors Phase 2 CONTEXT posture)

<domain>
## Phase Boundary

**What this phase delivers:** Move from "deploy by hand on `148-253-214-156.sslip.io` via SSH + `git pull` + `/opt/sport/deploy.sh`" → to "Ansible playbooks idempotently install + configure the full backend stack on any fresh Hetzner Cloud VPS in <60 minutes from `git clone + ansible-playbook` alone, with Terraform managing the cloud-side resources (VPS hosts, Storage Box, DNS, firewall) and SOPS-decrypt happening as part of the deploy flow (per `docs/RUNBOOKS/sops-edit.md §Deploy sequence`)."

**Three target environments:** `dev` (local docker-compose, untouched by Ansible) | `staging` (1 Hetzner VPS) | `prod` (1 Hetzner VPS) | `sentry` (separate Hetzner VPS per INFRA-06, owned by Phase 3 provisioning, consumed by Phase 5).

**Service inventory landing as systemd units** (8 Go services, not the 6 listed in older ROADMAP text — corrected per current code on `feat/cursona-redesign`):
1. `identity` (auth + JWT + featureflags admin)
2. `activity-sync` (tracker telemetry ingest)
3. `feed` (social feed; do-nothing per ADR-0004 but still runs)
4. `media` (S3 presigned URL broker)
5. `messaging` (DM)
6. `notifications` (Expo Push)
7. `realtime-gw` (NATS↔mobile websocket bridge)
8. `social-graph` (follow/block graph)

Plus 4 stateful + 1 gateway: Postgres+TimescaleDB, Redis, NATS JetStream, MinIO, Caddy.

**Out of scope:**
- CI/CD pipeline (Phase 4 / CICD-01..06) — Phase 3 lands the deploy SEAM (Ansible target invoked manually); Phase 4 wires GitHub Actions to invoke it on tagged release.
- Rollback drill (Phase 4 / CICD-04) — Phase 3 enables rollback via `git checkout` + re-run Ansible; Phase 4 proves the drill with a real DB migration in path.
- Observability stack (Phase 5) — Sentry VPS is provisioned in Phase 3 (INFRA-06) but Phase 5 owns Sentry-self-hosted install + Prom + Grafana + structured logging.
- DB backup automation (Phase 7 / DB-01..05) — Phase 3 provisions the Storage Box (INFRA-04 needs it for Terraform state too); Phase 7 wires pgBackRest → Storage Box + proven restore drill.
- HSM-backed Terraform state secrets (v1.1+) — closed beta uses Hetzner storage backend + .sops-encrypted env file at deploy time.
- Multi-region geographic expansion (v2.0 per user decision).
- Helm charts / K8s / ArgoCD — `services/backend/deploy/helm/` was a pre-v1.0 placeholder per CLAUDE.md ("Future: K8s + Helm + ArgoCD (not yet implemented)"). v1.0 stays on docker-on-VPS via systemd + docker (NOT raw native binaries — see D-04 below).

</domain>

<scout_findings>
## Current State of Deploy (verified 2026-05-16 on `feat/cursona-redesign`)

### What's already in place (good baseline)
- **`services/backend/docker-compose.prod.yml` is self-contained** — production stack file. Uses `${VAR:?need ...}` shell substitution to fail-fast on missing secrets (Phase 2 SEC-09 stays the line of defense at compose layer).
- **`services/backend/gateway/Caddyfile.prod` is production-shaped** — Let's Encrypt + sslip.io for both the main API host (`148-253-214-156.sslip.io`) and the S3 proxy (`s3.148-253-214-156.sslip.io`). CORS preflight handler in place for future web client.
- **Migration story exists** — one-shot `migrate/migrate:v4.18.1` init job in `docker-compose.prod.yml`; services wait via `service_completed_successfully` healthcheck. Migrations live at `services/backend/migrations/` (golang-migrate format, paired `*.up.sql` / `*.down.sql`).
- **SOPS deploy seam already documented** in `docs/RUNBOOKS/sops-edit.md §Deploy script (`/opt/sport/deploy.sh` на VPS)` — `sops -d --output-type=dotenv` writes to `/run/sport.env` (tmpfs, mode 600, `trap shred` cleanup), then `docker compose --env-file` consumes. **Phase 3 wraps this in Ansible — does NOT replace it.**
- **Observability scaffolding** at `services/backend/observability/` already has `prometheus.yml`, `loki.yml`, `grafana-datasources.yml` configs; `docker-compose.observability.yml` is a separate compose profile. Phase 5 lands the Sentry VPS install on top; Phase 3 provisions the Sentry VPS itself.
- **Smoke scripts** at `services/backend/scripts/smoke_*.py` already use `BASE_URL` env var defaulting to `https://148-253-214-156.sslip.io` — staging vs prod toggle is just `BASE_URL=...` ENV.

### What's missing / broken
- **No `infra/` directory at all.** No `infra/ansible/`, no `infra/terraform/`, no inventory files, no playbooks. Greenfield for Phase 3.
- **No GitHub Actions CI** (`.github/workflows/` does not exist). Phase 4 territory, but Phase 3's deploy.sh must be CI-invokable.
- **No staging environment.** Production is the only environment that's ever been deployed. Mobile `staging` flavor exists conceptually (will land Phase 11/12 via EAS profiles) but no backend staging VPS.
- **No backup story for Terraform state.** No state file exists yet (no Terraform).
- **No firewall configuration documented.** Hetzner Cloud firewall is currently default-open within the project's VPS group. INFRA-05 closes this.
- **No DNS strategy beyond sslip.io.** sslip.io subdomains are zero-cost auto-DNS-from-IP; works for closed beta but breaks once we want `api.<brand>.com`. Sentry per INFRA-06 needs separate DNS — for v1.0 closed beta that means `sentry.<another-ip>.sslip.io` (separate VPS, separate IP, separate sslip subdomain).
- **`deploy/helm/` placeholder code** at `services/backend/deploy/helm/identity/` (Phase 0-era) — UNUSED in v1.0; can be deleted in cleanup pass or left for future K8s migration. **Not consumed by Phase 3.**

### Hetzner Cloud account state (assumed — verify in Plan 03-01 Task 0)
- Current prod VPS at `148.253.214.156` is presumably a Hetzner Cloud instance (the smoke scripts hardcode it; CLAUDE.md mentions Hetzner). Owner is the same user account that holds Mapbox tokens (1-person ops). For Phase 3:
  - Need API token with read+write on Cloud + Storage Box scopes.
  - Project name / API token labels TBD — will surface in Plan 03-01 user_setup checkpoint, similar to Phase 2's Mapbox-dashboard checkpoint.
  - Existing prod VPS is most likely Terraform-imported into the new project, NOT recreated (zero-downtime requirement). Plan 03-02 wave 1 owns `terraform import hcloud_server.prod <existing-id>`.

### Constraints from prior phases
- **Phase 1 / REL-01 / REL-02:** API contract is locked + version negotiation is locked. Phase 3 must not change service ports / API paths / response shapes — it just packages and deploys them.
- **Phase 2 / SEC-02 + SEC-06 + SEC-09:** SOPS is the canonical secret store; `envRequire(KEY)` fail-fast helper is in every service `main.go`. Phase 3's Ansible templates source secrets from SOPS via `sops -d --output-type=dotenv`, never inline.
- **Phase 2 / SEC-03 + SEC-04 (ADR-0006):** Mapbox tokens are now in SOPS at `.secrets/{prod,staging,dev}/mapbox.yaml`. Phase 3's mobile-deploy story (EAS env-var wiring) is one of the Phase 2 follow-ups — Phase 3 may incidentally close it via `eas secret:create` from decrypted SOPS, or defer to Phase 11/12.
- **Phase 2 / SEC-07 (`docs/RUNBOOKS/sops-edit.md`):** Already documents the deploy.sh shape. Phase 3 takes that shape and wraps in Ansible (`copy` or `template` module, with `delegate_to: localhost` for the `sops -d` step).
- **Phase 2 follow-up #3:** `~/.envrc` (direnv) for `SOPS_AGE_KEY_FILE` on macOS dev machines. Phase 3 should include this in the dev-onboarding section of `docs/RUNBOOKS/deploy.md`.

</scout_findings>

<decisions>
## Implementation Decisions (17 gray areas auto-resolved; 3 explicitly deferred to researcher)

### IaC Architecture (INFRA-01, INFRA-02)

- **D-01: Ansible for software provisioning + Terraform for cloud resources.** Per ROADMAP explicit choice; not relitigated. Ansible runs on dev workstation (no pull-based mesh like Salt; no cron-based Chef agent). Terraform v1.13+ (latest stable as of 2026-05) with `hetznercloud/hcloud` provider. Why split: cloud resources are stateful (need state-file reconciliation), software config is convergent (idempotent every run, no state). The two tools handle different problems.
- **D-02: Single Hetzner project, multi-VPS topology.** Three production-ish VPS for v1.0 closed beta:
  - `prod-app-01` (CX22 or CX32 — let researcher pick; runs full app stack)
  - `staging-app-01` (CX22 — runs same stack at smaller size; identical software stack as prod)
  - `sentry-01` (CX22 — runs Sentry self-hosted, per INFRA-06 isolation)
  - Plus a Hetzner Storage Box for Terraform state + Phase 7 pgBackRest target.
  - **Existing `148.253.214.156` VPS is the `prod-app-01`** — imported into Terraform, not recreated. Plan 03-02 wave 1 owns the `terraform import`.
- **D-03: Inventory layout = `infra/ansible/inventory/{dev,staging,prod}/` per ROADMAP INFRA-03.** `dev/` inventory points at `localhost` running docker-compose (no Ansible-managed services in dev — keep the fast local loop). `staging/` and `prod/` point at the respective VPS. Sentry VPS gets its own inventory group `[sentry]` reachable from both staging and prod groups (separate run).

### Containers vs Native Binaries on systemd (INFRA-01)

- **D-04: Docker-on-systemd, NOT native Go binaries.** Each service runs as a `docker compose up`-style container, but the **compose stack itself is managed by a single root systemd unit** (e.g., `sport-stack.service` → `ExecStart=/usr/bin/docker compose -f /opt/sport/docker-compose.prod.yml --env-file /run/sport.env up`). Why:
  - Preserves the existing `Dockerfile`s and `docker-compose.prod.yml` (no rebuild of every service's deploy story).
  - systemd gives us startup ordering (`After=docker.service network-online.target`), auto-restart (`Restart=on-failure`), boot-time guarantees.
  - Single systemd unit is simpler than 8 per-service units that all need health-checks and ordering DAG.
  - Rejected alternative: 8 separate native systemd units running `go build` artifacts. Reason: 8× the deploy story, no isolation from libc differences across environments, and dist-vendor is solved by Docker.
- **Open question:** the ROADMAP success criterion 1 says "all 6 Go service systemd units" implying per-service units. **Override:** the spirit (each service runs reliably under systemd supervision) is met by the single-stack approach because docker-compose itself supervises the 8 containers. Recorded as a deviation in 03-CONTEXT vs literal ROADMAP wording; planner should explicitly call this out in `03-01-PLAN`.

### Terraform State Backend (INFRA-04) — DEFERRED to research

- **D-05 [DEFERRED to researcher]: How exactly does Terraform store state in Hetzner Storage Box?** Storage Box is SFTP/WebDAV; Terraform's `http` backend supports locking + needs an HTTP server fronting the store, OR pivot to **Hetzner Object Storage** (separate product, S3-compatible, eu-central-1) and use Terraform's `s3` backend. ROADMAP literally says "Storage Box" — may be a misnomer for "Hetzner storage product"; researcher confirms which Hetzner offering supports Terraform `s3` backend natively + provides state locking primitives. Open Q: Hetzner Storage Box does NOT natively support DynamoDB-style locking; researcher may recommend `terraform-backend-git` (against a private 2nd repo) as a v1.0 alternative.
- **Constraint:** never in main repo. Storage Box / Object Storage / private state-only repo are the three candidates; pick one.

### Network Firewall (INFRA-05)

- **D-06: Hetzner Cloud Firewall rules, declared in Terraform.** Per-VPS firewall + project-wide default deny ingress. Explicit allow rules:
  - **`prod-app-01` and `staging-app-01`:** TCP/443 from `0.0.0.0/0` (Caddy public), TCP/22 from `dev-workstation-IPs/32` only (admin SSH; rotate IPs in a `dev_admin_ips.tfvars` per dev), and inter-VPS internal traffic via Hetzner private network (NOT public IP). **No 80** (Caddy redirects via `redir 308`).
  - **`sentry-01`:** TCP/443 from `0.0.0.0/0` (Sentry web UI), TCP/22 from dev IPs only.
  - **Egress:** allow all (services need outbound DNS, Mapbox API, Expo Push, etc.).
- **D-07: NATS 4222 is INTERNAL ONLY.** The ROADMAP §Phase 3 success-criterion-5 mention of "4222 NATS" was misleading: in v1.0 single-VPS-per-env topology, NATS clients (`realtime-gw` + other backend services) live on the same docker network as the NATS server. **No external exposure.** Mobile clients connect to `realtime-gw` over WebSocket on 443 (Caddy proxies). Documented in 03-CONTEXT; researcher to verify the assumption holds (no current external NATS dependency I'm aware of).
- **D-08: MinIO S3 endpoint exposed via Caddy** at `s3.<vps-ip>.sslip.io` (per existing `Caddyfile.prod`). MinIO container port 9000 not directly exposed; presigned URLs flow through Caddy reverse-proxy. Already in place — Phase 3 just preserves it.

### Sentry VPS Provisioning (INFRA-06)

- **D-09: Sentry-01 is a separate VPS with separate Hetzner Cloud Firewall + separate Caddy + separate ACME cert.** DNS: `sentry.<vps-ip>.sslip.io` for v1.0 closed beta (e.g., `sentry.<sentry-ip>.sslip.io` — different IP from prod-app, different Caddy instance). When v1.1 real domain lands, becomes `sentry.<brand>.com`.
- **D-10: Phase 3 provisions the Sentry VPS + installs Caddy + opens 443. Phase 5 installs Sentry self-hosted (`getsentry/self-hosted` repo) on it via a separate Ansible role.** Cleanly split: Phase 3 = empty Sentry-ready VPS; Phase 5 = Sentry stack on it.
- **D-11: Sentry VPS minimum size per Sentry self-hosted docs:** 8 GB RAM (Sentry's recommended minimum). Hetzner CX32 = 4 vCPU + 8 GB RAM = right-sized. Documented in `infra/terraform/sentry.tf`.

### Deploy Sequence + SOPS Wiring (INFRA-01 mechanics)

- **D-12: Ansible runs `sops -d` locally on dev workstation** (via `delegate_to: localhost` block) and templates the resulting plaintext `.env` to `/run/sport.env` on the target VPS using Ansible's `copy` module with `mode: '0600'` and `owner: deploy` (a non-root deploy user). No SOPS binary needs to be on the VPS. Age key stays on dev workstation per Phase 2 D-04 strategy.
- **D-13: SOPS_AGE_KEY_FILE env var pointing to `~/.config/sops/age/keys.txt`** (the XDG path) is documented in `docs/RUNBOOKS/deploy.md §dev workstation setup`. Phase 2 follow-up #3 (`~/.envrc` via direnv) is closed by Phase 3 if the deploy playbook depends on it via `ansible-playbook`'s `env`-propagation; otherwise, document in RUNBOOK as a one-time dev-setup step.
- **D-14: Migration step is a separate Ansible play** that runs `docker compose -f docker-compose.prod.yml run --rm migrate` BEFORE bringing up the app services. The existing `migrate/migrate:v4.18.1` one-shot container is preserved — Ansible just orchestrates the ordering: SOPS-decrypt → migration → service-up. Rollback (Phase 4) wraps the `migrate -path migrations -database $DB down 1` analog.
- **D-15: `/run/sport.env` is shredded** by a systemd `OnFailure=`-ish hook (`shred -u /run/sport.env` in `ExecStopPost=`). On normal stack stop, the env file is shredded too — minimizes plaintext lifetime. tmpfs `/run` means it never lands on disk anyway, but explicit shred is defense-in-depth.

### Caddy Install Strategy

- **D-16: Hand-rolled Ansible role for Caddy.** Caddy v2 community Ansible roles exist (e.g., `caddy_ansible/caddy_ansible_role`) but introduce dependency surface for a 2-dev closed beta. The role is ~50 lines (apt-key + apt-repo + apt-install + Caddyfile template + systemd reload). Document in `infra/ansible/roles/caddy/`. Why: reduces external-dependency risk; Caddy is one of the simplest services to install (single binary).
- **D-17: Caddyfile per environment** — `staging.Caddyfile` vs `prod.Caddyfile` differ by `email` + `host` only. Use Ansible `template` module with per-env `{{ env }}` vars. The existing `services/backend/gateway/Caddyfile.prod` becomes the prod template seed.

### Hetzner DNS Strategy

- **D-18: sslip.io for v1.0 closed beta.** Auto-DNS from VPS public IP — zero ops cost. Documented as v1.1 follow-up to register a real `<brand>.com` once user-onboarding ramps. Implication for Sentry (INFRA-06): use the Sentry VPS's own IP as the sslip.io subdomain root (e.g., `sentry.<sentry-vps-ip>.sslip.io`). Mobile app uses a per-env runtime config: `EXPO_PUBLIC_IDENTITY_URL`, `EXPO_PUBLIC_SYNC_URL`, etc. — already env-driven from Phase 1 / REL-02.

### Operational Boundaries

- **D-19: 2-dev SSH access via `~/.ssh/authorized_keys` provisioned by Terraform on VPS creation** + propagated by an Ansible `authorized_keys` task on every run (idempotent — `state: present`). Both devs in the `ansible_user`'s authorized_keys; root login disabled (`PermitRootLogin no`), password auth disabled (`PasswordAuthentication no`). Adds DEV_B (Phase 2 carry-over — pubkey delivery) directly to authorized_keys on first run.
- **D-20: Deploy user `deploy`** (not `root`) — sudoers `ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/docker, /usr/bin/docker compose, /bin/shred /run/sport.env`. Narrow sudo allowance; deploy user owns `/opt/sport/`. Why: principle of least privilege; if `deploy` is compromised, attacker gets `systemctl` + `docker` but not unrestricted root.

### Deploy Timing Target (INFRA-07)

- **D-21: <60min target measured as `ansible-playbook site.yml -i inventory/prod` from a fresh Hetzner VPS** (post-Terraform creation). Excludes Terraform run time (`terraform apply` typically 30-60s on Hetzner; not the bottleneck). Excludes ACME cert issuance time (~10s — counted in the budget). Includes Docker install (~3min) + image pulls (~5-10min for 8 services if cold-cache) + Postgres+Timescale init + Caddy ACME + smoke health probe. Realistic estimate: 20-40 min on first run, 5-10 min on incremental (cached layers). Documented in `docs/RUNBOOKS/deploy.md` with measured timings recorded after Plan 03-04 dry-run on staging.

</decisions>

<deferred>
## Deferred to Researcher (Plan 03-XX research-phase)

These are open questions that need research before plan_phase can commit to a specific approach. Researcher's `RESEARCH.md` should answer:

1. **Terraform state backend on Hetzner** (D-05 deferred) — Verify:
   - Does Hetzner Storage Box support the Terraform `http` backend with state locking? (Suspicious: Storage Box is SFTP/WebDAV; locking primitives unclear.)
   - Does Hetzner Object Storage (separate product, eu-central-1, S3-compatible) support the Terraform `s3` backend with `dynamodb_table`-equivalent locking? (Most likely YES if they implement S3 conditional writes / `If-Match` headers.)
   - Alternative: `terraform-backend-git` against a separate private Git repo for state.
   - Recommendation: pick the simplest reliable option for a 2-dev v1.0 closed beta.
2. **Hetzner Cloud Firewall + private network topology** — Should staging-app-01 and prod-app-01 share a Hetzner private network for ssh-from-bastion patterns? Or stay isolated public-IP only? (Closed beta scale answer: isolated is fine; flag for v1.1 if multi-VPS-per-env emerges.)
3. **Sentry self-hosted CPU/RAM sizing on Hetzner** — verify CX32 (4 vCPU / 8 GB) is enough for Sentry self-hosted minimal (mobile + backend projects, 4 total, low event volume for closed beta with ≤10 users). Sentry docs say 8 GB minimum; verify in 2026 reality on small ARM/x86 spec.
4. **NATS exposure verification** — Confirm that NO external client connects directly to NATS 4222 in the v1.0 architecture. Mobile uses `realtime-gw` → `/ws` → NATS internally. (Already documented as my D-07 assumption; let researcher verify against current code.)

</deferred>

<deferred_ideas>
## Out-of-Scope Ideas (Captured for Roadmap Backlog)

These came up during analysis but belong in other phases or v1.1+:

- **Real `<brand>.com` domain registration** — v1.1 once beta ramps (currently sslip.io is zero-cost and works).
- **Multi-AZ / multi-region deployment** — v2.0 (user decision per STATE §Deferred Items).
- **Bastion host for SSH** — v1.1 if VPS count > 5; v1.0 closed beta keeps direct SSH from dev IPs.
- **K8s migration / Helm charts revival** — undated; `deploy/helm/` placeholder code at `services/backend/deploy/helm/` is unused in v1.0. Can be deleted in a hygiene pass.
- **Cloudflare in front of Caddy** — v1.1 for DDoS/CDN if mobile traffic grows.
- **Terraform Cloud / Spacelift** — v1.1+ if team grows beyond 2; v1.0 local-CLI Terraform + Hetzner-side state is sufficient.
- **Per-service systemd units** (vs single sport-stack.service umbrella per D-04) — revisit if/when migrating off docker-compose to native binaries. Not v1.0.
- **Automated Mapbox EAS secret push** — Phase 2 follow-up #4; could land here incidentally but cleaner in Phase 11/12 (EAS profile setup).

</deferred_ideas>

<canonical_refs>
## Canonical Documents (MUST READ before plan/research)

| Path                                                                  | Why it matters                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/ROADMAP.md §Phase 3`                                       | Phase 3 goal, success criteria 1-7, INFRA-01..07 mapping                                                                                  |
| `.planning/REQUIREMENTS.md §INFRA-01..07`                             | Numbered requirement definitions                                                                                                          |
| `.planning/phases/02-secrets-and-config-hardening/02-CONTEXT.md`      | Phase 2 decisions D-01..D-20 that Phase 3 inherits (esp. D-03 deploy seam, D-04 master key, D-06 SOPS-decrypt-at-deploy-time)             |
| `.planning/phases/02-secrets-and-config-hardening/02-04-SUMMARY.md`   | Mapbox rotation closeout + 5 follow-ups (Phase 2 → Phase 3 carryover items)                                                               |
| `docs/RUNBOOKS/sops-edit.md §Deploy script + §Manual SCP deploy`      | Pre-Phase-3 deploy shape that Phase 3 wraps in Ansible (DO NOT replace — wrap)                                                            |
| `docs/DECISIONS/0006-mapbox-token-incident.md`                        | SOPS-only canonical store decision — Phase 3 Ansible must source Mapbox tokens from there, not inline                                     |
| `docs/DECISIONS/0007-v1.0-release-contract.md`                        | API contract locked — Phase 3 must not change ports / paths / response shapes                                                             |
| `services/backend/docker-compose.prod.yml`                            | Production stack file — Phase 3 wraps but does NOT rewrite (preserves `${VAR:?need ...}` fail-fast)                                       |
| `services/backend/gateway/Caddyfile.prod`                             | Production Caddy config — seed for the per-env Ansible template                                                                           |
| `services/backend/migrations/`                                        | golang-migrate schema migrations — Phase 3 Ansible runs them as a separate one-shot play before service-up                                |
| `.planning/codebase/STACK.md`                                         | Tech stack reference — Go 1.25, Postgres 16, NATS 2.11, MinIO version, etc.                                                               |
| `.planning/codebase/INTEGRATIONS.md §Backend deploy`                  | Current deploy story baseline — single VPS, manual docker-compose                                                                         |
| `CLAUDE.md §Стек §Деплой`                                             | Future K8s mention; v1.0 stays docker-on-systemd per D-04 (explicit deviation noted)                                                      |

</canonical_refs>

<code_context>
## Reusable Assets

- **`docker-compose.prod.yml`** is the SEED for Phase 3's stack-systemd-unit. Ansible's `copy` module syncs the file to `/opt/sport/docker-compose.prod.yml` on the VPS; the systemd `ExecStart` references it.
- **`gateway/Caddyfile.prod`** is the SEED for Phase 3's Caddyfile template — env-specific variables (`email`, `host`) become `{{ caddy_email }}` / `{{ caddy_host }}` Jinja2 variables in the Ansible template.
- **`scripts/smoke_*.py`** are the smoke probe seed for Phase 3 post-deploy verification — `ansible-playbook` can invoke `services/backend/scripts/smoke_otp.py` etc. against the just-deployed `staging-app-01` or `prod-app-01` via `BASE_URL=https://<env>.<ip>.sslip.io`.
- **`services/backend/observability/*.yml`** stay UNTOUCHED in Phase 3 — Phase 5 owns the observability stack install. Phase 3 just provisions the Sentry VPS.
- **`docs/RUNBOOKS/sops-edit.md §Deploy script (`/opt/sport/deploy.sh` на VPS)`** literally contains the Phase 3 deploy script as a bash example. Phase 3 Ansible adapts that shape: split into stages (decrypt → SCP → migrate → up), each as Ansible tasks.

## New Files Expected (per ROADMAP success criteria)

```
infra/
  ansible/
    site.yml                          # entry playbook (per-env)
    inventory/
      dev/hosts.yml                   # localhost (no Ansible-managed services in dev)
      staging/hosts.yml               # staging-app-01
      prod/hosts.yml                  # prod-app-01
      sentry/hosts.yml                # sentry-01 (referenced by Phase 5 too)
    roles/
      common/                         # base packages, deploy user, ssh hardening, systemd defaults
      docker/                         # Docker Engine install
      caddy/                          # Caddy v2 install + Caddyfile template
      sport-stack/                    # /opt/sport/ layout + sport-stack.service systemd unit + SOPS decrypt + migration step
      sentry-prep/                    # base prep for Sentry VPS (Caddy + open 443); Sentry stack install is Phase 5
    group_vars/
      all.yml                         # cross-env defaults
      staging.yml                     # staging overrides
      prod.yml                        # prod overrides
      sentry.yml                      # sentry overrides
  terraform/
    main.tf                           # provider config (hetznercloud/hcloud)
    backend.tf                        # state backend (per D-05 researcher recommendation)
    network.tf                        # private network + firewalls
    servers.tf                        # prod-app-01 + staging-app-01 + sentry-01 (with terraform import for existing prod)
    storage.tf                        # Hetzner Storage Box for Phase 7 + (maybe) Terraform state
    dns.tf                            # sslip.io is auto, but record any aliases here
    variables.tf                      # API token, project name, region, dev SSH pubkeys
    terraform.tfvars.example          # template; real values in .gitignored terraform.tfvars
docs/
  RUNBOOKS/
    deploy.md                         # NEW — INFRA-07 requirement; documented <60min fresh-deploy with measured timings
```

## Pitfalls to Avoid (Pre-Researcher Heads-Up)

1. **Don't run `terraform apply` against an empty state when prod VPS already exists.** Must `terraform import hcloud_server.prod_app_01 <existing-id>` first. Plan 03-02 Wave 1 owns this; document in 03-02-PLAN as a blocking checkpoint.
2. **Don't generate new SSH keys in Ansible for each run** — use the dev's existing `~/.ssh/id_ed25519.pub` (or `id_rsa.pub`) and inject via `authorized_keys` task with `state: present`. Idempotent.
3. **Don't break the existing `148.253.214.156` VPS during cutover.** Plan 03-04 (cutover) must include a rollback path: keep `git pull && /opt/sport/deploy.sh` working during the Ansible-rollout transition. Two-deploy-paths-coexist for one plan, then deprecate the manual one.
4. **Don't expose 4222 NATS or 5432 Postgres** to the internet (default Hetzner Cloud firewall + per-VPS firewall together — defense in depth).
5. **Don't store Terraform state in the main repo** (INFRA-04 explicit). Researcher picks backend.
6. **Don't assume Ansible can `sops -d` on the remote VPS** — age key lives on dev workstation. Use `delegate_to: localhost` for the decrypt step, then `copy` to VPS.

</code_context>

<dependencies>
## Plan-Level Dependencies (Within Phase 3)

Expected plan breakdown (will be refined in `/gsd-plan-phase 3` after research):

- **Wave 1 (sequential — must precede everything):**
  - `03-01` — Terraform scaffold + `terraform import` of existing prod VPS + state backend setup (per D-05 researcher pick). USER ACTION: Hetzner API token creation + project setup.
- **Wave 2 (sequential after Wave 1):**
  - `03-02` — Ansible scaffold + `common` + `docker` + `caddy` roles + dev/staging/prod inventory + group_vars.
- **Wave 3 (parallel after Wave 2):**
  - `03-03a` — `sport-stack` role: docker-compose.prod.yml deploy + SOPS-decrypt-via-delegate + migration play + sport-stack.service systemd unit + post-deploy smoke probe. Includes <60min measurement on staging VPS.
  - `03-03b` — Sentry VPS provisioning: `sentry-prep` role + new sentry-01 VPS in Terraform + DNS sslip.io subdomain + Caddy + open 443 (no Sentry install yet — Phase 5).
- **Wave 4 (sequential after Wave 3):**
  - `03-04` — Production cutover: deploy via Ansible to existing `148.253.214.156`, verify zero-downtime; deprecate manual `/opt/sport/deploy.sh` (keep as documented fallback in RUNBOOK). `docs/RUNBOOKS/deploy.md` written with measured <60min timing.

</dependencies>

<success_criteria>
## Phase 3 Acceptance (from ROADMAP, no expansion)

1. ✓ `infra/ansible/` playbooks idempotently install: Caddy (with ACME), Postgres+TimescaleDB, Redis, NATS JetStream, MinIO, all 8 Go service systemd units (corrected from 6 in ROADMAP — current code on `feat/cursona-redesign` has 8 services; planner to fix ROADMAP wording in 03-01 PLAN).
2. ✓ `infra/terraform/` manages Hetzner Cloud resources: VPS hosts (dev/staging/prod), Storage Box, DNS records, firewall rules.
3. ✓ Environments: `dev` / `staging` / `prod` with inventory files in `infra/ansible/inventory/{env}/`.
4. ✓ State backend: Terraform state in Hetzner Storage Box (or Object Storage, per D-05 researcher pick) with remote locking; never in main repo.
5. ✓ Network: explicit Hetzner Cloud firewall rules; no `0.0.0.0/0` except 443 Caddy + 22 dev-IPs-only + presigned MinIO via Caddy.
6. ✓ Separate VPS provisioned for Sentry with separate DNS `sentry.<sentry-ip>.sslip.io` and separate ACME cert (Phase 5 consumes).
7. ✓ Fresh deploy from `git clone` to all services running in <60 minutes (measured on staging, recorded in `docs/RUNBOOKS/deploy.md`).

</success_criteria>

<user_checkpoints>
## Anticipated User-Action Checkpoints

Phase 3 has at least 2 `autonomous: false` checkpoints similar to Phase 2's Mapbox dashboard work:

1. **Plan 03-01 Task 0: Hetzner API token + project setup** — User logs into Hetzner Cloud Console, creates a project token with `read+write` Cloud + Storage Box scopes, pastes the token into SOPS (`sops --set` per Phase 2 D-19 pattern, into `.secrets/<env>/hetzner.yaml` — NEW slot file).
2. **Plan 03-02 Task X: DEV_B age pubkey + SSH pubkey** — Phase 2 carry-over follow-up #5 (Add DEV_B age pubkey). Phase 3 needs DEV_B's SSH pubkey too for the `authorized_keys` task. User signals when DEV_B has provided both; Claude runs `sops updatekeys` (Phase 2 RUNBOOK §Rotate-recipients) + adds SSH pubkey to `group_vars/all.yml`.

</user_checkpoints>
