# Sentry + Observability Operations RUNBOOK

> Operational playbook for Phase 5 observability infrastructure. Sentry SaaS is **deferred to post-v1.0** per [ADR-0010 amendment 2026-05-19 PM](../DECISIONS/0010-sentry-saas-and-colocation.md#amendment-2026-05-19-pm--sentry-sdk-activation-deferred-to-post-v10); SDK code paths ship wired-and-dormant. Loki + Grafana + Prometheus self-hosted on `srv1561293` ship in v1.0 (Plan 05-07).

---

## §0 Status — Sentry deferred for v1.0 (2026-05-19 PM)

Per [ADR-0010 amendment](../DECISIONS/0010-sentry-saas-and-colocation.md#amendment-2026-05-19-pm--sentry-sdk-activation-deferred-to-post-v10): Sentry SaaS org + DSN activation are **DEFERRED to post-v1.0**. SDK code in the 8 Go backend services + future mobile is wired-and-dormant — empty `SENTRY_DSN_BACKEND` env var causes `MustInitSentry` + `MustInitTracer` (in `services/backend/pkg/observability/`) to short-circuit and return a no-op shutdown per **D-38** (logging `slog.Info "observability.sentry: disabled — empty DSN"` on boot for operator visibility).

Follow §1 and §3 below when activating post-v1.0. This RUNBOOK ships **fully-formed** during v1.0 — only §1 + §3 USER ACTIONs are pending.

### Activation checklist (single deploy cycle, no code changes)

1. **§1 below** — create sentry.io org + 4 projects in the SaaS UI
2. `sops edit .secrets/prod/sentry.yaml` — replace empty `SENTRY_DSN_BACKEND: ""` + `SENTRY_DSN_MOBILE: ""` placeholders with the real DSN strings (delete the `# TODO: ...` lines above each)
3. `make deploy` (or equivalent) — backend services restart, the D-38 guard now sees a non-empty DSN and logs `slog.Info "observability.sentry: enabled — DSN configured"` on boot
4. **§3 below** — configure Sentry's native Telegram integration in the sentry.io UI (replaces the original D-24/D-25 custom Go alerter design)
5. Send a sentry.io test notification → verify it arrives in the `@running-ecosystem-alerts` Telegram chat
6. Optional: trigger a synthetic crash in `prod-backend` (e.g., a `/__test_panic` endpoint or `sentry.CaptureException(errors.New("post-v1.0 activation smoke"))`) → verify the event appears in sentry.io UI within 30 sec

**R-07 mitigation**: this checklist must be executed before v1.0-rc.1 → public-beta transition (codified as a Phase 21 staging-soak acceptance criterion).

---

## §1 sentry.io org + project setup (sentry.io setup)

> **STATUS: deferred for v1.0; follow this section when activating sentry.io post-v1.0 per ADR-0010 amendment 2026-05-19 PM.**

### 1.1 Sign up

- Open [https://sentry.io/signup/](https://sentry.io/signup/) — free tier, no payment card needed
- Pick an org slug (e.g., `running-ecosystem` or any operationally-meaningful slug). The slug becomes the `o<slug>` portion of DSN URLs: `https://<pubkey>@o<slug>.ingest.sentry.io/<projid>`. **Not a secret** — fine to share in commit messages, code comments, etc.
- **Enable 2FA** on the account (Settings → Security → Two-Factor Auth — TOTP is fine). This is the only escalation path to org-admin compromise (threat T-05-02-04 mitigation).

### 1.2 Create 4 projects

In the sentry.io UI: Projects → Create Project. Repeat 4 times:

| Project slug | Platform | Purpose |
|--------------|----------|---------|
| `prod-backend` | Go | Live backend services (8 Go services on prod VPS) |
| `staging-backend` | Go | Future staging environment (placeholder for v1.1) |
| `prod-mobile` | React Native | Phase 17 consumes this; production iOS + Android EAS builds |
| `staging-mobile` | React Native | Future staging mobile environment |

### 1.3 Copy the DSNs

For each project: Settings → Projects → `<project>` → Client Keys (DSN) → copy the "DSN" field. Format:

```
https://<32-hex-pubkey>@o<numeric-org-id>.ingest.sentry.io/<numeric-project-id>
```

Hold the 4 DSNs in a local scratchpad — **do NOT paste them in chat with Claude or any LLM** (the R-08 incident in ADR-0010 risk register documents what happens when this rule is broken). Move them straight to SOPS in §1.4.

### 1.4 Move DSNs to SOPS

```bash
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"   # see §2.0 below
sops .secrets/prod/sentry.yaml
```

In the sops-spawned editor: replace `SENTRY_DSN_BACKEND: ""` with `SENTRY_DSN_BACKEND: "https://<your-real-prod-backend-dsn>"`; same for `SENTRY_DSN_MOBILE`. Delete the `# TODO: populate after sentry.io org created` comment lines above each. Save + exit → sops re-encrypts in place.

Repeat for `.secrets/staging/sentry.yaml` with the `_STAGING` keys.

### 1.5 Smoke verify

```bash
sops -d .secrets/prod/sentry.yaml | grep -E '^SENTRY_DSN_' | sed 's/:.*/: [REDACTED]/'
```

Expect both keys present + no `TODO` lines. Then commit `.secrets/prod/sentry.yaml` + `.secrets/staging/sentry.yaml`.

### 1.6 Redeploy

`make deploy` (or your prod deploy command). Services restart; `MustInitSentry` now sees non-empty DSN and logs `slog.Info "observability.sentry: enabled — DSN configured"` on boot (vs. the deferred-state `... disabled — empty DSN`).

---

## §2 SOPS rotation playbook

### §2.0 Dev workstation setup — `SOPS_AGE_KEY_FILE`

macOS sops 3.x does **not** auto-discover `~/.config/sops/age/keys.txt`. Set the env var explicitly. Add to your shell rc (`~/.zshrc` or `~/.bashrc`):

```bash
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
```

Verify:

```bash
echo "$SOPS_AGE_KEY_FILE"   # should print the path
sops -d .secrets/prod/sentry.yaml | head -2   # should decrypt cleanly
```

If you skip this step, every `sops -d` fails with `Failed to get the data key required to decrypt the SOPS file. ... no identity matched any of the recipients.`

### §2.1 Rotating any value in `.secrets/{prod,staging}/sentry.yaml`

The 6 values + 2 staging placeholders are:

| Key | Rotation trigger |
|-----|------------------|
| `SENTRY_DSN_BACKEND` | Sentry SDK key compromise; project deletion + re-creation; quarterly hygiene |
| `SENTRY_DSN_MOBILE` | Same |
| `GRAFANA_ADMIN_PASSWORD` + `BCRYPT` | Suspected credential leak; new dev added/removed; quarterly hygiene |
| `TELEGRAM_BOT_TOKEN` | Suspected token leak (e.g., R-08); BotFather revoke required |
| `TELEGRAM_CHAT_ID` | Chat migration (different group/DM); chat membership change |
| `SENTRY_DSN_BACKEND_STAGING` + `_MOBILE_STAGING` | Same as prod DSN rotation, on staging projects |

### §2.2 Rotation procedure (generic)

```bash
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
sops .secrets/prod/sentry.yaml
# In the editor:
#   - Replace the affected key's value
#   - Save + exit (sops re-encrypts in-place)
git diff .secrets/prod/sentry.yaml   # confirm only the changed value re-encrypted (sops keeps unchanged values' ciphertext stable)
git add .secrets/prod/sentry.yaml
git commit -m "chore(secrets): rotate <KEY_NAME> in .secrets/prod/sentry.yaml"
make deploy   # services restart, pick up new value from /run/sport.env
```

### §2.3 Per-key rotation specifics

**`GRAFANA_ADMIN_PASSWORD` + `BCRYPT`** — generate locally (NEVER paste passwords in chat):

```bash
umask 077
NEW_PWD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 16)
NEW_BCRYPT=$(htpasswd -bnBC 14 admin "$NEW_PWD" | cut -d: -f2)
# Copy NEW_PWD + NEW_BCRYPT to clipboard, paste into sops editor, save
unset NEW_PWD NEW_BCRYPT   # remove from shell history scope
# After SOPS save: restart observability-caddy.service on srv1561293
ssh myvps 'sudo systemctl restart observability-caddy.service'
```

**`TELEGRAM_BOT_TOKEN`** — must be rotated via BotFather (the bot has only one valid token at a time):

```
1. DM @BotFather → /revoke → pick `running_ecosystem_alerts_bot`
2. BotFather issues new token AND immediately invalidates the old one
   (any holder of the old token now sees 401 Unauthorized on /getUpdates)
3. Copy new token to clipboard, sops edit, paste, save
4. ssh myvps 'sudo systemctl restart observability-caddy.service'
   (Grafana picks up the new token from /etc/caddy/secrets.env on restart)
5. Verify: trigger any test alert → message arrives in @running-ecosystem-alerts
```

**`SENTRY_DSN_*`** — generate via sentry.io UI:

```
1. Sentry UI → Settings → Projects → <project> → Client Keys (DSN)
2. "Generate New Key" (creates a new DSN; old DSN can be deleted or kept)
3. Copy new DSN to clipboard, sops edit, paste, save
4. make deploy (backend services restart; mobile needs EAS rebuild — Phase 17)
```

### §2.4 SOPS round-trip smoke (after any rotation)

```bash
sops -d .secrets/prod/sentry.yaml | grep -E '^(SENTRY|GRAFANA|TELEGRAM)_' | sed 's/:.*/: [REDACTED]/'
# expect 6 lines, all values [REDACTED]
sops -d .secrets/prod/sentry.yaml | grep -cF 'TODO: populate after sentry.io'
# expect 2 (or 0 if DSNs activated post-v1.0)
```

---

## §3 Telegram integration

> **STATUS: deferred for v1.0; follow this section post-v1.0 when activating sentry.io per ADR-0010 amendment.** Grafana-side Telegram alerts (D-26 codified rules — 5xx>5%, JWT spike>20/min, NATS lag>1000, plus 3 warnings) ship in v1.0 via Plan 05-07 and do NOT depend on this section.

### §3.1 Bot setup (already done in Plan 05-02 Task 2 — bot exists at `@running_ecosystem_alerts_bot`)

The bot, its token, and its chat ID are already in SOPS. If you ever need to recreate it from scratch:

```
1. DM @BotFather on Telegram → /newbot
2. Display name: running-ecosystem-alerts
3. Username: <prefix>_alerts_bot (must end in _bot)
4. Save token from BotFather's confirmation message
5. Add bot to a chat (DM yourself or a 2-dev group) → /start once
6. curl "https://api.telegram.org/bot<TOKEN>/getUpdates" → find chat.id
7. sops edit .secrets/prod/sentry.yaml → paste TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
```

### §3.2 Sentry-side Telegram integration (the deferred USER ACTION)

After Sentry SaaS is activated (§1):

```
1. sentry.io UI → Open prod-backend project → Settings → Integrations
2. Search "Telegram" → Add Integration
3. Paste TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
   (Retrieve from SOPS: `sops -d .secrets/prod/sentry.yaml | grep TELEGRAM_`
    — values [redacted] on the terminal; copy directly to UI form)
4. Save integration
5. Create alert rule:
   Settings → Projects → prod-backend → Alerts → "Create Alert Rule"
   - When: A new issue is created
   - If: Issue level is "error" or "fatal"
   - Then: Send a Telegram notification to <bot> in <chat_id>
   Save the rule as "Critical errors → Telegram"
6. (Optional spike-protection) Configure on the same Alerts page — skip in v1.0
   since baselines aren't established (Phase 8 establishes baselines)
7. Send a test notification → verify in @running-ecosystem-alerts chat
```

### §3.3 Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `getUpdates` returns `{"result":[]}` | Bot not in any chat / no messages yet | Send any message to the bot, re-run `getUpdates` |
| Test notification sent but not received | Wrong `chat.id` (positive vs negative integer for groups vs DMs) | Re-run `getUpdates` after sending a message in the target chat; chat.id format: negative integer (e.g., `-1001234567890`) for groups, positive for direct messages |
| Sentry "Send test" button returns 401/403 | Token wrong/revoked | Re-rotate per §2.3 and update SOPS |
| Sentry test arrives but real alerts don't | Alert rule filter too narrow | Loosen the rule's "If: Issue level" filter; check Sentry-side spike-protection isn't muting |
| Telegram bot replies "Forbidden: bot was blocked by the user" | Someone clicked "Block" on the bot in Telegram | Unblock in Telegram client; re-add to chat if needed |

### §3.4 Rate limits

- **Telegram Bot API**: 30 messages/sec to different chats; 1 msg/sec to the same chat. Burst tolerated. Sentry's alert grouping (which mirrors Grafana's group_wait=30s + group_interval=5m + repeat_interval=4h from Plan 05-07 D-26 rules) keeps us well below the ceiling for v1.0 closed-beta scale.

---

## §4 v1.1 migration path

When to revisit ADR-0010 (any of these triggers individually justifies a Phase 5.x retake):

| Trigger | Path |
|---------|------|
| Sentry SaaS event volume crosses 4K/mo (≈80% of free tier) | Upgrade sentry.io tier (cheap) OR migrate to self-hosted (revisit D-01..D-05 original ADR-0010 §Решение/1) |
| Dedicated VPS becomes available (≥16 GB RAM, fresh box) | Self-host Sentry: re-run the original Plans 05-01 (Sentry VPS provisioning) + 05-02 v1 (sentry-prep Ansible role + sentry-cli project bootstrap) on the fresh box — the SUPERSEDED versions still live in `.planning/phases/05-observability-backend/05-01-PLAN-SUPERSEDED.md` (commit `210d3cc`) |
| Sentry SaaS T&C changes unfavorably | R-06 mitigation: evaluate self-hosted-on-dedicated-VPS path |
| niko-prod stack migrates off `srv1561293` (frees the 80/443 ports) | Migrate observability-stack to a real domain with Let's Encrypt: drop self-signed cert (D-37); Caddy on :443; revisit D-35 / D-36 / D-37 |
| Telegram bot exposure event (R-08-style) | Rotate immediately per §2.3; consider migrating to encrypted-transport alert channel (PagerDuty if team grows; Signal Bot if pricing acceptable) |

### §4.1 Migration to self-hosted Sentry (rough sketch)

If trigger #2 fires (dedicated VPS available):

1. Restore Plan 05-01 from `.planning/phases/05-observability-backend/05-01-PLAN-SUPERSEDED.md` — rename back to `05-01-PLAN.md`; remove `status: scrapped` + `superseded_by` frontmatter
2. Restore Plan 05-02 v1 from git history (`git show a8d591a~1:.planning/phases/05-observability-backend/05-02-PLAN.md` — the version before defer revision)
3. Revisit CONTEXT.md D-01..D-05 — un-strike, re-LOCK
4. Run `/gsd-plan-phase 5 --gaps` to consolidate; check plan-check verdict
5. Run `/gsd-execute-phase 5 --wave 1` to execute the restored Plans 05-01 + 05-02 v1
6. After self-hosted Sentry running: `sops edit .secrets/prod/sentry.yaml` — swap SaaS DSNs with self-hosted DSNs (host changes from `o<slug>.ingest.sentry.io` → `sentry.<self-host>.example.com`; project IDs likely also change since sentry-cli creates new projects)
7. `make deploy` — backend services pick up new DSNs; sentry-go SDK transparently sends to the new endpoint (DSN URL is the only thing that changed)
8. Decommission sentry.io SaaS org (delete projects, then delete org) — optional, keep as backup for ~30 days

---

## §5 DSN format reference

The Sentry DSN URL is parsed by `sentry-go` SDK + OpenTelemetry OTLP exporter via standard `net/url.Parse`. Format:

```
https://<32-hex-pubkey>@o<numeric-org-id>.ingest.sentry.io/<numeric-project-id>
^^^^^   ^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^
scheme   public key       host (SaaS-fixed)                 project ID
```

### §5.1 Pseudocode for parsing

```go
import "net/url"

dsn, err := url.Parse(os.Getenv("SENTRY_DSN_BACKEND"))
if err != nil || dsn.Scheme == "" {
    // Empty or malformed — D-38 guard short-circuits init
    return func() {}
}
publicKey := dsn.User.Username()         // e.g., "a1b2c3d4e5f6..."
host := dsn.Host                          // e.g., "o4506000000000000.ingest.sentry.io"
projectID := strings.TrimPrefix(dsn.Path, "/")  // e.g., "4506000000000001"

// OTLP endpoint (sentry.io SaaS — note path differs from self-hosted):
otlpURL := fmt.Sprintf("https://%s/api/%s/otlp/v1/traces", host, projectID)
//         (self-hosted: "https://%s/api/%s/integration/otlp/v1/traces")

// Auth header:
authHeader := "sentry sentry_key=" + publicKey
```

### §5.2 Self-hosted DSN format (deferred path for v1.1)

Identical shape, different host:

```
https://<pubkey>@sentry.<self-host-dns>/<projid>
```

The Go code's `url.Parse` extraction works identically. The only difference is the OTLP URL path: self-hosted uses `/api/<id>/integration/otlp/v1/traces` (with `integration/` prefix); SaaS uses `/api/<id>/otlp/v1/traces` (no prefix). Plan 05-05 amendment 2026-05-19 codifies the SaaS path; v1.1 migration switches to self-hosted path.

### §5.3 DSN secrecy posture

A DSN is a **shared secret** — anyone holding the DSN can submit events to that project. They cannot read events, cannot escalate to admin, cannot exfiltrate data. Compromise = quota abuse + noisy false alerts. Rotation playbook: §2.3.

**SOPS-encrypted at rest** in `.secrets/{prod,staging}/sentry.yaml`. Phase 2 pre-commit gitleaks catches `sentry\.io/[0-9]+` and `o[0-9]+\.ingest\.sentry\.io` patterns in plaintext commits (defense-in-depth).

---

## §6 References

### Sentry SaaS

- [sentry.io DSN management](https://docs.sentry.io/product/sentry-basics/dsn-explainer/)
- [sentry.io Integrations (incl. Telegram)](https://docs.sentry.io/product/integrations/)
- [sentry.io Alert Rules](https://docs.sentry.io/product/alerts/create-alerts/)
- [sentry-go SDK — empty DSN behavior](https://docs.sentry.io/platforms/go/configuration/options/#dsn)
- [@sentry/react-native — empty DSN behavior](https://docs.sentry.io/platforms/react-native/configuration/options/#dsn)
- [OTLP HTTP endpoint for Sentry](https://docs.sentry.io/platforms/go/distributed-tracing/instrumentation/opentelemetry/)

### Telegram

- [Bot API — getUpdates](https://core.telegram.org/bots/api#getupdates)
- [Bot API — rate limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits)
- [BotFather commands](https://core.telegram.org/bots/features#botfather)

### SOPS

- [SOPS — age recipients](https://github.com/getsops/sops#22encrypting-using-age)
- [SOPS — env var configuration](https://github.com/getsops/sops#218specify-a-different-gpg-or-age-executable)
- `.sops.yaml` in repo root — creation_rules
- `docs/RUNBOOKS/sops-edit.md` — Phase 2 rotation pattern

### This project

- [ADR-0010 — Sentry SaaS + colocation + amendment](../DECISIONS/0010-sentry-saas-and-colocation.md)
- `.planning/phases/05-observability-backend/05-CONTEXT.md §D-33..D-38`
- `.planning/phases/05-observability-backend/05-PLAN-CHECK-3.md` — plan-check verdict
- `.planning/phases/05-observability-backend/05-02-PLAN.md` — this plan's full body
- `.planning/phases/05-observability-backend/05-02-SUMMARY.md` — what was shipped (post-Task-6 closeout)

---

## observability-stack

> Shipped by Plan 05-07 v2 (commit `<plan-05-07-commit>`); covers operations of Loki + Prometheus + Grafana + Caddy on `srv1561293`.

### §7 observability-stack deploy

The full stack ships via `scripts/deploy_observability_stack.sh`. Idempotent — re-running applies deltas only.

**Pre-reqs:**
- `SOPS_AGE_KEY_FILE` set (see §2.0)
- `ssh myvps` works passwordless (`~/.ssh/config` Host alias for `srv1561293`)
- `.secrets/prod/sentry.yaml` populated (Plan 05-02 — Grafana password/bcrypt + Telegram token + chat ID)
- `infra/observability-stack/` staged in repo (Plan 05-07 Tasks 1–3)

**Deploy:**

```bash
# Dry-run first to inspect what would be rsync'd (no remote touch):
bash scripts/deploy_observability_stack.sh --dry-run

# Live deploy:
bash scripts/deploy_observability_stack.sh
```

The script does, in order: (a) SOPS-decrypts secrets to ephemeral shell vars, (b) substitutes `{{PROD_VPS_IP}}` + `{{TELEGRAM_BOT_TOKEN}}` + `{{TELEGRAM_CHAT_ID}}` templates into a `/tmp/observability-stack-render.XXXXXX` dir, (c) rsyncs to `myvps:/opt/observability-stack/`, (d) scps `Caddyfile` + `secrets.env` to `/etc/caddy/`, (e) installs Caddy binary at `/usr/local/bin/caddy` if absent, (f) installs both systemd units + reloads daemon, (g) opens UFW :8443 if not already, (h) `systemctl enable --now` both services in order.

Total deploy time on a clean run: ~2–3 minutes (mostly: Caddy binary download + first-time Docker image pulls).

**Verify:**

```bash
GRAFANA_PASS=$(sops -d .secrets/prod/sentry.yaml | awk -F'"' '/^GRAFANA_ADMIN_PASSWORD:/ {print $2}') \
    python3 scripts/smoke_observability_stack.py

GRAFANA_PASS=$(sops -d .secrets/prod/sentry.yaml | awk -F'"' '/^GRAFANA_ADMIN_PASSWORD:/ {print $2}') \
    python3 scripts/smoke_grafana_alerts.py
```

### §8 GRAFANA_ADMIN_PASSWORD rotation

```bash
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"

# Generate new pwd + bcrypt offline (umask 077 — values never echoed)
NEW_PWD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 16)
NEW_BCRYPT=$(htpasswd -bnBC 14 admin "$NEW_PWD" | cut -d: -f2)

# Edit SOPS — paste NEW_PWD + NEW_BCRYPT in editor; save
sops .secrets/prod/sentry.yaml

# Redeploy: deploy script picks up new values from SOPS at next run
bash scripts/deploy_observability_stack.sh

# Or, if only the password changed and you want a faster path:
ssh myvps 'systemctl restart observability-caddy.service'
# (Grafana reads admin password from /run/secrets/admin_password mount,
#  re-rendered by deploy script. The caddy restart picks up the new
#  bcrypt from /etc/caddy/secrets.env.)

unset NEW_PWD NEW_BCRYPT
```

### §9 D-26 alert rule modification

To edit a rule: change `infra/observability-stack/grafana/provisioning/alerting/rules.yml`, commit, run `bash scripts/deploy_observability_stack.sh`. Grafana provisioning reloads YAML on every Grafana restart (provider.yml `updateIntervalSeconds: 30` also picks up changes within 30 sec without restart for dashboards; alerting rules need restart).

To verify rules loaded:

```bash
GRAFANA_PASS=... python3 scripts/smoke_grafana_alerts.py
```

To add a new rule: append a `- uid: <new>` block to `rules.yml` in the appropriate group (`backend-critical` or `backend-warning`), redeploy, re-smoke.

### §10 Dashboard sync (Plan 05-04 → 05-07)

Plan 05-04 (Wave 3 of Phase 5) ships dashboard JSONs to `services/backend/observability/dashboards/`. The deploy script automatically rsyncs them into the Grafana provisioning dir on every run:

```bash
# After adding a new dashboard JSON in services/backend/observability/dashboards/:
git add services/backend/observability/dashboards/<new>.json
git commit -m "feat(05-04): add <new> Grafana dashboard"
bash scripts/deploy_observability_stack.sh
# Grafana auto-loads within 30 sec (provider.yml updateIntervalSeconds)
```

### §11 Caddy allowlist debugging

`@allowed_loki { remote_ip {$LOKI_PUSH_ALLOWED_SOURCE} }` matcher controls who can POST to `/loki/api/v1/push`. Source IP comes from the TCP socket (Caddy doesn't trust X-Forwarded-For unless explicitly configured).

**Debugging 403s:**

```bash
# Tail Caddy logs to see the IP being rejected:
ssh myvps 'journalctl -u observability-caddy.service -f -n 100'
# Look for "@not_allowed_loki" matches; the line includes "remote_ip" of the rejected client

# Verify the allowlist value matches expected prod-VPS IP:
ssh myvps 'cat /etc/caddy/secrets.env | grep LOKI_PUSH_ALLOWED_SOURCE'
# Should print: LOKI_PUSH_ALLOWED_SOURCE='148.253.214.156/32'
```

**Common 403 causes:**

- Alloy on a different VPS than `LOKI_PUSH_ALLOWED_SOURCE` — update the SOPS slot + redeploy
- NAT/proxy in front of Alloy → Caddy sees the NAT's IP, not Alloy's; either pin to NAT IP or remove the NAT layer
- IPv6 — `148.253.214.156/32` is IPv4; if prod VPS uses IPv6 for outbound, add a `/128` allowlist entry too

### §12 Self-signed cert handling

Per D-37: Caddy on `srv1561293:8443` uses `tls internal` (Caddy's local CA generates a cert on first run). v1.0 closed-beta acceptance: browser warning on first dev visit, accept-once.

**For browsers:** Click through the warning. Add cert to OS trust store for permanent acceptance:

```bash
# macOS — extract + trust the Caddy cert
ssh myvps 'cat /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt' > /tmp/caddy-root.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/caddy-root.crt
rm /tmp/caddy-root.crt
```

**For Alloy / smoke scripts:** set `tls_config { insecure_skip_verify = true }` in Alloy config (Plan 05-06); Python smoke scripts already use `ssl.CERT_NONE`.

**v1.1 fix paths:** (a) migrate to a real domain + Let's Encrypt (requires nginx-side coexistence), (b) pinned-cert workflow (compile cert into Alloy image / Python smoke probes).

### §13 Resource ceiling watch (R-02)

`srv1561293` has 15 GB RAM / no swap and is **colocated with niko-prod** (currently using ~3 GB). observability-stack containers cap at:
- Loki: 512 MB
- Prometheus: 512 MB
- Grafana: 768 MB
- Total stack: ~1.8 GB hard cap (systemd `MemoryHigh=4G` soft cap)

**Watch signals:**

```bash
# Check observability-stack memory usage:
ssh myvps 'docker stats --no-stream observability-loki observability-prometheus observability-grafana'

# Check overall VPS memory pressure:
ssh myvps 'free -h && uptime'

# Check niko-prod for any regression correlated with observability spikes:
ssh myvps 'docker stats --no-stream $(docker ps --filter "name=niko-prod-" -q)'
```

**Revisit ADR-0010 if any of these fire sustained for >30 min:**
- Memory usage >12 GB total
- niko-prod container restarts correlate with observability-stack memory spikes
- `journalctl | grep -i "OOM\|out of memory"` shows OOM-kills

**Mitigations (in escalation order):**
1. Drop Loki retention to 7 days: edit `loki/loki-config.yaml` (`retention_period: 168h`); redeploy
2. Add 4 GB swap file on `srv1561293`: `ssh myvps 'fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab'`
3. Migrate observability-stack to a dedicated VPS (revisit D-34 → re-run Plans 05-01 + 05-02 v1 from SUPERSEDED)

### §14 niko-prod hands-off invariants

`srv1561293` runs an unrelated production project (`niko-prod` Docker stack + system nginx). The observability-stack is colocated but must NEVER touch any niko-prod resource. Hard invariants:

| Allowed (our domain) | Forbidden (niko-prod's domain) |
|----------------------|--------------------------------|
| `/opt/observability-stack/*` | `/opt/niko-prod/*` (or wherever niko-prod lives) |
| `/etc/caddy/*` | `/etc/nginx/*` (system nginx — owns `:80`/`:443`) |
| `/etc/systemd/system/observability-*.service` | niko-prod-related systemd units |
| `/usr/local/bin/caddy` (single binary, separate from system nginx) | system nginx binary at `/usr/sbin/nginx` |
| UFW rule for `:8443/tcp` | UFW rules for `:80`/`:443`/`:22` (already in place; we leave them) |
| Docker network `observability_internal` | `niko-prod_data_net` / `niko-prod_egress_net` / `niko-prod_public_net` / `niko-prod_signer_net` (4 networks; we never join them) |
| Docker volumes `observability_loki_data` / `observability_prometheus_data` / `observability_grafana_data` | volumes named `niko-prod_*` |
| Containers `observability-loki` / `observability-prometheus` / `observability-grafana` | the 8 niko-prod-* containers (frontend / admin / api / signer / postgres / redis / rabbitmq / db-backup) |
| Loopback ports `127.0.0.1:3000` / `:3100` / `:9090` (Caddy is sole public bridge to public `:8443`) | niko-prod's loopback ports `:3000` / `:3002` / `:5434` / `:5672` / `:6380` / `:7001` / `:8000` / `:15672` |

**Pre-deploy invariant snapshot** captured at `.planning/phases/05-observability-backend/evidence/srv1561293-pre-deploy.txt` (PIDs, nginx config md5s, listening sockets). Post-deploy delta verified by Plan 05-07 SUMMARY.

**If you discover invariant drift in the future:**
1. Don't touch niko-prod — open a discussion thread first
2. Document the drift in `.planning/phases/05-observability-backend/incidents/<date>.md`
3. Revisit ADR-0010 R-05 (operator accidentally edits niko-prod nginx)

---

---

## Acceptance Walkthrough

> Final 11-step end-to-end runtime acceptance for **Phase 5 closeout** (Plan 05-06 USER ACTION 4). Executed by user with orchestrator support; each step's pass/fail recorded in `.planning/phases/05-observability-backend/05-06-SUMMARY.md` evidence block.
>
> **Carrier swap reminder (ADR-0010 amendment 2026-05-19 PM):** Sentry SaaS *activation* is deferred to post-v1.0. Steps 1, 2, 7 below are marked **DEFERRED**; their assertions move to "MustInitSentry boot log shows `observability.sentry: disabled — empty DSN`" — the D-38 contract that proves the dormant-by-design path is observable from service startup logs.

### Walkthrough steps

1. ~~**Sentry UI reachable**~~ — **DEFERRED per ADR-0010 amendment 2026-05-19 PM.** No sentry.io org for v1.0. Verify the dormant contract instead:

   ```bash
   ssh deploy@<prod-vps-ip> 'docker logs sport-identity-1 2>&1 | grep "observability.sentry: disabled"'
   # Expect: INFO line "observability.sentry: disabled — empty DSN" with attr next_step="see ADR-0010 amendment 2026-05-19 PM"
   ```

2. ~~**Sentry admin login + 4 projects visible**~~ — **DEFERRED.** When activated post-v1.0: SOPS edit to populate the 4 DSNs → `make ansible-deploy` → service containers restart with non-empty `SENTRY_DSN_BACKEND` → D-38 guard skipped, full SDK init proceeds. No code change required.

3. **Generate synthetic load** — from a dev workstation with `BASE_URL` pointing at the prod app VPS:

   ```bash
   python3 scripts/smoke_metrics.py --load 60
   ```

   Expect 60-sec sustained traffic across the 8 services (identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph).

4. **4 Grafana panels populated within 5 min** — open `https://82-25-71-215.sslip.io:8443/grafana/` (Caddy basicauth — see §8 for credentials extraction); accept self-signed cert warning per D-37; navigate to each of the 4 dashboards:
   - P99 HTTP latency
   - HTTP error rate (5xx)
   - NATS consumer queue depth
   - JWT validation failures

   **EACH panel must show non-empty data** within 5 min of step 3 load start. Screenshot each to `.planning/phases/05-observability-backend/evidence/grafana-{p99,errors,queue,jwt}.png`.

5. **PII live probe green:**

   ```bash
   python3 scripts/pii_live_probe.py --duration 60
   # Expect:
   #   Scanned N log lines across M streams over 60s window
   #   ✓ 0 PII matches in N log lines
   #   🎉 Phase 5 / OBS-06 runtime check passed.
   # exit 0
   ```

   Copy exact stdout into 05-06-SUMMARY evidence block.

6. **Cardinality probe green:**

   ```bash
   python3 scripts/cardinality_probe.py
   # Expect: "PASS: 8 services scraped, 0 forbidden labels, max <N> series on <metric>"
   # exit 0
   ```

   Copy exact stdout into evidence block.

7. ~~**Sentry envelope smoke green**~~ — **DEFERRED per ADR-0010 amendment.** When activated post-v1.0: `python3 scripts/smoke_sentry.py` would POST a synthetic envelope to the Sentry SaaS DSN. For v1.0, the equivalent assertion is the boot-log INFO line from step 1.

8. **Grafana-side Telegram alert E2E** — synthetic 5xx burst triggers D-26 `5xx_rate_over_5pct` rule:

   ```bash
   python3 scripts/smoke_metrics.py --inject-500 --duration 30
   ```

   Within 5 min, the rule fires in Grafana; Telegram chat receives the formatted alert via the Grafana Telegram contact-point (configured by Plan 05-07 from SOPS `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`). Screenshot the chat message → save to `.planning/phases/05-observability-backend/evidence/telegram-grafana-5xx.png`.

   *Note:* Sentry-side P0 Telegram test deferred per steps 1+2+7. Grafana-side test is the **v1.0 alerting acceptance signal**.

9. **OBS-08 deferral confirmation** — user explicitly confirms verbatim in 05-06-SUMMARY.md:

   > "RU consent banner UX + mobile Settings toggle UI = Phase 17 territory; Phase 5 ships only the backend seam (DebugSessionMiddleware + `tester_debug_logging` featureflag + JWT `is_tester` claim coupling)."

10. **ROADMAP §Phase 5 checkbox flip** — edit `.planning/ROADMAP.md` §"Phase 5: Observability (backend)"; flip the closing `[ ]` checkbox → `[x]`. Add note: "Sentry SaaS activation deferred per ADR-0010 amendment 2026-05-19 PM; v1.0 ships SDK substrate (wired-and-dormant)."

11. **Write 05-06-SUMMARY.md** — following `$HOME/.claude/get-shit-done/templates/summary.md`:
    - **Outcome** — Phase 5 closed; SDK substrate wired + dormant per ADR-0010 amendment.
    - **Artifacts** — must_have artifact paths + final LOC.
    - **Evidence block** — verbatim stdouts from steps 5+6+8; screenshots from steps 4+8; **steps 1, 2, 7 marked DEFERRED**.
    - **Pinned deps** — Alloy 1.5.0, sentry-cli 2.40.0 (post-v1.0 activation), sentry-go 0.46.2, OTel 1.32.0, client_golang 1.20.5.
      ~~getsentry/self-hosted 26.5.0~~ DROP (no self-hosted Sentry in v1.0 per ADR-0010).
    - **Post-v1.0 activation list** — sentry.io org + 4 projects + DSN to SOPS + redeploy.
    - **Phase 17 inheritance** — mobile SDK install, Settings toggle, RU consent banner.

### Failure handling

If any step 3-6 or 8 fails:
1. Capture failure mode in 05-06-SUMMARY.md "Issues encountered" section
2. **DO NOT** proceed to step 10 (ROADMAP flip)
3. Spawn `/gsd-plan-phase 5 --gaps` follow-up plan to close the gap

### Resume signal

Type `approved` after all walkthrough steps pass and ROADMAP §Phase 5 checkbox is flipped to [x]. Reply with `blocked: <step-N>` + description if any step fails.

---

*Phase: 05-observability-backend / Plan 05-02 v3 Task 6 / 2026-05-19 PM*
*Acceptance Walkthrough authored: 2026-05-20 — Phase 5 / Plan 05-06 Task 5*
