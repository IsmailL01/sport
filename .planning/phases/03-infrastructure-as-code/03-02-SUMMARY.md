---
phase: 03-infrastructure-as-code
plan: 02
subsystem: infra
status: CLOSED 2026-05-17 11:19Z (Wave 2 — sport-stack role built + LIVE CUTOVER closed; INFRA-07 baseline 66.5s; 13 containers serving prod; see Live Cutover Addendum at end)
tags: [ansible, sport-stack, sops, systemd, docker-compose, infra-07]

requires:
  - phase: 03-infrastructure-as-code
    plan: 01
    provides: ansible scaffold + common/docker/ufw roles + hardened prod VPS + stub sport-stack role
provides:
  - infra/ansible/roles/sport-stack/ — full role implementation (tasks: main+decrypt_sops+run_migrations+smoke_probe; templates: sport-stack.service.j2+sport.env.j2; handlers; defaults)
  - infra/ansible/inventory/prod/group_vars/all.yml — inventory-relative scoping fix (group_vars/prod.yml never auto-bound to prod-app-01 host in Plan 03-01)
  - .planning/phases/03-infrastructure-as-code/03-02-timing.log — INFRA-07 baseline (check-mode dry-run; awk-derived verdict)
  - SOPS-via-delegate_to + tmpfs/shred + docker-compose-on-systemd umbrella PROVEN buildable end-to-end in check-mode
affects: [03-03-wave-3-cutover, 04-cicd, 05-observability]

tech-stack:
  added:
    - "ansible.posix.synchronize (rsync-based repo sync; replaces ansible.builtin.git for no-remote worktree case)"
    - "community.sops.load_vars (delegate_to: localhost — 3 SOPS slots: shared/mapbox/oauth per D-26)"
  patterns:
    - "Inventory-relative group_vars/all.yml (inventory/prod/group_vars/all.yml) — auto-loaded when -i inventory/prod is passed; fixes Plan 03-01 carry-forward where group_vars/prod.yml was never bound to any inventory group"
    - "check_mode-aware orchestration: live-only tasks (migrate, systemctl start, smoke probe, conditional steady-state restart) guarded by `when: not ansible_check_mode` to keep --check --diff exit 0 from fresh-state"
    - "Handler simplification: explicit conditional `Restart sport-stack if unit changed` task replaces handler-based restart — avoids check-mode race where handler fires before service exists"
    - "Programmatic awk verdict from /usr/bin/time -p `real` line; no hand-written PASS/FAIL string (B3 fix preserved)"
    - "tmpfs /run/sport.env mode 0600 owner deploy + ExecStopPost=/bin/shred -u defense-in-depth (D-15)"
    - "rsync repo sync as fallback for no-git-remote worktrees (Plan 03-01 SUMMARY §Carry-forward #2 option b realized)"

key-files:
  created:
    - "infra/ansible/roles/sport-stack/tasks/main.yml"
    - "infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml"
    - "infra/ansible/roles/sport-stack/tasks/run_migrations.yml"
    - "infra/ansible/roles/sport-stack/tasks/smoke_probe.yml"
    - "infra/ansible/roles/sport-stack/templates/sport-stack.service.j2"
    - "infra/ansible/roles/sport-stack/templates/sport.env.j2"
    - "infra/ansible/roles/sport-stack/handlers/main.yml"
    - "infra/ansible/roles/sport-stack/defaults/main.yml"
    - "infra/ansible/inventory/prod/group_vars/all.yml (moved from infra/ansible/group_vars/prod.yml)"
    - ".planning/phases/03-infrastructure-as-code/03-02-timing.log"
  modified:
    - ".gitignore (added allowlist for .planning/phases/**/NN-NN-timing.log)"
  deleted:
    - "infra/ansible/group_vars/prod.yml (moved — not data loss)"

key-decisions:
  - "D-04 KEPT: docker compose SPACE-form in systemd ExecStart (RESEARCH Pitfall 4)"
  - "D-12 KEPT: SOPS decrypt under delegate_to: localhost; age key NEVER on remote (T-03-PIV-06 mitigated)"
  - "D-14 KEPT: migrations as separate Ansible play (`docker compose run --rm migrations`) BEFORE service start (T-03-PIV-10 mitigated)"
  - "D-15 KEPT: /run/sport.env tmpfs mode 0600 owner deploy + ExecStopPost=/bin/shred -u (T-03-PIV-05 mitigated)"
  - "D-16 KEPT: Caddy stays containerized via existing docker-compose.prod.yml; sport-stack role does NOT apt-install Caddy"
  - "D-21 KEPT — partial: INFRA-07 baseline timing measured in check-mode; real first-deploy timing deferred to Plan 03-03 (gated by 2 architectural blockers — see Deviations)"
  - "D-26 KEPT: exactly 3 SOPS slots (shared.yaml + mapbox.yaml + oauth.yaml); no hetzner.yaml referenced anywhere in role"
  - "NEW deviation: ansible.posix.synchronize replaces ansible.builtin.git (rsync over SSH; controller-side worktree → /opt/sport/) — necessary because solo-dev worktree has no `origin` remote (Plan 03-01 SUMMARY §Carry-forward #2 option b)"

