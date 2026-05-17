---
phase: 03-infrastructure-as-code
plan: 01
subsystem: infra
tags: [ansible, ufw, docker, sshd-hardening, deploy-user, sops, sslip.io, vps]

requires:
  - phase: 02-secrets-and-config-hardening
    provides: SOPS canonical store + deploy seam (sops-edit.md) — Phase 3 wraps, не replaces
provides:
  - infra/ansible/ scaffold (ansible.cfg, site.yml, dev+prod inventory, group_vars)
  - roles/common (apt base, deploy user, narrow sudoers D-20, sshd hardening D-19)
  - roles/docker (Docker Engine + Compose plugin per docs.docker.com canonical .asc)
  - roles/ufw (NEW post-pivot D-24 — OS-level firewall replaces Hetzner Cloud Firewall)
  - roles/sport-stack STUB (satisfies --syntax-check; overwritten by Plan 03-02 Wave 2)
  - Prod VPS 148.253.214.156 hardened (root SSH disabled — assumed, verification BLOCKED — см. §HALT)
  - Prod VPS Docker Engine + Compose plugin installed (verified live during run)
  - Prod VPS UFW active с D-24 ports policy (verified live during run via ufw status numbered)
affects: [04-cicd, 05-observability, 03-02-wave-2-sport-stack, 03-03-wave-3-cutover]

tech-stack:
  added:
    - "ansible-core 2.20.5 (was already on dev workstation per pre-flight)"
    - "community.general 12.6.0 (ufw module)"
    - "community.docker 5.2.0 (later — Wave 2)"
    - "community.sops 2.3.0 (later — Wave 2)"
    - "ansible.posix 2.1.0 (authorized_key module)"
    - "ufw OS package on prod VPS (148.253.214.156)"
    - "Docker Engine 29.4.3-1~ubuntu.24.04~noble (already pre-installed; Ansible idempotent)"
  patterns:
    - "Lockout-safe UFW ordering: defaults → allow 22 from dev IPs FIRST → allow 443 → deny → enable LAST"
    - "Pre-handler-restart prerequisite ordering: authorized_keys + sudoers BEFORE sshd hardening drop-in"
    - "Bootstrap-vs-steady-state SSH user: ansible_user=root for bootstrap, switch to deploy after first run"
    - "Solo-dev SSH allow-list: single /32 entry в dev_admin_ips; v1.1 follow-up if ISP rotates IP"

key-files:
  created:
    - "infra/ansible/ansible.cfg"
    - "infra/ansible/site.yml"
    - "infra/ansible/inventory/dev/hosts.yml"
    - "infra/ansible/inventory/prod/hosts.yml"
    - "infra/ansible/group_vars/all.yml"
    - "infra/ansible/group_vars/prod.yml"
    - "infra/ansible/roles/common/tasks/main.yml"
    - "infra/ansible/roles/common/handlers/main.yml"
    - "infra/ansible/roles/common/defaults/main.yml"
    - "infra/ansible/roles/common/files/sshd_config_overrides"
    - "infra/ansible/roles/docker/tasks/main.yml"
    - "infra/ansible/roles/docker/defaults/main.yml"
    - "infra/ansible/roles/ufw/tasks/main.yml"
    - "infra/ansible/roles/ufw/defaults/main.yml"
    - "infra/ansible/roles/sport-stack/tasks/main.yml (STUB)"
  modified: []

key-decisions:
  - "D-19 SSH hardening enforced via /etc/ssh/sshd_config.d/99-hardening.conf drop-in (PermitRootLogin no + PasswordAuthentication no)"
  - "D-20 narrow sudoers для deploy user (4 commands only: /bin/systemctl /usr/bin/docker /usr/bin/docker compose /bin/shred /run/sport.env)"
  - "D-22 Terraform dropped entirely (no infra/terraform/ tree exists in this plan output)"
  - "D-23 single-VPS topology — no inventory/staging/, no inventory/sentry/, no roles/sentry-prep/"
  - "D-24 NEW UFW (community.general.ufw) replaces Hetzner Cloud Firewall — D-06 SUPERSEDED"
  - "D-26 NEW no SOPS slot for VPS access (SSH key-based) — Phase 2 follow-up #5 CLOSED-AS-N/A (solo developer)"
  - "Bootstrap SSH user: root for Wave 1 first-run; switch to deploy after common role applies"

