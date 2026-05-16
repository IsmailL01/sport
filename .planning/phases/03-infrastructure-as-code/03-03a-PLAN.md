---
plan_id: 03-03a
phase: 3
phase_slug: infrastructure-as-code
wave: 3
depends_on: [03-02]
files_modified:
  - infra/ansible/roles/sport-stack/defaults/main.yml
  - infra/ansible/roles/sport-stack/handlers/main.yml
  - infra/ansible/roles/sport-stack/tasks/main.yml
  - infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml
  - infra/ansible/roles/sport-stack/tasks/run_migrations.yml
  - infra/ansible/roles/sport-stack/tasks/smoke_probe.yml
  - infra/ansible/roles/sport-stack/templates/sport-stack.service.j2
  - infra/ansible/roles/sport-stack/templates/Caddyfile.j2
requirements: [INFRA-01, INFRA-07]
autonomous: true
estimated_duration: "2.5 h"

must_haves:
  truths:
    - "Один umbrella systemd unit `sport-stack.service` (НЕ 8 per-service units) запускает `docker compose ... up` foreground per CONTEXT D-04 + RESEARCH Pattern 1"
    - "ExecStart использует `/usr/bin/docker compose` (space, plugin form) — НЕ legacy `docker-compose` (dash) per RESEARCH correction Pitfall 4 (Ubuntu 24.04+ не имеет dash binary)"
    - "Type=simple + foreground `up` (НЕ `up -d`) — иначе systemd теряет PID и не может restart per RESEARCH Pattern 1"
    - "SOPS decrypt happens via `delegate_to: localhost` — age key никогда не покидает dev workstation per CONTEXT D-12 + RESEARCH Pattern 2"
    - "Plaintext `/run/sport.env` на tmpfs (mode 0600, owner deploy) — shred'ится через `ExecStopPost=` per CONTEXT D-15"
    - "Decrypt + copy tasks имеют `no_log: true` — иначе plaintext leak в ansible.log per RESEARCH Pitfall 8"
    - "SOPS_AGE_KEY_FILE explicit absolute construct: `{{ lookup('env', 'SOPS_AGE_KEY_FILE') | default(lookup('env', 'HOME') + '/.config/sops/age/keys.txt', true) }}` — НЕ `expanduser` (W3 fix: explicit HOME concat avoids macOS/Linux expanduser edge cases)"
    - "Migration step — отдельная одноразовая Ansible task `docker compose run --rm migrations` ДО `systemctl start sport-stack` per CONTEXT D-14"
    - "Caddy остаётся `caddy:2.8-alpine` в docker-compose.prod.yml — Ansible role syncs ТОЛЬКО `Caddyfile.j2` template + триггерит `docker compose restart gateway` handler (RESEARCH correction D-16, port 443 conflict avoidance)"
    - "Git clone использует `{{ sport_repo_url }}` group_var (W2 fix — sourced from `git remote get-url origin` в Plan 03-02 Task 1 Wave 0 step) — НЕ hardcoded `https://github.com/<user>/sport.git` placeholder"
    - "Smoke probe запускается через `delegate_to: localhost` с `BASE_URL=https://{{ caddy_host }}` env var против существующего `services/backend/scripts/smoke_otp.py` — НЕ требует remote Python install"
    - "8 Go services управляются как часть compose stack — НЕ 6 как в literal ROADMAP wording (current code на feat/cursona-redesign имеет 8: identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph)"
    - "Fail-fast `${VAR:?need ...}` substitution в compose.prod.yml преживает Ansible-обёртку через `EnvironmentFile=/run/sport.env` per Pattern B"
    - "<60min INFRA-07 timing measurement classified MANUAL-ONLY per VALIDATION L67 — `<automated>` verify covers только template content + syntax-check + check-mode dry-run; `<manual>` verify covers live deploy + wall-clock derivation через awk на `/usr/bin/time -p` output (B3 fix — устраняет circular self-attestation PASS/FAIL pattern исходного плана)"
    - "[informational] D-13 (SOPS_AGE_KEY_FILE direnv) — task требует env var present; документация в Plan 03-04"
    - "[informational] D-04 corrected: ExecStart использует `docker compose` (space), НЕ `docker-compose` (dash) — Ubuntu 24.04 не имеет legacy binary"
  behaviors:
    - "После Task 1 (templates): `ansible-playbook --syntax-check -i inventory/staging --tags=deploy site.yml` exit 0"
    - "После Task 2 `<automated>` verify (NO live VPS required): template content greps OK, `ansible-playbook --syntax-check ... --tags=sport-stack` OK, `ansible-playbook --check --diff ... --tags=sport-stack` OK (check-mode skips action modules — не нужен live SSH)"
    - "После Task 2 `<manual>` verify (live deploy): `/usr/bin/time -p ansible-playbook ...` → awk derives wall-clock < 60min PROGRAMMATICALLY (не self-attested PASS string); `BASE_URL=https://<staging>.sslip.io python smoke_otp.py` exit 0"
    - "После Task 2: `systemctl is-active sport-stack` показывает 'active'; `docker compose ps` показывает все 8 Go services + 4 stateful + caddy = 13 running containers"
    - "После Task 2: `curl -sI https://<staging-caddy-host>/healthz` (или identity health endpoint) returns HTTP 200"
    - "Idempotent: повторный `ansible-playbook -i inventory/staging --tags=deploy site.yml` показывает `changed=0` (за исключением migration plays если в DB новые миграции; norm для idempotent infra deploy)"
    - "Wall-clock fresh-deploy timing на staging-app-01 (от `ansible-playbook` start до smoke probe green) < 60 минут per INFRA-07; verdict derived от awk-parser в `<manual>` block, НЕ executor-written PASS string"
  forbidden:
    - "Не запускать `sops -d` через task без `delegate_to: localhost` — нарушит D-12 master key isolation"
    - "Не оставлять `no_log: false` (default) на decrypt/copy tasks — plaintext попадёт в ~/.ansible.log"
    - "Не использовать `Type=forking` или `up -d` в sport-stack.service — потеря PID = broken restart"
    - "Не использовать `/usr/bin/docker-compose` (dash) в ExecStart — Ubuntu 24.04 не имеет binary"
    - "Не apt-installить Caddy в sport-stack role — port 443 conflict с containerized Caddy"
    - "Не указывать каждый из 8 services отдельным systemd unit — single umbrella per D-04"
    - "Не запускать migration play параллельно с running stack (Pitfall 9) — stop → migrate → start ordering обязателен"
    - "Не использовать `expanduser` Jinja filter для SOPS_AGE_KEY_FILE — explicit HOME concat (W3 fix)"
    - "Не писать PASS/FAIL string executor'ом в timing.log и потом grep'ить его в `<automated>` verify — circular self-attestation (B3 fix). Verdict derived programmatically via awk."
    - "Не включать live VPS dependency в Task 2 `<automated>` block — staging unreachable scenario не должен сломать `<automated>` verify (B3 fix — live concerns живут в `<manual>` block)"