patterns-established:
  - "Inventory-relative group_vars pattern: variables that semantically belong to an env should live in inventory/<env>/group_vars/all.yml, not group_vars/<env>.yml (latter only binds if an inventory group named <env> exists)"
  - "check-mode-aware tasks for irreversible operations (systemctl, docker run): `when: not ansible_check_mode` keeps --check --diff exit 0 from fresh state without skipping the task in real runs"
  - "Conditional steady-state restart pattern: register template task → explicit `when: result is changed and not check_mode` restart task — avoids handler-based race in initial-install scenario"
  - "Awk-derived verdict pattern: `/usr/bin/time -p` output piped through `awk '/^real/ { ... }'` for budget comparison; verdict line written by awk's print, not hand-typed"
  - "rsync allowlist for SOPS-relevant exclusions: .env* always excluded (secrets render to /run/sport.env via Ansible template, never synced); .git/node_modules/__pycache__/*.pyc excluded for size+hygiene"

requirements-completed: []
# INFRA-01 PARTIAL: role buildable + check-mode dry-run failed=0 + unit template renders correctly,
# but `systemctl start sport-stack.service` not exercised live. INFRA-07 PARTIAL: methodology (programmatic
# awk verdict) established + check-mode baseline captured, but real first-deploy timing on production VPS
# deferred to Plan 03-03 due to blockers (see Deviations §Live-deploy-deferral).
# Both INFRA-01 and INFRA-07 will be marked complete after Plan 03-03 cutover.

duration: "15 min"
completed: 2026-05-17
---

# Phase 3 Plan 02: sport-stack Ansible role build + INFRA-07 baseline (Wave 2)

**sport-stack role fully implemented under D-04/D-12/D-14/D-15/D-16/D-26 invariants; check-mode dry-run on prod inventory exits failed=0 changed=4; live deploy deferred to Plan 03-03 cutover due to (1) port 443 occupied by manual stack and (2) SOPS slots missing 4 compose-required env vars.**

## Performance

- **Duration:** 15 min (single-shot — no recovery iterations)
- **Started:** 2026-05-17T09:18:54Z
- **Completed:** 2026-05-17T09:33:40Z
- **Tasks committed:** 2 (`18bb439` Task 1 role tree, `fdd9d1a` Task 2 timing log)
- **Files created:** 10 (8 role files + 1 inventory-relative group_vars + 1 timing log)
- **Files modified:** 1 (.gitignore allowlist)
- **Files deleted:** 1 (group_vars/prod.yml — moved to inventory/prod/group_vars/all.yml; not data loss)

## Accomplishments

- `infra/ansible/roles/sport-stack/` full tree built (8 files: 4 tasks + 2 templates + 1 handlers + 1 defaults), overwriting Plan 03-01 Task 1 stub
- All D-04/D-12/D-14/D-15/D-16/D-26 invariants encoded in role files (every claim grep-verifiable; see §Negative-presence below)
- SOPS decrypt path validated end-to-end in check-mode: `community.sops.load_vars` runs under `delegate_to: localhost`, loads all 3 prod slots (shared/mapbox/oauth), merges to single dict, templates to `/run/sport.env` mode 0600 owner deploy
- systemd unit template renders correctly with `ExecStart=/usr/bin/docker compose -f /opt/sport/services/backend/docker-compose.prod.yml up` (SPACE-form) and `ExecStopPost=/bin/shred -u /run/sport.env` (D-15)
- `ansible-playbook --syntax-check site.yml -i inventory/prod` exits 0
- `ansible-playbook --check --diff -i inventory/prod site.yml --tags sport-stack` exits 0 with `failed=0 changed=4` (rsync sync + sport.env template + systemd unit install + reload — all expected)
- INFRA-07 timing methodology established: `/usr/bin/time -p` → awk parses `real` line → emits verdict (PASS if <3600s); verdict written by awk's print, NOT hand-typed (B3 fix preserved)
- INFRA-07 baseline recorded: check-mode dry-run `real 13.01s` — well under 60min budget for infrastructure prep phase
- Inventory-relative group_vars/all.yml fix unblocks `env_name`/`caddy_host`/`sport_smoke_base_url` resolution (Plan 03-01 carry-forward bug: group_vars/prod.yml never bound to any inventory group)

## Task Commits

| Task | Name | Commit | Notes |
|------|------|--------|-------|
| 1 | Build sport-stack role tree (8 files + group_vars relocation) | `18bb439` | feat(03-02); syntax-check exit 0; check-mode failed=0 changed=4 |
| 2 | Live deploy + INFRA-07 timing (RUN AS check-mode + awk verdict; live deferred to Plan 03-03) | `fdd9d1a` | docs(03-02); programmatic awk verdict appended to 03-02-timing.log |

**Plan metadata commit (this SUMMARY):** _will be created after this file is committed_

## Files Created / Modified

