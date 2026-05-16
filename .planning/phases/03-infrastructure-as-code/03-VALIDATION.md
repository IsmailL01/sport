---
phase: 3
slug: infrastructure-as-code
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-16
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Ansible `--check`/`--diff` for idempotency · `terraform plan` no-diff for state · `bash`/`curl` smoke probes for HTTP 200s · `nmap`/`ss` for firewall closed-port checks |
| **Config file** | `infra/ansible/site.yml` · `infra/terraform/main.tf` · `services/backend/scripts/smoke_*.py` (existing) |
| **Quick run command** | `cd infra/ansible && ansible-playbook -i inventory/staging site.yml --check --diff` |
| **Full suite command** | `cd infra/terraform && terraform plan -detailed-exitcode` AND `cd infra/ansible && ansible-playbook -i inventory/staging site.yml` AND `BASE_URL=https://<staging-ip>.sslip.io python services/backend/scripts/smoke_otp.py` |
| **Estimated runtime** | ~5 min (check-mode) / ~20–40 min (full first run on staging) / ~5–10 min (incremental cached layers) |

---

## Sampling Rate

- **After every task commit:** Run `terraform fmt -check && terraform validate` (TF tasks) OR `ansible-playbook --syntax-check site.yml` (Ansible tasks)
- **After every plan wave:** Run `terraform plan -detailed-exitcode` (Wave 1) AND `ansible-playbook --check` (Wave 2–3) AND full smoke probe sequence (Wave 3+)
- **Before `/gsd-verify-work`:** Full suite must be green — `terraform plan` exit 0 (no diff), `ansible-playbook` idempotent 2nd-run exit `changed=0`, all 3 smoke probes return HTTP 200, firewall closed-port nmap exits expected (4222 NATS unreachable from public).
- **Max feedback latency:** 90 s (terraform validate + ansible syntax-check); 5 min (check-mode dry-run); 20–40 min (live deploy on staging-app-01).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-* | 01 | 1 | INFRA-02, INFRA-04, INFRA-05 | T-03-01 (state-in-repo) | Terraform state in Hetzner Object Storage with `use_lockfile = true`; .tfvars + state never committed | unit | `terraform fmt -check && terraform validate && terraform plan -detailed-exitcode` | ❌ W0 | ⬜ pending |
| 03-02-* | 02 | 2 | INFRA-01, INFRA-03 | T-03-02 (root SSH) | `PermitRootLogin no` + `PasswordAuthentication no` enforced; `deploy` user has narrow sudo allow-list | integration | `ansible-playbook --check --diff site.yml -i inventory/staging` (idempotent: `changed=0` on 2nd run) | ❌ W0 | ⬜ pending |
| 03-03a-* | 03a | 3 | INFRA-01, INFRA-07 | T-03-03 (plaintext env on disk) | `/run/sport.env` on tmpfs mode 0600 owner deploy; `shred -u` on stop; SOPS-decrypt via `delegate_to: localhost` | integration | `BASE_URL=https://<staging-ip>.sslip.io python services/backend/scripts/smoke_otp.py` returns 200 | ❌ W0 | ⬜ pending |
| 03-03b-* | 03b | 3 | INFRA-06 | T-03-04 (Sentry data in app blast-radius) | sentry-01 on separate VPS + separate Caddy + separate ACME; no shared compose with app stack | integration | `curl -sI https://sentry.<sentry-ip>.sslip.io | head -1` returns 2xx/3xx (Caddy serving, Sentry install lands in Phase 5) | ❌ W0 | ⬜ pending |
| 03-04-* | 04 | 4 | INFRA-01, INFRA-07 | T-03-05 (zero-downtime cutover) | Existing 148.253.214.156 imported (not recreated); manual `/opt/sport/deploy.sh` documented as fallback | manual | Time `ansible-playbook -i inventory/prod site.yml` on fresh VPS, assert `<60min` per INFRA-07 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `brew install terraform ansible` on dev workstation (research finding: NOT currently installed)
- [ ] `ansible-galaxy collection install community.sops community.docker hetzner.hcloud` — community.sops for SOPS-decrypt task module
- [ ] `.gitignore` additions: `infra/terraform/.terraform/`, `infra/terraform/terraform.tfstate*`, `infra/terraform/terraform.tfvars`, `infra/terraform/.terraform.lock.hcl` is committed
- [ ] `.secrets/<env>/hetzner.yaml` slot file in SOPS (Phase 2 inheritance — `sops -e` with project age recipients; placeholder `HCLOUD_TOKEN: REPLACE_ME` then user pastes real token in Plan 03-01 Task 0 user-action checkpoint)
- [ ] CI invocation deferred to Phase 4 (CICD-01); Phase 3 ships scripts locally invokable

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `terraform import hcloud_server.prod_app_01 <existing-id>` succeeds against existing 148.253.214.156 | INFRA-02 | Live cloud API call against real prod VPS; must be one-shot, irreversible if mis-keyed | (a) `terraform plan` shows drift on imported resource (b) reconcile attributes (c) `terraform plan` shows zero diff |
| <60min fresh-deploy timing measured on staging | INFRA-07 | Wall-clock measurement on a freshly-provisioned VPS; can only be measured once per test (Docker layer cache invalidation skews repeats) | Spin staging-app-01 from `terraform apply` → `time ansible-playbook -i inventory/staging site.yml` → assert <60min → record timing in `docs/RUNBOOKS/deploy.md` |
| Hetzner Cloud Console-side: API token with read+write Cloud + Object Storage scopes | INFRA-02, INFRA-04 | Hetzner Cloud Console is web-only (no CLI for token creation in v1.0); user pastes token into SOPS slot | Plan 03-01 Task 0 user-action checkpoint — analogous to Phase 2 Mapbox dashboard checkpoint |
| DEV_B SSH pubkey + age pubkey delivered | INFRA-01 (deploy-user authorized_keys) | Out-of-band human delivery (Phase 2 carry-over follow-up #5) | Plan 03-02 Task X user-action checkpoint; orchestrator runs `sops updatekeys` + adds SSH pubkey to `group_vars/all.yml` |
| Firewall closed-port verification | INFRA-05 | Requires running nmap from outside Hetzner VPC against the live VPS public IP | `nmap -p 22,80,443,4222,5432,6379,9000 <staging-ip>` — assert only 443 open from public; 22 open only from dev IPs; 4222/5432/6379/9000 closed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (terraform + ansible binaries, .gitignore, SOPS slot, ansible-galaxy collections)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (validate + syntax-check) / < 5min (check-mode dry-run) / < 40min (live deploy on staging)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