---

<objective>
## Цель плана 03-03a

Реализовать `sport-stack` Ansible role которая wraps существующий `services/backend/docker-compose.prod.yml` (8 Go services + Postgres+TimescaleDB + Redis + NATS + MinIO + caddy:2.8-alpine gateway + migrations one-shot) в single umbrella systemd unit `sport-stack.service`. Включает SOPS-decrypt-via-delegate-to-localhost flow, migration orchestration, Caddyfile.j2 per-env template render (template-only — Caddy stays containerized per RESEARCH correction D-16), и post-deploy smoke probe. Завершается first-pass measurement <60min INFRA-07 на staging-app-01.

**Purpose:** Wave 3a закрывает INFRA-01 (полностью — все 8 Go service units + 4 stateful + Caddy под systemd supervision) и INFRA-07 (measured <60min fresh-deploy на staging). Это вместе с Wave 3b (Sentry VPS prep) — последний technical gate перед Wave 4 production cutover.

**Output:**
- `infra/ansible/roles/sport-stack/` — полная role (tasks + templates + handlers + defaults) — overwrites Plan 03-02 stub в `tasks/main.yml`
- `sport-stack.service` systemd unit на staging-app-01, enabled + active
- Caddyfile.prod рендерится из template с per-env caddy_host
- Smoke probe green против staging endpoint
- Wall-clock fresh-deploy timing recorded для INFRA-07 (передаётся в Plan 03-04 deploy.md §9) — verdict derived programmatically (B3 fix)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/03-infrastructure-as-code/03-CONTEXT.md
@.planning/phases/03-infrastructure-as-code/03-RESEARCH.md
@.planning/phases/03-infrastructure-as-code/03-PATTERNS.md
@.planning/phases/03-infrastructure-as-code/03-VALIDATION.md
@.planning/phases/03-infrastructure-as-code/03-02-PLAN.md
@docs/RUNBOOKS/sops-edit.md
@services/backend/docker-compose.prod.yml
@services/backend/gateway/Caddyfile.prod
@services/backend/scripts/smoke_otp.py

<interfaces>
<!-- Source artifacts которые role wraps -->

From services/backend/docker-compose.prod.yml (304 lines, preserved verbatim):
- 8 Go services: identity (port 8081), activity-sync (8082), social-graph (8084), messaging (8083), feed (8085), media (8086), notifications (8087), realtime-gw (8090)
- 4 stateful: postgres (timescale/timescaledb:2.17.2-pg16), nats (nats:2.11-alpine), minio (minio/minio:...), redis (redis:7-alpine)
- 1 gateway: caddy:2.8-alpine, binds 80/443 на host
- 1 one-shot: migrations (migrate/migrate:v4.18.1) — реализован через `restart: "no"` и `service_completed_successfully` deps
- Fail-fast `${VAR:?need ...}` substitution для POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, CADDY_ACME_EMAIL

From services/backend/gateway/Caddyfile.prod (175 lines, used verbatim для тела template):
- Top-level: `{ email {env.CADDY_ACME_EMAIL} }`
- S3 host: `s3.148-253-214-156.sslip.io { reverse_proxy minio:9000; ... }`
- Main host: `148-253-214-156.sslip.io { handle /identity/* ...; handle /activity-sync/* ...; ...; }` (17 handle blocks)

From services/backend/scripts/smoke_otp.py:
- BASE = os.environ.get("BASE_URL", "https://148-253-214-156.sslip.io")
- Сценарий: POST /identity/v1/auth/otp/request → POST /verify → JWT validation
- Exit code 0 если все checks pass; non-zero если HTTP != 200 или payload mismatch

From docs/RUNBOOKS/sops-edit.md §9 (deploy.sh pattern которое Ansible adapts):
```bash
set -euo pipefail
umask 077
export SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt
ENV_FILE="$(mktemp /run/sport.env.XXXXXX)"
trap "shred -u '$ENV_FILE'" EXIT
sops -d --output-type=dotenv .secrets/prod/shared.yaml  >  "$ENV_FILE"
sops -d --output-type=dotenv .secrets/prod/mapbox.yaml  >> "$ENV_FILE"
sops -d --output-type=dotenv .secrets/prod/oauth.yaml   >> "$ENV_FILE"
# Затем docker compose --env-file "$ENV_FILE" up -d
```