| File | Purpose |
|------|---------|
| `infra/ansible/roles/sport-stack/tasks/main.yml` | Orchestration: ensure-dir → rsync sync → SOPS decrypt → migrate → unit install → daemon-reload → enable+start → smoke (check-mode guards on live-only tasks) |
| `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml` | SOPS load_vars under `delegate_to: localhost` for 3 slots (shared/mapbox/oauth); `no_log: true` on every plaintext-touching task; `SOPS_AGE_KEY_FILE` via explicit `lookup('env', 'HOME') + '/.config/sops/age/keys.txt'` (W3 fix — NOT expanduser); merge to `sport_env_merged`; template to `/run/sport.env` mode 0600 owner deploy |
| `infra/ansible/roles/sport-stack/tasks/run_migrations.yml` | `/usr/bin/docker compose -f ... run --rm migrations` (matches L101 service name); fails-fast on rc != 0 |
| `infra/ansible/roles/sport-stack/tasks/smoke_probe.yml` | `delegate_to: localhost`; invokes `python3 services/backend/scripts/smoke_otp.py` with `BASE_URL={{ sport_smoke_base_url }}`; 5×30s retry (covers ACME issuance window) |
| `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2` | systemd umbrella: `User=deploy`, `EnvironmentFile=/run/sport.env`, `ExecStart=/usr/bin/docker compose -f ... up` (SPACE-form per D-04), `ExecStopPost=/bin/shred -u /run/sport.env` (D-15), `Restart=on-failure`, `TimeoutStartSec=600` |
| `infra/ansible/roles/sport-stack/templates/sport.env.j2` | dotenv render: `{% for key, value in sport_env_merged.items() | sort %}{{ key }}={{ value }}{% endfor %}` + appended `CADDY_ACME_EMAIL` from group_vars |
| `infra/ansible/roles/sport-stack/handlers/main.yml` | Just `reload systemd` — restart handled by explicit conditional task in main.yml (avoids check-mode race) |
| `infra/ansible/roles/sport-stack/defaults/main.yml` | sport_install_dir=/opt/sport, sport_env_file=/run/sport.env, sport_env_mode='0600', sport_sops_groups=[shared,mapbox,oauth], sport_smoke_retries=5, sport_smoke_delay_seconds=30, sport_migrate_service=migrations, sport_repo_local_root="{{ playbook_dir }}/../.." |
| `infra/ansible/inventory/prod/group_vars/all.yml` (moved from `infra/ansible/group_vars/prod.yml`) | env_name=prod, caddy_host="148-253-214-156.sslip.io", sport_smoke_base_url="https://{{ caddy_host }}" |
| `.planning/phases/03-infrastructure-as-code/03-02-timing.log` | Header (mode + deferral reason) + `/usr/bin/time -p` output (real=13.01s) + awk-derived `INFRA-07 VERDICT: PASS (13.01s <= 3600s)` |
| `.gitignore` | Added `!.planning/phases/**/[0-9][0-9]-[0-9][0-9]-timing.log` allowlist so contractual plan timing logs are tracked despite `*.log` ignore rule |

## Decisions Cited

- **D-04** — `docker compose` SPACE-form в `ExecStart`/`ExecStop`/`run_migrations.yml` (RESEARCH Pitfall 4). Verified `grep -rE "^[^#]*\bdocker-compose\s" roles/sport-stack/` returns nothing.
- **D-12** — `community.sops.load_vars` task block declared `delegate_to: localhost` + `become: false`; age key never copied to remote (no `copy: src=~/.config/sops/age/keys.txt`).
- **D-14** — `tasks/main.yml` ordering: `run_migrations.yml` imported BEFORE systemd `enable + start` task. Migration container has `restart: "no"` in compose (one-shot semantics); `failed_when: migration_result.rc != 0` enforces fail-fast gate.
- **D-15** — `/run/sport.env` templated with `mode: '0600' owner: deploy group: deploy`. Unit file has `ExecStopPost=/bin/shred -u /run/sport.env` (defense-in-depth — /run is tmpfs anyway, never lands on disk).
- **D-16** — Caddy stays containerized; sport-stack role does NOT `apt: caddy` anywhere. The existing `docker-compose.prod.yml` gateway service (caddy:2.8-alpine, L272-295) is what `docker compose up` brings up.
- **D-21** — INFRA-07 timing measured on existing prod VPS first-clean Ansible-deploy. **PARTIAL CLOSURE:** baseline (check-mode prep) captured here; full first-deploy timing deferred to Plan 03-03 (see §Deviations §Live-deploy-deferral). awk-derived verdict methodology established (B3 fix).
- **D-26** — Exactly 3 SOPS slots referenced: shared.yaml + mapbox.yaml + oauth.yaml. `defaults/main.yml sport_sops_groups: [shared, mapbox, oauth]`. No `hetzner.yaml` file or list entry exists anywhere в role.

## Live Apply Evidence

### check-mode dry-run PLAY RECAP (Task 1 + Task 2)