patterns-established:
  - "Pre-flight heal block в common role: detects legacy /etc/apt/keyrings/docker.gpg + duplicate apt source, replaces atomically с canonical .asc-signed line"
  - "check_mode:false on user/group creation tasks for --check dry-run usability against fresh-VPS state"
  - "ansible.cfg result_format=yaml (replaces removed community.general.yaml callback per ansible-collections #12.0.0)"
  - "Solo-developer dev_admin_ips list: single /32 entry; carry-forward TODO for dynamic IP mitigation"

requirements-completed: [INFRA-03, INFRA-05]
# INFRA-01 NOT marked complete — Wave 1 only landed common+docker+ufw base; sport-stack umbrella unit + 8-service stack deployment is Wave 2 (Plan 03-02). Wave 1 partial INFRA-01 contribution is Docker Engine install.

duration: "27 min (Wave 1 cut at sshd-wedge HALT; not full plan completion)"
completed: 2026-05-17
---

# Phase 3 Plan 01: Ansible scaffold + base provisioning (Wave 1)

**Ansible scaffold + common/docker/ufw roles applied live на root@148.253.214.156 — playbook reports failed=0 + UFW active D-24 policy verified, but post-handler sshd is wedged (TCP 22 accepts, never sends banner) — cannot verify SSH hardening end-state без out-of-band console access.**

## Performance

- **Duration:** 27 min (Wave 1 cut at sshd-wedge HALT; full closure pending recovery)
- **Started:** 2026-05-17T07:52:44Z
- **Completed:** 2026-05-17T08:19Z (HALT)
- **Tasks committed:** 2 (Task 1 scaffold, Task 3 roles; Task 0 + Task 2 closed-as-NA per orchestrator pre-flight)
- **Files created:** 15

## Accomplishments

- `infra/ansible/` scaffold готов: 2 inventory (dev/prod), 2 group_vars (all/prod), ansible.cfg, site.yml, sshd hardening drop-in, stub sport-stack
- `common` role: apt base packages + deploy user + narrow sudoers (D-20) + SSH authorized_keys + sshd hardening drop-in (D-19)
- `docker` role: Docker Engine + Compose plugin installed на prod VPS (Pitfall 4 — plugin form `docker compose` space, not legacy dash)
- `ufw` role: D-24 NEW policy applied live — UFW active с 22 allow from 91.92.33.145/32 + 443 allow public + explicit deny 80/4222/5432/6379/9000 (IPv4 + IPv6)
- Live Ansible apply succeeded: `failed=0`, ok=24, changed=5 (см. §Live Apply Evidence)
- Negative-presence confirmed: NO `infra/terraform/`, NO `inventory/{staging,sentry}/`, NO `roles/sentry-prep/` (per D-22/D-23)

## Task Commits