Group vars (set in Plan 03-02):
- env_name (staging/prod) — feeds в decrypt_sops.yml path .secrets/{{ env_name }}/*.yaml
- caddy_host (e.g., "staging-app-01-ipv4-with-dashes.sslip.io") — feeds в Caddyfile.j2 + smoke probe BASE_URL
- caddy_acme_email — feeds в Caddyfile.j2 email directive
- sport_repo_url — feeds в git clone task (W2 fix); populated в Plan 03-02 Task 1 via `git remote get-url origin`

Stub role overwritten:
- `infra/ansible/roles/sport-stack/tasks/main.yml` создан в Plan 03-02 Task 1 как `debug` stub (B2 fix для syntax-check); Task 1 ниже полностью переписывает его реальной orchestration.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: sport-stack role files — defaults, tasks (main+decrypt_sops+run_migrations+smoke_probe), handlers, templates (Caddyfile.j2 + sport-stack.service.j2) — OVERWRITES Plan 03-02 stub</name>
  <files>
    infra/ansible/roles/sport-stack/defaults/main.yml,
    infra/ansible/roles/sport-stack/handlers/main.yml,
    infra/ansible/roles/sport-stack/tasks/main.yml,
    infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml,
    infra/ansible/roles/sport-stack/tasks/run_migrations.yml,
    infra/ansible/roles/sport-stack/tasks/smoke_probe.yml,
    infra/ansible/roles/sport-stack/templates/sport-stack.service.j2,
    infra/ansible/roles/sport-stack/templates/Caddyfile.j2
  </files>
  <read_first>
    services/backend/docker-compose.prod.yml,
    services/backend/gateway/Caddyfile.prod,
    services/backend/scripts/smoke_otp.py,
    docs/RUNBOOKS/sops-edit.md (§9 Deploy script),
    .planning/phases/03-infrastructure-as-code/03-PATTERNS.md (lines 207-480 — sport-stack role pattern с excerpt-ами),
    .planning/phases/03-infrastructure-as-code/03-RESEARCH.md (lines 280-420 — Pattern 1/2/3 systemd + decrypt + migrations),
    infra/ansible/roles/sport-stack/tasks/main.yml (Plan 03-02 stub — этот task полностью overwrites)
  </read_first>
  <action>
    1. `infra/ansible/roles/sport-stack/defaults/main.yml`:
       ```yaml
       ---
       sport_install_dir: /opt/sport
       sport_repo_ref: feat/cursona-redesign   # branch до Phase 21 merge; main после
       sport_env_file: /run/sport.env
       sport_compose_file: "{{ sport_install_dir }}/services/backend/docker-compose.prod.yml"
       sport_caddy_target: "{{ sport_install_dir }}/services/backend/gateway/Caddyfile.prod"
       sport_sops_groups:
         - shared
         - mapbox
         - oauth
       # hetzner.yaml SOPS slot — для Wave 3a НЕ нужен (это TF state creds, не runtime secrets);
       # specifically excluded из sport_sops_groups
       sport_smoke_scripts:
         - smoke_otp.py
         # Дополнительные smoke_*.py добавятся когда они появятся; v1.0 baseline = OTP smoke
       ```

    2. `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2` (per RESEARCH Pattern 1):
       ```ini
       # /etc/systemd/system/sport-stack.service — Phase 3 D-04 umbrella unit
       [Unit]
       Description=Running Ecosystem application stack (Phase 3 D-04 umbrella)
       Requires=docker.service
       After=docker.service network-online.target
       StartLimitIntervalSec=300
       StartLimitBurst=5

       [Service]
       Type=simple
       WorkingDirectory={{ sport_install_dir }}/services/backend
       EnvironmentFile={{ sport_env_file }}
       ExecStartPre=/usr/bin/docker compose -f docker-compose.prod.yml pull
       ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up
       ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
       ExecStopPost=/bin/bash -c 'shred -u {{ sport_env_file }} 2>/dev/null || true'
       Restart=on-failure
       RestartSec=10s
       TimeoutStartSec=600
       TimeoutStopSec=120

       [Install]
       WantedBy=multi-user.target
       ```
       **Critical:** `/usr/bin/docker compose` (space, plugin) — НЕ `/usr/bin/docker-compose` (dash, Pitfall 4). `Type=simple` + foreground `up` (НЕ `up -d`, Pitfall 4).

    3. `infra/ansible/roles/sport-stack/templates/Caddyfile.j2` — копия `services/backend/gateway/Caddyfile.prod` ВЕРБАТИМ с двумя Jinja2-подстановками:
       - Заменить `{env.CADDY_ACME_EMAIL}` (строка 10 в .prod) на `{{ caddy_acme_email }}`
       - Заменить ВСЕ instances of `148-253-214-156.sslip.io` (строки 18, 27) на `{{ caddy_host }}`
       - Заменить `s3.148-253-214-156.sslip.io` (строка 18) на `s3.{{ caddy_host }}`
       - ВСЕ остальные 175 строк (17 handle blocks для identity/activity-sync/notifications/realtime-gw/messaging/media/feed/social-graph/admin + CORS preflight + reverse_proxy directives) — копируются БЕЗ изменений per PATTERNS Pattern E.

    4. `infra/ansible/roles/sport-stack/tasks/main.yml` — entry-point orchestration (W2 fix: git URL = `{{ sport_repo_url }}`, не hardcoded):
       ```yaml
       ---
       - name: Ensure /opt/sport directory exists with deploy ownership
         ansible.builtin.file:
           path: "{{ sport_install_dir }}"
           state: directory
           owner: "{{ deploy_user }}"
           group: "{{ deploy_group }}"
           mode: '0755'
         tags: [deploy]

       - name: Sync repo checkout to /opt/sport via git (W2 fix — sport_repo_url из group_vars/all.yml, NOT hardcoded)
         ansible.builtin.git:
           repo: "{{ sport_repo_url }}"
           dest: "{{ sport_install_dir }}"
           version: "{{ sport_repo_ref }}"
           force: false
         become: true
         become_user: "{{ deploy_user }}"
         tags: [deploy]

       - name: Render Caddyfile.j2 (per-env caddy_host)
         ansible.builtin.template:
           src: Caddyfile.j2
           dest: "{{ sport_caddy_target }}"
           owner: "{{ deploy_user }}"
           group: "{{ deploy_group }}"
           mode: '0644'
         notify: restart caddy container
         tags: [deploy]

       - name: Render sport-stack.service systemd unit
         ansible.builtin.template:
           src: sport-stack.service.j2
           dest: /etc/systemd/system/sport-stack.service
           owner: root
           group: root
           mode: '0644'
         notify:
           - reload systemd
           - restart sport-stack
         tags: [deploy]

       - import_tasks: decrypt_sops.yml
         tags: [deploy]

       - import_tasks: run_migrations.yml
         tags: [deploy]

       - name: Enable + start sport-stack systemd unit
         ansible.builtin.systemd:
           name: sport-stack.service
           state: started
           enabled: true
           daemon_reload: true
         tags: [deploy]

       - name: Wait for Caddy port 443 to listen (max 60s)
         ansible.builtin.wait_for:
           host: "{{ ansible_host }}"
           port: 443
           timeout: 60
           delay: 5
         delegate_to: localhost
         become: false
         tags: [deploy]

       - import_tasks: smoke_probe.yml
         tags: [deploy]
       ```

    5. `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml` — per RESEARCH Pattern 2 + Pitfall 8 + W3 fix (explicit HOME concat, no expanduser):
       ```yaml
       ---
       - name: Decrypt SOPS secrets on controller (NEVER on remote per D-12)
         delegate_to: localhost
         become: false
         block:
           - name: Create temp env file on controller
             ansible.builtin.tempfile:
               state: file
               suffix: .env
             register: tmp_env
             no_log: true

           - name: Decrypt + concat все sport_sops_groups в один dotenv
             ansible.builtin.shell: |
               set -euo pipefail
               umask 077
               : > {{ tmp_env.path }}
               for f in {{ sport_sops_groups | join(' ') }}; do
                 sops -d --output-type=dotenv .secrets/{{ env_name }}/${f}.yaml >> {{ tmp_env.path }}
               done
             args:
               chdir: "{{ playbook_dir }}/../.."   # repo root
             environment:
               # W3 fix: explicit HOME concat avoids expanduser edge cases (macOS vs Linux, missing HOME, etc.)
               SOPS_AGE_KEY_FILE: "{{ lookup('env', 'SOPS_AGE_KEY_FILE') | default(lookup('env', 'HOME') + '/.config/sops/age/keys.txt', true) }}"
             changed_when: false
             no_log: true

           - name: Copy decrypted env to remote tmpfs /run/sport.env (mode 0600, owner deploy)
             ansible.builtin.copy:
               src: "{{ tmp_env.path }}"
               dest: "{{ sport_env_file }}"
               owner: "{{ deploy_user }}"
               group: "{{ deploy_group }}"
               mode: '0600'
             no_log: true

         always:
           - name: Shred temp env on controller (always — даже при failure)
             delegate_to: localhost
             become: false
             ansible.builtin.command: "shred -u {{ tmp_env.path }}"
             changed_when: false
             failed_when: false
             when: tmp_env.path is defined
       ```

    6. `infra/ansible/roles/sport-stack/tasks/run_migrations.yml` — per RESEARCH Pattern 3:
       ```yaml
       ---
       - name: Stop sport-stack (если запущен) для clean migration ordering
         ansible.builtin.systemd:
           name: sport-stack.service
           state: stopped
         failed_when: false   # OK если не запущен (fresh install)

       - name: Run schema migrations через golang-migrate one-shot container
         ansible.builtin.command:
           cmd: >
             docker compose
             -f {{ sport_compose_file }}
             --env-file {{ sport_env_file }}
             run --rm migrations
           chdir: "{{ sport_install_dir }}/services/backend"
         register: migrate_result
         changed_when: "'no change' not in migrate_result.stdout"
         failed_when: migrate_result.rc != 0
       ```

    7. `infra/ansible/roles/sport-stack/tasks/smoke_probe.yml` — per PATTERNS Pattern D:
       ```yaml
       ---
       - name: Run smoke probes (local — re-uses existing services/backend/scripts/smoke_*.py)
         delegate_to: localhost
         become: false
         ansible.builtin.command:
           cmd: "python3 services/backend/scripts/{{ item }}"
           chdir: "{{ playbook_dir }}/../.."
         loop: "{{ sport_smoke_scripts }}"
         environment:
           BASE_URL: "https://{{ caddy_host }}"
         changed_when: false
         register: smoke_results
       ```

    8. `infra/ansible/roles/sport-stack/handlers/main.yml`:
       ```yaml
       ---
       - name: reload systemd
         ansible.builtin.systemd:
           daemon_reload: true

       - name: restart sport-stack
         ansible.builtin.systemd:
           name: sport-stack.service
           state: restarted

       - name: restart caddy container
         ansible.builtin.command: docker compose -f {{ sport_compose_file }} restart gateway
         changed_when: true
       ```

    **Critical reminder для executor:** `caddy:2.8-alpine` остаётся в `services/backend/docker-compose.prod.yml` — НИКАКОГО apt-install Caddy на host (port 443 conflict per RESEARCH correction D-16). Handler `restart caddy container` использует `docker compose restart gateway` для re-load Caddyfile. Этот task полностью overwrites `tasks/main.yml` stub созданный в Plan 03-02 Task 1.
  </action>
  <verify>
    <automated>
      test -f infra/ansible/roles/sport-stack/defaults/main.yml \
      && test -f infra/ansible/roles/sport-stack/tasks/main.yml \
      && test -f infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml \
      && test -f infra/ansible/roles/sport-stack/tasks/run_migrations.yml \
      && test -f infra/ansible/roles/sport-stack/tasks/smoke_probe.yml \
      && test -f infra/ansible/roles/sport-stack/templates/sport-stack.service.j2 \
      && test -f infra/ansible/roles/sport-stack/templates/Caddyfile.j2 \
      && grep -q "/usr/bin/docker compose" infra/ansible/roles/sport-stack/templates/sport-stack.service.j2 \
      && (grep -E '^[^#]*ExecStart=/usr/bin/docker-compose' infra/ansible/roles/sport-stack/templates/sport-stack.service.j2 | wc -l | grep -qE '^[[:space:]]*0$') \
      && grep -q "Type=simple" infra/ansible/roles/sport-stack/templates/sport-stack.service.j2 \
      && (grep -E '^[^#]*ExecStart=.*up -d' infra/ansible/roles/sport-stack/templates/sport-stack.service.j2 | wc -l | grep -qE '^[[:space:]]*0$') \
      && grep -q "delegate_to: localhost" infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml \
      && grep -c "no_log: true" infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml | awk '{exit ($1 < 3)}' \
      && (grep -E 'expanduser' infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml | wc -l | grep -qE '^[[:space:]]*0$') \
      && grep -q "lookup('env', 'HOME')" infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml \
      && grep -q "{{ sport_repo_url }}" infra/ansible/roles/sport-stack/tasks/main.yml \
      && (grep -E 'github\.com/<user>' infra/ansible/roles/sport-stack/tasks/main.yml | wc -l | grep -qE '^[[:space:]]*0$') \
      && grep -q "{{ caddy_host }}" infra/ansible/roles/sport-stack/templates/Caddyfile.j2 \
      && grep -q "{{ caddy_acme_email }}" infra/ansible/roles/sport-stack/templates/Caddyfile.j2 \
      && (grep -E '148-253-214-156' infra/ansible/roles/sport-stack/templates/Caddyfile.j2 | wc -l | grep -qE '^[[:space:]]*0$') \
      && cd infra/ansible && ansible-playbook --syntax-check -i inventory/staging --tags=deploy site.yml
    </automated>
  </verify>
  <acceptance_criteria>
    - 8 файлов созданы / overwritten (defaults, handlers, 4 task files, 2 templates)
    - `sport-stack.service.j2` использует `/usr/bin/docker compose` (space) НЕ dash; Type=simple; foreground `up` (без -d)
    - `Caddyfile.j2` содержит обе Jinja2 переменные ({{ caddy_host }} + {{ caddy_acme_email }}); НЕТ hardcoded `148-253-214-156`
    - `decrypt_sops.yml` использует `delegate_to: localhost` + `become: false` + минимум 3 `no_log: true` (tempfile, decrypt shell, copy)
    - `decrypt_sops.yml` SOPS_AGE_KEY_FILE использует `lookup('env', 'HOME') + '/.config/sops/age/keys.txt'` — НЕ `expanduser` (W3 fix)
    - `tasks/main.yml` git clone task использует `{{ sport_repo_url }}` — НЕ hardcoded `github.com/<user>/sport.git` (W2 fix)
    - `ansible-playbook --syntax-check --tags=deploy site.yml -i inventory/staging` exit 0
  </acceptance_criteria>
  <done>
    sport-stack role complete и overwrites Plan 03-02 stub. Готов для live apply (Task 2) на staging-app-01.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Live apply на staging-app-01 + smoke probe green + <60min timing measurement (B3: split automated vs manual verify)</name>
  <files>
    .planning/phases/03-infrastructure-as-code/03-03a-timing.log
  </files>
  <read_first>
    .planning/phases/03-infrastructure-as-code/03-RESEARCH.md (lines 654-675 — Pitfall 6 timing breakdown),
    .planning/phases/03-infrastructure-as-code/03-VALIDATION.md (lines 65-69 — INFRA-07 manual-only classification),
    .planning/phases/03-infrastructure-as-code/03-02-SUMMARY.md (если exists — bootstrap pass timing на staging для baseline; иначе берется из current task)
  </read_first>
  <action>
    Apply sport-stack role на staging-app-01 (создан в Wave 1, common+docker base в Wave 2). Измерить wall-clock для INFRA-07 — verdict derived programmatically от `/usr/bin/time -p` output через awk (B3 fix — НЕ executor-written PASS string).

    1. **Pre-flight checks** (включая W3 — SOPS_AGE_KEY_FILE доступен):
       ```
       # Verify Wave 1 + Wave 2 outputs:
       cd infra/terraform && ./tf-wrap.sh output -raw staging_app_ipv4   # должен показать IP
       cd infra/ansible && ansible -i inventory/staging app_servers -m ping -u deploy   # SUCCESS

       # W3: Verify SOPS_AGE_KEY_FILE доступен:
       test -f "${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}" || { echo "ERR: age key not found at ${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"; exit 1; }
       sops -d .secrets/staging/shared.yaml > /dev/null   # exit 0 confirms decrypt path

       # Verify staging caddy_host правильно forms valid sslip.io hostname:
       grep caddy_host infra/ansible/group_vars/staging.yml
       # пример: caddy_host: "195-201-32-100.sslip.io" (IP с dashes вместо точек)
       ```

       Если staging caddy_host пока placeholder REPLACE_FROM_TF_OUTPUT — обновить:
       ```
       STAGING_IP=$(cd infra/terraform && ./tf-wrap.sh output -raw staging_app_ipv4)
       STAGING_SSLIP=$(echo "$STAGING_IP" | tr '.' '-').sslip.io
       sed -i.bak "s|caddy_host:.*|caddy_host: \"$STAGING_SSLIP\"|" infra/ansible/group_vars/staging.yml
       ```

       Same для caddy_acme_email — если placeholder, paste real value (ops email того кто owns Let's Encrypt account).

    2. **Verify `.secrets/staging/*.yaml` имеют реальные значения** (Phase 2 inheritance):
       ```
       sops -d .secrets/staging/shared.yaml | head -5   # должен показать настоящий POSTGRES_PASSWORD, JWT_SECRET и т.д.
       sops -d .secrets/staging/mapbox.yaml | head -5
       sops -d .secrets/staging/oauth.yaml | head -5
       ```
       Если staging secrets — placeholders (REPLACE_ME), сначала сделать `sops .secrets/staging/<file>.yaml` и заполнить. Без реальных secrets compose `${VAR:?need ...}` fail-fast'нет.

    3. **Live apply с timing measurement** (B3: raw timing only, no executor-written verdict):
       ```
       TIMING_LOG=.planning/phases/03-infrastructure-as-code/03-03a-timing.log
       echo "=== sport-stack first deploy on staging-app-01 ===" > "$TIMING_LOG"
       date -u >> "$TIMING_LOG"

       /usr/bin/time -p ansible-playbook -i inventory/staging --tags=deploy site.yml 2>&1 | tee -a "$TIMING_LOG"

       date -u >> "$TIMING_LOG"
       echo "=== end ===" >> "$TIMING_LOG"
       ```

       **B3 fix:** НЕТ executor-written "PASS"/"FAIL" line после этого блока. Verdict выводится в `<manual>` verify через awk parser, который читает `^real` line из `/usr/bin/time -p` output. Это устраняет circular self-attestation pattern.

       Ожидаемые phases (per RESEARCH Pitfall 6 breakdown):
       - Git clone /opt/sport (10-30s)
       - Template render Caddyfile + sport-stack.service (<5s)
       - SOPS decrypt + copy (<5s)
       - Docker image pull cold (~5-10 min для 8 services первый раз)
       - Migrations run (30-60s, 19 migrations)
       - systemctl start + Caddy ACME issue (10-30s)
       - wait_for 443 + smoke probe (10-30s)
       - **Total cold: 15-25 min** (well under 60min target)

    4. **Verify live state на staging** (классифицировано manual per VALIDATION L67 — INFRA-07 timing manual-only):
       ```
       ssh deploy@$(cd infra/terraform && ./tf-wrap.sh output -raw staging_app_ipv4) << 'EOF'
         sudo systemctl is-active sport-stack    # expect: active
         sudo systemctl is-enabled sport-stack   # expect: enabled
         docker compose -f /opt/sport/services/backend/docker-compose.prod.yml ps --format json | jq -r '.[] | .Name + " " + .State' | sort
         # Expect 12-13 lines: postgres up, nats up, minio up, redis up, identity up, activity-sync up, social-graph up, messaging up, feed up, media up, notifications up, realtime-gw up, gateway (caddy) up; migrations exited (одноразовый)
         stat -c '%a %U:%G' /run/sport.env   # expect: 600 deploy:deploy
       EOF
       ```

    5. **Smoke probe local + remote-curl assertions:**
       ```
       # local smoke (через delegate_to: localhost — уже выполнен в Task 1 role main.yml)
       BASE_URL="https://$(grep caddy_host infra/ansible/group_vars/staging.yml | awk -F'"' '{print $2}')"
       python3 services/backend/scripts/smoke_otp.py   # exit 0

       # raw curl health probe:
       curl -sI "$BASE_URL/identity/healthz" | head -1   # expect: HTTP/2 200 (или 404 если health endpoint не реализован — тогда любой 2xx/3xx OK как proof что Caddy is serving)
       ```

    6. **Idempotency proof — 2nd run без изменений:**
       ```
       ansible-playbook -i inventory/staging --tags=deploy site.yml 2>&1 | tail -10
       # PLAY RECAP должен показать changed=0 для большинства tasks (за исключением decrypt_sops которые changed=false по design + migrations которые conditional)
       ```

    7. **(B3 fix) Log raw timing only — verdict derived in `<manual>` verify via awk:**
       ```
       echo "" >> "$TIMING_LOG"
       echo "=== raw timing for INFRA-07 verdict derivation ===" >> "$TIMING_LOG"
       # /usr/bin/time -p output уже в TIMING_LOG (через tee выше — line "^real <seconds>")
       # `<manual>` verify ниже использует awk на этой строке для programmatic PASS/FAIL.
       # NO executor-written PASS/FAIL string — это circular self-attestation.
       ```
  </action>
  <verify>
    <automated>
      <!-- B3 fix: automated block НЕ зависит от live VPS reachability;
           covers template content + syntax-check + check-mode dry-run only.
           Live deploy / timing / smoke moved to <manual> block. -->
      test -f infra/ansible/roles/sport-stack/templates/sport-stack.service.j2 \
      && grep -q "/usr/bin/docker compose" infra/ansible/roles/sport-stack/templates/sport-stack.service.j2 \
      && grep -q "Type=simple" infra/ansible/roles/sport-stack/templates/sport-stack.service.j2 \
      && grep -q "delegate_to: localhost" infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml \
      && cd infra/ansible \
      && ansible-playbook --syntax-check -i inventory/staging --tags=sport-stack site.yml \
      && ansible-playbook --check --diff -i inventory/staging --tags=sport-stack site.yml 2>&1 | grep -qE "PLAY RECAP|ok="
    </automated>
    <manual>
      <!-- B3 fix: classified manual per VALIDATION L67 (INFRA-07 timing is manual-only).
           Verdict derived programmatically via awk on /usr/bin/time -p output —
           NOT a self-written PASS string. -->

      # Step A: live deploy with raw wall-clock capture
      cd $(git rev-parse --show-toplevel)
      TIMING_LOG=.planning/phases/03-infrastructure-as-code/03-03a-timing.log
      cd infra/ansible
      /usr/bin/time -p ansible-playbook -i inventory/staging --tags=deploy site.yml 2>&1 | tee "$TIMING_LOG"

      # Step B: programmatic verdict derivation (B3 fix — NO executor-written PASS string)
      # `time -p` writes 'real <seconds>' to stderr (captured via tee above).
      # awk parses real-time seconds → checks if < 3600 (60 min INFRA-07 target).
      awk '/^real/ { secs = $2 + 0; if (secs > 3600) { print "FAIL: " secs "s exceeds 60min INFRA-07 target"; exit 1 } else { print "PASS: " secs "s within 60min INFRA-07 target" } }' "$TIMING_LOG"

      # Step C: live smoke probe (requires staging VPS reachable)
      cd $(git rev-parse --show-toplevel)
      STAGING_IP=$(cd infra/terraform && ./tf-wrap.sh output -raw staging_app_ipv4)
      CADDY_HOST=$(grep caddy_host infra/ansible/group_vars/staging.yml | awk -F'"' '{print $2}')
      ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 deploy@"$STAGING_IP" "sudo systemctl is-active sport-stack" | grep -q "^active$"
      ssh -o StrictHostKeyChecking=no deploy@"$STAGING_IP" "stat -c '%a %U' /run/sport.env" | grep -q "^600 deploy$"
      curl -sI --max-time 10 "https://$CADDY_HOST/" | head -1 | grep -qE "HTTP.*[23][0-9][0-9]"
      BASE_URL="https://$CADDY_HOST" python3 services/backend/scripts/smoke_otp.py
    </manual>
  </verify>
  <acceptance_criteria>
    - **`<automated>` block (no live VPS required):** template content greps OK, `ansible-playbook --syntax-check ... --tags=sport-stack` exit 0, `ansible-playbook --check --diff ... --tags=sport-stack` exit 0 (check-mode skips action modules, works without staging reachable). B3 fix achieved.
    - **`<manual>` block:** `systemctl is-active sport-stack` = `active` на staging-app-01; `docker compose ps` показывает 12 + 1 (caddy) running containers; `/run/sport.env` существует с mode 0600 + owner deploy; `https://<staging-caddy-host>/` отвечает HTTP 2xx/3xx; `smoke_otp.py` exit 0; awk parser на `/usr/bin/time -p` real-line выводит "PASS: <secs>s" (НЕ executor-written) — verdict derived programmatically (B3 fix).
    - Wall-clock timing recorded в `.planning/phases/03-infrastructure-as-code/03-03a-timing.log` — raw `/usr/bin/time -p` output, no synthetic PASS/FAIL line.
    - 2nd-run idempotency: PLAY RECAP `changed=0` за исключением conditional plays
  </acceptance_criteria>
  <done>
    INFRA-01 fully closed (все 8 Go services + 4 stateful + caddy под systemd umbrella supervision). INFRA-07 measured + recorded — verdict derived programmatically (B3 fix), передаётся в Plan 03-04 deploy.md §9. Staging environment fully deployed via IaC.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dev workstation → staging-app-01 SSH (Ansible control path) | deploy user, SSH key auth, port 22 from dev IPs only (Wave 1 firewall) |
| dev workstation localhost → SOPS decrypt | age key (`~/.config/sops/age/keys.txt`) used ТОЛЬКО локально per CONTEXT D-12 |
| Plaintext sport.env transit dev → staging-app-01 | Через SSH-encrypted Ansible `copy` channel; never lands on disk on controller (tempfile) или remote (tmpfs `/run`) |
| Internet → staging Caddy 443 | Open public per Wave 1 firewall + Phase 1 API contract |
| Caddy → internal services | Within Docker bridge network, не exposed |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-03-12 | Information Disclosure | Plaintext `/run/sport.env` persists на диске после crash/abort | HIGH | mitigate | `/run` = tmpfs (RAM-only — Ubuntu default `/run` mount); даже без shred, reboot wipes. Defense-in-depth: `ExecStopPost=/bin/bash -c 'shred -u /run/sport.env'` в systemd unit; `always` block в decrypt_sops.yml shred'ит controller tempfile даже при failure. |
| T-03-13 | Information Disclosure | SOPS decrypt run на remote VPS (нарушит D-12 master key isolation) | HIGH | mitigate | `delegate_to: localhost` + `become: false` в decrypt_sops.yml; SOPS binary НЕ устанавливается через docker/common role (verify в Wave 2 — sops НЕ в common_packages); только age package для interop (но age key не передаётся на remote — `lookup('env', 'SOPS_AGE_KEY_FILE')` evaluates на controller). |
| T-03-14 | Information Disclosure | Plaintext secrets leak в `~/.ansible.log` или CI artifact | HIGH | mitigate | `no_log: true` на 3 tasks (tempfile register, decrypt shell, copy). Verify через `ansible-playbook -vvv --tags=deploy` test run + `grep -E "POSTGRES_PASSWORD|JWT_SECRET" /tmp/ansible-sport.log` exit 1 (no match). |
| T-03-15 | Tampering | systemd unit ExecStart с legacy `docker-compose` (dash) → service fails startup → silently broken stack | MEDIUM | mitigate | Template `/usr/bin/docker compose` (space, plugin form). Wave 2 docker role verify task `docker compose version` запускается; если fails — Wave 2 не green. Plus VALIDATION manual: после Task 2 `systemctl status sport-stack` показывает `active`. |
| T-03-16 | Denial of Service | Caddy apt-install на host → port 443 conflict с caddy:2.8-alpine container → broken HTTPS | MEDIUM | mitigate | RESEARCH correction D-16: role template-only (renders Caddyfile, restart container handler). Verify в Task 1 acceptance: НЕ существует `roles/caddy/tasks/main.yml` с `apt: name=caddy`. |
| T-03-17 | Repudiation | Migration runs parallel с running stack — data corruption риск | MEDIUM | mitigate | run_migrations.yml: `systemd: stopped` ДО `docker compose run --rm migrations`, потом systemd: started в main.yml. Sequential ordering guaranteed. |

**block_on:** high
**HIGH-severity threats:** T-03-12, T-03-13, T-03-14 — все mitigated.
</threat_model>

<verification>
- All 8 sport-stack role files exist (overwrites Plan 03-02 stubs)
- `ansible-playbook --syntax-check --tags=deploy site.yml -i inventory/staging` exit 0
- Caddyfile.j2 содержит обе Jinja2 переменные, НЕ содержит hardcoded `148-253-214-156`
- sport-stack.service.j2 использует `docker compose` (space), Type=simple, foreground up
- decrypt_sops.yml: `delegate_to: localhost` + `become: false` + `no_log: true` × 3
- decrypt_sops.yml SOPS_AGE_KEY_FILE: `lookup('env', 'HOME') + '/.config/sops/age/keys.txt'` — no `expanduser` (W3 fix)
- tasks/main.yml git clone: `{{ sport_repo_url }}` — no hardcoded URL (W2 fix)
- run_migrations.yml: stop sport-stack ДО `docker compose run --rm migrations` (sequential ordering)
- Live на staging (manual verify): `systemctl is-active sport-stack` = active; `docker compose ps` ≥ 12 containers running; `/run/sport.env` mode 0600 owner deploy; smoke_otp.py exit 0
- Timing log: raw `/usr/bin/time -p` output; awk parser в `<manual>` block выводит PASS/FAIL programmatically (B3 fix)
- Idempotency: 2nd run `changed=0` за исключением conditional migration tasks
</verification>

<success_criteria>
- **INFRA-01 fully closed:** `infra/ansible/` idempotently install + supervise Caddy (template-only render + container restart handler) + Postgres+TimescaleDB + Redis + NATS + MinIO + 8 Go service systemd units (через single umbrella `sport-stack.service` per CONTEXT D-04 — спирт ROADMAP success criterion #1 met, literal "6 → 8" wording fix отложен в Plan 03-04).
- **INFRA-07 measured:** Wall-clock fresh-deploy на staging-app-01 < 60min recorded в timing.log; verdict от awk-parser (B3 fix — НЕ executor self-attested). Cold deploy ~15-25min realistic per RESEARCH Pitfall 6.
- staging-app-01 fully operational: Caddy issuing ACME cert, smoke_otp.py green.
- sport-stack role идемпотентен — 2nd run `changed=0`.
- B3 / W2 / W3 checker-fix acceptance: verify split into automated (no live VPS) + manual (live + programmatic awk); git clone uses sport_repo_url var; SOPS_AGE_KEY_FILE uses explicit HOME concat.
</success_criteria>

<output>
After completion, create `.planning/phases/03-infrastructure-as-code/03-03a-SUMMARY.md` per template.

**Required SUMMARY content:**
- Timing log excerpt (cold + incremental) — feeds в Plan 03-04 deploy.md §9; verdict из awk-parser (B3)
- `docker compose ps` snapshot подтверждающий 12+ containers running на staging
- Smoke probe output (smoke_otp.py exit 0 evidence)
- Idempotency proof (2nd-run PLAY RECAP)
- Decisions cited: D-04 (umbrella systemd), D-12 (SOPS delegate_to:localhost), D-13 (SOPS_AGE_KEY_FILE env requirement), D-14 (migration sequencing), D-15 (/run tmpfs + shred)
- RESEARCH corrections cited explicitly: D-04 corrected (`docker compose` space form used), D-16 corrected (Caddy template-only, NOT apt-installed — port 443 conflict avoided)
- B3 closure: `<automated>` independent of live VPS; `<manual>` derives verdict via awk on `/usr/bin/time -p` (no self-written PASS string)
- W2 closure: git clone task uses `{{ sport_repo_url }}` (verified via grep)
- W3 closure: SOPS_AGE_KEY_FILE uses `lookup('env', 'HOME') + '/.config/sops/age/keys.txt'` (no expanduser)
- Carry-forward: REPLACE_ME placeholder check для staging SOPS secrets (если найдены — flag для Plan 03-04 prod cutover preparation)
- Phase 5 readiness: sentry-01 НЕ touched в этом плане; Wave 3b owns sentry prep — references that plan
</output>
</output>