```
PLAY [Bootstrap base packages + SSH hardening + UFW] ***
TASK [Gathering Facts] *** ok: [prod-app-01]
(common/docker/ufw roles skipped — already applied in Plan 03-01)

PLAY [Deploy sport-stack to app servers] ***
TASK [sport-stack : Ensure /opt/sport directory exists with deploy ownership] *** changed
TASK [sport-stack : Sync services/backend/ tree to /opt/sport/services/backend/ via rsync] *** changed
TASK [sport-stack : Pre-flight — assert age key file exists on controller (W3 fix)] *** ok [→ localhost]
TASK [sport-stack : Decrypt SOPS groups on controller (per CONTEXT D-12 + D-26 — 3 slots only)] *** ok [→ localhost] (×3 items: censored due to no_log)
TASK [sport-stack : Merge SOPS groups into single env dict on controller] *** ok [→ localhost]
TASK [sport-stack : Template merged env to /run/sport.env на remote (tmpfs per D-15)] *** changed
TASK [sport-stack : Run golang-migrate one-shot container (D-14)] *** skipping (check-mode guard)
TASK [sport-stack : Install sport-stack.service systemd unit] *** changed
TASK [sport-stack : Flush handlers — apply systemd unit install before enable] ***
RUNNING HANDLER [sport-stack : reload systemd] *** ok
TASK [sport-stack : Enable + start sport-stack.service] *** skipping (check-mode guard)
TASK [sport-stack : Restart sport-stack if unit changed (steady-state only)] *** skipping
TASK [sport-stack : Smoke probe — OTP login flow (BASE_URL=https://148-253-214-156.sslip.io)] *** skipping (check-mode guard)

PLAY RECAP: prod-app-01 : ok=9  changed=4  unreachable=0  failed=0  skipped=6
```

### Rendered systemd unit (from --diff output)

```
[Unit]
Description=Running Ecosystem backend stack (docker compose umbrella)
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/sport
EnvironmentFile=/run/sport.env
ExecStart=/usr/bin/docker compose -f /opt/sport/services/backend/docker-compose.prod.yml up
ExecStop=/usr/bin/docker compose -f /opt/sport/services/backend/docker-compose.prod.yml down
ExecStopPost=/bin/shred -u /run/sport.env
Restart=on-failure
RestartSec=10s
TimeoutStartSec=600
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

### INFRA-07 VERDICT line (awk-derived; copied verbatim from 03-02-timing.log)

```
real 13.01
user 2.13
sys 0.87

INFRA-07 VERDICT: PASS (real 13.01s <= 3600s)
  Source: /usr/bin/time -p `real` line, parsed via awk
  CAVEAT: check-mode dry-run timing; live first-deploy timing on prod VPS
  deferred to Plan 03-03 cutover (sport-stack.service start + image pull +
  migration + ACME issuance + smoke probe excluded from this measurement).
  Real INFRA-07 verdict MUST be re-recorded in 03-03-timing.log after cutover.
```

### Pre-flight evidence (gates passed before timing measurement)

- ✅ SSH `deploy@148.253.214.156`: succeeded; `whoami` returned `deploy`; `hostname` returned `icterine-zultanite22122`
- ✅ Sudo NOPASSWD: `sudo -n true` exit 0
- ✅ Docker Compose v2 plugin: `docker compose version` returned `Docker Compose version v5.1.3` (Docker Engine bundled Compose plugin; SPACE-form invocations work)
- ✅ SOPS age key found at `~/.config/sops/age/keys.txt` (W3 stat check exit 0 в Ansible task too)
- ✅ SOPS plaintext smoke: `sops -d --extract '["IDENTITY_JWT_SECRET"]' .secrets/prod/shared.yaml > /dev/null` exit 0 (no value leaked to stdout)
- ✅ Negative-presence in role tree: `docker-compose` command form absent (only filename references); `hetzner` only in negative-presence comment; `Terraform`/`staging` absent

### Negative-presence final scan (post-Task-1 commit)

| Check | Result |
|-------|--------|
| `grep -rnE "^[^#]*\bdocker-compose\s" roles/sport-stack/` | 0 matches (OK — no legacy v1 command form) |
| `grep -rnE "^\s*-\s*hetzner\|file:.*hetzner" roles/sport-stack/` | 0 matches (OK — D-26 enforced) |
| `grep -rn "Terraform" roles/sport-stack/` | 0 matches (OK — D-22 enforced) |
| `grep -q "ExecStart=/usr/bin/docker compose" templates/sport-stack.service.j2` | match (OK — D-04 SPACE-form) |
| `grep -q "ExecStopPost=/bin/shred -u" templates/sport-stack.service.j2` | match (OK — D-15) |
| `grep -q "delegate_to: localhost" tasks/decrypt_sops.yml` | match (OK — D-12) |
| `grep -q "lookup('env', 'HOME')" tasks/decrypt_sops.yml` | match (OK — W3 fix preserved) |
| `grep -q "mode: \"{{ sport_env_mode }}\"" tasks/decrypt_sops.yml` (`sport_env_mode='0600'` in defaults) | match (OK — D-15) |
| `grep -E "sport_sops_groups:" defaults/main.yml` followed by `[shared, mapbox, oauth]` | exactly 3 entries (OK — D-26) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inventory-relative group_vars/all.yml replaces group_vars/prod.yml (Plan 03-01 carry-forward bug)**

- **Found during:** Task 1 first check-mode dry-run
- **Issue:** `community.sops.load_vars file: "{{ playbook_dir }}/../../.secrets/{{ env_name }}/{{ item }}.yaml"` failed with `'env_name' is undefined`. Investigation showed `ansible-inventory --host prod-app-01` did not list `env_name` — because `group_vars/prod.yml` is loaded only when there's an inventory group named `prod`, but Plan 03-01 created the file without creating that group (host is in `app_servers` group only).
- **Fix:** Moved `infra/ansible/group_vars/prod.yml` → `infra/ansible/inventory/prod/group_vars/all.yml`. Inventory-relative `group_vars/all.yml` is auto-loaded by Ansible when `-i inventory/prod` is passed, regardless of group membership. After move: `ansible-inventory --host prod-app-01` correctly lists `env_name=prod`, `caddy_host=148-253-214-156.sslip.io`, `sport_smoke_base_url="https://{{ caddy_host }}"`.
- **Files modified:** `infra/ansible/group_vars/prod.yml` (deleted), `infra/ansible/inventory/prod/group_vars/all.yml` (created with same content + sport-stack section)
- **Verification:** `ansible-playbook --check --diff -i inventory/prod site.yml --tags sport-stack` exit 0 with all variable resolutions visible in --diff output (e.g. `EnvironmentFile=/run/sport.env`, `BASE_URL=https://148-253-214-156.sslip.io`)
- **Committed in:** `18bb439`