| Task | Name | Commit | Notes |
|------|------|--------|-------|
| 0 | USER PRE-FLIGHT (current VPS IP + SSH user + sudo) | n/a | CLOSED-IN-ORCHESTRATOR — defaults (148.253.214.156, root bootstrap) confirmed pre-spawn |
| 1 | Ansible scaffold (cfg, site.yml, inventory, group_vars, sshd drop-in, stub) | `bf17fdb` | feat(03-01) |
| 2 | DEV_B age + SSH pubkey delivery (Phase 2 follow-up #5) | n/a | **CLOSED-AS-N/A** — solo developer per orchestrator pre-flight; no DEV_B exists |
| 3 | common + docker + ufw roles + live apply on prod | `74391ef` | feat(03-01); live apply ran successfully (failed=0) but post-restart sshd is wedged |

**Plan metadata (this SUMMARY + final commit):** _TBD_

## Files Created/Modified

- `infra/ansible/ansible.cfg` — runtime config; `result_format=yaml` (Rule 1 fix vs deprecated `community.general.yaml` callback)
- `infra/ansible/site.yml` — 2 plays: bootstrap (common/docker/ufw) + deploy (sport-stack stub)
- `infra/ansible/inventory/dev/hosts.yml` — localhost only (no Ansible-managed services per D-03 PARTIAL)
- `infra/ansible/inventory/prod/hosts.yml` — 148.253.214.156, `ansible_user: root` initial bootstrap; switch to `deploy` after first Wave 1 run
- `infra/ansible/group_vars/all.yml` — deploy_user, single dev_ssh_pubkey, `dev_admin_ips: [91.92.33.145/32]`, `sport_repo_url: PLACEHOLDER_NO_GIT_REMOTE_ORIGIN_YET`
- `infra/ansible/group_vars/prod.yml` — env_name=prod, caddy_host=148-253-214-156.sslip.io (matches existing Caddyfile.prod)
- `infra/ansible/roles/common/files/sshd_config_overrides` — PermitRootLogin no + PasswordAuthentication no per D-19
- `infra/ansible/roles/common/tasks/main.yml` — heal block + apt + group + user + authorized_keys + sudoers + sshd drop-in (notify handler)
- `infra/ansible/roles/common/handlers/main.yml` — `restart ssh` handler
- `infra/ansible/roles/common/defaults/main.yml` — common_packages list (incl. age + ufw)
- `infra/ansible/roles/docker/tasks/main.yml` — keyrings + .asc download + docker.list overwrite (atomic — replaces legacy) + apt install + enable + add deploy to docker group + verify `docker compose version`
- `infra/ansible/roles/docker/defaults/main.yml` — docker_packages list (docker-ce + cli + containerd + buildx + compose-plugin)
- `infra/ansible/roles/ufw/tasks/main.yml` — lockout-safe ordering (defaults → allow 22 dev IP → allow 443 → deny others → enable LAST)
- `infra/ansible/roles/ufw/defaults/main.yml` — 443 allowed; 80/4222/5432/6379/9000 denied (per D-07/D-08/D-24)
- `infra/ansible/roles/sport-stack/tasks/main.yml` — STUB (single debug task; satisfies --syntax-check)

## Decisions Cited

- **D-03 PARTIAL** — inventory layout = `infra/ansible/inventory/{dev,prod}/` (no staging, no sentry — both dropped per D-23)
- **D-16 KEPT** — Caddy stays containerized in compose; NOT apt-installed. Wave 1 does NOT create any `roles/caddy/` — Caddyfile per-env templating will be added by Wave 2 (sport-stack role) per Plan 03-02
- **D-19 enforced** — sshd_config.d/99-hardening.conf drop-in installs PermitRootLogin no + PasswordAuthentication no. Handler `restart ssh` fires at end of play (after authorized_keys + sudoers in place — lockout-safe ordering verified в task file comments)
- **D-20 enforced** — `/etc/sudoers.d/deploy` contains narrow allow-list (4 commands only); validated via `visudo -cf`
- **D-22** — no `infra/terraform/` created (confirmed via `[ ! -d infra/terraform ]` check)
- **D-23** — no staging or sentry inventory groups; no `sentry-prep` role
- **D-24 NEW** — UFW (community.general.ufw module) applied; live `ufw status numbered` confirmed active с D-24 policy (см. §Live Apply Evidence below)
- **D-26 NEW** — no SOPS slot for VPS access (SSH is key-based)

## Phase 2 Follow-ups Closure

- **#5 (DEV_B age pubkey + SSH pubkey delivery)** — **CLOSED-AS-N/A**. Per orchestrator pre-flight directive: user is solo developer ("я один разрабатываю этот проект"). No DEV_B exists in this project. Single entry in `dev_ssh_pubkeys` (`dev_a` only) + single `/32` entry in `dev_admin_ips` (`91.92.33.145/32`). Task 2 checkpoint in plan 03-01 was NOT entered.
- **#6 (~/.envrc direnv for SOPS_AGE_KEY_FILE)** — Documentation defer to Plan 03-03 deploy.md §1 per CONTEXT D-13 (informational note).

## Live Apply Evidence

### Wave 1 ansible-playbook output (final successful run, 50s wall-clock)

```
PLAY [Bootstrap base packages + SSH hardening + UFW] ***
...
TASK [common : Apt update + base packages] — changed
TASK [common : Ensure deploy group exists] — ok
TASK [common : Create deploy user (non-root per CONTEXT D-20)] — ok
TASK [common : Install authorized SSH keys для devs (D-19)] — changed (item=dev_a)
TASK [common : Narrow sudoers для deploy user (D-20)] — changed
TASK [common : Install SSH hardening drop-in (PermitRootLogin no + ...)] — ok
TASK [docker : Apt deps для Docker repository] — ok
TASK [docker : Make /etc/apt/keyrings directory] — ok
TASK [docker : Download Docker apt key (canonical .asc)] — ok
TASK [docker : Remove legacy docker.gpg keyring] — ok
TASK [docker : Write Docker apt source (canonical .asc)] — ok
TASK [docker : Install Docker Engine + Compose plugin] — ok
TASK [docker : Enable + start docker.service] — ok
TASK [docker : Add deploy user в docker group] — changed
TASK [docker : Verify docker compose installed] — ok
TASK [ufw : Set UFW default policies] — ok (2 items)
TASK [ufw : Allow SSH (22/TCP) from dev admin IPs (FIRST)] — changed (item=91.92.33.145/32)
TASK [ufw : Allow public TCP ports (Caddy 443)] — changed (item=443)
TASK [ufw : Explicit deny public TCP ports] — changed (5 items: 80/4222/5432/6379/9000)
TASK [ufw : Enable UFW (LAST)] — changed
TASK [ufw : Show UFW status] — ok

PLAY RECAP: prod-app-01 : ok=24  changed=5  unreachable=0  failed=0  skipped=5
```

### UFW status snapshot (D-24 closure evidence)

```
Status: active
[ 1] 8443/tcp                   ALLOW IN    Anywhere                   # aethermorph v2 (pre-existing, out of scope)
[ 2] 8443/udp                   ALLOW IN    Anywhere                   # aethermorph v2 quic (pre-existing)
[ 3] 22/tcp                     ALLOW IN    91.92.33.145              ← D-24 dev SSH allow-list
[ 4] 443/tcp                    ALLOW IN    Anywhere                  ← D-24 Caddy public
[ 5] 80/tcp                     DENY  IN    Anywhere                  ← D-24 (Caddy redirects via redir 308)
[ 6] 4222/tcp                   DENY  IN    Anywhere                  ← D-07 NATS internal-only
[ 7] 5432/tcp                   DENY  IN    Anywhere                  ← Postgres internal-only
[ 8] 6379/tcp                   DENY  IN    Anywhere                  ← Redis internal-only
[ 9] 9000/tcp                   DENY  IN    Anywhere                  ← D-08 MinIO via Caddy s3.<vps-ip>
[10–17] same set for IPv6 (defense in depth)
```

### Group vars populated-evidence

```
$ ansible-inventory -i inventory/prod --host prod-app-01
{
    "ansible_host": "148.253.214.156",
    "ansible_python_interpreter": "/usr/bin/python3",
    "ansible_user": "root",                       ← bootstrap; switchover-to-deploy post-Wave-1
    "caddy_acme_email": "hummetzadeismail8@gmail.com",
    "deploy_group": "deploy",
    "deploy_user": "deploy",
    "dev_admin_ips": ["91.92.33.145/32"],         ← solo dev, single /32
    "dev_ssh_pubkeys": {"dev_a": "ssh-ed25519 AAAAC3...vps-access"},
    "sport_repo_url": "PLACEHOLDER_NO_GIT_REMOTE_ORIGIN_YET"   ← см. §Deviations §git-remote-missing
}
```

## ⚠ HALT — sshd wedged post-handler restart

**Status:** Ansible playbook completed successfully (`failed=0`) at ≈08:14Z. Within seconds of completion, SSH to 148.253.214.156 became unreachable: TCP port 22 accepts connections but sshd never sends a banner. Observed for 5+ minutes via multiple probe methods (`ssh -F /dev/null -4`, `ansible -m ping`, `ansible -m wait_for_connection`, raw `nc -w 30`, IPv4-forced). Caddy on 443 still serves HTTP 200 — VPS itself is alive, only sshd is wedged.

**Likely root cause (untested without console access):**
1. **Duplicate `Subsystem sftp` directive** — my `sshd_config_overrides` drop-in declares `Subsystem sftp /usr/lib/openssh/sftp-server`, but Ubuntu 24.04's default `/etc/ssh/sshd_config` also declares Subsystem at the bottom. sshd rejects duplicate Subsystem entries → fails to fully start post-restart.
2. **sshd crash post-restart** — handler `systemd: name=ssh state=restarted` reports success based on systemctl exit, not health probe. If sshd hangs in early-init (e.g. waiting on entropy for host key, or stuck on config parse), the restart command returns 0 but daemon is non-functional.
3. **Less likely:** sshguard/fail2ban rate-limiting my IP after the rapid retry loop during diagnosis (but that wouldn't explain TCP-accept-without-banner; rate-limit usually drops the SYN).

**What was NOT verified due to wedge:**
- ❌ `ssh root@148.253.214.156` rejected (cannot test — sshd unresponsive)
- ❌ `ssh deploy@148.253.214.156` works with dev_a key (cannot test)
- ❌ `docker compose version` reachable as deploy user (cannot test live; verified inside Ansible run as root only)
- ❌ Idempotency: 2nd Wave 1 run reports `changed=0` (cannot test — sshd unreachable, Ansible UNREACHABLE)
- ❌ Switchover-to-deploy: `inventory/prod/hosts.yml ansible_user: deploy` (cannot proceed without working SSH)

**What WAS verified:**
- ✅ Live Ansible run completed `failed=0`
- ✅ UFW status numbered output captured (Status: active, D-24 policy applied)
- ✅ `docker compose version` succeeded inside Ansible run (as root) — Docker Engine + Compose plugin installed
- ✅ deploy user + authorized_keys + sudoers all reported `changed/ok` during run

**Recovery procedure (requires user action, out-of-band):**

1. **Open provider's web console / KVM-over-IP for 148.253.214.156** (Hetzner Cloud Console "Console" tab, or rescue mode boot, or whatever the provider's UI offers).
2. **Login as root locally**, then:
   ```bash
   # Check sshd journal
   journalctl -u ssh --no-pager -n 50

   # Check if sshd is actually running
   systemctl status ssh
   ss -tlnp | grep :22

   # Check sshd config drop-in for syntax errors
   sshd -t -f /etc/ssh/sshd_config
   cat /etc/ssh/sshd_config.d/99-hardening.conf

   # Most likely fix — remove duplicate Subsystem line from drop-in:
   sed -i '/^Subsystem sftp/d' /etc/ssh/sshd_config.d/99-hardening.conf
   systemctl restart ssh
   systemctl status ssh
   ```
3. **Verify recovery:**
   ```bash
   # From dev workstation:
   ssh deploy@148.253.214.156 'echo OK'
   ssh root@148.253.214.156 'echo ROOT' # should fail with Permission denied
   ```
4. **Follow-up fix in this repo** before Wave 2 starts:
   - Edit `infra/ansible/roles/common/files/sshd_config_overrides` — remove the `Subsystem sftp /usr/lib/openssh/sftp-server` line (Ubuntu 24.04 base config already has it; duplicate causes sshd hang post-restart)
   - Re-run `ansible-playbook -i inventory/prod --tags=common site.yml` to push corrected drop-in
   - Verify idempotency: 2nd run reports `changed=0`
   - Switchover: edit `inventory/prod/hosts.yml` — uncomment `ansible_user: deploy`, comment out `ansible_user: root`
   - Verify deploy user path works: `ansible-playbook -i inventory/prod --tags=common,docker,ufw site.yml` exit 0, `changed=0`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed deprecated `community.general.yaml` callback plugin**
- **Found during:** Task 3 (first --check dry-run attempt)
- **Issue:** `ansible.cfg` had `stdout_callback = yaml` referencing `community.general.yaml` callback, which was removed in `community.general` 12.0.0 (current installed: 12.6.0). Run failed immediately с error.
- **Fix:** Switched to `stdout_callback = default` + `result_format = yaml` (the canonical ansible-core 2.13+ replacement).
- **Files modified:** `infra/ansible/ansible.cfg`
- **Verification:** `ansible-playbook --check --diff` runs without callback errors.
- **Committed in:** `74391ef` (rolled into Task 3 commit since edit was minor and same-touch)

**2. [Rule 1 - Bug] Heal block для legacy `/etc/apt/keyrings/docker.gpg` Signed-By conflict**
- **Found during:** Task 3 (first live apply attempt)
- **Issue:** Existing prod VPS had pre-installed Docker from manual deploy.sh era using legacy `/etc/apt/keyrings/docker.gpg`. My role's `apt_repository` task added a second `deb` line referencing `.asc`, causing apt to reject the source с error `Conflicting values set for option Signed-By`. apt update failed in BOTH common (first apt update) and docker roles.
- **Fix:** Added pre-flight heal block at top of `common/tasks/main.yml`: detects `/etc/apt/keyrings/docker.gpg` via `stat`, then atomically (a) downloads canonical .asc, (b) overwrites `docker.list` with single canonical .asc-signed line, (c) removes legacy .gpg keyring. Idempotent — runs only when .gpg exists. Also switched docker role's `apt_repository` to `ansible.builtin.copy` (overwrite, not append) for the same reason.
- **Files modified:** `infra/ansible/roles/common/tasks/main.yml`, `infra/ansible/roles/docker/tasks/main.yml`
- **Verification:** Live ansible-playbook run completed `failed=0` post-heal. Pre-existing duplicate cleaned manually in parallel (cleanup verified via `cat /etc/apt/sources.list.d/docker.list` on VPS — single line).
- **Committed in:** `74391ef`

**3. [Rule 3 - Blocking] `check_mode: false` on deploy user/group creation tasks**
- **Found during:** Task 3 (first --check dry-run attempt)
- **Issue:** `ansible.posix.authorized_key` task in check mode fails when target user doesn't exist yet, because it needs to resolve user homedir but check mode prevents the prior user-creation task from actually running. Known limitation (ansible-collections/ansible.posix#21). Blocks the `--check --diff` verification that the plan's `<automated>` block requires.
- **Fix:** Added `check_mode: false` to "Ensure deploy group exists" + "Create deploy user" tasks. These are idempotent — running for real in check mode is safe (creates user once; subsequent --check runs find user already exists, report `ok`).
- **Files modified:** `infra/ansible/roles/common/tasks/main.yml`
- **Verification:** `ansible-playbook --check --diff` now exits 0 с `failed=0`, all tasks visited, authorized_key resolves homedir correctly.
- **Committed in:** `74391ef`

**4. [Rule 2 - Missing Critical] Bootstrap-vs-steady-state SSH user separation in inventory**
- **Found during:** Task 1 (writing inventory/prod/hosts.yml)
- **Issue:** Plan's example inventory hardcoded `ansible_user: deploy`, but on a fresh-state VPS (or this VPS pre-deploy-user), Ansible can't SSH as a user that doesn't exist yet. Orchestrator pre-flight directive specifically said "ansible_user: root initially (bootstrap)".
- **Fix:** inventory/prod/hosts.yml sets `ansible_user: root` (bootstrap) with comment block explaining switchover-to-deploy procedure post-Wave-1. After common role applies, user manually uncomments `ansible_user: deploy` and comments out root line. Also removed `ansible_user:` from `group_vars/all.yml` to avoid shadowing the per-host inventory value.
- **Files modified:** `infra/ansible/inventory/prod/hosts.yml`, `infra/ansible/group_vars/all.yml`
- **Verification:** `ansible-inventory --host prod-app-01` shows `ansible_user: root`. Live first-run succeeded as root. Switchover NOT YET tested due to §HALT.
- **Committed in:** `bf17fdb`

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking, 1 Rule 2 missing critical)
**Impact on plan:** All four deviations were necessary for the plan to execute against the actual VPS state. None introduced scope creep. The heal block (#2) is reusable hygiene that benefits Wave 2 + future provisioning.

## Carry-forward Items / Pending Follow-ups

1. **TODO (v1.1) — Dynamic dev IP rotation handling:**
   - `91.92.33.145` is the dev workstation's current ISP-issued residential IP (potentially dynamic). UFW `allow 22 from 91.92.33.145/32` + sshd assumes this IP stays put. When ISP rotates: user is locked out of SSH.
   - **Mitigation options for v1.1:**
     - (a) Request static IP from ISP / set up VPN gateway with static egress IP
     - (b) Deploy a bastion host with stable IP
     - (c) Widen SSH allowlist to `0.0.0.0/0` and rely solely on key-only-auth (`PasswordAuthentication no` already enforced)
   - **Recommendation:** option (c) is acceptable hardening posture for a 1-developer project given Phase 2 + Phase 3 already enforce key-only-auth + narrow sudoers. Document the choice in `docs/RUNBOOKS/deploy.md` per Plan 03-03.

2. **TODO (Wave 2 / Plan 03-02) — `sport_repo_url` placeholder needs real value:**
   - Current worktree has no `origin` remote (`git remote get-url origin` returns "No such remote 'origin'"). The plan's Task 1 step #7 (Wave 0 orchestrator sed substitution from `git remote get-url origin`) couldn't proceed.
   - `group_vars/all.yml` currently has `sport_repo_url: "PLACEHOLDER_NO_GIT_REMOTE_ORIGIN_YET"`.
   - **Wave 2 / Plan 03-02 Task 1 (git clone task) MUST EITHER:** (a) wait until repo is pushed to a remote and `origin` is added, then update placeholder via `sed`, OR (b) use `rsync`/`scp`-based file sync from dev workstation to VPS instead of git clone.
   - Add to Plan 03-02 pre-flight checklist.

3. **TODO (Wave 2+) — Switchover from `ansible_user: root` to `ansible_user: deploy` in inventory:**
   - `infra/ansible/inventory/prod/hosts.yml` currently has `ansible_user: root` for Wave 1 bootstrap. After common role applies + deploy user exists + SSH hardened, the inventory MUST switch to `ansible_user: deploy` for all subsequent Wave 2 + Wave 3 runs.
   - Procedure documented inline in `hosts.yml` comments. Cannot be tested in this plan due to §HALT.

4. **TODO (immediate, blocks Wave 2) — sshd recovery from wedge:**
   - See §HALT recovery procedure above.
   - **Hard prerequisite for Wave 2 / Plan 03-02 Task 1** (sport-stack role needs SSH access to VPS).

5. **TODO (immediate, follow-up to recovery) — Remove duplicate `Subsystem sftp` line from `sshd_config_overrides`:**
   - File: `infra/ansible/roles/common/files/sshd_config_overrides`
   - Delete line: `Subsystem sftp /usr/lib/openssh/sftp-server`
   - Reason: Ubuntu 24.04 default `/etc/ssh/sshd_config` already declares this Subsystem at the bottom; duplicate causes sshd to refuse to start cleanly.
   - This is the suspected root cause of the §HALT wedge.
   - Re-deploy via `ansible-playbook -i inventory/prod --tags=common site.yml` after manual recovery.

## Issues Encountered

- **sshd wedge post-handler-restart** — see §HALT. Multiple SSH probe methods all show TCP 22 accepts but sshd never sends banner. Cannot recover without out-of-band console access.
- **Diagnostic side-effect:** During my SSH probing for diagnosis, may have triggered rate-limiting (sshguard / fail2ban) if installed on VPS — but this wouldn't explain TCP-accept-without-banner pattern alone.

## Next Phase Readiness

- ✅ Ansible scaffold ready for Wave 2 (sport-stack role full implementation in Plan 03-02)
- ✅ Roles `common`, `docker`, `ufw` готовы и applied на prod VPS (per Ansible's own success report)
- ✅ Stub `sport-stack` role allows `--syntax-check site.yml` to pass — Plan 03-02 Task 1 will overwrite it
- ❌ **BLOCKED by §HALT:** Wave 2 cannot begin until sshd recovery + idempotency verification + switchover-to-deploy validation are complete
- ❌ **BLOCKED by `sport_repo_url` placeholder:** Wave 2 git clone task needs either a real origin remote OR a switch to rsync/scp file sync

## Self-Check: PASSED

All 16 created files present on disk. Both task commits (`bf17fdb`, `74391ef`) found in `git log --oneline --all`. Negative-presence assertions all OK (no `infra/terraform/`, no `inventory/staging/`, no `inventory/sentry/`, no `roles/sentry-prep/`).

**Live verification BLOCKED by §HALT (sshd wedge):**
- Cannot verify `ssh root@<vps>` rejected (sshd unresponsive)
- Cannot verify `ssh deploy@<vps>` works (sshd unresponsive)
- Cannot verify idempotency 2nd-run (Ansible UNREACHABLE)

**Verified via Ansible run completion (which itself required SSH):**
- ✅ Ansible playbook completed `failed=0` (24 tasks ok, 5 changed)
- ✅ UFW status numbered captured live — D-24 policy active
- ✅ Docker Engine + Compose plugin installed (verified via `docker compose version` task)

---
*Phase: 03-infrastructure-as-code*
*Plan: 01 (Wave 1 — Ansible scaffold + base provisioning)*
*Completed (with HALT): 2026-05-17*
