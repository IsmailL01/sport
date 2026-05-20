# Phase 6: Release signing — Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 11 new + 2 modified
**Analogs found:** 11 / 13 strong; 2 partial (no SOPS-binary-base64 analog, no Apple Developer enrollment analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.secrets/prod/mobile-signing.yaml` (NEW) | data (SOPS-encrypted bundle) | static-data-at-rest | `.secrets/prod/sentry.yaml` (SOPS w/ DSN slots) + `.secrets/prod/mapbox.yaml` (`sops --set` workflow) | role-match (string slots) + partial (no binary-base64 analog) |
| `.planning/phases/06-release-signing/evidence/smoke-roundtrip.sh` (NEW) | smoke-script (bash one-shot) | script | `scripts/deploy_observability_stack.sh` (bash + `set -euo pipefail` shape) + `services/backend/scripts/smoke_otp.py` (probe + must/exit semantics in Python) | role-match |
| `evidence/smoke-keystore-generated.sh` (NEW) | smoke | script | sibling `smoke-roundtrip.sh` | exact |
| `evidence/smoke-sops-roundtrip.sh` (NEW) | smoke | script | sibling + `services/backend/scripts/secrets/verify_sops_roundtrip.sh` (Plan 02-01 artifact) | exact |
| `evidence/smoke-sha256-captured.sh` (NEW) | smoke | script | sibling | exact |
| `evidence/smoke-ios-cert-roundtrip.sh` (NEW) | smoke | script | sibling | exact |
| `evidence/smoke-ios-provprofile.sh` (NEW) | smoke | script | sibling | exact |
| `evidence/smoke-asc-api-key.sh` (NEW) | smoke | script | sibling | exact |
| `evidence/keystore-sha256.txt` (NEW) | side-file (raw evidence artifact) | static-data | `.planning/phases/05-observability-backend/evidence/srv1561293-pre-deploy.txt` (raw `cmd \| out` dump used as audit trail) | role-match |
| `docs/SECRETS.md` (MOD — extend) | doc (rotation/recovery playbook) | static-doc | self — existing `## Rotation Playbook — Mapbox pk. token` section is the canonical 4-step shape | exact |
| `.sops.yaml` (MAYBE-MOD per D-14) | config (recipient list) | static-declarative | self — existing `.sops.yaml` from Plan 02-01 | exact |
| Plan 06-01 frontmatter+tasks (NEW) | plan-doc | static-doc | `02-01-PLAN-sops-scaffold.md` (autonomous=false + Task 0 USER ACTION checkpoint pattern) | exact |
| Plan 06-02 frontmatter+tasks (NEW) | plan-doc | static-doc | `02-04-PLAN-mapbox-incident-and-docs.md` (multi-checkpoint pattern with 2 USER ACTIONs sandwich) + `05-06-PLAN.md` Task 6 (final-acceptance USER ACTION) | exact |

---

## Section 1 — New SOPS slot file `.secrets/prod/mobile-signing.yaml`

### Analog A: existing slot file shape

**File:** `.secrets/prod/sentry.yaml` (Phase 5 artifact)
**Why:** closest *string-slot* layout (multi-key SOPS YAML with several KEY: ENC[...] entries, comment annotations between fields, SaaS-issued IDs alongside passwords). Lines 1-12 of the encrypted form show the same flat `KEY: ENC[...]` layout that Phase 6 needs for `keystore_password`, `key_password`, `provisioning_profile_uuid`, `team_id`, `asc_api_key_id`, `asc_api_issuer_id`.

**Plaintext-shape excerpt** (what `sops -d .secrets/prod/sentry.yaml` produces — derived from the slot definitions in Plan 05-02):

```yaml
# Sentry DSNs — populate after sentry.io org + 4 projects created (Plan 05-02 Task 6).
# Until populated, services read SENTRY_DSN_BACKEND="" → SDK is dormant per ADR-0010.
SENTRY_DSN_BACKEND: ""
# Mobile DSN — populated in Phase 17 when react-native @sentry/react-native installed.
SENTRY_DSN_MOBILE: ""
# Grafana admin — generated 2026-05-19 via `openssl rand -base64 32`; bcrypt'd for grafana.ini.
GRAFANA_ADMIN_PASSWORD: <32-byte-random-base64>
GRAFANA_ADMIN_PASSWORD_BCRYPT: <bcrypt of above>
# Telegram bot — created via BotFather; chat_id from /getUpdates after bot added to alert channel.
TELEGRAM_BOT_TOKEN: <bot:token-from-botfather>
TELEGRAM_CHAT_ID: <numeric-id>
```

**Divergence for `mobile-signing.yaml`:** add nested 2-level structure (`android:` / `ios:`) per D-03; add base64-encoded binary fields (`keystore_base64`, `distribution_cert_p12_base64`, `provisioning_profile_base64`, `asc_api_key_p8_base64`) — these are net-new field types with no in-repo analog. Each binary field is ~3-10 KB base64-encoded YAML scalar.

### Analog B: `sops --set` write workflow

**File:** `.planning/phases/02-secrets-and-config-hardening/02-04-PLAN-mapbox-incident-and-docs.md` lines 326-348 (the canonical non-interactive SOPS write that the planner should mirror).

**Excerpt** (verbatim, lines 327-334):

```bash
For prod:
```bash
# Programmatic SOPS update (avoids interactive editor):
sops --set '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"] "<MAPBOX_PK_PROD>"' .secrets/prod/mapbox.yaml
sops --set '["MAPBOX_DOWNLOADS_TOKEN"] "<MAPBOX_SK_BUILD>"' .secrets/prod/mapbox.yaml
```
(Note: `sops --set` syntax verified against sops v3.13.0 — if the exact flag form differs, fall back to `EDITOR=ed sops ...` with a printf-driven `ed` script. The goal is non-interactive write without ever printing the value to stdout.)
```

**Confirmation in `docs/SECRETS.md:23`** (Incident Log row):
> "SOPS `.secrets/{prod,staging,dev}/mapbox.yaml` обновлены через `sops --set` (non-interactive); round-trip decrypt verified"

**Divergence for Phase 6:**
- Mapbox uses `sops --set '[KEY] "value"'` (scalar string). Phase 6 needs **nested** field paths `'["android"]["keystore_base64"]'` — verified by RESEARCH §"Claude's Discretion" + CONTEXT D-15(d).
- For binary base64 payloads of ~5 KB, RESEARCH recommends `sops set --value-file /tmp/keystore.b64 .secrets/prod/mobile-signing.yaml '["android"]["keystore_base64"]'` (SOPS 3.11+) to avoid shell `ARG_MAX` + history exposure. Planner should encode this as the primary form, with `sops --set` shell-arg form as fallback (per the 02-04 "if syntax differs" escape hatch).

### Analog C: `.sops.yaml` recipient list (read-only verify per D-14)

**File:** `.sops.yaml` (repo root, Plan 02-01 artifact) — already inlined in `<upstream_input>` above.

**Excerpt** (lines 22-32):

```yaml
# Recipient list (comma-separated string per SOPS spec):
#   - DEV_A: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
#   - TODO(DEV_B): append second developer's age public key once provided.
#   - CI deploy key (Phase 4) appended here once issued.
creation_rules:
  - path_regex: \.secrets/.*\.yaml$
    age: age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my
```

**Per D-14 + RESEARCH blocker finding:** CI age key is still on the TODO list. Plan 06-01 Wave 0 must either:
1. Confirm Phase 4 added it via `grep -c 'age1' .sops.yaml` ≥ 2 → no-op; OR
2. Defer to Phase 7 if CI key generation belongs there (per RESEARCH blocker).

Pattern action: **the planner should NOT add a CI key in Phase 6**; instead encode a guard task that asserts the current state and references Phase 7 if guard fails. The existing `path_regex: \.secrets/.*\.yaml$` already covers the new `mobile-signing.yaml` file (no `.sops.yaml` edit needed — verified via the regex literal).

---

## Section 2 — Bash smoke scripts (`evidence/smoke-*.sh`)

### Analog: `scripts/deploy_observability_stack.sh` (Plan 05-07)

**Why:** closest in-repo bash + `set -euo pipefail` + idempotent stylistic shape. Phase 6 smokes are simpler (single probe, no scp/ssh side-effects), but the shebang + flag-handling + final exit-code semantics come from here.

**Excerpt** (lines 1-25, verbatim):

```bash
#!/usr/bin/env bash
# Phase 5 / Plan 05-07 v2 — Deploy Loki+Prom+Grafana stack to srv1561293
# Idempotent: re-running this script applies deltas; safe for repeat invocations.
#
# Pre-reqs:
#   - SOPS_AGE_KEY_FILE set (or ~/.config/sops/age/keys.txt findable)
#   - `ssh myvps` works passwordless
#   - infra/observability-stack/ staged in repo (Plan 05-07 Tasks 1-3)
#
# Usage:
#   ./scripts/deploy_observability_stack.sh           # full deploy
#   ./scripts/deploy_observability_stack.sh --dry-run # stage locally only; no scp/ssh

set -euo pipefail

# ---------- CONFIG ----------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_STAGING="$REPO_ROOT/infra/observability-stack"
```

### Analog: `services/backend/scripts/smoke_otp.py` (Phase 2 smoke pattern)

**Why:** canonical "must/exit-code" probe semantics. Phase 6 smokes are bash not Python, but the verb shape ("name + condition + exit 1 on fail, print pass on green") is what `must()` (line 59-63) embodies. The planner should mirror this in bash via a small helper.

**Excerpt** (lines 59-64):

```python
def must(s, expect, name, body=None):
    if s != expect:
        print(f"❌ {name}: expected {expect}, got {s}: {body}")
        sys.exit(1)
    print(f"✓ {name} → {s}")
```

### Recommended bash skeleton for each `evidence/smoke-*.sh`

Each of the 7 smokes follows the same minimal shape. Below is the canonical template the planner should write 7 times (one per task verification row in `06-VALIDATION.md §"Per-Task Verification Map"`):

```bash
#!/usr/bin/env bash
# Phase 6 / Plan 06-0{1,2} Task <NN> — <one-line probe purpose>
# Verifies <06-VALIDATION.md row> by <decrypt+round-trip+inspect> sequence.
#
# Exit codes:
#   0 — smoke green
#   1 — smoke red (probe assertion failed)
#   2 — pre-req missing (sops/yq/keytool/openssl absent → see Wave 0 checklist)
#
# Usage:
#   bash .planning/phases/06-release-signing/evidence/smoke-<name>.sh

set -euo pipefail

# ---------- pre-req guard (Wave 0) ----------
for bin in sops yq keytool openssl base64; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "❌ pre-req missing: $bin (see .planning/phases/06-release-signing/06-VALIDATION.md §Wave 0)"
    exit 2
  }
done

# ---------- helper (mirrors smoke_otp.py must()) ----------
must() {
  # must <name> <expected> <actual> [<detail>]
  local name="$1" expected="$2" actual="$3" detail="${4:-}"
  if [ "$actual" != "$expected" ]; then
    echo "❌ ${name}: expected '${expected}', got '${actual}' ${detail}"
    exit 1
  fi
  echo "✓ ${name} → ${actual}"
}

# ---------- probe ----------
# <task-specific decrypt + assert>
# e.g. for smoke-sops-roundtrip.sh:
TMP=$(mktemp -d -t sport-sign-XXXXXX)
trap 'rm -rf "$TMP"' EXIT

sops -d .secrets/prod/mobile-signing.yaml \
  | yq -r '.android.keystore_base64' \
  | base64 -d > "$TMP/keystore.p12"

LISTING=$(keytool -list -keystore "$TMP/keystore.p12" -storepass "$(sops -d .secrets/prod/mobile-signing.yaml | yq -r '.android.keystore_password')" 2>&1 | grep -c 'runningecosystem-release')
must "alias-present" "1" "$LISTING"

echo "🎉 smoke green: SOPS round-trip → keystore listing"
```

**Pattern divergences per smoke:**

| Smoke script | Specific probe |
|--------------|----------------|
| `smoke-keystore-generated.sh` | `keytool -list -v -keystore <ramdisk>.p12` produces 1 alias + RSA 4096 + validity ≥ 2125-01 (per VALIDATION row 06-01-01) |
| `smoke-sops-roundtrip.sh` | template above (decrypt → base64 -d → keytool -list) |
| `smoke-sha256-captured.sh` | `keytool -list -v ... \| grep SHA256:` extracts 32-byte fingerprint AND `test -f evidence/keystore-sha256.txt` AND file content matches |
| `smoke-ios-cert-roundtrip.sh` | `sops -d \| yq -r .ios.distribution_cert_p12_base64 \| base64 -d \| openssl pkcs12 -info -password pass:"$(sops -d \| yq -r .ios.distribution_cert_password)"` exits 0 |
| `smoke-ios-provprofile.sh` | base64-decode → `security cms -D -i <profile>.mobileprovision` → grep `<key>UUID</key>` matches `ios.provisioning_profile_uuid` SOPS field |
| `smoke-asc-api-key.sh` | base64-decode → `openssl ec -in <p8> -text -noout` (P8 is an EC private key) parses |
| `smoke-roundtrip.sh` | umbrella runner — sources/exec's the 6 sub-smokes in order, aggregates pass/fail count, exits 0 only if all 6 green |

---

## Section 3 — `docs/SECRETS.md` "Mobile signing — recovery" section

### Analog: `## Rotation Playbook — Mapbox \`pk.\` token` (existing in `docs/SECRETS.md` lines 177-220)

**Why:** Phase 6 D-15 explicitly says "extend `docs/SECRETS.md` with new section ... [following] the same template". The Mapbox `pk.` playbook is the most recently-revised template (Plan 02-04, 2026-05-16); it has the canonical 4-step Russian-headed shape that Phase 6's 4-scenario recovery section must mirror.

**Excerpt** (lines 177-220, verbatim — the entire section the planner mimics):

```markdown
## Rotation Playbook — Mapbox `pk.` token (4 шага)

Запускается при подозрении на утечку (попадание `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` в чат / git history / EAS Build logs / screenshot бандла), **или** по плановому графику (раз в 6 месяцев — fallback per RESEARCH Pitfall 9), **или** при смене Bundle ID / SHA-256 fingerprint (например, новый release keystore).

`pk.` тоже public, но утечка → возможность злоупотребления квотой нашего Mapbox-аккаунта со стороны. **Per-env separation** (prod / staging / dev) изолирует blast radius.

### Шаг 1. Создать новый `pk.` в Mapbox dashboard

1. Открыть https://account.mapbox.com/access-tokens (sign in: `iassd` / `dragon2015516@gmail.com`).
2. **Create a token**. Имя: `sport-mobile-runtime-pk-{prod|staging|dev}-<YYYY-MM>`.
3. **НЕ ставить** галочку «Secret access token» — иначе префикс будет `sk.`, а нам нужен public.
...

### Шаг 2. Обновить SOPS

```bash
EDITOR=vim sops .secrets/<env>/mapbox.yaml
# Под ключом EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: вставить новое pk. значение, save.
```

См. `docs/RUNBOOKS/sops-edit.md` §2 «Edit existing encrypted file».

### Шаг 3. Deploy

См. `docs/RUNBOOKS/sops-edit.md` §9 «Deploy sequence (SCP-based prod deploy)». ...

### Шаг 4. Validation

```bash
PK_NEW=$(sops -d --extract '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"]' .secrets/<env>/mapbox.yaml)
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=$PK_NEW"
unset PK_NEW
# Expected: 200 ...
```

После validation — **revoke старый `pk.`** в dashboard (`Delete` button); дописать запись в §«История ротаций» (дата, кто, причина).

---
```

### Recommended section shape for Phase 6 (planner copies the rhythm)

The Phase 6 section is a **recovery** playbook (not rotation), so the "Запускается" lead changes from "при подозрении на утечку OR график" to "при потере age-key / keystore corruption / iOS cert revoke". The 4 scenarios from D-15 (a/b/c/d) replace the 4 numbered steps. Skeleton:

```markdown
## Mobile signing — recovery

Запускается при одном из 4 сценариев потери material'а для подписи мобильных билдов. Phase 6 / SIGN-01 + SIGN-02. См. `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md` §"closed-beta blast radius".

**Контекст:** `.secrets/prod/mobile-signing.yaml` хранит Android keystore + iOS distribution bundle (см. ADR-?, Phase 6 CONTEXT D-01..D-19). Recovery невозможна без age private key — back-up на 2 encrypted-DMG USB sticks (D-07).

### Сценарий (a). Age key потерян на workstation → restore from USB (~5 min)

1. Вставить USB-A (`SPORT-RECOVERY-A`) — лежит в <home location, заполнить пользователем во время Plan 06-01 Task N USER ACTION>.
2. Mount encrypted DMG: `hdiutil attach /Volumes/SPORT-RECOVERY-A/sport-recovery.dmg` (passphrase из laminated recovery card на USB).
3. Restore age key: `cp /Volumes/sport-recovery/age-keys.txt ~/.config/sops/age/keys.txt && chmod 600 ~/.config/sops/age/keys.txt`.
4. Verify: `sops -d .secrets/prod/mobile-signing.yaml | head -3`. Если decrypt работает — recovery green.
5. `hdiutil detach /Volumes/sport-recovery`. Storage USB обратно в <location>.

### Сценарий (b). Age key потерян везде (2 USB утеряны + workstation) — CATASTROPHIC

**Последствие:** existing closed-beta APK installs не получат update (Android refuse signed-by-different-key). iOS TestFlight builds работают до expiry, после — невозможно publish new.

**Mitigation:** документировано в D-07 (2 USB в 2 разных физических locations) + Phase 2 D-04 (1Password sealed entry per dev). Probability of all 3 failing approaches zero.

**Tester communication template** (см. `docs/RUNBOOKS/closed-beta-comms.md` если/когда сценарий случится):
> "К сожалению, нам пришлось пересоздать подпись приложения. Удалите старую версию ... установите новую с <URL>."

### Сценарий (c). Keystore corrupted, age key OK

1. SOPS YAML — текстовый формат, corruption улавливается визуально перед commit. Если уже committed: `git restore .secrets/prod/mobile-signing.yaml` из git history (encrypted form в репо).
2. Если и git history broken — переход к сценарию (b).

### Сценарий (d). iOS distribution cert revoked / expired (annual)

См. `https://developer.apple.com/account/resources/certificates/list`. Steps:

1. Apple Dev portal → Certificates → **Distribution** → revoke old → **+** → Apple Distribution → upload CSR (`Keychain Access → Certificate Assistant → Request a Certificate From a CA → save to disk`).
2. Download new `.cer`, double-click → installs in Keychain. Export private key + cert as `.p12` с explicit password (NOT default).
3. Provisioning profile auto-regenerates когда cert changes; download new `.mobileprovision`.
4. Update SOPS:
   ```bash
   base64 -i ~/Downloads/distribution.p12 > /tmp/p12.b64
   sops set --value-file /tmp/p12.b64 .secrets/prod/mobile-signing.yaml '["ios"]["distribution_cert_p12_base64"]'
   shred -u /tmp/p12.b64 2>/dev/null || rm -P /tmp/p12.b64    # macOS shred fallback
   ```
5. Existing TestFlight builds работают до их expiry; новые build'ы используют new cert (Phase 7 / EAS production profile).

См. также `docs/SECRETS.md §SOPS_AGE_KEY` (recipient rotation в случае compromise age key самого по себе).

---
```

**Divergence notes for the planner:**

- The Mapbox `pk.` analog has 4 *numbered shell steps*; Phase 6's analog has 4 *scenarios* labeled (a)/(b)/(c)/(d). Same indentation depth (`### Сценарий (X)`) — keeps the doc's `## Rotation Playbook` ToC scannable.
- Russian header style is locked: `## <Title>` + `Запускается при ... <triggers>` lead + `### Шаг N. <action>` or `### Сценарий (X). <action>` body.
- All shell snippets MUST use `base64 -i` (BSD on macOS — see RESEARCH §"Standard Stack" footnote). Phase 6 RUNBOOK has no GNU `base64 -w0` invocation anywhere.
- Per CLAUDE.md "Не коммитить секреты": placeholder values only in the doc itself (`<base64 of .jks bytes>`, `<32-byte random>`). No real keystore base64 ever appears.
- D-19 cross-link: scenario (d) does NOT mention the Mapbox SHA-256 restriction (separate `/gsd-fast mapbox-restrict` follow-up). The keystore-sha256.txt side-file is referenced from a NEW row in `## Инвентарь токенов` table, not from this recovery section.

---

## Section 4 — Side-file evidence (`evidence/keystore-sha256.txt`)

### Analog: `.planning/phases/05-observability-backend/evidence/srv1561293-pre-deploy.txt`

**Why:** existing precedent for "raw `cmd → stdout` dump committed as audit artifact in a `phases/<NN>/evidence/` subdir". The Phase 5 deploy used these to capture pre/post-deploy state for the hands-off verification of niko-prod. Phase 6's `keystore-sha256.txt` is the same shape: a single block of `keytool -list -v` output, committed once, never edited.

**Excerpt** (the existing analog, lines 1-12):

```
=== docker ps PIDs ===
niko-prod-frontend-1 ca266d8ad127
...
=== nginx PIDs ===
2733838 nginx: master process /usr/sbin/nginx -c /etc/nginx/nginx.conf
3109920 nginx: worker process
...
=== /etc/nginx hash ===
75c947b91203d6780373cd0b738cf37e  /etc/nginx/sites-available/project.conf
```

### Recommended `keystore-sha256.txt` shape

The planner should produce a similarly flat file — heading bands (`=== ... ===`) + raw command output between them. Phase 6 has only 1 band:

```
=== keytool -list -v -keystore /Volumes/SIGN_RAM/runningecosystem.p12 -storepass <env> ===
# Captured: 2026-MM-DD (Plan 06-01 Task M) on RAM-disk during keystore generation
# Source: keytool 22.0.x (Apple silicon JDK 17+); macOS 26.2 (Tahoe)

Keystore type: PKCS12
Keystore provider: SUN

Your keystore contains 1 entry

runningecosystem-release, May DD 2026, PrivateKeyEntry,
Certificate fingerprint (SHA-256): XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX

=== machine-readable SHA-256 (for Mapbox dashboard restriction tightening, D-19) ===
XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
```

**Divergence:** unlike the Phase 5 evidence dump, `keystore-sha256.txt` is **consumed downstream** by the user during the `/gsd-fast mapbox-restrict` task and by Phase 8 (manifest verification). Committed to git (no secrets — SHA-256 is a public fingerprint per Android best-practice docs). The Plan 06-01 task that captures it should append `\necho "evidence written to $(ls -la evidence/keystore-sha256.txt)"` for trail.

---

## Section 5 — Plan task structure (frontmatter + USER ACTION encoding)

### Analog A: `autonomous: false` plan with Task 0 USER ACTION

**File:** `.planning/phases/02-secrets-and-config-hardening/02-01-PLAN-sops-scaffold.md` lines 1-95 (frontmatter) + 137-163 (Task 0 USER ACTION).

**Frontmatter excerpt** (lines 1-30 — pattern Phase 6 plans copy):

```yaml
---
phase: 02-secrets-and-config-hardening
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .sops.yaml
  - .gitattributes
  ...
autonomous: false
requirements:
  - SEC-02
tags:
  - secrets
  - sops
  - age
  - encryption
user_setup:
  - service: sops+age toolchain
    why: "SOPS encryption requires sops + age binaries installed per developer workstation"
    install_cmd: "brew install sops age gitleaks trufflehog pre-commit"
    expected_versions:
      sops: ">= v3.13.0"
      age: ">= v1.3.1"
  - service: age master key
    why: "Per-developer X25519 key required to encrypt/decrypt .secrets/**"
    action: "Each developer runs `age-keygen ...`"

must_haves:
  truths:
    - "sops + age + gitleaks + ... installed locally at HIGH-confidence pinned versions"
    ...
  artifacts:
    - path: .sops.yaml
      provides: "creation_rules for .secrets/**/*.yaml with age recipients"
      contains: "creation_rules"
    ...
---
```

**Task 0 USER ACTION excerpt** (lines 137-163, verbatim — the canonical XML structure):

```xml
<task type="checkpoint:human-action" gate="blocking">
  <name>Task 0: USER ACTION — Install toolchain + generate per-dev age keys</name>
  <what-built>
    Claude has prepared the plan; the next steps require physical access to each developer workstation (private-key material cannot leave the workstation, per D-04). After this checkpoint clears, all subsequent tasks are autonomous.
  </what-built>
  <how-to-verify>
    1. Run: `brew install sops age gitleaks trufflehog pre-commit` (≈30 s on M1/M2 Mac).
    2. Verify versions meet HIGH-confidence pins from RESEARCH §Standard Stack:
       - `sops --version` → `3.13.x` or newer
       ...
    3. Generate this dev's age key:
       ```bash
       mkdir -p ~/.config/sops/age
       age-keygen -o ~/.config/sops/age/keys.txt
       chmod 600 ~/.config/sops/age/keys.txt
       ```
       Note the **public key** printed to stderr (`Public key: age1...`).
    ...
    7. Paste both public keys here as the resume signal so Task 1 can write them into `.sops.yaml`.
  </how-to-verify>
  <resume-signal>Paste both age public keys (format `age1xxxx...`), one per line, labeled `DEV_A_AGE_PUBKEY:` and `DEV_B_AGE_PUBKEY:`...</resume-signal>
</task>
```

**Apply to Phase 6:**

- **Plan 06-01 Task 0** (Wave 0 — `<task type="auto">`) creates the `evidence/` dir + 7 smoke-script stubs + `tool-versions.txt` (per VALIDATION.md "Wave 0 Requirements"). Mirrors the SOPS plan's pre-bootstrap setup but is *autonomous* (no human keystrokes needed for `mkdir + touch`).
- **Plan 06-01 Task N** (final — `<task type="checkpoint:human-action" gate="blocking">`) is the 2-USB physical-placement USER ACTION per D-17. Direct mirror of Task 0's shape above: `<what-built>` recap + `<how-to-verify>` numbered steps + `<resume-signal>` paste-back.

### Analog B: `autonomous: false` plan with multiple USER ACTIONs (sandwich)

**File:** `.planning/phases/02-secrets-and-config-hardening/02-04-PLAN-mapbox-incident-and-docs.md` lines 201-321.

**Why:** Plan 06-02 has the same "USER ACTION Task 0 → auto tasks → USER ACTION final" sandwich as 02-04 (which has Task 1 USER ACTION → Task 2 auto → Task 3 USER ACTION → Task 4 auto). Specifically:

- 06-02 Task 0 = Apple Developer enrollment (D-17 — wall-clock 2-7+ weeks per RESEARCH §1) — analog of 02-04 Task 1 ("verify Mapbox dashboard restriction UI availability")
- 06-02 Tasks 1-3 = auto SOPS-writes for cert + profile + ASC API key — analog of 02-04 Task 2 + 4 (auto writes)
- 06-02 Task 4 = `docs/SECRETS.md` extend with recovery playbook — analog of 02-04 Task 2 (auto doc-extend)

**Excerpt** (02-04 lines 201-217, the verify-before-mutate gate that 06-02 Task 0 mirrors):

```xml
<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: USER ACTION — Verify Mapbox Bundle ID restriction UI availability (verify-before-rotate)</name>
  <what-built>
    Claude has prepared ADR-0006 skeleton (Task 2) and the rotation playbooks. Before the user proceeds to revoke the 3 prior Mapbox tokens (a destructive, irreversible operation), this checkpoint confirms RESEARCH Pitfall 9's MEDIUM-confidence assumption ...
  </what-built>
  <how-to-verify>
    1. Open https://account.mapbox.com/access-tokens ...
    ...
    6. Report back to Claude which of the following is true:
       - **(A) Available as documented** — ...
       - **(B) Partial** — ...
       - **(C) Unavailable** — ...
  </how-to-verify>
  <resume-signal>Type "A" / "B (missing: ios|android)" / "C" to indicate restriction UI status...</resume-signal>
</task>
```

**Apply to Plan 06-02 Task 0:** same shape; resume-signal is the 10-character Apple Team ID (e.g. `A1B2C3D4E5`) + confirmation that Apple Developer app is installed on a biometric-capable device (D-09 + RESEARCH §1).

### Analog C: final-acceptance USER ACTION at end of plan

**File:** `.planning/phases/05-observability-backend/05-06-PLAN.md` lines 567-624 (Task 6 USER ACTION 4 — final acceptance walkthrough).

**Why:** the "11-step checklist that user runs + Claude records evidence into SUMMARY" shape is the closest precedent for Plan 06-01's final USER ACTION (2-USB placement + recovery drill). Both are end-of-plan, multi-step, all-or-nothing gates that produce evidence artifacts.

**Excerpt** (lines 567-590):

```xml
<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 6: USER ACTION 4 — Final acceptance walkthrough + ROADMAP closeout</name>
  <files>
    .planning/ROADMAP.md,
    .planning/phases/05-observability-backend/05-06-SUMMARY.md
  </files>
  <read_first>
    - docs/RUNBOOKS/sentry-ops.md §Acceptance Walkthrough ...
    - .planning/phases/05-observability-backend/05-VALIDATION.md ...
    ...
  </read_first>
  <what-built>
    By this point (post-Task 5), all six Phase 5 plans have shipped artifacts ...
    Everything is now wired; this checkpoint is the end-to-end runtime acceptance.
  </what-built>
  <how-to-verify>
    Execute the 11-step **Acceptance Walkthrough** checklist from `docs/RUNBOOKS/sentry-ops.md §9` verbatim. Each step's pass/fail is recorded in the 05-06-SUMMARY.md evidence block.

    1. ...
    11. **Write 05-06-SUMMARY.md** — Following `$HOME/.claude/get-shit-done/templates/summary.md` structure: outcome ...
  </how-to-verify>
```

**Apply to Plan 06-01 final Task** (2-USB physical placement). Verbatim mirror of the above with these substitutions:
- `read_first` → `docs/SECRETS.md §"Mobile signing — recovery" §Сценарий (a)` + `06-VALIDATION.md §"Manual-Only Verifications"`.
- `how-to-verify` step count: 5 (not 11) — (1) format USB-A, (2) create encrypted DMG, (3) copy age-keys.txt + mobile-signing.yaml + recovery-card.pdf, (4) test mount-and-decrypt round-trip on USB-A, (5) repeat for USB-B, (6) physical placement of USB-A at home + USB-B at <user-selected location>, (7) confirm by typing two location strings into resume-signal.
- `resume-signal` → `USB-A placed at: <location>. USB-B placed at: <location>. Both mounts verified decrypt-clean.`

---

## Section 6 — Wave 0 prerequisite task structure

### Analog: Plan 02-01 Task 0 + Wave 0 pattern

**File:** `02-01-PLAN-sops-scaffold.md` Task 0 (already excerpted above) + `06-VALIDATION.md §"Wave 0 Requirements"` (which Phase 6 already populated).

**Excerpt** (06-VALIDATION.md lines 57-70, verbatim — the planner's Wave 0 spec):

```markdown
## Wave 0 Requirements

Wave 0 = environment prerequisites before Plan 06-01 / 06-02 tasks can execute. Per RESEARCH §0:

- [ ] `yq` installed (`brew install yq` — 4.x for SOPS-decoded YAML extraction)
- [ ] `sops` version ≥ 3.11 (`sops --version` — `set --value-file` syntax requires this; current local is `3.13.1` per researcher, confirms ≥ 3.11)
- [ ] `keytool` available (JDK 17+ — comes with Apple silicon Java; `keytool -help` succeeds)
- [ ] `openssl` ≥ 3.0 (`openssl version` — for `.p12` + `.p8` round-trip verification)
- [ ] `hdiutil` available (macOS-native; `hdiutil help` succeeds — for RAM-disk pattern replacing broken `shred -u` per RESEARCH Pitfall 11)
- [ ] `.planning/phases/06-release-signing/evidence/` directory created
- [ ] 2× empty USB sticks (or 2× exFAT-formatted partitions on existing drives) prepared for encrypted-DMG copy
- [ ] Stub smoke scripts created in `evidence/` so the per-task verification map above resolves at planner time
```

### Recommended Wave 0 task encoding

Plan 06-01 Task 0 (Wave 0, autonomous=true sub-task — distinct from the user-facing toolchain bootstrap that mirrors 02-01's Task 0):

```xml
<task type="auto">
  <name>Task 0 (Wave 0): Create evidence/ scaffolding + tool-version capture + smoke-script stubs</name>
  <files>
    .planning/phases/06-release-signing/evidence/tool-versions.txt,
    .planning/phases/06-release-signing/evidence/smoke-keystore-generated.sh,
    .planning/phases/06-release-signing/evidence/smoke-sops-roundtrip.sh,
    .planning/phases/06-release-signing/evidence/smoke-sha256-captured.sh,
    .planning/phases/06-release-signing/evidence/smoke-ios-cert-roundtrip.sh,
    .planning/phases/06-release-signing/evidence/smoke-ios-provprofile.sh,
    .planning/phases/06-release-signing/evidence/smoke-asc-api-key.sh,
    .planning/phases/06-release-signing/evidence/smoke-roundtrip.sh
  </files>
  <action>
    1. mkdir -p .planning/phases/06-release-signing/evidence
    2. Capture tool versions per RESEARCH §"Version verification" block:
       ```bash
       {
         echo "## Tool versions captured at Phase 6 execution"
         date -u +"%Y-%m-%dT%H:%M:%SZ"; echo
         sops --version --check-for-updates 2>&1 | head -2
         yq --version
         openssl version
         keytool -help 2>&1 | head -1
         echo "macOS: $(sw_vers -productVersion)"
       } > .planning/phases/06-release-signing/evidence/tool-versions.txt
       ```
    3. Create 7 smoke-script stubs (template per §2 of 06-PATTERNS.md). Each stub initially `exit 2` with a "Wave 0 stub — implemented in Plan 06-0X Task N" message; Plan tasks edit them to land the real probes.
    4. `chmod +x evidence/smoke-*.sh`.
  </action>
  <verify>
    <automated>test -f .planning/phases/06-release-signing/evidence/tool-versions.txt && [ "$(ls .planning/phases/06-release-signing/evidence/smoke-*.sh | wc -l)" -eq 7 ] && bash .planning/phases/06-release-signing/evidence/smoke-roundtrip.sh; rc=$?; [ "$rc" -eq 2 ]</automated>
  </verify>
  <done>evidence/ dir present; tool-versions.txt captured; 7 smoke stubs exist + executable + exit 2 (pre-implementation). Atomic commit: `chore(06-wave0): evidence/ scaffolding + tool versions + smoke stubs (SIGN-01)`</done>
</task>
```

**Divergence from 02-01 Task 0:**
- 02-01 Task 0 is `checkpoint:human-action` (human installs sops + age + generates key pair); Phase 6 Wave 0 is `<task type="auto">` because tool *checking* is autonomous (the install was already done by Phase 2). If `command -v sops` fails, Plan 06-01 surfaces a Wave 0 BLOCKER and the planner should encode a SECOND checkpoint:human-action task that re-runs the 02-01 Task 0 bootstrap. Practically: emit a single auto-task that probes and only spawns the human-action gate if it fails.
- Phase 6 Wave 0 ALSO confirms `keytool` + `hdiutil` (not used in Phase 2) — these are macOS-bundled, no install step.

---

## Cross-cutting Shared Patterns

### Pattern A — Russian comments + English code identifiers

**Source:** `CLAUDE.md` standing instruction + `docs/SECRETS.md` 10-section playbook (all RU-headed).
**Apply to:** All `docs/SECRETS.md` extensions, all Plan task `<what-built>` blocks (English), all RUNBOOK `### Шаг N` headers (Russian per CLAUDE.md "Pattern D"). Bash + Python identifiers stay English. Smoke script `echo` lines: pass messages English (`✓ <name>`), error messages may switch to Russian per existing `smoke_otp.py` convention.

### Pattern B — `sops -d --extract` for non-interactive read into shell var, immediately `unset`

**Source:** `docs/SECRETS.md` lines 211-214 (Mapbox `pk.` Шаг 4. Validation) + Plan 02-04 Task 4 lines 352-360.

**Excerpt:**
```bash
PK_PROD=$(sops -d --extract '["EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"]' .secrets/prod/mapbox.yaml)
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "https://api.mapbox.com/...?access_token=$PK_PROD")
if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL: prod pk. validation returned $HTTP_CODE"
    exit 1
fi
unset PK_PROD HTTP_CODE
```

**Apply to:** Every Phase 6 smoke script that needs to read a SOPS field into a bash variable (e.g., `KS_PASS` for `keytool -storepass`, `P12_PASS` for `openssl pkcs12 -password`). The `unset` after use is mandatory per CLAUDE.md "Не коммитить секреты" + Plan 02-04 §Threat T-02-28 mitigation.

### Pattern C — Atomic commit messages with phase + plan + requirement ID

**Source:** every `<done>` block in 02-01 + 02-04 + 05-06 plans.

**Excerpts:**
- `feat(phase2-sec): add .sops.yaml + age recipients + merge-safety (SEC-02)` (02-01 Task 1)
- `feat(phase2-sec): populate .secrets/*/mapbox.yaml with rotated tokens + Incident Log close-out (SEC-03)` (02-04 Task 4)
- `docs(05-07): closeout SUMMARY — Wave 2 of Phase 5 closed` (recent commit 6296af6 from `gitStatus` recent commits)

**Apply to:** Phase 6 commit messages should use `feat(06-01)`, `feat(06-02)`, `docs(06-01)`, etc. Always append ` (SIGN-01)` or ` (SIGN-02)` requirement ID. Atomic per-task commits (1 task → 1 commit), no squash.

### Pattern D — Plan file numbering + naming

**Source:** All `.planning/phases/<NN>-<slug>/<NN>-<MM>-PLAN-<descriptor>.md` files (consistent across Phase 2..5).

**Examples:**
- `02-01-PLAN-sops-scaffold.md`
- `02-04-PLAN-mapbox-incident-and-docs.md`
- `05-06-PLAN.md` (Phase 5 dropped descriptor; planner choice — both forms accepted)
- `05-07-PLAN.md`

**Apply to:** Plan files should be `06-01-PLAN-android-keystore.md` and `06-02-PLAN-ios-cert-and-asc.md` (descriptor form per Phase 2 convention, since Phase 6 has only 2 plans and named descriptors aid grepping).

---

## No Analog Found (planner falls back to RESEARCH.md)

| File | Why no analog | Fallback source |
|------|---------------|-----------------|
| `.secrets/prod/mobile-signing.yaml` — *base64-binary-in-YAML* fields | Existing SOPS files are all string-keyed (Mapbox tokens, OAuth secrets, DSNs, Grafana password). No prior binary-blob-as-base64 slot. | RESEARCH §"Standard Stack" `base64 -i keystore.p12 > /tmp/b64` + `sops set --value-file /tmp/b64 ... '["android"]["keystore_base64"]'`. Field-name conventions per D-03 CONTEXT excerpt. |
| Apple Developer Program enrollment USER ACTION | First Apple-portal-driven task in the project. | RESEARCH §1 "Apple Developer Program enrollment 2026" — biometric attestation via Apple Developer iOS/iPadOS/macOS app, 2-7+ week SLA per developer.apple.com forums. Encode as USER ACTION with `<resume-signal>` capturing 10-char Team ID + enrollment-completed date. |
| `evidence/keystore-sha256.txt` machine-readable footer | Phase 5 evidence files are human-only audit dumps; Phase 6 SHA-256 is consumed by downstream tasks. | Custom format — see §4 above. Two bands: human-readable `keytool -list -v` block + machine-readable single-line SHA-256 colon-pair for Mapbox dashboard paste. |

---

## Metadata

**Analog search scope:**
- `.secrets/prod/*.yaml` (3 files)
- `.sops.yaml` (1 file, repo root)
- `.planning/phases/02-secrets-and-config-hardening/*.md` (4 PLAN + SUMMARY + CONTEXT/RESEARCH/PATTERNS)
- `.planning/phases/05-observability-backend/05-06-PLAN.md` + `05-07-PLAN.md` + `evidence/`
- `docs/SECRETS.md` (834 lines, 10 rotation playbook sections)
- `docs/gitleaks-history-scan.json` (side-file precedent)
- `scripts/{deploy_observability_stack.sh, smoke_metrics.py, setup-branch-protection.sh}`
- `services/backend/scripts/smoke_otp.py`

**Files scanned:** ~25
**Pattern extraction date:** 2026-05-20
**Downstream consumer:** `gsd-planner` writing `06-01-PLAN-android-keystore.md` + `06-02-PLAN-ios-cert-and-asc.md`.