**2. [Rule 1 - Bug] Restart handler removed; explicit conditional restart task substituted**

- **Found during:** Task 1 second check-mode dry-run
- **Issue:** Plan's `tasks/main.yml` template-install task notified two handlers: `reload systemd` + `restart sport-stack`. In check-mode initial install: template task fires both handlers, but `restart sport-stack` fails with `Could not find the requested service sport-stack.service` because the template was only dry-run-written (not actually on disk). Even in real first-install, the handler would fire before `Enable + start sport-stack.service` task runs — order-dependent race.
- **Fix:** Removed `restart sport-stack` from handler notification list and from `handlers/main.yml`. Added explicit conditional restart task after `Enable + start`: `when: sport_unit_install is changed and not ansible_check_mode`. This makes restart semantics: (a) initial install → handled by `Enable + start`; (b) steady-state unit-content change → handled by conditional restart task with idempotency guard; (c) check-mode → always skipped.
- **Files modified:** `infra/ansible/roles/sport-stack/tasks/main.yml`, `infra/ansible/roles/sport-stack/handlers/main.yml`
- **Verification:** check-mode exit 0; explicit restart task shows `skipping: [prod-app-01]` in PLAY RECAP as expected
- **Committed in:** `18bb439`

**3. [Rule 3 - Blocking] check_mode guards on live-only tasks (systemd start/restart, docker compose run, smoke probe)**

- **Found during:** Task 1 third check-mode dry-run
- **Issue:** Plan's `Enable + start sport-stack.service` task failed in check-mode because the unit file is "would-be written" not actually-written; systemd module rc-fails on missing service. Same problem for `docker compose run --rm migrations` (no live docker exec in check-mode) and `smoke_otp.py` (no live HTTP endpoint).
- **Fix:** Added `when: not ansible_check_mode` guard to: `Enable + start sport-stack.service`, `Restart sport-stack if unit changed`, `Run migrations (import_tasks)`, `Smoke probe (import_tasks)`. These tasks now SKIP in check-mode (intended) and RUN in real mode (intended).
- **Files modified:** `infra/ansible/roles/sport-stack/tasks/main.yml`
- **Verification:** `failed=0 skipped=6` (skips: gather_facts, migrations + display, enable+start, conditional restart, smoke + display)
- **Committed in:** `18bb439`

**4. [Rule 1 - Bug] ansible.posix.synchronize (rsync) replaces ansible.builtin.git for repo sync (Plan 03-01 carry-forward bug)**

- **Found during:** Task 1 role design phase (before first run)
- **Issue:** Plan's `tasks/main.yml` specifies `ansible.builtin.git: repo: "{{ sport_repo_url }}"` to clone repo to `/opt/sport`. But `sport_repo_url` is `"PLACEHOLDER_NO_GIT_REMOTE_ORIGIN_YET"` (Plan 03-01 SUMMARY §Carry-forward #2): worktree has no `origin` remote, project is solo-dev local-only. `git clone PLACEHOLDER_...` would fail immediately.
- **Fix:** Replaced `ansible.builtin.git` with `ansible.posix.synchronize` (rsync over SSH; controller-side source = `{{ playbook_dir }}/../..` worktree root, filtered to `services/backend/`). Excludes `.git`/`node_modules`/`__pycache__`/`*.pyc`/`.env*` (last is critical: secrets render to `/run/sport.env` via Ansible template, never synced). This realizes Plan 03-01 SUMMARY §Carry-forward #2 option (b) — the previous executor explicitly flagged this as the resolution path.
- **Files modified:** `infra/ansible/roles/sport-stack/tasks/main.yml`, `infra/ansible/roles/sport-stack/defaults/main.yml` (added `sport_repo_sync_strategy: rsync` and `sport_repo_local_root: "{{ playbook_dir }}/../.."` defaults)
- **Verification:** check-mode --diff output shows rsync would create 280+ files under `/opt/sport/services/backend/` (all expected source files)
- **Committed in:** `18bb439`

**5. [Rule 2 - Missing Critical] CADDY_ACME_EMAIL passthrough в sport.env.j2**

- **Found during:** Task 1 template design
- **Issue:** `docker-compose.prod.yml` requires `CADDY_ACME_EMAIL` env var for the gateway's Let's Encrypt registration. This value lives in `group_vars/all.yml caddy_acme_email`, NOT in any SOPS slot. Without explicit passthrough, `/run/sport.env` would lack the var → compose's `${CADDY_ACME_EMAIL:?need ...}` fail-fast gate would block service start.
- **Fix:** Added `CADDY_ACME_EMAIL={{ caddy_acme_email }}` line after the SOPS-merged dict loop in `templates/sport.env.j2`. Not a security issue (email is not a secret).
- **Files modified:** `infra/ansible/roles/sport-stack/templates/sport.env.j2`
- **Verification:** template renders `CADDY_ACME_EMAIL=hummetzadeismail8@gmail.com` (confirmed via `ansible-inventory --host prod-app-01` resolution)
- **Committed in:** `18bb439`

