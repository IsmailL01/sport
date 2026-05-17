---
phase: 3
slug: infrastructure-as-code
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-16
revised: 2026-05-17 (post-pivot to provider-agnostic prod-only Ansible-only scope)
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **PIVOTED 2026-05-17:** Terraform-related rows removed (D-22 — no TF in v1.0). Staging + sentry rows removed (D-23 — single prod VPS topology). UFW replaces Hetzner Cloud Firewall (D-24).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Ansible `--check`/`--diff` for idempotency · `bash`/`curl` smoke probes for HTTP 200s · `nmap`/`ss` for UFW closed-port checks · `awk '/^real/'` for `/usr/bin/time -p` wall-clock verdict |
| **Config file** | `infra/ansible/site.yml` · `services/backend/scripts/smoke_*.py` (existing) |
| **Quick run command** | `cd infra/ansible && ansible-playbook -i inventory/prod site.yml --check --diff` |
| **Full suite command** | `cd infra/ansible && ansible-playbook -i inventory/prod site.yml` AND `BASE_URL=https://<prod-ip>.sslip.io python services/backend/scripts/smoke_otp.py` |
| **Estimated runtime** | ~5 min (check-mode) / ~20–40 min (full first-clean Ansible-deploy on existing prod VPS) / ~5–10 min (incremental cached layers) |

---

## Sampling Rate

- **After every task commit:** Run `ansible-playbook --syntax-check site.yml` (all Ansible tasks)
- **After every plan wave:** Run `ansible-playbook --check --diff -i inventory/prod` (Wave 1: tags=common,docker,ufw; Wave 2: tags=sport-stack; Wave 3: no-tags full) AND smoke probe sequence (Wave 2+) — NOTE: no `caddy` tag in Wave 1 (D-16 — Caddy stays containerized in sport-stack umbrella, not as standalone role)
- **Before `/gsd-verify-work`:** Full suite must be green — `ansible-playbook` idempotent 2nd-run exit `changed=0`, smoke probe returns HTTP 200, UFW closed-port nmap exits expected (4222/5432/6379/9000 unreachable from public).
- **Max feedback latency:** 90 s (ansible syntax-check); 5 min (check-mode dry-run); 20–40 min (live deploy on existing prod VPS).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-* | 01 | 1 | INFRA-01p, INFRA-03, INFRA-05 | T-03-03 (root SSH), T-03-04 (deploy-user sudoers), T-03-AGN-UFW | `PermitRootLogin no` + `PasswordAuthentication no` enforced; `deploy` user has narrow sudo allow-list; UFW idempotent allow 443/22-dev-IPs only | integration | `ansible-playbook --check --diff -i inventory/prod site.yml --tags common,docker,ufw` (idempotent: `changed=0` on 2nd run; NOTE: no `caddy` tag — Caddy stays containerized in sport-stack umbrella per D-16, not as standalone Ansible role) | ❌ W0 | ⬜ pending |
| 03-02-* | 02 | 2 | INFRA-01, INFRA-07 | T-03-PIV-05 (plaintext env on disk), T-03-PIV-06 (SOPS on remote forbidden) | `/run/sport.env` on tmpfs mode 0600 owner deploy; `shred -u` on stop; SOPS-decrypt via `delegate_to: localhost`; `docker compose` space-form in ExecStart | integration (`<automated>` block) | `ansible-playbook --syntax-check site.yml` exit 0 + `ansible-playbook --check --diff -i inventory/prod site.yml --tags sport-stack` exit 0 | ❌ W0 | ⬜ pending |
| 03-02-* | 02 | 2 | INFRA-07 | T-03-PIV-09 (ACME stream-idle) | `/usr/bin/time -p ansible-playbook -i inventory/prod site.yml --tags sport-stack` + `awk '/^real/ { secs = $2 + 0; if (secs > 3600) exit 1 }' 03-02-timing.log` — wall-clock derived programmatically (not self-attested) | manual | Live deploy + smoke `BASE_URL=https://<prod-ip>.sslip.io python services/backend/scripts/smoke_otp.py` returns 200 | ❌ W0 | ⬜ pending |
| 03-03-* | 03 | 3 | INFRA-01v, INFRA-07 | T-03-PIV-08 (zero-downtime cutover), T-03-AGN-01 (two-deploy-paths confusion) | Existing prod VPS preserved (no recreation); manual `/opt/sport/deploy.sh` torn down explicitly via `docker compose down` step 3.5 BEFORE Ansible UP; `docs/RUNBOOKS/deploy.md` provider-agnostic | mixed | `! grep -qi 'hetzner\|digitalocean\|aws\|gcp' docs/RUNBOOKS/deploy.md` (provider-agnostic verify) + `ssh deploy@<prod-ip> 'systemctl is-active sport-stack.service'` returns `active` + `! grep -q '<fill' docs/RUNBOOKS/deploy.md` (placeholders filled) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `brew install ansible` on dev workstation (research finding: NOT currently installed; terraform install removed post-pivot per D-22)
- [ ] `ansible-galaxy collection install community.sops community.docker community.general` — community.sops for SOPS-decrypt task module; community.general for `ufw` module
- [ ] CI invocation deferred to Phase 4 (CICD-01); Phase 3 ships scripts locally invokable
- [ ] **REMOVED 2026-05-17:** terraform install · `.gitignore` for `infra/terraform/*` · `.secrets/<env>/hetzner.yaml` SOPS slot — all dropped per pivot (D-22, D-26)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| <60min fresh-deploy timing measured on existing prod VPS | INFRA-07 | Wall-clock measurement on a single VPS first-clean-Ansible-deploy; can only be measured once per test (Docker layer cache invalidation skews repeats); no separate staging baseline post-pivot (D-23) | `time ansible-playbook -i inventory/prod site.yml` → `awk '/^real/ { secs=$2+0; if (secs>3600) exit 1 }' 03-02-timing.log` → record timing programmatically in `docs/RUNBOOKS/deploy.md` §9 |
| DEV_B SSH pubkey + age pubkey delivered | INFRA-01 (deploy-user authorized_keys) | Out-of-band human delivery (Phase 2 carry-over follow-up #5) | Plan 03-01 Task X user-action checkpoint; orchestrator runs `sops updatekeys` + adds SSH pubkey to `group_vars/all.yml` |
| User provides current VPS IP + SSH-user with sudo | INFRA-03 (prod inventory) | VPS provider-side info known only to user (post-pivot RUNBOOK is provider-agnostic per D-25); Ansible inventory needs these values | Plan 03-01 Task 0 pre-flight checkpoint; orchestrator writes IP to `infra/ansible/inventory/prod/hosts.yml` |
| Prod cutover human-verify | INFRA-01v | Live HTTP smoke + `systemctl is-active sport-stack.service` on prod after explicit `docker compose down` of manual stack; user observes no downtime gap | Plan 03-03 Task 2 (B4 mitigation — explicit teardown step 3.5 before Ansible UP step 4) |
| UFW closed-port verification | INFRA-05 | Requires running nmap from outside the VPS public IP (D-24 — UFW replaces Hetzner Cloud Firewall) | `nmap -p 22,80,443,4222,5432,6379,9000 <prod-ip>` — assert only 443 open from public; 22 open only from dev IPs; 4222/5432/6379/9000 closed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (ansible binary, ansible-galaxy collections incl. community.general for UFW)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (syntax-check) / < 5min (check-mode dry-run) / < 40min (live deploy on existing prod VPS)
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] **Post-pivot scope confirmation:** No Terraform/staging/sentry rows remain in this VALIDATION map

**Approval:** pending
