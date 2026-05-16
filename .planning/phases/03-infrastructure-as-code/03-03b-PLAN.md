---
plan_id: 03-03b
phase: 3
phase_slug: infrastructure-as-code
wave: 3
depends_on: [03-02]
files_modified:
  - infra/ansible/roles/sentry-prep/defaults/main.yml
  - infra/ansible/roles/sentry-prep/tasks/main.yml
  - infra/ansible/roles/sentry-prep/handlers/main.yml
  - infra/ansible/roles/sentry-prep/templates/Caddyfile.sentry.j2
  - infra/ansible/roles/sentry-prep/templates/sentry-gateway.service.j2
requirements: [INFRA-06]
autonomous: true
estimated_duration: "1.5 h"

must_haves:
  truths:
    - "sentry-01 — отдельный Hetzner VPS (cx42 per RESEARCH correction D-11 — Sentry self-hosted 2026 минимум 16 GB RAM), provisioning'нут Wave 1 (Plan 03-01); этот план только prep'ит VPS — НЕ устанавливает Sentry"
    - "Sentry self-hosted install — Phase 5 ownership (OBS-01); Wave 3b lays the base: common + docker (наследуется от Wave 2 sites.yml `hosts: app_servers:sentry`) + sentry-prep role которая seed'ит Caddy"
    - "Sentry VPS получает свой собственный Caddy через отдельный docker compose (минимальный stub), НЕ через main sport-stack compose — изоляция: если app stack падает, Sentry остаётся доступен per CONTEXT D-09 + INFRA-06"
    - "Sentry Caddy slot serve'ит placeholder `respond \"Sentry pending Phase 5\"` на 443 — proves ACME issuance работает; Phase 5 заменяет на real Sentry reverse_proxy"
    - "Sentry-01 DNS = `sentry.<sentry-ip>.sslip.io` per CONTEXT D-18 (отдельный sslip subdomain от app — physical isolation in DNS)"
    - "Hetzner firewall на sentry-01 — отдельный hcloud_firewall.sentry (Wave 1) с 443 public + 22 dev_admin_ips only; никаких 4222/5432/9000"
    - "[informational] D-10 (Phase 3 = empty Sentry-ready VPS; Phase 5 = Sentry stack install) — preserved в этом плане"
    - "[informational] D-11 corrected: server_type=cx42 для sentry-01 (НЕ cx32 как в первоначальной CONTEXT)"
  behaviors:
    - "После Task 1: `ansible-playbook --syntax-check -i inventory/sentry --tags=sentry site.yml` exit 0"
    - "После Task 2 (live apply на sentry-01): `systemctl is-active sentry-gateway` показывает 'active'; `curl -sI https://sentry.<sentry-ip>.sslip.io/` returns HTTP 200 с body 'Sentry pending Phase 5'"
    - "После Task 2: Sentry-01 reachable separately от app VPS — `ping -c1 <sentry-ipv4>` works но `<sentry-ipv4>` НЕ совпадает с prod/staging app IPs (visible изоляция VPS)"
    - "Idempotent: повторный `ansible-playbook -i inventory/sentry --tags=sentry site.yml` показывает `changed=0`"
  forbidden:
    - "НЕ устанавливать Sentry в этом плане — Phase 5 ownership (OBS-01)"
    - "НЕ deploy'ить sport-stack systemd unit на sentry-01 — Sentry должен быть в blast-radius изоляции"
    - "НЕ shared'ить compose stack между sentry-01 и app servers — отдельные docker compose files в разных директориях"
    - "НЕ apt-install Caddy на sentry-01 — тот же port 443 conflict pattern что и Wave 3a (CADDY должен быть containerized для consistency)"
    - "НЕ открывать 4222/5432/6379/9000 на sentry-01 firewall — отдельный firewall hcloud_firewall.sentry уже это enforce'ит (Wave 1)"
---

<objective>
## Цель плана 03-03b

