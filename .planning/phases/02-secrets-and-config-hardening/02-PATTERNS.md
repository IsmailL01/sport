# Phase 2: Secrets & Config Hardening — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 27 (new + modified)
**Analogs found:** 22 / 27 (5 net-new with no in-repo analog — RESEARCH.md upstream patterns instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.sops.yaml` (NEW) | config (encryption rule set) | static-declarative | `services/backend/api/redocly.yaml` (declarative-tool-config; root-level lint config) | role-match (no SOPS analog) |
| `.gitleaks.toml` (NEW) | config (scanner rules) | static-declarative | `apps/mobile-rn/eslint.config.js` (rule extend + allowlist) | role-match |
| `.trufflehog/config.yaml` (NEW, optional) | config (scanner rules) | static-declarative | `.gitleaks.toml` (sibling in same phase) | role-match |
| `.pre-commit-config.yaml` (NEW) | config (hook manifest) | static-declarative | none in-repo — RESEARCH §pre-commit-config | no-analog |
| `.secrets/dev/shared.yaml` (NEW) | data (encrypted secret blob) | static-data-at-rest | `apps/mobile-rn/.env.example` (env-var schema enumerator, plaintext placeholders) | partial — both list env-var names |
| `.secrets/dev/mapbox.yaml` (NEW) | data (encrypted secret blob) | static-data-at-rest | `.secrets/dev/shared.yaml` (sibling) | exact |
| `.secrets/dev/oauth.yaml` (NEW) | data (encrypted secret blob) | static-data-at-rest | `.secrets/dev/shared.yaml` (sibling) | exact |
| `.secrets/staging/{shared,mapbox,oauth}.yaml` (NEW) | data (encrypted secret blob) | static-data-at-rest | `.secrets/dev/*.yaml` | exact |
| `.secrets/prod/{shared,mapbox,oauth}.yaml` (NEW) | data (encrypted secret blob) | static-data-at-rest | `.secrets/dev/*.yaml` | exact |
| `.secrets/README.md` (NEW) | doc (directory legend) | static-doc | `tests/runs/README.md` (in-repo per-dir README convention) | role-match |
| `services/backend/identity/cmd/server/main.go` (MOD) | config-loader + composition root | request-response (startup) | self (existing canonical `envOr` + `redactPassword` patterns at lines 121-152) | exact |
| `services/backend/feed/cmd/server/main.go` (MOD) | config-loader + composition root | request-response (startup) | `services/backend/identity/cmd/server/main.go` (canonical) | exact |
| `services/backend/social-graph/cmd/server/main.go` (MOD) | config-loader + composition root | request-response (startup) | `services/backend/identity/cmd/server/main.go` | exact |
| `services/backend/activity-sync/cmd/server/main.go` (MOD) | config-loader + composition root | request-response (startup) | `services/backend/identity/cmd/server/main.go` | exact |
| `services/backend/messaging/cmd/server/main.go` (MOD) | config-loader + composition root | request-response (startup) | `services/backend/identity/cmd/server/main.go` | exact |
| `services/backend/notifications/cmd/server/main.go` (MOD) | config-loader + composition root | request-response (startup) | `services/backend/identity/cmd/server/main.go` | exact |
| `services/backend/realtime-gw/cmd/server/main.go` (MOD) | config-loader + composition root | request-response (startup) | `services/backend/identity/cmd/server/main.go` | exact |
| `services/backend/media/cmd/server/main.go` (MOD) | config-loader + composition root | request-response (startup) | `services/backend/identity/cmd/server/main.go` | exact |
| `services/backend/scripts/smoke_otp.py` (MOD) | smoke-script (default flip) | script (one-shot) | self (line 28 — `SMOKE_DEV_MODE` constant) | exact |
| `docs/DECISIONS/0006-mapbox-token-incident.md` (NEW) | ADR | static-doc | `docs/DECISIONS/0007-v1.0-release-contract.md` + `docs/DECISIONS/0001-framework-react-native.md` | exact |
| `docs/SECRETS.md` (MOD — extend) | doc (rotation playbook) | static-doc | self (existing Mapbox playbook header style is canonical) | exact |
| `docs/RUNBOOKS/sops-edit.md` (NEW) | doc (RUNBOOK) | static-doc | `docs/SECRETS.md` (RU-headers + numbered-step playbook style) | role-match |
| `services/backend/scripts/secrets/init-pre-commit.sh` (NEW) | bash installer | script (one-shot) | `services/backend/scripts/test_clientversion_caddy.sh` (existing bash smoke script) | role-match |
| `docs/gitleaks-history-scan.json` (NEW) | data (scan output) | static-data | none — pure tool output | no-analog |
| `services/backend/Makefile` (MOD — add `scan-secrets`) | Makefile target | shell-pipeline | `services/backend/Makefile:79 check-routes` (Phase 1 / REL-01 target) | exact |
| `.gitignore` (VERIFY, likely no-op) | config | static-declarative | self | exact |
| `services/backend/docker-compose.prod.yml` (VERIFY, likely no-op) | composition manifest | static-declarative | self | exact |

## Pattern Assignments

### `services/backend/identity/cmd/server/main.go` — `envRequire` + `isLocalDBURL` + DEV_MODE flip

**Analog:** Self — same file (the canonical `envOr` + `redactPassword` already live here).

**File header pattern** (lines 1-10) — RU module header + ENV-block + Использование:
```go
// identity/cmd/server — entry point identity-сервиса.
//
// Конфиг через ENV:
//   IDENTITY_HTTP_ADDR        :8081
//   IDENTITY_DB_URL           postgres://...
//   IDENTITY_JWT_SECRET       (>=32 байта)
//
// Использование:
//   make run-identity
package main
```
**Apply to:** when `envRequire` is added, update the header ENV-block to note which vars are REQUIRED (no default) vs OPTIONAL.

**Existing `envOr` (line 121-126) — canonical helper, KEEP:**
```go
func envOr(key, def string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return def
}
```

**Existing `redactPassword` (line 130-152) — reused by new dev-mode safety check:**
```go
// redactPassword скрывает пароль в URL для логов.
// postgres://user:secret@host/db → postgres://user:***@host/db
func redactPassword(url string) string {
    at := -1
    for i, c := range url {
        if c == '@' {
            at = i
            break
        }
    }
    // ... bounded scan back for ':', returns redacted form
```
**Apply to:** every place that logs `dbURL` in the new safety-check block. Already used at line 68 (`logger.Info("db connected", "url", redactPassword(dbURL))`).

**Existing fail-fast pattern at top of `main()` (lines 34-39):**
```go
func main() {
    if err := run(); err != nil {
        slog.Error("fatal", "error", err)
        os.Exit(1)
    }
}
```
**Apply to:** new `envRequire` mirrors this — use `slog.Error` + `os.Exit(1)` on missing key. RESEARCH §env-require pattern:
```go
func envRequire(key string) string {
    v := os.Getenv(key)
    if v == "" {
        slog.Error("required env var missing", "key", key)
        os.Exit(1)
    }
    return v
}
```

**DEV_MODE flip target** (line 47-50):
```go
jwtSecret := []byte(envOr("IDENTITY_JWT_SECRET", "dev-secret-must-be-at-least-32-bytes-long!!"))
// DevMode = выводить devCode в response /auth/request-code (для smoke,
// staging). В production выставить IDENTITY_DEV_MODE=false.
devMode := envOr("IDENTITY_DEV_MODE", "true") == "true"
```
Flip default `"true"` → `"false"`; add `isLocalDBURL` guard right after (RESEARCH §dev-mode-safety pattern). The comment line 49 (`В production выставить IDENTITY_DEV_MODE=false`) is now redundant — rephrase to say "Дефолт false; включить вручную для local dev."

**`auth.NewSigner` already enforces ≥32 bytes** (line 52-55) — DO NOT add a length check in `envRequire`:
```go
signer, err := auth.NewSigner(jwtSecret)
if err != nil {
    return fmt.Errorf("init signer: %w", err)
}
```
`pkg/auth/jwt.go:43-46` returns `errors.New("auth: jwt secret must be at least 32 bytes")` which bubbles via `run()` → `main()` → `os.Exit(1)`. Just convert `envOr("IDENTITY_JWT_SECRET", "...")` → `envRequire("IDENTITY_JWT_SECRET")`.

**Converts (this file):**
- `envOr("IDENTITY_DB_URL", "postgres://...")` → `envRequire("IDENTITY_DB_URL")` (line 46)
- `envOr("IDENTITY_JWT_SECRET", "dev-secret-...")` → `envRequire("IDENTITY_JWT_SECRET")` (line 47)

**Keep `envOr` (this file):**
- `IDENTITY_HTTP_ADDR` (line 45) — non-secret, has safe default
- `IDENTITY_DEV_MODE` (line 50) — flag with explicit safe `"false"` default
- `CLIENT_MIN_VERSION`, `FORCE_UPDATE_URL_*` (lines 89-91) — non-secret policy defaults

---

### `services/backend/{feed,social-graph,activity-sync,messaging,notifications,realtime-gw,media}/cmd/server/main.go` — copy-paste `envRequire`

**Analog:** `services/backend/identity/cmd/server/main.go` (canonical). All 8 services share the identical `envOr` (verified — see Bash grep: each file has the same 5-line block at the bottom).

**Pattern:** copy-paste `envRequire` companion next to existing `envOr` in each file (per D-07 — `pkg/config` shared lib deferred to v1.1).

**Per-service convert-list** (from RESEARCH §env-require audit table):

| Service | envOr → envRequire | Line numbers | Keep envOr |
|---------|--------------------|--------------|-----------|
| feed | `FEED_DB_URL`, `IDENTITY_JWT_SECRET` | 42, 43 | HTTP_ADDR, NATS_URL, REDIS_URL, version-policy |
| social-graph | `SOCIAL_GRAPH_DB_URL`, `IDENTITY_JWT_SECRET` | 45, 46 | HTTP_ADDR, REDIS_URL, version-policy |
| activity-sync | `ACTIVITY_SYNC_DB_URL`, `IDENTITY_JWT_SECRET` | 44, 45 | HTTP_ADDR, NATS_URL (empty-default sentinel), version-policy |
| messaging | `MESSAGING_DB_URL`, `IDENTITY_JWT_SECRET` | 45, 46 | HTTP_ADDR, NATS_URL, REDIS_URL |
| notifications | `NOTIFICATIONS_DB_URL`, `IDENTITY_JWT_SECRET` | 47, 48 | HTTP_ADDR, NATS_URL, **`EXPO_ACCESS_TOKEN`** (optional — see note) |
| realtime-gw | `IDENTITY_JWT_SECRET` | 41 | HTTP_ADDR, NATS_URL, DB_URL (empty default, used optionally) |
| media | `MEDIA_DB_URL`, `IDENTITY_JWT_SECRET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | 50, 51, 74, 75 | HTTP_ADDR, S3_ENDPOINT, S3_BUCKET, S3_REGION |

**Special case (notifications): `EXPO_ACCESS_TOKEN`** — compose-prod line 177 uses `${EXPO_ACCESS_TOKEN:-}` (empty default, not `:?`). Service can start without push fanout. **Keep `envOr` with default `""` for v1.0**, NOT `envRequire`. Document in `docs/SECRETS.md` rotation playbook section §Expo push token.

---

### `services/backend/identity/cmd/server/main.go` — `isLocalDBURL` helper (NEW function)

**Analog:** `redactPassword` (same file, lines 130-152) — same "pure string-scan helper at bottom of `main.go`" pattern.

**Pattern to add** (RESEARCH §dev-mode-safety):
```go
// isLocalDBURL returns true if the DB URL points at a local development host.
// Used to refuse dev-mode startup against non-local databases.
func isLocalDBURL(url string) bool {
    return strings.Contains(url, "localhost") ||
        strings.Contains(url, "127.0.0.1") ||
        strings.Contains(url, "host.docker.internal") ||
        strings.Contains(url, "@postgres:") // docker-compose dev network
}
```
**Wiring (replaces line 50):**
```go
devMode := envOr("IDENTITY_DEV_MODE", "false") == "true"
if devMode {
    if !isLocalDBURL(dbURL) {
        slog.Error(
            "REFUSING TO START: IDENTITY_DEV_MODE=true but database is not localhost",
            "db_host", redactPassword(dbURL),
        )
        os.Exit(1)
    }
    slog.Warn("IDENTITY_DEV_MODE=true — OTP devCode WILL be returned in /auth/request-code; this MUST NOT happen in prod")
}
```
**Import addition:** add `"strings"` to the import block at line 12-32. Place new helper at the bottom of `main.go` after `redactPassword` (preserves file shape).

---

### `services/backend/scripts/smoke_otp.py` — default flip

**Analog:** Self, line 28 (canonical).

**Current** (line 25-28):
```python
# Phase M9.5: identity service в IDENTITY_DEV_MODE=true принимает ЛЮБОЙ
# 6-значный код (для тестов с APK без email). Smoke в этом режиме
# пропускает шаги, проверяющие strict-OTP (reuse-401, wrong-401).
DEV_MODE = os.environ.get("SMOKE_DEV_MODE", "true") == "true"
```

**Change:**
- Flip default `"true"` → `"false"`.
- Update comment block: "Phase M9.5 → Phase 2 / SEC-05: default flipped to false to match identity service. Set SMOKE_DEV_MODE=true explicitly for local-only OTP-relaxed smoke."

**Style/idiom preserved:** Russian comment header, EN identifier, `os.environ.get(KEY, default)` pattern (matches Go `envOr` philosophy).

---

### `.sops.yaml` (NEW, repo root)

**Analog (closest in-repo):** `services/backend/api/redocly.yaml` (repo-root-adjacent declarative tool-config). No SOPS-specific analog — see RESEARCH §sops-config.

**Apply pattern (RESEARCH §sops-config, [VERIFIED]):**
```yaml
# .sops.yaml — encrypts .secrets/**/*.yaml for two age recipients.
# Phase 2 / SEC-02 — D-01 (age backend) + D-02 (.secrets/<env>/<group>.yaml layout) + D-05 (root config)
creation_rules:
  - path_regex: '\.secrets/.*\.yaml$'
    key_groups:
      - age:
          - age1devA<replace-with-dev-A-public-key>
          - age1devB<replace-with-dev-B-public-key>
          # Phase 4: append age1ci<...> for CI runner
```

**Pre-condition:** Wave 0 generates 2 age keys (`age-keygen -o ~/.config/sops/age/keys.txt` per dev); public keys exchanged out-of-band; pasted as recipients.

---

### `.gitleaks.toml` (NEW, repo root)

**Analog:** `apps/mobile-rn/eslint.config.js` (rule-extend + allowlist pattern from pre-v1.0 Plan 08). RESEARCH §gitleaks-config has the canonical TOML.

**Pattern (RESEARCH §gitleaks-config, [VERIFIED 2026-05-15]):**
```toml
# .gitleaks.toml — extends default ruleset + Mapbox custom rules + fixture allowlist
# Phase 2 / SEC-08 — D-10. Upstream rule mapbox-api-token catches pk.+keyword only;
# sk. and bare pk. need custom rules (RESEARCH Pitfall 2).

[extend]
useDefault = true

[[rules]]
id = "mapbox-secret-token"
description = "Mapbox secret access token (sk.) — never bundles, never commits"
regex = '''\bsk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b'''
keywords = ["sk."]
tags = ["secret", "mapbox"]

[[rules]]
id = "mapbox-public-token-bare"
description = "Mapbox public access token (pk.) literal — flag for review"
regex = '''\bpk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b'''
keywords = ["pk."]
tags = ["mapbox"]

[[allowlists]]
description = "Intentional ESLint guard fixture (pre-v1.0 Plan 08)"
paths = [
  '''apps/mobile-rn/src/__fixtures__/secret\.lint-fixture\.ts''',
]
```

**Cross-check vs ESLint guard** (`apps/mobile-rn/eslint.config.js`, per pre-v1.0 Plan 08): ESLint covers `apps/mobile-rn/src/**` TypeScript only. `.gitleaks.toml` covers Go + docs + scripts + everything else. **The two complement, don't duplicate.**

---

### `.pre-commit-config.yaml` (NEW, repo root)

**Analog:** None in-repo. Pre-commit framework new to this phase.

**Pattern (RESEARCH §pre-commit-config, [VERIFIED]):**
```yaml
# .pre-commit-config.yaml — staged-files-only gitleaks scan
# Phase 2 / SEC-01 / SEC-08 — D-08 (pre-commit Python) + D-11 (staged scope)
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.30.1
    hooks:
      - id: gitleaks
```
Default hook entry is `gitleaks git --pre-commit --redact --staged --verbose` — passes only staged files to gitleaks. <5s budget per D-11.

---

### `.secrets/dev/shared.yaml`, `mapbox.yaml`, `oauth.yaml` (NEW × 9 — 3 envs × 3 groups)

**Analog:** `apps/mobile-rn/.env.example` (env-var schema with placeholder values, checked in).

**Pre-encrypt template** (the unencrypted shape — what `sops` sees in editor before encryption):

`shared.yaml`:
```yaml
# Phase 2 / SEC-02 — D-02 (shared = runtime secrets all services consume)
POSTGRES_PASSWORD: "<replace-via-openssl-rand-base64-32>"
JWT_SECRET: "<replace-via-openssl-rand-hex-32-min-32-bytes-per-pkg/auth>"
MINIO_ROOT_USER: "<replace>"
MINIO_ROOT_PASSWORD: "<replace>"
EXPO_ACCESS_TOKEN: "<replace>"
CADDY_ACME_EMAIL: "<replace>"
```

`mapbox.yaml`:
```yaml
# Phase 2 / SEC-03 — Mapbox tokens (independent rotation cycle)
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: "pk.<new-token-after-rotation>"
MAPBOX_DOWNLOADS_TOKEN: "sk.<new-token-after-rotation>"
```

`oauth.yaml`:
```yaml
# Phase 2 — placeholders; populated when Phase 11/12 lands Strava integration
STRAVA_CLIENT_ID: "<deferred-phase-11-12>"
STRAVA_CLIENT_SECRET: "<deferred-phase-11-12>"
GOOGLE_OAUTH_CLIENT_SECRET: "<deferred-v1.1>"
APPLE_SIGN_IN_CLIENT_SECRET: "<deferred-v1.1>"
```

**Encrypt step (per file):** `EDITOR=vim sops .secrets/dev/shared.yaml` → SOPS reads `.sops.yaml` → encrypts on save → committed encrypted-at-rest.

**Smoke test (Pitfall 1 guard):** After Wave 1 encrypt — `sops -d --output-type=dotenv .secrets/dev/shared.yaml > /tmp/test.env && cat /tmp/test.env` must produce 6 `KEY=value` lines with no embedded spaces. Add to Wave 1 verification per RESEARCH §Validation §SEC-02.

---

### `.secrets/README.md` (NEW)

**Analog:** `tests/runs/README.md` (per-directory README convention — file exists at repo root subfolder, explains gitignore exceptions and structure).

**Pattern:**
- RU header matching `docs/SECRETS.md` style
- One short paragraph: "Что здесь живёт" → encrypted YAMLs per env
- Pointer to `docs/RUNBOOKS/sops-edit.md` for workflow
- Warning: "НЕ редактировать `.yaml` напрямую — открывать только через `sops <file>`"

---

### `docs/DECISIONS/0006-mapbox-token-incident.md` (NEW)

**Analog:** `docs/DECISIONS/0007-v1.0-release-contract.md` + `docs/DECISIONS/0001-framework-react-native.md` (canonical ADR shape — both verified).

**Header block pattern** (from `0007:1-6`):
```markdown
# ADR-0006: Mapbox Token Incident & Full Reset

**Дата:** 2026-05-15
**Статус:** Accepted
**Контекст:** Phase 2 / SEC-03..04 (Milestone v1.0 Production Readiness)
**Решение:** Полный reset всех Mapbox-токенов как treated-as-compromise incident. Новые `sk.` (build) + `pk.` (runtime) с Bundle ID + SHA-256 restrictions (см. Pitfall 9 fallback в RESEARCH).
```

**Section structure (RU headings, from `0001`):**
1. `## Контекст` — какие токены были, что утекло, когда (chat-history audit pre-v1.0 Plan 08), какие риски
2. `## Решение` — полный reset; новые `sk.` + `pk.`; revoke старых 3 (`dev-public`, `prod-public`, `server-secret`); хранение в SOPS `.secrets/prod/mapbox.yaml`
3. `## Альтернативы` — частичная ротация (отклонено), no-op + monitoring (отклонено)
4. `## Обоснование` — почему treated-as-compromise; chain-of-custody через chat = неотзывная утечка
5. `## Последствия` — Положительные / Отрицательные / Риски (split per ADR-0001 style); CI build downtime во время ротации; SOPS = единственное место хранения
6. `## Митигации` — Bundle ID + SHA-256 restriction (MEDIUM confidence per RESEARCH Pitfall 9); pre-commit + CI gitleaks; existing ESLint guard
7. `## Сценарии пересмотра` — public launch v1.5; смена Mapbox tier; обнаружение еще одной утечки
8. `## Ссылки` — `docs/SECRETS.md` §Mapbox, pre-v1.0 archive SUMMARY, ADR-0007 (sibling phase reference)

**Cross-ref insertion:** add line in `docs/DECISIONS/` if there's an INDEX (verify — `ls` shows no INDEX.md; skip).

---

### `docs/SECRETS.md` (MODIFY — extend, don't replace)

**Analog:** Self — existing structure is canonical (per D-18 EXTEND existing).

**Existing structure preserved** (verified lines 1-120):
- `# SECRETS` header + lead paragraph
- `## Инвентарь токенов (Token Inventory)` with table (extend with 8 more secret-type rows)
- `### Mapbox` subsection with type-table + classification rules
- `## Rotation Playbook — Mapbox sk. token (4 шага, D-32)` — 4 numbered steps

**Extension pattern (per D-18 — 10 playbook sections, one per secret type from CONTEXT §scout_findings #45):**

For each of the 9 NEW playbook sections (1 already exists for Mapbox):
```markdown
## Rotation Playbook — <Secret Name> (N шагов)

Запускается при подозрении на утечку **или** по плановому графику (раз в N месяцев).

### Шаг 1. <Generate / Revoke / Update>
...

### Шаг 2. Обновить SOPS

\`\`\`bash
EDITOR=vim sops .secrets/prod/shared.yaml
# Под ключом <KEY>: вставить новое значение, save (Esc :wq)
\`\`\`

### Шаг 3. Deploy

См. `docs/RUNBOOKS/sops-edit.md` §«Deploy sequence».

### Шаг 4. Validation
...
```

**Sections to add** (10 total — keeping existing Mapbox `sk.` playbook as #1):
1. Mapbox `sk.` (existing)
2. Mapbox `pk.` (new)
3. POSTGRES_PASSWORD
4. JWT_SECRET
5. MINIO_ROOT_USER / MINIO_ROOT_PASSWORD (paired)
6. EXPO_ACCESS_TOKEN
7. CADDY_ACME_EMAIL
8. OAuth client secrets (Strava placeholder; Google/Apple stub)
9. SOPS_AGE_KEY (the master key itself — recipient rotation via `sops updatekeys`)
10. NATS auth — "deferred v1.1" stub (per D-20)

**Add `## Incident Log` section near top** (per D-12): history-scan findings table + ADR-0006 reference + rotation status per finding.

---

### `docs/RUNBOOKS/sops-edit.md` (NEW)

**Analog:** `docs/SECRETS.md` itself (RU-header + numbered-step playbook style is the canonical "ops doc" shape). `docs/RUNBOOKS/` directory does not exist yet — create it.

**Header pattern:**
```markdown
# SOPS Edit / Decrypt / Rotate Workflow

Краткий справочник для команды по работе с SOPS-зашифрованными `.secrets/**/*.yaml`.

> ⚠️ Пререквизиты — см. §«Environment Setup» ниже. Без `~/.config/sops/age/keys.txt` команды `sops` не работают.
```

**Sections (RU-headers, numbered steps matching `docs/SECRETS.md`):**
1. `## Environment Setup` — `brew install sops age`; `age-keygen -o ~/.config/sops/age/keys.txt`; `export SOPS_AGE_KEY_FILE`
2. `## Edit existing encrypted file` — `EDITOR=vim sops .secrets/prod/shared.yaml`
3. `## Create new encrypted file` — same command on non-existent path
4. `## Decrypt to stdout` (read-only) — `sops -d .secrets/prod/shared.yaml`
5. `## Decrypt to dotenv` — `sops -d --output-type=dotenv ... > /tmp/.env` (mention Pitfall 1 multi-line gotcha)
6. `## Rotate recipients (after .sops.yaml edited)` — `find .secrets -name '*.yaml' -exec sops updatekeys -y {} \;` (Pitfall 8)
7. `## Recovery — Lost age key` — 1Password sealed entry OR USB backup OR partner dev's key (Pitfall 4)
8. `## Merge conflicts on encrypted YAML` — `.gitattributes` `*.yaml -text` for `.secrets/**`; checkout one side then re-edit (Pitfall 5)
9. `## Deploy sequence` (Phase 3 Ansible target) — copy RESEARCH §deploy-decrypt block verbatim

**Code-block source:** RESEARCH §sops-edit and §deploy-decrypt are [VERIFIED 2026-05-15] copy-paste candidates.

---

### `services/backend/Makefile` (MODIFY — add `scan-secrets` target)

**Analog:** `services/backend/Makefile:79 check-routes` — Phase 1 / REL-01 added target. Same shape applies.

**Existing canonical target (lines 1 + 79-80):**
```makefile
.PHONY: help up up-stack down migrate migrate-down run-identity run-activity-sync test test-coverage tidy docker-build observability-up observability-down check-routes

# ... 78 lines elided ...

check-routes:
	cd scripts/openapi-routes-check && GOWORK=off go test -race ./...
```

**Apply pattern — add to `.PHONY` list + new target block:**
```makefile
.PHONY: ... check-routes scan-secrets

scan-secrets:
	@command -v gitleaks >/dev/null 2>&1 || { \
		echo "gitleaks не установлен. Установите: brew install gitleaks"; exit 1; }
	cd .. && gitleaks detect --no-banner --redact --source .
```

**Style preserved:**
- Same `@command -v ... || { echo "..."; exit 1; }` install-check idiom as `migrate` target (lines 46-49 — see `head` output above).
- Russian error message matching `migrate` target style.
- `.PHONY` append (not separate `.PHONY:` line).
- Help-text addition under `help:` block (line 14 area — add `scan-secrets    Run gitleaks against repo (Phase 2 / SEC-01)`).

**Decision:** add to `services/backend/Makefile` (not new root-level Makefile) — keeps tooling co-located with `check-routes`. Root has no Makefile today; adding one solely for `scan-secrets` adds surface area. Per CONTEXT D-10 area, the planner can split off later if a root Makefile materializes.

---

### `services/backend/scripts/secrets/init-pre-commit.sh` (NEW)

**Analog:** `services/backend/scripts/test_clientversion_caddy.sh` (existing bash smoke script; same dir convention).

**Pattern:**
```bash
#!/usr/bin/env bash
# Phase 2 / SEC-01 — D-08 — pre-commit installer for new dev workstations.
# Run once per laptop after cloning the repo.

set -euo pipefail

command -v pre-commit >/dev/null 2>&1 || {
    echo "pre-commit not installed. Run: brew install pre-commit (or: pip install pre-commit==4.6.0)"
    exit 1
}

# Install the git hook at .git/hooks/pre-commit
pre-commit install

echo "✓ pre-commit hook installed"
echo "  Test: pre-commit run --all-files"
```

**Style preserved:** `set -euo pipefail` + `command -v X >/dev/null 2>&1 || { ... }` matches existing scripts.

---

### `docs/gitleaks-history-scan.json` (NEW)

**Analog:** None — tool output. Generated once during Wave 4 via:
```bash
gitleaks detect --no-banner --redact --report-format json \
    --report-path docs/gitleaks-history-scan.json \
    --log-opts="--all" --source .
```

Per CONTEXT D-12 — committed as audit artifact; pre-v1.0 archive already documents zero findings on `git grep`; gitleaks `--all` is stricter (every commit on every branch).

---

### `.gitignore` (VERIFY)

**Verified existing patterns (lines 1-10):**
```
# ===== Секреты =====
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.mobileprovision
.netrc
secrets/
```

**Decisions:**
- `.env*` block keeps mobile/backend `.env` files out (safety net for SOPS workflow). KEEP.
- `secrets/` (lowercase) — does NOT match `.secrets/` (uppercase, dotfile). Encrypted `.secrets/**/*.yaml` ARE committed per D-05. No conflict. KEEP.
- New configs (`.gitleaks.toml`, `.sops.yaml`, `.pre-commit-config.yaml`) — none match existing ignores. Will be tracked.
- Add comment line: `# .secrets/**/*.yaml ARE committed (SOPS-encrypted at rest; see docs/RUNBOOKS/sops-edit.md)` near the Секреты block — clarifies intent for future contributors.

---

### `services/backend/docker-compose.prod.yml` (VERIFY)

**Verified existing pattern** (grep output above) — `${VAR:?need ...}` enforcement at compose level on:
- `POSTGRES_PASSWORD` (line 19)
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` (lines 58-59)
- `JWT_SECRET` (lines 113, 129, 149, 175, 195, 211, 234, 258)
- `CADDY_ACME_EMAIL` (line 284)

And `:-` (empty default) on:
- `EXPO_ACCESS_TOKEN` (line 177) — service starts even without it (push fanout no-op)

**Decision:** No changes needed. SOPS-decrypted `.env` consumed via `docker-compose --env-file <path>` — existing `${VAR:?}` enforcement still fires if a key is missing from the decrypted file. Per RESEARCH §Runtime State Inventory: "Live service config CONTINUES TO WORK UNCHANGED."

---

## Shared Patterns

### Pattern A: RU module-header + ENV-block (Go services)

**Source:** `services/backend/identity/cmd/server/main.go:1-10`
**Apply to:** all 8 main.go files when `envRequire` lands — annotate which ENV vars are required vs optional.

```go
// <service>/cmd/server — entry point <service>-сервиса.
//
// Конфиг через ENV:
//   <SERVICE>_HTTP_ADDR        :PORT
//   <SERVICE>_DB_URL           postgres://...        REQUIRED
//   IDENTITY_JWT_SECRET        (>=32 байта)          REQUIRED
//
// Использование:
//   make run-<service>
package main
```

### Pattern B: `slog.Error` + `os.Exit(1)` fail-fast

**Source:** `services/backend/identity/cmd/server/main.go:34-39`
```go
func main() {
    if err := run(); err != nil {
        slog.Error("fatal", "error", err)
        os.Exit(1)
    }
}
```
**Apply to:** new `envRequire` body + new `IDENTITY_DEV_MODE` safety check. Uses structured `slog` (not `log.Fatal`) — matches JSON-handler setup at line 42.

### Pattern C: ADR RU-headings + numbered alternatives

**Source:** `docs/DECISIONS/0001-framework-react-native.md:1-60` + `docs/DECISIONS/0007-v1.0-release-contract.md:1-50`
**Sections (canonical):** Контекст → Решение → Альтернативы → Обоснование → Последствия (Положительные/Отрицательные/риски) → Митигации → Сценарии пересмотра → Ссылки.
**Header block:** `**Дата:** YYYY-MM-DD` + `**Статус:** Accepted` + `**Контекст:** Phase X / TASK-ID` + `**Решение:** <one-sentence summary>`.

### Pattern D: Russian docs headers + English code identifiers

**Source:** CLAUDE.md (project rule) — visible across `docs/SECRETS.md`, both ADRs, all Go module headers.
**Apply to:** every new doc file (ADR-0006, sops-edit.md, .secrets/README.md). Code identifiers stay English (`envRequire`, `isLocalDBURL`, `SOPS_AGE_KEY_FILE`).

### Pattern E: Bash script preamble — `set -euo pipefail` + `command -v` guard

**Source:** `services/backend/Makefile:46-49` (migrate target install-check) + `services/backend/scripts/test_clientversion_caddy.sh` (likely; not opened).
```bash
#!/usr/bin/env bash
set -euo pipefail
command -v <tool> >/dev/null 2>&1 || {
    echo "<tool> not installed. Run: brew install <tool>"
    exit 1
}
```
**Apply to:** `init-pre-commit.sh`, future `deploy.sh` (Phase 3 Ansible target).

### Pattern F: Makefile target — `.PHONY` append + RU help-text + install-check

**Source:** `services/backend/Makefile:1, 14, 46-49, 79`
**Apply to:** new `scan-secrets` target — same shape as `migrate` (with install-check) + `check-routes` (single-line cd + tool invocation).

### Pattern G: docker-compose `${VAR:?need MSG}` for required secrets

**Source:** `services/backend/docker-compose.prod.yml:19, 58-59, 113, ...`
**Status:** Already shipped; Phase 2 keeps it. Layered with Go-side `envRequire` (belt-and-suspenders per D-07 / RESEARCH SEC-09).

---

## No Analog Found

Files with no close in-repo match — planner uses RESEARCH.md patterns:

| File | Role | Data Flow | Pattern source |
|------|------|-----------|----------------|
| `.sops.yaml` | tool-config | declarative | RESEARCH §sops-config [VERIFIED] |
| `.pre-commit-config.yaml` | tool-config | declarative | RESEARCH §pre-commit-config [VERIFIED] |
| `.trufflehog/config.yaml` (optional, Phase 4 staging) | tool-config | declarative | RESEARCH §full-history-scan + trufflehog v3 docs |
| `.secrets/**/*.yaml` (encrypted pre-commit, decrypted in-editor) | encrypted-data | static-at-rest | RESEARCH §sops-config — SOPS auto-encrypts on save per `.sops.yaml` rule |
| `docs/gitleaks-history-scan.json` | tool-output | static-data | RESEARCH §full-history-scan — gitleaks invocation produces this file directly |

---

## Metadata

**Analog search scope:**
- `services/backend/*/cmd/server/main.go` (8 services — all verified via Bash grep — same `envOr` shape)
- `services/backend/pkg/auth/jwt.go` (existing 32-byte JWT length check)
- `services/backend/scripts/smoke_otp.py` (DEV_MODE flag)
- `services/backend/Makefile` (target shape + install-check idiom)
- `services/backend/docker-compose.prod.yml` (`${VAR:?}` enforcement points)
- `docs/DECISIONS/000[1-7]-*.md` (ADR shape — verified ADR-0001 + ADR-0007)
- `docs/SECRETS.md` (existing pre-v1.0 Plan 08 scaffold — extend pattern)
- `.gitignore` (secret-block verification)
- `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` (fixture allowlist target)

**Files scanned:** ~22 files read; ~15 ranges grep'd
**Pattern extraction date:** 2026-05-15