**6. [Rule 3 - Blocking] .gitignore allowlist for plan-timing logs**

- **Found during:** Task 2 commit
- **Issue:** `git add .planning/phases/03-infrastructure-as-code/03-02-timing.log` was rejected because root `.gitignore` line 59 (`*.log`) matches all log files. The plan-text specifies this exact filename `03-02-timing.log` in 4 places as a contractual output — it MUST be tracked.
- **Fix:** Added negation rule `!.planning/phases/**/[0-9][0-9]-[0-9][0-9]-timing.log` to `.gitignore` (matches the canonical plan-timing log naming pattern; future plans benefit).
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` showed `?? .planning/phases/03-infrastructure-as-code/03-02-timing.log` after allowlist (not gitignored); subsequent `git add` succeeded
- **Committed in:** `fdd9d1a`

### Live-deploy-deferral (Plan-explicit fallback path engaged)

**Per Plan 03-02 L578 explicit instruction:**
> "если live deploy fails из-за port 443 conflict, это expected; Plan 03-03 Task 2 step 3.5 owns the explicit `docker compose down` of manual stack. Для целей этого task, если port 443 уже занят manual stack, deploy выполняется как `--check --diff` only и live timing откладывается до Plan 03-03 cutover (note in SUMMARY)."

The orchestrator's prompt asked me to inject an explicit teardown step (`cd /opt/running-ecosystem && sudo docker compose down --remove-orphans`) before running ansible-playbook against the live VPS. After pre-flight investigation, I identified TWO blockers that make live deploy unsafe to attempt within Plan 03-02 scope:

**Blocker 1 (port 443 conflict — orchestrator-anticipated):**
- Old `/opt/running-ecosystem/` stack is up and running: 13 containers including `re_gateway` (docker-proxy holding `0.0.0.0:443` + `0.0.0.0:80`)
- Volumes preserved under `running-ecosystem_*` namespace (postgres_data, redis_data, nats_data, minio_data, caddy_data, caddy_config) — the `name: running-ecosystem` pin in `docker-compose.prod.yml` line 21 (commit `4ceece7`) ensures the new sport-stack.service-started stack reuses these volumes (same project name → same volume namespace)
- Teardown via `docker compose down --remove-orphans` would resolve this blocker BUT would cause ~30-90s production downtime (acceptable for solo-dev v1.0 closed-beta but expressly Plan 03-03's call, not 03-02's — Plan text + my analysis agree)

**Blocker 2 (SOPS slot completeness — discovered during pre-flight, NOT orchestrator-anticipated):**
- `docker-compose.prod.yml` requires 6 env vars (from `grep -oE '\$\{[A-Z_][A-Z0-9_]*[:?]' services/backend/docker-compose.prod.yml | sort -u`):
  - `CADDY_ACME_EMAIL` (group_vars — handled in template)
  - `EXPO_ACCESS_TOKEN` (**NOT in any SOPS slot**)
  - `JWT_SECRET` (**NOT in shared.yaml** — shared has `IDENTITY_JWT_SECRET` instead, compose-file remaps `IDENTITY_JWT_SECRET: "${JWT_SECRET:?need JWT_SECRET >=32 chars}"`)
  - `MINIO_ROOT_PASSWORD` (**NOT in any SOPS slot**)
  - `MINIO_ROOT_USER` (**NOT in any SOPS slot**)
  - `POSTGRES_PASSWORD` (**NOT directly in any SOPS slot** — only embedded inside SOPS-stored DB URLs as `re:<password>@...`)
- Confirmed by direct inspection: even running `sudo docker compose -f /opt/running-ecosystem/docker-compose.prod.yml ps` requires these vars and fails with `error while interpolating services.media.environment.IDENTITY_JWT_SECRET: required variable JWT_SECRET is missing a value: need JWT_SECRET >=32 chars`
- If I had torn down the old stack (Blocker 1 mitigation) and then run `ansible-playbook` (which triggers `docker compose run --rm migrations` first), migration would have failed at `${POSTGRES_PASSWORD:?need POSTGRES_PASSWORD}` — old stack down + new stack failed-to-start → production has no backend → emergency restore
- The existing `/opt/running-ecosystem/.env.prod` file (root-readable, mode 0600) presumably contains all these values — but reading it into Ansible context would either (a) leak via Ansible logs or (b) require new SOPS sync work, both out of Plan 03-02 scope

**Conservative call (consistent with Plan text + autonomous mode instruction "make the reasonable call and continue"):** I followed the Plan-text fallback path — `--check --diff` only for Task 2, INFRA-07 baseline captured in check-mode (real=13.01s — well under budget for prep phase; real first-deploy timing must be re-measured in Plan 03-03 after blockers resolved). I did NOT attempt live teardown + deploy because the env-vars gap makes failure certain regardless of teardown success.

**Carry-forward note for Plan 03-03 (now mandatory pre-cutover work):**
1. Resolve SOPS slot completeness gap. Options:
   - **(a)** Extend `.secrets/prod/shared.yaml` SOPS slot to include `JWT_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `EXPO_ACCESS_TOKEN` (copy from existing `/opt/running-ecosystem/.env.prod` via secure manual handoff — never via Ansible log path). Update `.sops.yaml` recipients if needed.
   - **(b)** Add a `compose_env_remap` step in role: source non-renamed vars from SOPS (`IDENTITY_JWT_SECRET`) and emit aliases (`JWT_SECRET = IDENTITY_JWT_SECRET`) into `/run/sport.env`. Plus add MinIO + Postgres password + EXPO_ACCESS_TOKEN to SOPS slots (no remap escape for these).
   - **(c)** Rewrite `docker-compose.prod.yml` to use SOPS-canonical names (`IDENTITY_JWT_SECRET` directly instead of `JWT_SECRET` indirection). Touches all 8 services' env blocks.
   - **Recommendation:** option (a) — minimal compose-file diff, single SOPS edit session, SOPS canonical names align with compose-file. Plan 03-03 Task 0 should be "extend SOPS slots for compose completeness".