Подготовить sentry-01 VPS (provisioning'нут в Wave 1 как cx42 per RESEARCH correction) к Phase 5 Sentry install. Реализовать `sentry-prep` Ansible role: получает common + docker (от Wave 2 через site.yml `hosts: app_servers:sentry`) + добавляет минимальный `sentry-gateway` docker compose с Caddy serving placeholder на `sentry.<sentry-ip>.sslip.io` (proves ACME flow + DNS routing — Phase 5 заменяет placeholder на real Sentry).

**Purpose:** Wave 3b закрывает INFRA-06 (separate VPS provisioning + separate DNS + separate ACME cert для Sentry — изоляция per user redline). Параллельно с Wave 3a (sport-stack на app VPS) — без shared file conflicts (different role directory + different inventory group).

**Output:**
- `infra/ansible/roles/sentry-prep/` — role файлы (tasks + templates + handlers + defaults)
- На sentry-01: containerized Caddy listening на 443, ACME cert issued, placeholder response
- Phase 5 разблокирован: может deploy Sentry stack без infra concerns
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
@.planning/phases/03-infrastructure-as-code/03-01-PLAN.md
@.planning/phases/03-infrastructure-as-code/03-02-PLAN.md
@services/backend/gateway/Caddyfile.prod

<interfaces>
<!-- Wave 1 (Plan 03-01) provisioning'ит sentry-01 — Wave 3b cumulates на этом -->

From infra/terraform/servers.tf (created in Plan 03-01 Task 2):
- hcloud_server.sentry_01 (server_type = "cx42", image = "ubuntu-24.04", firewall_ids = [hcloud_firewall.sentry.id])
- output sentry_ipv4 = hcloud_server.sentry_01.ipv4_address

From infra/terraform/firewall.tf (created in Plan 03-01 Task 2):
- hcloud_firewall.sentry: 443/TCP from 0.0.0.0/0 + 22/TCP from var.dev_admin_ips

From infra/ansible/inventory/sentry/hosts.yml (created in Plan 03-02 Task 1):
- sentry-01 ansible_host = <sentry-ipv4 from TF output>, ansible_user = deploy

From infra/ansible/group_vars/sentry.yml (created in Plan 03-02 Task 1):
- env_name: sentry
- caddy_host: "sentry.REPLACE_FROM_TF_OUTPUT_sentry_ipv4-with-dashes.sslip.io"   # пример: sentry.49-12-100-50.sslip.io
- caddy_acme_email: (наследуется от all.yml)

From infra/ansible/site.yml (created in Plan 03-02 Task 1):
- Play 1 `hosts: app_servers:sentry` (роли common + docker) — sentry-01 получает base от Wave 2 sequence
- Play 3 `hosts: sentry` (role sentry-prep) — этот план

From RESEARCH.md (D-11 correction):
- Sentry self-hosted 2026 minimum requirements: 16 GB RAM + 16 GB swap + 4 CPU cores (develop.sentry.dev)
- cx32 = 8 GB → OOM-killed → corrected to cx42 (8 vCPU / 16 GB / 160 GB SSD) in Wave 1
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: sentry-prep role — defaults, tasks, handlers, Caddyfile template для sentry-only stub stack</name>
  <files>
    infra/ansible/roles/sentry-prep/defaults/main.yml,
    infra/ansible/roles/sentry-prep/tasks/main.yml,
    infra/ansible/roles/sentry-prep/handlers/main.yml,
    infra/ansible/roles/sentry-prep/templates/Caddyfile.sentry.j2,
    infra/ansible/roles/sentry-prep/templates/sentry-gateway.service.j2
  </files>
  <read_first>
    .planning/phases/03-infrastructure-as-code/03-CONTEXT.md (D-09, D-10, D-11 — Sentry isolation rationale),
    .planning/phases/03-infrastructure-as-code/03-RESEARCH.md (lines 602-612 — Pitfall 1 Sentry sizing; lines 322-376 — Pattern 2 SOPS если нужно для Phase 5; нам сейчас не нужно),
    .planning/phases/03-infrastructure-as-code/03-02-PLAN.md (site.yml structure — sentry-prep role будет triggered'ьно через `hosts: sentry`),
    .planning/phases/03-infrastructure-as-code/03-03a-PLAN.md (sport-stack.service.j2 pattern — sentry-gateway.service.j2 — параллельный аналог),
    services/backend/gateway/Caddyfile.prod (для понимания existing Caddy directives pattern)
  </read_first>
  <action>
    1. `infra/ansible/roles/sentry-prep/defaults/main.yml`:
       ```yaml
       ---
       sentry_install_dir: /opt/sentry
       sentry_compose_file: "{{ sentry_install_dir }}/docker-compose.sentry.yml"
       sentry_caddy_target: "{{ sentry_install_dir }}/Caddyfile"
       sentry_gateway_service: sentry-gateway.service
       # Phase 5 OWNERSHIP: Sentry stack установка (getsentry/self-hosted) идёт в обновление этого compose.
       # v1.0 Phase 3 закрывает: только Caddy + placeholder respond для ACME bootstrap.
       ```

    2. `infra/ansible/roles/sentry-prep/templates/Caddyfile.sentry.j2` — минимальный stub:
       ```caddy
       # /opt/sentry/Caddyfile — Phase 3 placeholder; Phase 5 заменяет на real Sentry reverse_proxy
       {
           email {{ caddy_acme_email }}
       }

       {{ caddy_host }} {
           # Placeholder response — proves ACME cert issuance + DNS routing работают
           # до того как Phase 5 deploys Sentry self-hosted stack за этим хостом.
           respond "Sentry pending Phase 5 deploy. See .planning/ROADMAP.md §Phase 5 (OBS-01)." 200

           # Health endpoint для smoke probe из Task 2 acceptance criteria
           handle /healthz {
               respond "ok" 200
           }

           # Logging — на будущее когда Phase 5 wires Sentry
           log {
               output stdout
               format console
           }
       }
       ```

       **Note:** Не использует Caddyfile.prod (175 строк) verbatim — этот VPS imho не имеет identity/activity-sync/etc. handle blocks. Минимальный stub правильный shape.

    3. `infra/ansible/roles/sentry-prep/templates/sentry-gateway.service.j2` — параллельный аналог sport-stack.service.j2 для sentry-only stack:
       ```ini
       # /etc/systemd/system/sentry-gateway.service — Phase 3 Wave 3b umbrella для sentry-01
       [Unit]
       Description=Sentry VPS Caddy gateway (Phase 3 placeholder; Phase 5 wraps real Sentry)
       Requires=docker.service
       After=docker.service network-online.target
       StartLimitIntervalSec=300
       StartLimitBurst=5

       [Service]
       Type=simple
       WorkingDirectory={{ sentry_install_dir }}
       ExecStartPre=/usr/bin/docker compose -f docker-compose.sentry.yml pull
       ExecStart=/usr/bin/docker compose -f docker-compose.sentry.yml up
       ExecStop=/usr/bin/docker compose -f docker-compose.sentry.yml down
       Restart=on-failure
       RestartSec=10s
       TimeoutStartSec=300
       TimeoutStopSec=60

       [Install]
       WantedBy=multi-user.target
       ```
       Note: тот же `docker compose` space-form + Type=simple + foreground up — same hardening как sport-stack.service.

    4. `infra/ansible/roles/sentry-prep/tasks/main.yml`:
       ```yaml
       ---
       - name: Ensure /opt/sentry directory с deploy ownership
         ansible.builtin.file:
           path: "{{ sentry_install_dir }}"
           state: directory
           owner: "{{ deploy_user }}"
           group: "{{ deploy_group }}"
           mode: '0755'
         tags: [sentry]

       - name: Render minimal docker-compose.sentry.yml (только Caddy для Phase 3 placeholder)
         ansible.builtin.copy:
           dest: "{{ sentry_compose_file }}"
           owner: "{{ deploy_user }}"
           group: "{{ deploy_group }}"
           mode: '0644'
           content: |
             # /opt/sentry/docker-compose.sentry.yml — Phase 3 placeholder.
             # Phase 5 (OBS-01) добавит сюда services: web/worker/postgres/clickhouse/kafka/snuba.
             services:
               gateway:
                 image: caddy:2.8-alpine
                 container_name: sentry_gateway
                 volumes:
                   - ./Caddyfile:/etc/caddy/Caddyfile:ro
                   - caddy_data:/data
                   - caddy_config:/config
                 ports:
                   - "80:80"
                   - "443:443"
                 environment:
                   CADDY_ACME_EMAIL: "{{ caddy_acme_email }}"
                 restart: unless-stopped
             volumes:
               caddy_data:
               caddy_config:
         tags: [sentry]

       - name: Render Caddyfile.sentry.j2 → /opt/sentry/Caddyfile
         ansible.builtin.template:
           src: Caddyfile.sentry.j2
           dest: "{{ sentry_caddy_target }}"
           owner: "{{ deploy_user }}"
           group: "{{ deploy_group }}"
           mode: '0644'
         notify: restart sentry-gateway
         tags: [sentry]

       - name: Render sentry-gateway.service systemd unit
         ansible.builtin.template:
           src: sentry-gateway.service.j2
           dest: /etc/systemd/system/{{ sentry_gateway_service }}
           owner: root
           group: root
           mode: '0644'
         notify:
           - reload systemd
           - restart sentry-gateway
         tags: [sentry]

       - name: Enable + start sentry-gateway systemd unit
         ansible.builtin.systemd:
           name: "{{ sentry_gateway_service }}"
           state: started
           enabled: true
           daemon_reload: true
         tags: [sentry]

       - name: Wait for Caddy port 443 на sentry-01 (max 60s)
         ansible.builtin.wait_for:
           host: "{{ ansible_host }}"
           port: 443
           timeout: 60
           delay: 5
         delegate_to: localhost
         become: false
         tags: [sentry]

       - name: Verify Caddy responding с placeholder text
         delegate_to: localhost
         become: false
         ansible.builtin.uri:
           url: "https://{{ caddy_host }}/healthz"
           status_code: 200
           return_content: true
         register: sentry_health
         retries: 6
         delay: 10
         until: sentry_health is succeeded
         tags: [sentry]
       ```

    5. `infra/ansible/roles/sentry-prep/handlers/main.yml`:
       ```yaml
       ---
       - name: reload systemd
         ansible.builtin.systemd:
           daemon_reload: true

       - name: restart sentry-gateway
         ansible.builtin.systemd:
           name: "{{ sentry_gateway_service }}"
           state: restarted
       ```

    **Critical:** НЕТ apt-install Caddy на sentry-01 — Caddy остаётся `caddy:2.8-alpine` контейнером (consistent с app stack pattern из Wave 3a + RESEARCH correction D-16).
  </action>
  <verify>
    <automated>
      test -f infra/ansible/roles/sentry-prep/defaults/main.yml \
      && test -f infra/ansible/roles/sentry-prep/tasks/main.yml \
      && test -f infra/ansible/roles/sentry-prep/handlers/main.yml \
      && test -f infra/ansible/roles/sentry-prep/templates/Caddyfile.sentry.j2 \
      && test -f infra/ansible/roles/sentry-prep/templates/sentry-gateway.service.j2 \
      && grep -q "/usr/bin/docker compose" infra/ansible/roles/sentry-prep/templates/sentry-gateway.service.j2 \
      && grep -q "Type=simple" infra/ansible/roles/sentry-prep/templates/sentry-gateway.service.j2 \
      && grep -q "{{ caddy_host }}" infra/ansible/roles/sentry-prep/templates/Caddyfile.sentry.j2 \
      && grep -q "Sentry pending Phase 5" infra/ansible/roles/sentry-prep/templates/Caddyfile.sentry.j2 \
      && grep -q "caddy:2.8-alpine" infra/ansible/roles/sentry-prep/tasks/main.yml \
      && (grep -E '^[^#]*apt:' infra/ansible/roles/sentry-prep/tasks/main.yml | grep -i caddy | wc -l | grep -qE '^[[:space:]]*0$') \
      && cd infra/ansible && ansible-playbook --syntax-check -i inventory/sentry --tags=sentry site.yml
    </automated>
  </verify>
  <acceptance_criteria>
    - 5 файлов созданы (defaults, tasks/main, handlers/main, 2 templates)
    - `sentry-gateway.service.j2` использует `docker compose` space form + Type=simple
    - `Caddyfile.sentry.j2` содержит {{ caddy_host }} + {{ caddy_acme_email }} + "Sentry pending Phase 5" placeholder + /healthz handler
    - НЕТ apt-install Caddy в tasks/main.yml (verify via grep `apt:` + `caddy`)
    - `ansible-playbook --syntax-check --tags=sentry -i inventory/sentry site.yml` exit 0
  </acceptance_criteria>
  <done>
    sentry-prep role complete. Готов для live apply на sentry-01 в Task 2.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Live apply на sentry-01 + verify Caddy ACME issued + health probe green</name>
  <files />
  <read_first>
    .planning/phases/03-infrastructure-as-code/03-RESEARCH.md (lines 654-675 — Pitfall 6 timing breakdown для базовой ACME issuance оценки),
    .planning/phases/03-infrastructure-as-code/03-VALIDATION.md (line 44 — INFRA-06 verify cmd)
  </read_first>
  <action>
    1. **Pre-flight checks:**
       ```
       # Verify Wave 1 provisioning'нул sentry-01:
       cd infra/terraform && ./tf-wrap.sh output -raw sentry_ipv4   # должен показать IP
       cd infra/ansible && ansible -i inventory/sentry sentry-01 -m ping -u deploy   # SUCCESS
       # Если deploy user не существует на sentry-01 (fresh VPS) — выполнить Wave 2 bootstrap pass:
       #   ansible-playbook -i inventory/sentry --tags=common,docker --user root site.yml
       ```

       Обновить `infra/ansible/group_vars/sentry.yml` real IP-based caddy_host:
       ```
       SENTRY_IP=$(cd infra/terraform && ./tf-wrap.sh output -raw sentry_ipv4)
       SENTRY_SSLIP="sentry.$(echo "$SENTRY_IP" | tr '.' '-').sslip.io"
       sed -i.bak "s|caddy_host:.*|caddy_host: \"$SENTRY_SSLIP\"|" infra/ansible/group_vars/sentry.yml
       ```

    2. **Apply common + docker на sentry-01 если не сделано** (Wave 2 site.yml hosts: app_servers:sentry уже cover, но если Wave 2 был запущен только для staging):
       ```
       ansible-playbook -i inventory/sentry --tags=common,docker site.yml
       # Если deploy user уже существует — should be idempotent (changed=0)
       # Если fresh — нужен bootstrap pass с --user root
       ```

    3. **Apply sentry-prep на sentry-01:**
       ```
       ansible-playbook -i inventory/sentry --tags=sentry site.yml 2>&1 | tee /tmp/sentry-deploy.log
       ```

    4. **Verify live state:**
       ```
       SENTRY_IP=$(cd infra/terraform && ./tf-wrap.sh output -raw sentry_ipv4)
       SENTRY_HOST=$(grep caddy_host infra/ansible/group_vars/sentry.yml | awk -F'"' '{print $2}')

       # Sentry-gateway systemd active
       ssh deploy@"$SENTRY_IP" "sudo systemctl is-active sentry-gateway"   # expect: active

       # Caddy container running
       ssh deploy@"$SENTRY_IP" "docker ps --filter name=sentry_gateway --format '{{.Status}}'"   # expect: Up X minutes

       # ACME cert issued + Caddy responds
       curl -sI "https://$SENTRY_HOST/" | head -1   # expect: HTTP/2 200
       curl -s "https://$SENTRY_HOST/healthz"   # expect: ok
       curl -s "https://$SENTRY_HOST/" | head -1   # expect: "Sentry pending Phase 5..."

       # Isolation proof — sentry-01 != app-01:
       STAGING_IP=$(cd infra/terraform && ./tf-wrap.sh output -raw staging_app_ipv4)
       test "$SENTRY_IP" != "$STAGING_IP"   # exit 0 если IPs different
       ```

    5. **Idempotency proof:**
       ```
       ansible-playbook -i inventory/sentry --tags=sentry site.yml 2>&1 | tail -10
       # PLAY RECAP должен показать changed=0
       ```

    6. **Firewall closed-port verification** (VALIDATION.md manual check INFRA-05/06):
       ```
       # Из dev workstation (где у нас есть allowed IP на 22):
       nmap -p 22,80,443,4222,5432,9000 "$SENTRY_IP"
       # Expected:
       #   22/tcp  open    (от dev IP allowed)
       #   80/tcp  open    (Caddy auto-redirect, sometimes listed)
       #   443/tcp open    (placeholder Caddy)
       #   4222,5432,9000  filtered (firewall blocks)
       ```
       Записать output в SUMMARY.
  </action>
  <verify>
    <automated>
      SENTRY_IP=$(cd infra/terraform && ./tf-wrap.sh output -raw sentry_ipv4 2>/dev/null) \
      && STAGING_IP=$(cd infra/terraform && ./tf-wrap.sh output -raw staging_app_ipv4 2>/dev/null) \
      && SENTRY_HOST=$(grep caddy_host infra/ansible/group_vars/sentry.yml | awk -F'"' '{print $2}') \
      && test "$SENTRY_IP" != "$STAGING_IP" \
      && ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 deploy@"$SENTRY_IP" "sudo systemctl is-active sentry-gateway" 2>/dev/null | grep -q "^active$" \
      && curl -sI --max-time 15 "https://$SENTRY_HOST/healthz" 2>/dev/null | head -1 | grep -qE "HTTP.*200" \
      && curl -s --max-time 15 "https://$SENTRY_HOST/healthz" 2>/dev/null | grep -q "ok" \
      && curl -s --max-time 15 "https://$SENTRY_HOST/" 2>/dev/null | grep -q "Sentry pending Phase 5"
    </automated>
  </verify>
  <acceptance_criteria>
    - `systemctl is-active sentry-gateway` = active на sentry-01
    - `https://sentry.<sentry-ip>.sslip.io/` returns HTTP 200 с body "Sentry pending Phase 5..."
    - `https://sentry.<sentry-ip>.sslip.io/healthz` returns HTTP 200 + "ok" body
    - sentry-01 IPv4 НЕ равно staging-app-01 IPv4 (physical isolation proof)
    - Idempotent: 2nd-run `--tags=sentry` = `changed=0`
    - (Manual recorded в SUMMARY) `nmap` shows только 22 + 443 (+optional 80) open на sentry-01 public
  </acceptance_criteria>
  <done>
    INFRA-06 closed: sentry-01 — отдельный VPS, отдельный DNS (sentry.<sentry-ip>.sslip.io), отдельный ACME cert (Let's Encrypt issued via Caddy), отдельный firewall (Wave 1). Phase 5 (OBS-01) разблокирован: может добавить Sentry stack containers в `/opt/sentry/docker-compose.sentry.yml` и заменить placeholder Caddyfile на reverse_proxy.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Internet → sentry-01 Caddy 443 | Public per hcloud_firewall.sentry (Wave 1) |
| dev workstation → sentry-01 SSH (port 22) | dev_admin_ips/32 only (Wave 1 firewall) |
| Sentry-01 ⟂ app servers | Physical isolation: separate VPS, separate IP, separate Caddy, separate compose stack |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-03-18 | Information Disclosure | Sentry-01 shares compose stack или Caddy с app — если app падает, Sentry тоже падает (blast-radius shared) | MEDIUM | mitigate | Separate VPS (Wave 1 hcloud_server.sentry_01); separate Caddy compose (`/opt/sentry/docker-compose.sentry.yml` vs `/opt/sport/services/backend/docker-compose.prod.yml`); separate systemd unit (`sentry-gateway.service` vs `sport-stack.service`); separate DNS subdomain (`sentry.<ip>.sslip.io` vs `<ip>.sslip.io`). |
| T-03-19 | Tampering | Sentry secrets (когда Phase 5 lands) попадут в shared SOPS path с app secrets | LOW | accept_risk | Wave 3b НЕ обрабатывает Sentry secrets (Phase 5 ownership). Phase 5 CONTEXT будет flag'ить отдельный `.secrets/<env>/sentry.yaml` slot per SECRETS.md pattern. Не actionable в Wave 3b. |
| T-03-20 | Denial of Service | Sentry-01 cx32 (8 GB) → OOM-killed на real Sentry workload | HIGH | mitigate | Wave 1 (Plan 03-01 Task 2) использует server_type = "cx42" (16 GB) per RESEARCH correction D-11. Verify в этом плане Task 2 acceptance: `ssh deploy@<sentry-ip> "free -m | awk '/^Mem:/{print \$2}'"` показывает ≥ 15000 (≥15 GB visible). |
| T-03-21 | Information Disclosure | Caddy placeholder может leak'нуть info о infra — "Sentry pending Phase 5..." message | LOW | accept_risk | Сообщение указывает "Phase 5" — не reveals secrets или internal architecture beyond "this is Sentry slot". Phase 5 заменит на real Sentry web UI (которое имеет свою auth wall). |
| T-03-22 | Elevation of Privilege | apt-install Caddy на sentry-01 → port 443 conflict с containerized Caddy | MEDIUM | mitigate | RESEARCH correction D-16 consistent applied: role uses `caddy:2.8-alpine` container, никакого `apt: name=caddy` в tasks/main.yml. Verify в Task 1 acceptance criteria. |

**block_on:** high
**HIGH-severity threats:** T-03-20 (mitigate via cx42) — fully mitigated через Wave 1 server_type choice.
</threat_model>

<verification>
- 5 файлов sentry-prep role существуют
- `ansible-playbook --syntax-check --tags=sentry -i inventory/sentry site.yml` exit 0
- Live на sentry-01: `systemctl is-active sentry-gateway` = active; Caddy container running
- `https://sentry.<sentry-ip>.sslip.io/` returns HTTP 200 + body содержит "Sentry pending Phase 5..."
- `https://sentry.<sentry-ip>.sslip.io/healthz` returns HTTP 200 + "ok"
- IPv4 sentry-01 != IPv4 staging-app-01 (different VPS)
- Idempotent: 2nd run `changed=0`
- Manual nmap recorded — только 443 + 22 (от dev IP) + optional 80 open на sentry-01
</verification>

<success_criteria>
- INFRA-06 closed: sentry-01 — отдельный Hetzner VPS (cx42), отдельный sslip.io subdomain, отдельный ACME cert, отдельный Caddy (containerized), отдельный firewall. Изоляция per user redline сохранена: если app stack crashes, Sentry remains reachable (когда Phase 5 wires real Sentry).
- Phase 5 (OBS-01) разблокирован: `/opt/sentry/docker-compose.sentry.yml` имеет shape куда Phase 5 добавит services; `/opt/sentry/Caddyfile` имеет shape для замены placeholder respond → reverse_proxy.
- Sentry VPS sizing corrected per RESEARCH (cx42 not cx32) — preempts Sentry OOM-kill в Phase 5.
</success_criteria>

<output>
After completion, create `.planning/phases/03-infrastructure-as-code/03-03b-SUMMARY.md` per template.

**Required SUMMARY content:**
- nmap output на sentry-01 (proves только 22+443+optional 80 open public)
- `free -m` snapshot на sentry-01 (proves 16 GB RAM available per RESEARCH correction)
- IPv4 + caddy_host для sentry-01 (для передачи в Phase 5 CONTEXT)
- ACME cert issuance confirmation (curl -sI https + cert chain check)
- Idempotency PLAY RECAP changed=0
- Decisions cited: D-09 (separate VPS), D-10 (Phase 3 = base only, Phase 5 = Sentry stack), D-18 (sslip.io subdomain)
- RESEARCH corrections cited: D-11 corrected (cx42 used in Wave 1; sentry-01 has 16 GB verified), D-16 (Caddy containerized — consistency с app stack pattern)
- Phase 5 carry-forward: `/opt/sentry/docker-compose.sentry.yml` shape ready for Sentry service additions; placeholder Caddyfile ready for reverse_proxy замены
</output>
