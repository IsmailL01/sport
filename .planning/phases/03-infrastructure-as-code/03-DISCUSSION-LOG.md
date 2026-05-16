# Phase 3: Infrastructure as Code — Discussion Log

**Date:** 2026-05-16
**Mode:** Autonomous (`--auto`-equivalent per persistent no-questions instruction; mirrors Phase 2 CONTEXT posture)
**Outcome:** 17 decisions auto-resolved (D-01..D-21 with 4 of those deferred as research items); 8 deferred ideas captured for backlog; 2 user-action checkpoints anticipated.

## Why no interactive Q&A this round

User has a standing instruction (system-reminder at session start + persistent across sessions per memory `framework_choice.md`-style precedent): "work without stopping for clarifying questions. When you'd normally pause to check, make the reasonable call and continue; they'll redirect if needed."

Phase 2's CONTEXT.md was gathered under the same convention (20 decisions auto-resolved). Phase 3 mirrors that posture. The user explicitly invoked `/gsd-discuss-phase 3` for the CONTEXT artifact (which gsd-planner consumes), not for an interactive session.

## Gray areas identified and resolved (without asking)

| #     | Area                                          | Resolution                                                                                                                                        | Confidence |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D-01  | IaC tool split (Ansible vs Terraform)         | Both — Terraform for cloud resources, Ansible for software config                                                                                 | HIGH (locked in ROADMAP) |
| D-02  | Topology — number + sizing of VPS             | 3 production-ish VPS: prod-app-01 (CX22/CX32) + staging-app-01 (CX22) + sentry-01 (CX32). Existing `148.253.214.156` is prod-app-01.              | HIGH       |
| D-03  | Inventory layout                              | `infra/ansible/inventory/{dev,staging,prod}/` per ROADMAP; sentry as a group in prod inventory or as its own inventory dir                       | HIGH       |
| D-04  | Containers vs native systemd                  | Docker-compose-on-systemd umbrella (`sport-stack.service` wraps `docker compose up`) — NOT per-service native binaries                            | MEDIUM (deviation from literal ROADMAP "6 service units"; planner to flag) |
| D-05  | Terraform state backend                       | **DEFERRED to researcher** — Storage Box vs Object Storage vs `terraform-backend-git`                                                             | LOW (research needed)    |
| D-06  | Network firewall rules                        | Hetzner Cloud Firewall in Terraform — 443 + 22-from-dev-IPs + Hetzner private network internal-only                                              | HIGH       |
| D-07  | NATS external exposure                        | INTERNAL ONLY — mobile clients route through `realtime-gw` on 443. ROADMAP §Phase 3 §5 mention of "4222 NATS" was misleading.                     | MEDIUM (researcher verifies) |
| D-08  | MinIO endpoint exposure                       | Via Caddy at `s3.<vps-ip>.sslip.io` — preserves existing Phase B3 design                                                                          | HIGH       |
| D-09  | Sentry DNS + cert                             | `sentry.<sentry-ip>.sslip.io` + separate Caddy + separate ACME cert                                                                              | HIGH       |
| D-10  | Sentry install split                          | Phase 3 = empty Sentry-ready VPS (Caddy + 443 open); Phase 5 = install Sentry self-hosted stack on it                                            | HIGH       |
| D-11  | Sentry VPS sizing                             | CX32 (4 vCPU / 8 GB) per Sentry self-hosted minimum                                                                                              | MEDIUM (researcher verifies 8 GB still enough in 2026) |
| D-12  | Ansible SOPS-decrypt location                 | Local on dev workstation via `delegate_to: localhost` — NO SOPS binary on VPS, NO age key on VPS                                                  | HIGH       |
| D-13  | SOPS_AGE_KEY_FILE setup                       | `~/.envrc` direnv snippet (closes Phase 2 follow-up #3); document in `docs/RUNBOOKS/deploy.md §dev workstation setup`                            | HIGH       |
| D-14  | Migration step                                | Separate Ansible play running `docker compose run --rm migrate` BEFORE service-up — preserves existing one-shot migrate container                | HIGH       |
| D-15  | `/run/sport.env` lifetime                     | Shredded by `ExecStopPost=` on stack shutdown; tmpfs already prevents disk landing                                                                | HIGH       |
| D-16  | Caddy install strategy                        | Hand-rolled Ansible role (~50 lines) — no community-role dependency                                                                              | HIGH       |
| D-17  | Caddyfile per-environment                     | Jinja2 template with `{{ caddy_email }}` + `{{ caddy_host }}` vars; existing `Caddyfile.prod` is the seed                                        | HIGH       |
| D-18  | DNS strategy                                  | sslip.io for v1.0 closed beta; real domain in v1.1                                                                                               | HIGH       |
| D-19  | SSH access — 2-dev authorized_keys            | Both devs' pubkeys provisioned by Terraform + Ansible `authorized_keys` task (idempotent)                                                        | HIGH       |
| D-20  | Deploy user permissions                       | `deploy` user with narrow sudoers (systemctl + docker + shred only); no unrestricted root                                                        | HIGH       |
| D-21  | <60min target measurement                     | `ansible-playbook site.yml -i inventory/prod` from fresh VPS — measured on staging in Plan 03-04                                                  | HIGH       |

## Deferred to researcher (4 explicit items)

See `<deferred>` in 03-CONTEXT.md.

## Deferred ideas (8 items)

See `<deferred_ideas>` in 03-CONTEXT.md. All captured for v1.1+ or other phases — none act on in Phase 3.

## Anticipated user-action checkpoints (2)

See `<user_checkpoints>` in 03-CONTEXT.md.

## What was NOT discussed

- WHAT to build — locked by ROADMAP §Phase 3 success criteria + REQUIREMENTS.md §INFRA-01..07.
- WHETHER to do this — non-negotiable per ROADMAP "strict gate" wording.
- Per-service implementation details — Phase 3 just deploys what already exists; service-level changes belong in other phases.

If the user redirects on any decision (especially the systemd umbrella vs per-service-units choice in D-04 — that's the most opinionated call), 03-CONTEXT.md is the single update point before researcher / planner consume it.