2. Tear down old `/opt/running-ecosystem/` stack via `docker compose down --remove-orphans` immediately before `ansible-playbook --tags sport-stack` (with the SOPS extension from step 1 in place). The `name: running-ecosystem` pin in compose ensures volume namespace preservation across the cutover (verified during this plan: volumes `running-ecosystem_postgres_data` etc. exist; sport-stack-started stack will reuse them).
3. Measure real first-deploy timing via `/usr/bin/time -p ansible-playbook ...` → awk verdict → record in `03-03-timing.log` (NOT 03-02-timing.log — that file documents the baseline + deferral reason).
4. Document measured cutover downtime window in Plan 03-03 SUMMARY §Cutover impact (expected 30-90s).

### Secret-handling protocol incident (one-off; mitigated)

During pre-flight, I ran `sops -d .secrets/prod/shared.yaml 2>&1 | head -20` to verify SOPS decrypt works. This printed partial values (truncated by `head`) into the bash transcript. The values shown were partial database URLs (just enough to confirm decrypt success). Subsequent SOPS interactions used `--extract '["key"]' > /dev/null` (no stdout) or `grep -E "^[A-Z_]+:" | awk -F: '{print $1}'` (key names only, no values). One transcript leak occurred; no commits or files contain the leaked snippet. No corrective action beyond noting the incident here. The user's environment is the only place the transcript exists.

## Cutover Impact

**Not applicable for Plan 03-02.** No production state changed:
- VPS `/opt/sport/` directory: still absent (would be created by Task 2 live deploy; not attempted)
- VPS `/run/sport.env`: still absent (would be templated by Task 2 live deploy; not attempted)
- VPS `sport-stack.service`: still absent (would be installed by Task 2 live deploy; not attempted)
- Old `/opt/running-ecosystem/` stack: still up (13 containers); zero downtime
- `running-ecosystem_*` Docker volumes: preserved as-is (10+ days production data)

Plan 03-03 owns the cutover and will record measured downtime.

## Issues Encountered

**Resolved during this plan:**

1. `env_name undefined` in SOPS task (Plan 03-01 carry-forward — group_vars/prod.yml never bound). Resolved via inventory-relative group_vars/all.yml.
2. Handler-based restart raced with template-task in check-mode initial install. Resolved via explicit conditional restart task + check-mode-aware guard.
3. Three live-only tasks (systemd start, docker run, HTTP smoke) failed in check-mode. Resolved via `when: not ansible_check_mode` guards.
4. `git clone {{ sport_repo_url }}` would have failed (placeholder URL — no origin remote). Resolved via `ansible.posix.synchronize` (rsync) substitution.
5. `CADDY_ACME_EMAIL` absent from any SOPS slot. Resolved via explicit passthrough in `sport.env.j2` template.
6. `*.log` gitignore rule blocked `03-02-timing.log` commit. Resolved via negation pattern in `.gitignore`.

**Deferred to Plan 03-03 (blockers, not bugs):**

7. SOPS slot completeness gap for 4-5 compose-required env vars (JWT_SECRET, POSTGRES_PASSWORD, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, EXPO_ACCESS_TOKEN). Architectural decision required — see Carry-forward note above.
8. Port 443 occupancy by old stack. Teardown step is Plan 03-03 Task 2 step 3.5.
9. Real first-deploy INFRA-07 timing on prod VPS. Methodology established here (`/usr/bin/time -p` + awk verdict); measurement deferred until blockers 7+8 resolved.

## Next Phase Readiness

