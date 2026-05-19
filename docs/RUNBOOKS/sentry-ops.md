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

> ⏳ **TODO anchor** — Plan 05-07 task 6 will append §7–§14 here (observability-stack deploy + Grafana provisioning + Caddy edits + D-26 alert rule maintenance + Loki retention tuning + niko-prod hands-off invariants).

---

## Acceptance Walkthrough

> ⏳ **TODO anchor** — Plan 05-06 task 6 (final acceptance walkthrough) will append the 11-step checklist here (note: steps 1, 2, 7 are deferred per ADR-0010 amendment — see Plan 05-06 v3 `<how-to-verify>` block).

---

*Phase: 05-observability-backend / Plan 05-02 v3 Task 6 / 2026-05-19 PM*
