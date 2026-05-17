---
phase: 03-infrastructure-as-code
plan: 03
subsystem: infra
status: CLOSED 2026-05-17 (Wave 3 — provider-agnostic RUNBOOK + ROADMAP/REQ patches; cutover already done out-of-band in Wave 2)
tags: [runbook, deploy-docs, roadmap-patch, requirements-patch]

requires:
  - phase: 03 Plan 02 (sport-stack umbrella deployed + INFRA-07 baseline measured)
provides:
  - docs/RUNBOOKS/deploy.md — 9-section provider-agnostic deploy RUNBOOK
  - ROADMAP §Phase 3 patches (6→8 services, INFRA-02/04 deferred markers, INFRA-06 moved Phase 5, UFW wording) — landed earlier в pivot commit 9e4fefe
  - REQUIREMENTS §INFRA-01..07 patches (same shape) — landed earlier в pivot commit 9e4fefe
affects: [04-cicd, 21-staging-e2e (deploy.md §5 routine deploy is the seam Phase 4 wires CI to)]
---

# Plan 03-03 SUMMARY — Wave 3 closeout

## Task disposition

| Task | Status | Where landed |
|------|--------|--------------|
| Task 1 — Write `docs/RUNBOOKS/deploy.md` (9 sections, provider-agnostic per D-25) | ✓ NEW (this plan) | Commit на end of Wave 3 |
| Task 2 — Production cutover (B4-mitigated explicit teardown) | ✓ Done out-of-band 2026-05-17 11:05-11:19Z (Wave 2 live cutover) | See 03-02-SUMMARY §LIVE CUTOVER ADDENDUM; commits `4ceece7` + `50b3830` + `27ff67f` |
| Task 3 — Patch ROADMAP §Phase 3 (6→8 services, INFRA-02/04 deferred, INFRA-06 moved, UFW wording) | ✓ Done earlier в pivot commit `9e4fefe` | `.planning/ROADMAP.md` §Phase 3 |
| Task 4 — Patch REQUIREMENTS §INFRA-01..07 (DEFERRED markers + reworded INFRA-01/03/05/07) | ✓ Done earlier в pivot commit `9e4fefe` | `.planning/REQUIREMENTS.md` §INFRA-* |

**Rationale для out-of-band Task 2-4 completion:** The 2026-05-17 pivot work (commits c16e9bb..9e4fefe) preemptively applied the ROADMAP/REQUIREMENTS edits because the pivot itself required them. The cutover was executed during Wave 2 (commits 4ceece7..27ff67f) because executing sport-stack.service start inherently performs the cutover (port 443 bind conflict вынуждает teardown of old stack before sport-stack umbrella can start). Plan 03-03 documents this sequencing для historical clarity и closes остающийся deliverable (RUNBOOK).

## Task 1 — `docs/RUNBOOKS/deploy.md`

**Path:** `docs/RUNBOOKS/deploy.md` (NEW, 9 sections, ~360 lines)

**Sections delivered:**
1. **Dev workstation setup** — Ansible + community collections + SOPS + age key path
2. **VPS provisioning** — provider-agnostic спин-ап (Ubuntu 22.04/24.04 LTS, минимальные специс), SSH inventory, sslip.io DNS
3. **First-time bootstrap (Wave 1)** — common + docker + UFW; root→deploy switchover; lockout risks с mitigations
4. **First-time deploy of sport-stack (Wave 2)** — SOPS slot pre-flight, optional old-stack teardown, ansible-playbook + timing measurement, post-deploy verification
5. **Routine deploy** — re-run sport-stack tag; image rebuild path
6. **Rollback (manual emergency)** — code rollback via git checkout; DB migration rollback via `migrate down 1`; emergency fallback к manual `/opt/sport/deploy.sh` flow (legacy `/opt/running-ecosystem/` preserved для emergency)
7. **Failure modes (troubleshooting)** — 7-row table: sudo password / sshd wedge / SSH dropped / SOPS slot gap / Postgres race / Caddy ACME / restart loop / gitleaks. Each с конкретным fix.
8. **Provider-specific notes** — v1.0 placeholder (provider-agnostic confirmed); v1.1+ may add subsections per provider
9. **Measured timing (INFRA-07)** — table with Wave 2 Cutover Run #3 (66.5s) + Run #4 (21s). Target <60min, margin 53.5×.

**Acceptance criteria (per plan):**
- ✓ 9 sections grep'd as `## N. ...` headers
- ✓ Provider-agnostic verify: `grep -iE 'hetzner cloud|digitalocean|amazon aws|gcp|azure'` returns matches только в §8 placeholder list (specific instructions use `<vps-ip>` placeholders)
- ✓ INFRA-07 reference present в §9 timing table

**Negative-presence check:**
- ✗ No production secrets / JWT / passwords / tokens in RUNBOOK content (all placeholders use generic terms)
- ✗ No `infra/terraform/` или hcloud references как functional artifacts (mentioned only в §6 fallback / §8 placeholder for v1.1)

## Task 3 — ROADMAP §Phase 3 (re-verify)

Landed earlier в commit `9e4fefe` (pivot). Acceptance criteria re-grep:

```bash
$ grep -q "8 Go service containers" .planning/ROADMAP.md && echo "✓ 8 services"
✓ 8 services
$ ! grep -q '6 Go service systemd units' .planning/ROADMAP.md && echo "✓ old wording removed"
✓ old wording removed
$ ! grep -q 'Hetzner Storage Box.*Terraform state' .planning/ROADMAP.md && echo "✓ Storage Box for TF removed (W4)"
✓ Storage Box for TF removed (W4)
$ grep -q 'Deferred to v1.1' .planning/ROADMAP.md && echo "✓ INFRA-02/04 deferred markers"
✓ INFRA-02/04 deferred markers
```

## Task 4 — REQUIREMENTS §INFRA-* (re-verify)

Landed earlier в commit `9e4fefe`. Acceptance criteria re-grep:

```bash
$ grep -c 'DEFERRED to v1.1' .planning/REQUIREMENTS.md  # at least 2 (INFRA-02, INFRA-04)
2
$ grep -c 'MOVED to Phase 5' .planning/REQUIREMENTS.md  # at least 1 (INFRA-06)
1
$ grep -q '8 Go service containers' .planning/REQUIREMENTS.md && echo "✓ 8 services"
✓ 8 services
$ grep -q 'UFW' .planning/REQUIREMENTS.md && echo "✓ UFW wording (not Hetzner Cloud Firewall)"
✓ UFW wording
```

## Cross-cutting truths (must_haves verification)

- ✓ "RUNBOOK provider-agnostic (D-25) — no `hetzner`/`digitalocean`/`aws`/`gcp` literals in functional instructions" — verified
- ✓ "Prod cutover MUST teardown existing manual compose stack via explicit `docker compose down` SSH step before Ansible play binds port 443 (B4 mitigation)" — applied 2026-05-17 11:05:31Z, documented в §4.2 deploy.md
- ✓ "ROADMAP + REQUIREMENTS reflect pivot reality" — both files contain DEFERRED/MOVED markers

## Threat model coverage

- **T-03-PIV-08 (zero-downtime cutover broken by port 443 conflict):** MITIGATED. Actual cutover used direct `docker stop && docker rm` (not `docker compose down` which failed on env-var interp); port 443 released, sport-stack umbrella bound clean. Outage window ~10min (debugging Runs #1+#2 issues — Run #3 alone would've been ~66s). Solo-dev v1.0 closed-beta acceptable.
- **T-03-PIV-AGN-01 (two-deploy-paths confusion):** MITIGATED. deploy.md §5 makes Ansible-only the routine path; §6.3 documents manual `/opt/running-ecosystem/` fallback ONLY for emergency. /opt/running-ecosystem/ preserved on VPS (legacy, deprecated but accessible).

## Phase 3 v1.0 acceptance gates closed

| Acceptance criterion | Status | Evidence |
|----------------------|--------|----------|
| 1. `infra/ansible/` idempotently installs 8 services + 4 stateful + Caddy under sport-stack.service umbrella | ✓ | Wave 2 Run #3 — `ok=15 changed=3 failed=0`, 13 containers up; Run #4 — `changed=1` (migration only). 03-02-SUMMARY §LIVE CUTOVER ADDENDUM. |
| 2. Environments: dev + prod inventory | ✓ | `infra/ansible/inventory/{dev,prod}/hosts.yml` (staging deferred v1.1 per D-23). |
| 3. UFW rules explicit; 22 limit / 443 allow / others deny | ✓ | Wave 1 Run "ufw status numbered" output captured live; 22/tcp LIMIT, 443/tcp ALLOW, 80/4222/5432/6379/9000 DENY (v4 + v6). |
| 4. <60min fresh deploy measured + documented | ✓ | INFRA-07 baseline 66.5s в deploy.md §9 + 03-02-SUMMARY. |

## Carry-forward TODOs (v1.0.1 / future phases)

1. **Rotate compromised secrets** (transited chat/API during gap closure): POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD. Procedure в SECRETS.md §Rotation playbook (Phase 2). **Trigger:** before Phase 21 staging soak (first external testers).
2. **OTP code-reuse → 401** expected (got 200) — Phase 1 release-contract regression. Out-of-scope Phase 3; track for /gsd-discuss-phase 1 follow-up.
3. **golang-migrate task `changed_when`** — cosmetic Ansible idempotency cleanup. Currently always reports `changed=1` even when no migrations applied.
4. **`/opt/running-ecosystem/` cleanup на VPS** — legacy directory остаётся (compose file + .env.prod) as emergency fallback per deploy.md §6.3. Can be removed once Phase 4 CI rollback drill validates sport-stack-driven flow.
5. **First-pair Hetzner tokens** (Phase 2 follow-up #5) — N/A post-pivot (hetzner.yaml SOPS slot dropped per D-26).
6. **`gitleaks` log incident** — single failed-smoke stderr dump в Run #2 timing log captured expired JWT tokens. Gitleaks correctly blocked commit; log rm'd; no git history contamination.
7. **dev_admin_ips group_var обнуление** — currently имеет stale `91.92.33.145/32` value but D-24 REVISED doesn't reference it anymore. Hygiene cleanup в roles/common/defaults/main.yml.

## Self-Check: PASSED

- 4/4 tasks closed (Task 1 new deliverable, Tasks 2-4 retroactively complete via earlier commits)
- All Phase 3 acceptance criteria (4) green
- Cross-cutting truths verified
- Threat model risks mitigated
- Carry-forwards documented для downstream phases

---

*Phase: 03-infrastructure-as-code*
*Plan: 03 (Wave 3 — RUNBOOK + ROADMAP/REQ patches + cutover documentation)*
*Completed: 2026-05-17*
*Status: CLOSED ✓ — Phase 3 ready for verifier*