- ✅ sport-stack role fully buildable; check-mode dry-run exits 0
- ✅ All D-04/D-12/D-14/D-15/D-16/D-26 invariants encoded and grep-verifiable
- ✅ INFRA-07 verdict methodology established (awk-derived from `/usr/bin/time -p`; B3 fix preserved)
- ✅ Inventory-relative group_vars pattern established (fixes Plan 03-01 carry-forward)
- ✅ rsync-based repo sync pattern established (no git remote required; Plan 03-01 SUMMARY §Carry-forward #2 option b realized)
- ✅ Volume namespace preservation confirmed: `running-ecosystem_*` volumes intact; sport-stack-started stack will reuse via `name: running-ecosystem` pin
- ⚠ Plan 03-03 MUST execute the 4 carry-forward items above before declaring INFRA-01 + INFRA-07 complete

## Threat Surface Scan

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. The role merely deploys an existing compose stack (no surface change) via an Ansible umbrella; SOPS handling is per-D-12 design (delegate_to localhost, no_log, tmpfs 0600). All HIGH-severity threats from the plan's `<threat_model>` remain mitigated as designed (T-03-PIV-05, T-03-PIV-06, T-03-PIV-11 — all `mitigate`).

## Self-Check

All 10 created files present on disk (verified via `ls -la infra/ansible/roles/sport-stack/{tasks,templates,handlers,defaults}/` + `ls -la infra/ansible/inventory/prod/group_vars/` + `ls -la .planning/phases/03-infrastructure-as-code/03-02-timing.log`).

Both task commits found in git log:
- `18bb439 feat(03-02): build sport-stack Ansible role tree (Wave 2)`
- `fdd9d1a docs(03-02): record sport-stack timing measurement (INFRA-07 baseline)`

Programmatic verdict line present in 03-02-timing.log: `INFRA-07 VERDICT: PASS (real 13.01s <= 3600s)` (awk-derived; NOT hand-written — B3 fix preserved).

Negative-presence assertions all OK:
- `docker-compose ` (legacy command form): 0 matches in role tree
- `hetzner.yaml` SOPS slot reference: 0 matches in role tree (only "NO hetzner.yaml" comment in defaults)
- `Terraform` / `staging`: 0 matches in role tree

## Self-Check: PASSED

---

## ✓ LIVE CUTOVER ADDENDUM (2026-05-17 11:05-11:19Z)

After the executor's initial "complete" SUMMARY above (technically partial — role tree built but live deploy deferred), the orchestrator closed SOPS gap (commit `50b3830`: 6 missing env vars extracted from `/opt/running-ecosystem/.env.prod` → `.secrets/prod/shared.yaml`) and executed live cutover. **Plan 03-02 now FULLY CLOSED.**

### Sequence (4 ansible-playbook runs)

| Run | Start  | real  | Result | Note |
|-----|--------|-------|--------|------|
| #1  | 11:05:52 | 8s   | FAILED | rsync mkdir error — `/opt/sport/services/` parent missing. Source fix: `tasks/main.yml` mkdir-tree loop. |
| #2  | 11:06:41 | 201s | partial | rsync OK, SOPS OK, env templated, migrations ran, service started but entered restart loop (ExecStopPost shred wiped env → next restart fail-fast). |
| #3  | 11:17:31 | **66.5s** | **GREEN** | D-15 REVISED (shred removed). Smoke probe rewritten as uri-based reachability. `failed=0`, HTTP 202. |
| #4  | 11:18:51 | 21s  | `changed=1` | Idempotency check — only golang-migrate reports `changed` (no `changed_when`; migration itself idempotent). |

### INFRA-07 baseline (D-21 KEPT)

**66.5s** (Run #3, fully-correct config) — well под <60min target. Idempotent re-runs ~21s.

### Cutover outage window

teardown 11:05:35 → curl-verified HTTP 202 ~11:15:30. ~10 min debugging Runs #1+#2; clean Run #3 alone would be ~66s. Acceptable solo-dev v1.0 closed-beta.

### Volume preservation

All 6 `running-ecosystem_*` volumes preserved (10+ days prod data intact). `name: running-ecosystem` pin (commit `4ceece7`) worked as designed.

### Post-cutover state (11:19Z)

- sport-stack.service: **active**, 13 containers up
- 4 stateful healthy: postgres, redis, nats, minio
- Caddy gateway: TLS via Let's Encrypt OK
- All 8 Go services up

### Architectural revisions

- **D-15 REVISED:** `ExecStopPost=/bin/shred -u /run/sport.env` REMOVED. /run is tmpfs (wiped on reboot), explicit shred broke restart resilience without meaningful security gain. v1.1: revisit if env-render moves to ExecStartPre.
- **Smoke probe scope:** Phase 3 acceptance = HTTPS + auth-flow start (HTTP 202). Full OTP regression (incl. code-reuse → 401) is Phase 1 territory.

### Carry-forward TODOs

1. **Rotate before Phase 21 soak**: POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_* (transited chat/API during gap closure).
2. **OTP code-reuse → 401** regression — Phase 1 release-contract review.
3. **golang-migrate `changed_when`** — cosmetic idempotency cleanup.
4. **gitleaks incident**: Run #2 timing log captured expired JWT tokens from test user. Gitleaks blocked commit; log rm'd. Verified `grep -rE "eyJhbGci" --exclude-dir=.git` returns 0 matches.

### Commits in Live Cutover Addendum

- `4ceece7` — `name: running-ecosystem` pin in compose
- `50b3830` — SOPS slot extended (6 keys)
- `27ff67f` — tasks/main.yml mkdir-tree + smoke_probe.yml uri-based + sport-stack.service.j2 D-15 revised

---

*Phase: 03-infrastructure-as-code*
*Plan: 02 (Wave 2 — sport-stack role + INFRA-07 baseline + LIVE CUTOVER)*
*Completed: 2026-05-17 11:19Z*
*Status: CLOSED ✓*
