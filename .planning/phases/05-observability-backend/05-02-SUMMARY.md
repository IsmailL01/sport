# 05-02-SUMMARY — Sentry SaaS deferred + Grafana/Telegram SOPS substrate + Sentry RUNBOOK

**Plan:** 05-02 v3 (Wave 1 — `autonomous: false`)
**Requirements:** OBS-01 (partial — substrate only; activation deferred), OBS-02 (deferred)
**Executed:** 2026-05-19 PM (after ADR-0010 amendment landing the defer revision)
**Commits:** `a8d591a` (defer revision) → `d2e8d54` (R-08 leak ADR entry) → `6fe9842` (SOPS slots) → `267a730` (RUNBOOK)
**Status:** ✅ Complete — but with critical follow-ups recorded (see §Carry-forward)

---

## What landed

### Task 1 — sentry.io org + 4 projects → **DEFERRED**

Per [ADR-0010 amendment 2026-05-19 PM](../../../docs/DECISIONS/0010-sentry-saas-and-colocation.md#amendment-2026-05-19-pm--sentry-sdk-activation-deferred-to-post-v10): user chose to defer Sentry SaaS activation for v1.0 deploy. Activation playbook lives in [`docs/RUNBOOKS/sentry-ops.md §1`](../../../docs/RUNBOOKS/sentry-ops.md) — single SOPS edit + redeploy when ready, no code changes required.

### Task 2 — Telegram bot via BotFather → DONE (with R-08 leak event)

- Bot created: `@running_ecosystem_alerts_bot`
- Chat ID: private DM (positive integer; concrete value in SOPS)
- **R-08 leak event:** user pasted BotFather's confirmation message verbatim in chat including the original token. Offered rotation; user initially chose accept. Mid-execution my Bash script shredded the rotated token's tmp-file before successfully encrypting (see §Bugs encountered #1). User re-rotated via BotFather a second time. **Current token in SOPS is the second rotation** — pre-rotation tokens (both the original-leaked AND the first-rotation) return 401 on `/getUpdates`.
- R-08 documented in ADR-0010 risk register with Phase 21 staging-soak acceptance gate: "pre-rotation tokens MUST return 401" before v1.0-rc.1 → public-beta transition.

### Task 3 — Grafana admin password + bcrypt → DONE

- 16-char alnum password generated locally via `openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 16`
- bcrypt cost 14 via `htpasswd -bnBC 14 admin <pwd>` — `$2y$14$<60-char-hash>`
- Round-trip verified via `htpasswd -bv` (exit 0, "Password for user admin correct")
- Values never left the machine; held in `~/.sport-cred-tmp-11032/` with `umask 077` perms (0700 dir / 0600 files) until SOPS-write in Task 4, then shredded

### Task 4 — populate `.secrets/{prod,staging}/sentry.yaml` via SOPS → DONE

- **Final approach** (after 3 attempts — see §Bugs encountered): stage plaintext at `.secrets/<env>/sentry.yaml` (so `.sops.yaml` `path_regex: \.secrets/.*\.yaml$` matches creation_rules), then `sops --encrypt --in-place`, then validate `ENC[AES256_GCM` envelope marker present, then `sops --decrypt` round-trip with `SOPS_AGE_KEY_FILE` explicit, then only after all gates pass, shred temp creds.
- **Final on-disk state** (commit `6fe9842`):
  - `.secrets/prod/sentry.yaml` — 2964 bytes, 6 keys (SENTRY_DSN_BACKEND="" / SENTRY_DSN_MOBILE="" / GRAFANA_ADMIN_PASSWORD / GRAFANA_ADMIN_PASSWORD_BCRYPT / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID), 2 TODO comments
  - `.secrets/staging/sentry.yaml` — 1684 bytes, 2 keys (SENTRY_DSN_BACKEND_STAGING="" / SENTRY_DSN_MOBILE_STAGING=""), 2 TODO comments
- Encrypted against age recipient `age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my` per Phase 2 `.sops.yaml` creation_rules.

### Task 5 — Sentry-side Telegram integration in sentry.io UI → **DEFERRED**

Same reason as Task 1. Activation playbook in [`docs/RUNBOOKS/sentry-ops.md §3`](../../../docs/RUNBOOKS/sentry-ops.md).

### Task 6 — `docs/RUNBOOKS/sentry-ops.md` → DONE

353 lines covering §0–§6 + 2 TODO anchors:

- **§0** Status banner — Sentry deferred for v1.0 (6-step activation checklist)
- **§1** sentry.io org + project setup — deferred-banner
- **§2** SOPS rotation playbook — incl. critical **§2.0** `SOPS_AGE_KEY_FILE` setup note (carry-forward from Task 4 bug)
- **§3** Telegram integration — deferred-banner + 5-row troubleshooting table
- **§4** v1.1 migration path — 5 trigger conditions + self-hosted-Sentry migration sketch
- **§5** DSN format reference — Go pseudocode + secrecy posture
- **§6** References — 6 Sentry doc links + 3 Telegram + 3 SOPS + 5 cross-refs
- **TODO anchors**: `## observability-stack` (Plan 05-07 task 6 appends) + `## Acceptance Walkthrough` (Plan 05-06 task 6 appends)

---

## Bugs encountered during Task 4 (3 attempts)

Recorded for future SOPS helper script + RUNBOOK §2.0.

### Bug #1: silent `sops --encrypt` failure

**Cause:** `sops --encrypt /tmp/plaintext.XXXXXX > .secrets/prod/sentry.yaml` — sops matches creation_rules against the **input** file path (`/tmp/...`), NOT the output. `/tmp/plaintext.XXXXXX` doesn't match `\.secrets/.*\.yaml$` → sops exited non-zero with "error loading config: no matching creation rules found", but the `> output` redirect created an empty file. My script's `set -e` didn't trip because the redirect itself succeeded.

**Worse**: my script then shredded the temp cred dir **before** verifying decrypt round-trip. Lost: the just-rotated Telegram token (bot became unreachable until user re-rotated).

**Fix:** stage plaintext **inside** `.secrets/` so creation_rules path_regex matches, then `sops --encrypt --in-place`. Plaintext-on-disk window is ~1 second; dir perms `drwxr-xr-x` + file perms `0600` so only the operator can read.

### Bug #2: `sops --age` flag does NOT bypass creation_rules

**Cause:** Tried `sops --encrypt --age <pubkey> /tmp/plaintext > out` thinking `--age` would bypass the path-based lookup. It doesn't — `--age` adds a recipient on top of whatever creation_rules resolve to; if no rule matches, sops still errors.

**Fix:** same as Bug #1 — stage inside `.secrets/`.

### Bug #3: macOS sops 3.x does NOT auto-discover `~/.config/sops/age/keys.txt`

**Cause:** sops's runtime search order for the age private key checks `SOPS_AGE_KEY_FILE`, `SOPS_AGE_KEY`, `SOPS_AGE_SSH_PRIVATE_KEY_FILE`, `SOPS_AGE_SSH_PRIVATE_KEY_CMD`, `SOPS_AGE_KEY_CMD` — but the default file location `~/.config/sops/age/keys.txt` is NOT in this list on this macOS install. My preflight check confirmed the file exists but didn't verify sops could find it.

**Symptom:** `sops --decrypt` failed with `Failed to get the data key required to decrypt the SOPS file. ... no identity matched any of the recipients.` even though encryption had succeeded and `~/.config/sops/age/keys.txt` was present + readable.

**Fix:** `export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"` before running `sops --decrypt`. Documented in RUNBOOK §2.0 — should be added to dev workstation shell rc.

### Bug #4: zsh `set -e` doesn't always trip on function returns

**Cause:** Defined an `encrypt_to()` helper that `return 1`-ed on sops failure. With `set -e`, the calling site SHOULD exit. In zsh (the system shell here), it didn't — possibly because of how zsh treats `set -e` inside function-call contexts vs subshells.

**Fix:** explicit `|| exit 1` after each call site; don't rely on `set -e` for function-return propagation. Or rewrite as a non-function (inline).

---

## Acceptance criteria status (from Plan 05-02 v3 success_criteria block)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | ~~4 sentry.io projects exist~~ | **DEFERRED** ✓ (per ADR-0010 amendment) |
| 2 | `.secrets/prod/sentry.yaml` SOPS-encrypted with 6 keys + 2 `# TODO` comments + empty DSN placeholders | ✓ |
| 3 | `.secrets/staging/sentry.yaml` SOPS-encrypted with 2 staging DSN placeholders + 2 `# TODO` comments | ✓ |
| 4 | ~~Sentry's native Telegram integration configured~~ | **DEFERRED** ✓ (per ADR-0010 amendment) |
| 5 | `docs/RUNBOOKS/sentry-ops.md` §0 + §1–§6 + ≥110 lines | ✓ (353 lines) |
| 6 | Plan 05-05 unblocked — `SENTRY_DSN_BACKEND` env-var seam exists (empty triggers D-38 guard → no-op) | ✓ |
| 7 | Plan 05-07 unblocked — `GRAFANA_ADMIN_PASSWORD_BCRYPT` + `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` populated | ✓ |

---

## Carry-forward (must surface in Phase 5 closeout SUMMARY + Phase 21 acceptance)

### R-07 — Sentry SaaS activation must happen before v1.0-rc.1 → public-beta

**Trigger:** Phase 21 staging-soak acceptance gate
**Action:** Execute the 6-step activation checklist in `docs/RUNBOOKS/sentry-ops.md §0`
**Estimated effort:** ~20 min (one SOPS edit + one `make deploy` + one sentry.io UI Telegram config)
**Risk:** R-07 NEW in ADR-0010 — deferral becomes permanent by neglect

### R-08 — Pre-rotation Telegram tokens must return 401

**Trigger:** Phase 21 staging-soak acceptance gate
**Action:** Curl `getUpdates` against the leaked-in-chat token AND the first-rotation token → expect HTTP 401 for both
**Current state:** Both pre-rotation tokens were revoked by BotFather automatically when the user did `/revoke` twice; verification is a 30-second smoke test
**Risk:** R-08 in ADR-0010 — closes only when verification command exit 0

### SOPS_AGE_KEY_FILE missing from dev workstation setup docs

**Trigger:** next dev onboarding OR next time someone tries `sops -d` and hits the "no identity matched" error
**Action:** Add `export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"` to `docs/RUNBOOKS/deploy.md §1` (Dev workstation setup)
**Status:** Documented in `docs/RUNBOOKS/sentry-ops.md §2.0` as part of this plan; `deploy.md §1` integration deferred to Phase 5 closeout SUMMARY task

### `.gitleaks.toml` missing rules for Telegram tokens + Sentry DSN patterns

**Trigger:** future leak event (R-08 was the first; would have been pre-commit-blocked if rules existed)
**Action:** Add rules to `.gitleaks.toml`:
- `regex: '^\d{8,10}:[A-Za-z0-9_-]{30,40}$'` for Telegram bot tokens
- `regex: 'https://[a-f0-9]+@o\d+\.ingest\.sentry\.io/\d+'` for sentry.io SaaS DSN
- `regex: 'sentry-cli.*--auth-token=[a-f0-9]{64}'` for sentry-cli tokens (post-v1.0)
**Status:** Deferred to Phase 6 EDGE-* (edge defense round) — not Phase 5 scope. Logged here.

---

## Unblocks

- **Plan 05-05** (Wave 1 — depends_on `[05-02]`) — `pkg/observability/{otel_init.go, sentry_init.go}` D-38 empty-DSN guard now has the env-var seam ready (`SENTRY_DSN_BACKEND` decrypts to `""`).
- **Plan 05-07** (Wave 2 — depends_on `[05-02]`) — observability-stack deploy script can SOPS-decrypt `GRAFANA_ADMIN_PASSWORD_BCRYPT` for Caddy basicauth + `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` for Grafana D-26 alerting contact point.

---

## File inventory

```
NEW:
  .secrets/prod/sentry.yaml                    2964 B  (SOPS-encrypted, 6 keys + 2 TODOs)
  .secrets/staging/sentry.yaml                 1684 B  (SOPS-encrypted, 2 keys + 2 TODOs)
  docs/RUNBOOKS/sentry-ops.md                  353 lines

DEFERRED ARTIFACTS (Task 1 + Task 5 — sentry.io UI work):
  sentry.io organization (slug TBD when activated)
  sentry.io projects: prod-backend, staging-backend, prod-mobile, staging-mobile
  sentry.io Telegram integration on prod-backend project

MODIFIED:
  docs/DECISIONS/0010-sentry-saas-and-colocation.md   (amendment section + R-07 + R-08)
  .planning/phases/05-observability-backend/05-CONTEXT.md   (D-33 amended + D-38 added)
  .planning/phases/05-observability-backend/05-02-PLAN.md   (v3 rewrite)
  .planning/phases/05-observability-backend/05-05-PLAN.md   (D-38 empty-DSN guards)
  .planning/phases/05-observability-backend/05-06-PLAN.md   (acceptance steps 1, 2, 7 deferred)
```

Total: 3 new files (~5,000 bytes ciphertext + 353 lines markdown), 5 modified planning docs, 4 atomic commits.

---

## Plan 05-02 v3 closes Wave 1

Wave 1 state after this SUMMARY:

| Plan | Wave | Status |
|------|------|--------|
| 05-02 v3 | 1 | ✅ DONE (this SUMMARY) |
| 05-03 | 1 (was Wave 2 in original plan) | ✅ DONE pre-reshape (commits `6dfcef3..183beb0`) |
| 05-05 | 1 (DAG-derived; declared wave 3) | ⏳ blocked-on-Wave-2-completion-by-orchestrator-convention; could run in parallel with 05-07 |

Phase 5 next: **Wave 2 Plan 05-07** (observability-stack: Loki + Grafana + Prometheus on `srv1561293` + Caddy on `:8443` self-signed + D-26 alert rules). This is the largest single autonomous deploy of Phase 5.

---

*Plan: 05-02 v3 — Sentry SaaS deferred + Grafana/Telegram SOPS substrate + Sentry RUNBOOK*
*Phase: 05-observability-backend*
*Executed: 2026-05-19 PM*
