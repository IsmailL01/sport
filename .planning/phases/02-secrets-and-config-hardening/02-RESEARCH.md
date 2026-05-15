# Phase 2: Secrets & Config Hardening — Research

**Researched:** 2026-05-15
**Domain:** Secrets management (SOPS+age), full-history secret scanning (gitleaks+trufflehog), Go env-loading fail-fast, Mapbox token incident reset
**Confidence:** HIGH (every external claim verified against upstream repo or registry; one Mapbox claim flagged MEDIUM)

## Summary

Phase 2 is a backend-workstream hardening sprint that takes the repo from "secrets manually exported on prod VPS, `IDENTITY_DEV_MODE=true` shipped as default, Mapbox tokens leaked through chat" to "every secret in SOPS-encrypted YAML committed to repo, decrypted at deploy time only, rotation playbooks for 10 secret types, pre-commit + CI scans clean on full history." All 20 decisions D-01..D-20 in `02-CONTEXT.md` are locked — research does not re-litigate them. This research surfaces the **HOW**: exact tool versions, install commands, library/CLI quirks, code patterns, file paths, and risks the planner must mitigate.

**Critical new findings:**

1. **`pkg/auth.NewSigner` already enforces `len(secret) ≥ 32`** at `services/backend/pkg/auth/jwt.go:43-46` — JWT length is enforced Go-side TODAY (not just by compose-level `${VAR:?}`). `envRequire` does NOT need a length variant for `IDENTITY_JWT_SECRET`; existing `auth.NewSigner` returns an error that bubbles to `os.Exit(1)`. This contradicts focus-area Q8's assumption and simplifies the plan.
2. **Upstream `gitleaks` v8.30.1 `mapbox-api-token` rule only catches `pk.…` tokens** (requires keyword "mapbox" nearby + `pk.` prefix). It does NOT catch `sk.…` tokens or bare `pk.` tokens without the keyword. Custom rules are mandatory for the SEC-08 acceptance criterion.
3. **`sops --output-type=dotenv` has known bugs with multi-line values and special chars** (issues #724, #784, #1435, #1951). The current secret inventory is fortunately spaces-and-PEM-free; planner must guard with a smoke-test and document the constraint.
4. **All 8 services duplicate the same `envOr` helper** (verified). Adding `envRequire` per file means 8 identical 6-line additions — viable for v1.0 per D-07 (`pkg/config` shared lib deferred to v1.1).
5. **All required toolchain is missing locally** (sops, age, gitleaks, trufflehog, pre-commit). Homebrew + Python 3.13 + Go 1.22.3 available — install via `brew install sops age gitleaks trufflehog pre-commit`. Planner must add a "developer environment setup" task as Wave 0.

**Primary recommendation:** Single executor pass, 5–6 atomic waves: (Wave 0) tooling install + age key generation per dev → (Wave 1) `.sops.yaml` + empty encrypted YAMLs committed → (Wave 2) `envRequire` helper added per service + `IDENTITY_DEV_MODE` flip + smoke_otp.py default flip → (Wave 3) `.gitleaks.toml` + `.pre-commit-config.yaml` + lint-fixture allowlist → (Wave 4) full-history scan + Mapbox dashboard rotation (USER ACTION) + populate SOPS YAMLs → (Wave 5) `docs/SECRETS.md` extensions + `docs/RUNBOOKS/sops-edit.md` + ADR-0006.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: SOPS backend = `age`** (not PGP, not cloud KMS). Single-binary, X25519, multi-recipient, mature for team-of-2 + Hetzner VPS scale. Cloud KMS rejected for privacy. PGP rejected for friction.

**D-02: Layout = `.secrets/<env>/{shared,mapbox,oauth}.yaml`** with three envs (`dev/`, `staging/`, `prod/`). `shared.yaml` = runtime secrets (POSTGRES_PASSWORD, JWT_SECRET, MinIO creds, Expo token, Caddy email). `mapbox.yaml` = pk./sk. (independent rotation cycle). `oauth.yaml` = Google/Apple/Strava client secrets (placeholders for v1.0).

**D-03: Loading = `sops -d` at deploy time → `.env` consumed by docker-compose**. Per-service split via `--extract` deferred. Go services use existing `os.Getenv()`.

**D-04: Master key = age private key in 1Password sealed + encrypted USB backup per dev**. 2 age keys as recipients. CI gets a 3rd age key in Phase 4.

**D-05: `.sops.yaml` at repo root** with single creation rule for `.secrets/**/*.yaml`.

**D-06: SOPS decrypt happens ONCE at deploy time**, not per service. Tmpfs `.env`, shredded after compose-up.

**D-07: `envRequire(key) string` helper** added next to `envOr` in each service main.go. `pkg/config` shared lib deferred to v1.1.

**D-08: Pre-commit framework = `pre-commit` (Python).**

**D-09: gitleaks pre-commit on staged files only; gitleaks + trufflehog in CI on full history.** Phase 2 lands configs; Phase 4 wires CI.

**D-10: `.gitleaks.toml`** = default rules + Mapbox custom rules + allowlist for `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts`.

**D-11: Pre-commit hook scope = staged files only.** Full-repo scans = CI job.

**D-12: Initial full-history scan happens once during Phase 2.** Findings trigger rotation, NOT history rewrite.

**D-13: Flip `IDENTITY_DEV_MODE` default to `false`** at `identity/cmd/server/main.go:50`. Add prod-detection safety check.

**D-14: Flip `SMOKE_DEV_MODE` default to `false`** in `services/backend/scripts/smoke_otp.py`.

**D-15: Mapbox = full reset.** All 3 tokens that touched chat revoked. New `sk.` + new `pk.` with Bundle ID + SHA-256 restrictions.

**D-16: User action required for Mapbox dashboard work.**

**D-17: ADR-0006 file path = `docs/DECISIONS/0006-mapbox-token-incident.md`** (Russian headings).

**D-18: Rotation playbooks in `docs/SECRETS.md`** for all 10 secret types. EXTEND existing file (Russian headings).

**D-19: `docs/RUNBOOKS/sops-edit.md`** = new file for SOPS edit/decrypt/keygen quick reference.

**D-20: NATS auth deferred to v1.1.**

### Claude's Discretion

- Specific `age` version: latest stable (v1.x) — research recommends v1.3.1 (HIGH).
- SOPS version: latest stable (v3.x) — research recommends v3.13.0 (HIGH).
- `pre-commit` version: ~3.x — research recommends 4.6.0 (HIGH; current major).
- `.sops.yaml` config: single creation rule for all `.secrets/**` (D-05).
- `sops --output-type=dotenv` over yq pipeline — confirmed feasible with constraints (see Pitfall 1).
- Per-service split via `sops --extract` deferred.

### Deferred Ideas (OUT OF SCOPE)

- HashiCorp Vault (v1.1+)
- HSM-backed master key / YubiKey (v1.1+)
- Automated secret rotation (v1.1+)
- NATS authentication (v1.1+)
- `pkg/config` shared Go lib (v1.1)
- SOPS with cloud KMS (v2.0)
- Sealed Secrets / External Secrets Operator (v2.0)
- CI's own age key (Phase 4)
- Strava client_secret population (Phase 11/12)
- Google/Apple OAuth secrets (indefinitely)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | `gitleaks` + `trufflehog` on full clone report zero findings | Standard Stack §scanners; full-history scan command in Code Examples §full-history-scan; risk of pre-existing findings flagged in Pitfall 7 |
| SEC-02 | SOPS-encrypted secrets in `.secrets/` for all 10 types | Standard Stack §sops+age; `.sops.yaml` schema in Code Examples §sops-config; secret inventory matches D-02 layout |
| SEC-03 | Mapbox token incident reset (rotate both `pk.→sk.` CI + prod `pk.*`) | Mapbox dashboard procedure in Code Examples §mapbox-rotation; existing pre-v1.0 playbook reuse |
| SEC-04 | `docs/DECISIONS/0006-mapbox-token-incident.md` documents rotation as compromise | ADR template sketched in `02-CONTEXT.md` §specifics; no new research needed |
| SEC-05 | `IDENTITY_DEV_MODE=true` default removed | Code change pinpointed at `identity/cmd/server/main.go:50`; prod-detection safety pattern in Code Examples §dev-mode-safety |
| SEC-06 | 12-factor split — no hardcoded URLs/keys/tokens; all via env from SOPS | Audit complete: 8 services use `envOr()` consistently — only `os.Getenv()`-style; no hardcoded secrets found. Minor pattern adjustment for `envRequire` |
| SEC-07 | Rotation playbooks in `docs/SECRETS.md` for all 10 types | Existing `docs/SECRETS.md` already has Mapbox playbook (extend, don't replace per D-18) |
| SEC-08 | Pre-commit hook scanning AWS/AKIA/GitHub PAT/Mapbox `sk.` | `.gitleaks.toml` extends default + Mapbox custom rules in Code Examples §gitleaks-config |
| SEC-09 | Secret loading audit: every Go service fails-fast on missing secret | `envRequire` pattern in Code Examples §env-require; **NOTE**: `pkg/auth.NewSigner` already enforces ≥32 byte JWT length — no new length wrapper needed |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Secret encryption at rest | Repo (committed encrypted YAML) | — | Encrypted state is safe to commit; planner verifies `.gitignore` does NOT block `.secrets/**/*.yaml` |
| Secret decryption | Deploy host (CI runner or VPS shell) | — | `sops -d` runs at deploy time; Go services NEVER call SOPS library |
| Secret consumption | API/Backend (8 Go services) | — | Each main.go reads via `os.Getenv()` → `envRequire()`; same pattern as today |
| Pre-commit scanning | Developer workstation | — | `pre-commit install` per dev; bypasses possible — must check git hook on `main` (deferred to Phase 4 CI as safety net) |
| Full-history scanning | CI (Phase 4) + one-time local (Phase 2) | — | gitleaks+trufflehog have different strengths; both run in CI per D-09 |
| Master key custody | Out-of-band (1Password + USB) | — | Bus factor mitigation per D-04; never in repo, never on VPS shell |
| Mapbox token rotation | User (Mapbox dashboard) + Repo (SOPS YAML update) | — | Dashboard step manual per D-16; SOPS edit step automatable |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `getsops/sops` | **v3.13.0** (May 2025) | Encrypts YAML/JSON/dotenv with multi-recipient age | Industry-standard; CNCF-adopted; supports `--output-type=dotenv` (the deploy linchpin per D-03) `[VERIFIED: github.com/getsops/sops/releases/latest]` |
| `FiloSottile/age` | **v1.3.1** (Dec 2024) | X25519 encryption backend for SOPS | Single-binary, no GPG keyring; multi-recipient via comma-separated public keys `[VERIFIED: github.com/FiloSottile/age/releases/latest]` |
| `gitleaks/gitleaks` | **v8.30.1** (Mar 2025) | Pre-commit hook + CI secret scanner | Default ruleset covers AWS/AKIA/GH PAT/Mapbox-pk; extensible via `[extend] useDefault = true` `[VERIFIED: github.com/gitleaks/gitleaks/releases/latest]` |
| `trufflesecurity/trufflehog` | **v3.95.3** (May 2025) | CI deep-scan + entropy + verified-secret detection | Complementary to gitleaks: verifies live secrets against APIs (catches what regex misses) `[VERIFIED: github.com/trufflesecurity/trufflehog/releases/latest]` |
| `pre-commit/pre-commit` | **v4.6.0** (Apr 2025) | Python pre-commit framework | Industry standard; gitleaks ships official hook `[VERIFIED: github.com/pre-commit/pre-commit/releases/latest]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Homebrew | system | Install all 5 tools above | `brew install sops age gitleaks trufflehog pre-commit` — verified all 5 are in Homebrew core `[VERIFIED: brew available locally]` |
| Python 3.13 | system | Runs pre-commit framework | Already installed locally at `/opt/homebrew/opt/python@3.13` `[VERIFIED: python3 --version]` |
| Go 1.22.3 | system | Builds 8 services | Already installed `[VERIFIED: go version]` |
| `golang-jwt/jwt/v5` | already in go.mod | JWT signing/verification with HS256 | Existing — `NewSigner` already enforces ≥32 byte secret `[VERIFIED: services/backend/pkg/auth/jwt.go:43-46]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SOPS+age | HashiCorp Vault | Vault = server, daemon, ACLs, audit — overkill for team-of-2 single-VPS. Deferred to v1.1 per D-20 family. |
| SOPS+age | git-crypt | Symmetric, no multi-recipient, harder to rotate access. Inferior to age for team scenarios. |
| age | PGP | GPG keyring complexity, smartcard ceremony, key signing — rejected per D-01 |
| pre-commit (Python) | husky (Node) | Husky requires Node; repo has mobile-rn but backend is Go — Python is cross-stack. Pre-commit is the cross-language standard. |
| gitleaks+trufflehog | detect-secrets (Yelp) | detect-secrets has worse Mapbox coverage and weaker entropy detection. gitleaks+trufflehog combination is industry standard for 2024-2026 era. |
| `sops --output-type=dotenv` | `sops -d \| yq -o=env` | Extra dependency (yq), still has same multi-line bug. Use dotenv directly per Discretion. |
| `envRequire` per main.go | `pkg/config` shared lib | Lean keep per-service per D-07; 8 × 6-line additions is acceptable v1.0 blast radius. |

**Installation (developer workstation, macOS):**

```bash
# All-in-one Homebrew install (verified all 5 in Homebrew core)
brew install sops age gitleaks trufflehog pre-commit

# Verify versions match HIGH-confidence targets:
sops --version          # expect: 3.13.x or newer
age --version           # expect: v1.3.1 or newer
gitleaks version        # expect: 8.30.x or newer
trufflehog --version    # expect: 3.95.x or newer
pre-commit --version    # expect: 4.6.x or newer

# Per-developer age key generation (D-04 — 2 devs each generate one):
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
# Public key printed to stderr — copy to .sops.yaml recipients list
# Private key stays in ~/.config/sops/age/keys.txt (mode 600 auto)
# Backup: 1Password sealed entry + encrypted USB per D-04
```

**Version verification:** All 5 versions confirmed against upstream `releases/latest` on 2026-05-15. Stable, current, all from 2024 or 2025.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  DEVELOPER WORKSTATION (mac/linux, 2 devs)                               │
│                                                                          │
│  Edit:    EDITOR=vim sops .secrets/prod/shared.yaml                      │
│           ↓ (decrypts to tmp, opens editor, re-encrypts on save)         │
│  Commit:  git add .secrets/prod/shared.yaml                              │
│           ↓ (pre-commit runs: gitleaks --staged --redact)                │
│           ↓ FAIL → block commit (no --no-verify allowed per redline)     │
│           ↓ PASS → encrypted YAML committed                              │
│  Push:    git push                                                       │
└──────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  REPOSITORY (.secrets/{dev,staging,prod}/*.yaml ARE committed, encrypted)│
│                                                                          │
│  .sops.yaml  ──→ creation rule: encrypt .secrets/**/*.yaml with 2 age   │
│                  recipients (dev A, dev B); Phase 4 adds 3rd (CI)        │
└──────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  CI (Phase 4 — Phase 2 only lands configs, not the matrix wiring)        │
│                                                                          │
│  gitleaks detect --no-banner --redact --log-opts="--all"                 │
│  trufflehog git --no-update file://. --only-verified --json              │
│  ↓ FAIL → PR blocked                                                     │
└──────────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  DEPLOY HOST (VPS via Ansible in Phase 3; manual via SSH in v1.0 init)   │
│                                                                          │
│  $ git pull                                                              │
│  $ export SOPS_AGE_KEY_FILE=/etc/sops/age.key  (mode 400, root-only)     │
│  $ sops -d --output-type=dotenv .secrets/prod/shared.yaml >  /tmp/.env   │
│  $ sops -d --output-type=dotenv .secrets/prod/mapbox.yaml >> /tmp/.env   │
│  $ sops -d --output-type=dotenv .secrets/prod/oauth.yaml  >> /tmp/.env   │
│  $ docker-compose -f services/backend/docker-compose.prod.yml \          │
│      --env-file /tmp/.env up -d                                          │
│  $ shred -u /tmp/.env                                                    │
│                                                                          │
│  Each Go service container reads via os.Getenv() — envRequire() exits 1 │
│  if any expected secret is missing or empty.                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
.secrets/                            # NEW — encrypted YAMLs committed
├── dev/
│   ├── shared.yaml                  # SOPS-encrypted; POSTGRES_PASSWORD, JWT_SECRET, MinIO, Expo, Caddy
│   ├── mapbox.yaml                  # SOPS-encrypted; EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN, MAPBOX_DOWNLOADS_TOKEN
│   └── oauth.yaml                   # SOPS-encrypted; placeholders for Google/Apple/Strava
├── staging/
│   └── (same 3 files)
└── prod/
    └── (same 3 files)

.sops.yaml                           # NEW — creation rules + age recipients
.gitleaks.toml                       # NEW — extends default + Mapbox custom rules
.pre-commit-config.yaml              # NEW — gitleaks hook on staged files
docs/
├── DECISIONS/
│   └── 0006-mapbox-token-incident.md  # NEW per D-17 (sketched in CONTEXT)
├── RUNBOOKS/
│   └── sops-edit.md                  # NEW per D-19
└── SECRETS.md                        # EXTEND per D-18 (10 playbooks + SOPS section)

services/backend/
├── identity/cmd/server/main.go      # MODIFY: flip IDENTITY_DEV_MODE default; add envRequire
├── activity-sync/cmd/server/main.go # MODIFY: add envRequire
├── feed/cmd/server/main.go          # MODIFY: add envRequire
├── media/cmd/server/main.go         # MODIFY: add envRequire
├── messaging/cmd/server/main.go     # MODIFY: add envRequire
├── notifications/cmd/server/main.go # MODIFY: add envRequire
├── realtime-gw/cmd/server/main.go   # MODIFY: add envRequire
├── social-graph/cmd/server/main.go  # MODIFY: add envRequire
└── scripts/smoke_otp.py             # MODIFY: flip SMOKE_DEV_MODE default
```

### Pattern 1: SOPS multi-recipient age config

**What:** `.sops.yaml` declares which keys can decrypt which files.
**When to use:** At repo root, before any encrypted YAML is created. `sops <file>` reads this config to know who to encrypt for.
**Example:** See Code Examples §sops-config.

### Pattern 2: Fail-fast env loading

**What:** `envRequire(key) string` companion to `envOr(key, def)`. Calls `slog.Error` + `os.Exit(1)` if env var is empty/missing.
**When to use:** For every secret-bearing env var. Non-secrets (`HTTP_ADDR`, `CLIENT_MIN_VERSION`) keep `envOr` with safe defaults.
**Example:** See Code Examples §env-require.

### Pattern 3: SOPS-decrypt-once at deploy

**What:** Deploy script runs `sops -d` once, writes `.env` to tmpfs, runs `docker-compose --env-file`, shreds.
**When to use:** v1.0 single-VPS deploy. Phase 3 Ansible wraps this pattern.
**Example:** See Code Examples §deploy-decrypt.

### Anti-Patterns to Avoid

- **Importing SOPS library into Go services.** Adds attack surface + complicates testing. `sops -d` at deploy time is the seam (per D-06).
- **`git rebase`/filter-branch to remove historical leaks.** Old token already compromised; rewriting history doesn't revoke the token in Mapbox dashboard. Document + rotate per D-12.
- **Two simultaneously-active Mapbox tokens "for safety".** Doubles attack surface. Playbook order: create new → verify in dev build → revoke old (per existing `docs/SECRETS.md` §«Rotation Playbook»).
- **Storing the age private key on the prod VPS in plaintext at `~/.config/sops/age/keys.txt` with broad read perms.** Use `mode 400` and `/etc/sops/age.key` owned by root.
- **Using `${VAR:?msg}` as a length check.** Shell substitution only tests emptiness, not length. JWT length is already enforced by `auth.NewSigner` Go-side — no additional check needed for that one secret.
- **Allowing `--no-verify` commits to bypass pre-commit hook.** Hard rule per ROADMAP.md §Hard Rules. Phase 4 CI runs gitleaks as belt-and-suspenders so bypass is detected.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML encryption | Custom AES-GCM wrapper | `sops + age` | sops handles MAC, key rotation, per-value encryption, editor integration, dotenv output |
| X25519 key generation | OpenSSL one-liners | `age-keygen` | Produces age-format public+private keys; correct file mode; recovery via bech32 encoding |
| Multi-recipient key envelope | Custom hkdf/ecdh wrap | age recipient stanzas | Built-in to age v1; survives recipient add/remove via `sops updatekeys` |
| Secret pattern regex | Custom Go regexp scanner | `gitleaks` ruleset | gitleaks default config has 200+ patterns including AWS, GitHub, GitLab, Stripe, Twilio. Maintained by community. |
| Entropy-based secret detection | Shannon entropy in Go | `trufflehog` | Verified-secret mode actually pings APIs; massively reduces false positives vs pure entropy |
| Pre-commit hook orchestration | Bash hooks | `pre-commit` framework | Handles install/uninstall, Python venv isolation, version pinning per hook |
| Dotenv format generation | YAML→ENV bash script | `sops --output-type=dotenv` | Built into sops v3.x; one command vs piping through `yq` and managing quoting |

**Key insight:** Every problem in this phase has a mature OSS solution. Hand-rolling any of them adds attack surface and maintenance debt. The five tools (sops, age, gitleaks, trufflehog, pre-commit) compose into the standard secrets workflow used by dozens of CNCF projects, Flux CD, and the SOPS ecosystem.

## Runtime State Inventory

> Phase 2 is partial-rename (config defaults flip + new files) — the canonical question applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — no database table or persistent record contains the `IDENTITY_DEV_MODE` literal or any of the 10 secret-type names as IDs/keys. Postgres uses these env vars at process startup only. | None |
| **Live service config** | `docker-compose.prod.yml` `${VAR:?need ...}` enforcement at compose level (lines 19, 58-59, 113, 129, 149, 154, 175, 195, 211, 234, 258, 284) — **CONTINUES TO WORK UNCHANGED** when source switches from shell-exported vars to `--env-file /tmp/.env`. No data migration. | Code edit only — Phase 3 Ansible orchestrates the `sops -d → --env-file` sequence |
| **OS-registered state** | None — VPS has no systemd/launchd units that embed the literal `IDENTITY_DEV_MODE` or the secret keys. Phase 3 will create systemd units; Phase 2 is pre-systemd. | None |
| **Secrets and env vars** | 10 secret types catalogued in `02-CONTEXT.md` §scout_findings (Mapbox pk./sk., POSTGRES_PASSWORD, NATS auth deferred, MINIO_ROOT_*, EXPO_ACCESS_TOKEN, IDENTITY_JWT_SECRET, CADDY_ACME_EMAIL, OAuth client secrets, SOPS_AGE_KEY itself). Today: shell-exported on VPS or `~/.netrc`/`~/.gradle/gradle.properties` for Mapbox sk. on dev workstations. | **Data migration**: each secret VALUE moves from shell/dotfile → SOPS YAML. **Code edit**: no — `os.Getenv()` source-of-truth doesn't change. **User action**: Mapbox dashboard rotation for all 3 leaked tokens per D-15. |
| **Build artifacts / installed packages** | None — Phase 2 doesn't change build artifacts. (Phase 11 Android build will read `MAPBOX_DOWNLOADS_TOKEN` from `~/.gradle/gradle.properties` or EAS Build env; Phase 2 just puts the canonical value into SOPS so EAS Build env can be populated from there in Phase 4 CI.) | None |

**Nothing found in:** Stored data, OS-registered state, build artifacts. Confirmed via grep on `docker-compose.prod.yml` + `services/backend/*/cmd/server/main.go` + `services/backend/scripts/`.

## Common Pitfalls

### Pitfall 1: `sops --output-type=dotenv` mangles multi-line values and values with spaces

**What goes wrong:** SOPS dotenv output strips newlines from multi-line PEM keys, replacing them with spaces — producing invalid PEM and breaking certificate-bearing services. Values containing spaces are emitted without quotes, which breaks `--env-file` parsing for some compose versions. Values with `$` get interpolated.

**Why it happens:** The dotenv format is not roundtrip-safe with rich YAML scalars; sops has open issues since 2019 acknowledging this limitation `[CITED: github.com/getsops/sops/issues/724, /784, /1435, /1951]`.

**How to avoid:**
1. **Inventory check**: Today's 10 secret types are all single-line opaque strings (passwords, tokens, emails). No PEM, no spaces, no embedded `$`. SAFE for v1.0.
2. **If iOS distribution certificate (P8) lands in Phase 10**: it IS multi-line. Use `sops -d` (YAML output) + parse in Go via `os.ReadFile` after writing to a separate file path. Do NOT use `--output-type=dotenv` for the P8.
3. **Smoke test** (planner adds as task verification): after first SOPS encrypt, run `sops -d --output-type=dotenv .secrets/dev/shared.yaml > /tmp/test.env && cat /tmp/test.env` and verify all 6 expected `KEY=value` lines appear with no spaces in values.

**Warning signs:** Service fails to start with "JWT secret too short" when secret SHOULD be 64 chars — likely a value with `$` got interpolated by shell.

### Pitfall 2: Upstream `gitleaks` mapbox rule only catches keyword-adjacent `pk.` — misses raw `sk.` literals

**What goes wrong:** SEC-08 requires "Mapbox `sk.` patterns" detected. The upstream `gitleaks` v8.30.1 default `mapbox-api-token` rule has regex:

```
(?i)[\w.-]{0,50}?(?:mapbox)(?:[ \t\w.-]{0,20})[\s'"]{0,3}(?:=|>|:{1,3}=|\|\||:|=>|\?=|,)[\x60'"\s=]{0,5}(pk\.[a-z0-9]{60}\.[a-z0-9]{22})(?:[\x60'"\s;]|\\[nr]|$)
```
`[VERIFIED: curl raw.githubusercontent.com/gitleaks/gitleaks/master/config/gitleaks.toml line 2569]`

It only matches `pk.…` tokens when the keyword "mapbox" appears within 70 chars. A naked `sk.eyJ1...` in code is NOT caught. A `pk.xyz` literal without the word "mapbox" nearby is NOT caught.

**Why it happens:** Upstream rule is tuned for low false-positive rate, not aggressive coverage.

**How to avoid:** Custom rules in `.gitleaks.toml` with `[extend] useDefault = true`:

```toml
[[rules]]
id = "mapbox-secret-token"
description = "Mapbox secret access token (sk.) — never bundles, never commits"
regex = '''\bsk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b'''
keywords = ["sk."]
[[rules.allowlists]]
paths = ['''apps/mobile-rn/src/__fixtures__/secret\.lint-fixture\.ts''']
description = "Intentional ESLint guard fixture from pre-v1.0 Plan 08"

[[rules]]
id = "mapbox-public-token-bare"
description = "Mapbox public access token (pk.) without the 'mapbox' keyword — flag for review"
regex = '''\bpk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b'''
keywords = ["pk."]
```

**Warning signs:** False positive: TypeScript `'pk-button-primary'` would NOT match the `{60,}` length requirement. False negatives: still possible if token is base64-armored.

### Pitfall 3: `${VAR:?msg}` in docker-compose only checks emptiness, not length

**What goes wrong:** `docker-compose.prod.yml` line 113 has `${JWT_SECRET:?need JWT_SECRET >=32 chars}` — the message implies length enforcement, but shell `${VAR:?msg}` only fires when VAR is unset or empty. A 5-char JWT_SECRET passes compose and reaches Go.

**Why it happens:** Shell parameter expansion has no built-in length predicate. Common misreading of `:?msg` semantics.

**How to avoid:**
- **For JWT_SECRET specifically: ALREADY HANDLED.** `services/backend/pkg/auth/jwt.go:43-46` enforces `len(secret) ≥ 32` and returns error → `os.Exit(1)`. `[VERIFIED: pkg/auth/jwt.go]`
- **For other length-sensitive secrets** (none in current inventory, but future): wrap `envRequire` with an `envRequireMinLen(key, min int) string` variant. For v1.0 the only length-sensitive secret IS JWT_SECRET and it's covered. Don't build the wrapper unless a second use case appears.

**Warning signs:** Service starts in CI with weak test secret but `auth.NewSigner` returns "auth: jwt secret must be at least 32 bytes" — that means it's working.

### Pitfall 4: Master age key loss = catastrophic

**What goes wrong:** If both devs lose their age private keys simultaneously (laptop theft + 1Password lockout + USB physical loss), ALL `.secrets/**/*.yaml` files become unreadable. Production deploys break next time secrets need updating.

**Why it happens:** age is X25519; no recovery without private key.

**How to avoid:**
1. **Recovery playbook** in `docs/RUNBOOKS/sops-edit.md` (per D-19): "If master key lost — see step X" — instructs use of 1Password sealed entry OR physical USB backup OR partner dev's key.
2. **Two-recipient invariant from day one**: never have a single-recipient `.sops.yaml`. Even with 2 devs, the 2nd dev's key is the recovery path for the 1st.
3. **Test recovery**: planner adds a "verify dev B can decrypt dev A's encrypted file" smoke test as Wave 1 verification.

**Warning signs:** `sops -d` returns "no key could decrypt the data" → check `SOPS_AGE_KEY_FILE` env var and `.sops.yaml` recipient list match the actual `age-keygen` public key.

### Pitfall 5: SOPS edit on merge-conflicted encrypted YAML produces garbage

**What goes wrong:** Two devs edit `.secrets/prod/shared.yaml` on parallel branches. On merge, git produces a 3-way conflict on encrypted blob — but the merged content is gibberish because conflict markers `<<<<<<<` are inside ciphertext.

**Why it happens:** SOPS encrypts each VALUE individually but the MAC + metadata at the file bottom is one block. Git's textual merge has no semantics for encrypted YAML.

**How to avoid:**
- **Treat encrypted YAML as binary** in `.gitattributes`: `*.yaml -text` for `.secrets/**` (or use `binary` attribute).
- **Resolve via "ours" or "theirs" then re-edit**: `git checkout --theirs .secrets/prod/shared.yaml && sops .secrets/prod/shared.yaml` to add the changes from the losing branch manually.
- **Optional**: `.gitattributes` SOPS diff driver — `*.yaml diff=sopsdiffer` with a git diff driver running `sops --output yaml --decrypt`. Nice-to-have for v1.0, not required.

**Warning signs:** `sops -d` after a merge fails with "Input string ... does not match sops' expected format" → conflict markers leaked into ciphertext; revert and re-merge.

### Pitfall 6: Pre-commit hook fails on Windows / WSL line endings

**What goes wrong:** A Windows dev with `core.autocrlf=true` sees gitleaks reject the commit because hooks fail to execute due to CRLF in the hook script.

**Why it happens:** `pre-commit install` writes a POSIX shell script as `.git/hooks/pre-commit`. With autocrlf on, git checkout converts LF→CRLF and shell can't execute.

**How to avoid:** Add `.gitattributes` directive: `.git/hooks/* text eol=lf` (actually only relevant if hooks are committed; pre-commit framework's installed hook lives outside git's purview). Lower priority — both project devs are macOS per init metadata.

**Warning signs:** `git commit` errors with `^M: command not found` or `bad interpreter`.

### Pitfall 7: Full-history scan finds a real, still-active secret

**What goes wrong:** Wave 4 runs `gitleaks detect --log-opts="--all"` and finds an old commit with a Mapbox `sk.` token or a Postgres password. Per D-12, history is NOT rewritten — but the token must be revoked NOW.

**Why it happens:** Pre-Phase-2 commits could contain leaks. Pre-v1.0 audit at `docs/SECRETS.md` §«Аудит истории» already confirms `git grep` is clean — but `gitleaks --all` scans all branches and all commits, which is a stricter check.

**How to avoid:**
1. **Run full-history scan EARLY in Phase 2** (Wave 1 not Wave 4). Produce JSON report: `gitleaks detect --no-banner --redact --report-format json --report-path .planning/phases/02-secrets-and-config-hardening/history-scan.json --log-opts="--all"`.
2. **Classify each finding**: (a) intentional fixture (allowlist in `.gitleaks.toml`), (b) historical leak — rotation required, (c) false positive — allowlist with comment.
3. **For (b) findings**: rotate the affected secret BEFORE Phase 2 closes. Document in `docs/SECRETS.md` §"Rotation Log".

**Warning signs:** JSON report has entries with `"Match": "sk.…"` and `"Commit": "<sha>"` not in the existing fixture file. Treat as compromise.

### Pitfall 8: SOPS recipient rotation without `updatekeys` invalidates all files

**What goes wrong:** Dev A leaves project; replace their age key in `.sops.yaml` with dev C's key. If you naively re-encrypt every file with the new recipient list, every value gets a fresh nonce → every encrypted YAML changes → massive PR diff. Worse: if you forget to re-encrypt some files, the new dev can't decrypt them.

**Why it happens:** Two SOPS rotation commands look similar but do different things.

**How to avoid:**
- **Use `sops updatekeys .secrets/prod/shared.yaml`** — this re-wraps the data key for the new recipient list WITHOUT changing the encrypted VALUES. Diff is minimal (only the recipient stanzas change). `[VERIFIED: github.com/getsops/sops, getsops.io/docs/]`
- For each file: `find .secrets -name '*.yaml' -exec sops updatekeys -y {} \;`
- **When removing a recipient who shouldn't have past access**: ALSO run `sops -r --in-place <file>` to generate a fresh data key. But for v1.0 closed-beta with 2 devs and no terminations, `updatekeys` is sufficient.

**Warning signs:** Diff after rotation shows every `enc:` line changed → you ran full re-encrypt, not `updatekeys`. Not wrong, just noisy.

### Pitfall 9: Mapbox Bundle ID + Android SHA-256 restrictions may not be a dashboard-exposed feature

**What goes wrong:** D-15 + existing `docs/SECRETS.md` documents Bundle ID + Android SHA-256 restrictions on Mapbox tokens. Current Mapbox documentation pages (`docs.mapbox.com/help/dive-deeper/access-tokens/` and `/help/troubleshooting/private-access-token-android-and-ios/`) describe **URL restrictions** but do NOT describe Bundle ID or SHA-256 restrictions as a publicly-documented feature `[CITED: docs.mapbox.com/help/dive-deeper/access-tokens/, accessed 2026-05-15]`.

**Why it happens:** Either (a) Mapbox dashboard surfaces native-app restrictions in the UI without documenting them publicly, (b) the feature changed/was removed, or (c) the pre-v1.0 author conflated SDK-level restrictions with token-level restrictions.

**How to avoid:**
- **Planner adds a Phase 2 user-action verification step**: "User logs in to Mapbox dashboard and confirms Bundle ID restriction UI exists. If it does not — document in `docs/DECISIONS/0006-mapbox-token-incident.md` §Mitigations as 'restriction not available; rely on rotation + scope minimization'."
- **Fallback if dashboard doesn't expose it**: minimize scopes (only `STYLES:READ`, `FONTS:READ`, `TILES:READ`, `DATASETS:READ`, `VISION:READ` on `pk.`; only `DOWNLOADS:READ` on `sk.`); add **URL restrictions** for `pk.` to limit to known mobile referrers (`*.runningecosystem.app` if we have a domain; otherwise leave unrestricted but rotate every 6 months).
- Confidence on Bundle ID feature: MEDIUM — the existing `docs/SECRETS.md` line 219 documents this restriction was applied to `prod-public` token, so the feature DID exist at least in 2026-05. Re-verify during execution.

**Warning signs:** Dashboard "Edit token" view shows only "URL restrictions" without Bundle ID / SHA-256 fields → use URL restrictions + scope minimization fallback.

### Pitfall 10: New Mapbox `sk.` token must reach 3 distinct build paths

**What goes wrong:** After Mapbox rotation in Wave 4, the new `sk.` is in `.secrets/prod/mapbox.yaml`. But Mapbox SDK download happens during build, and 3 build paths need the value:
1. Local iOS `pod install` → reads `~/.netrc`
2. Local Android `./gradlew assemble` → reads `~/.gradle/gradle.properties`
3. EAS Build (Phase 11/12) → reads `MAPBOX_DOWNLOADS_TOKEN` env var injected by EAS

**Why it happens:** Build-time secrets have no single source of truth pre-SOPS. Each dev workstation has its own `~/.netrc` and EAS has its own env var management.

**How to avoid:**
- **Document in `docs/SECRETS.md` rotation playbook §Mapbox**: after `sk.` rotation, the operator must update THREE places: their local `~/.netrc`, their local `~/.gradle/gradle.properties`, AND the EAS Build env var via `eas secret:create` (deferred to Phase 11/12 — Phase 2 just lands the SOPS-stored canonical value).
- **Phase 2 scope**: SOPS YAML is the canonical store. Subsequent phases sync from SOPS to other locations.

**Warning signs:** `pod install` fails with HTTP 401 on `api.mapbox.com` → `~/.netrc` not updated. CI build fails with same error → EAS secret not rotated.

## Code Examples

Verified patterns. Snippets that quote tool output are tagged `[VERIFIED]`; pattern sketches for the planner are tagged `[PATTERN]`.

### §sops-config — `.sops.yaml` at repo root

```yaml
# .sops.yaml — encrypts .secrets/**/*.yaml for two age recipients.
# Source: getsops.io/docs/ + github.com/getsops/sops/discussions/1579
# [VERIFIED via web search 2026-05-15]
creation_rules:
  - path_regex: '\.secrets/.*\.yaml$'
    # encrypted_regex omitted on purpose — encrypt ALL keys; not Kubernetes-style.
    key_groups:
      - age:
          - age1devA<replace-with-dev-A-public-key>  # Dev A workstation
          - age1devB<replace-with-dev-B-public-key>  # Dev B workstation
          # Phase 4: add age1ci<...> for CI runner
```

### §gitleaks-config — `.gitleaks.toml` extending default

```toml
# .gitleaks.toml — extends default ruleset + Mapbox custom rules + fixture allowlist.
# Source: github.com/gitleaks/gitleaks README §"Extending Rules" [VERIFIED 2026-05-15]

[extend]
useDefault = true
# disabledRules = []  # nothing to disable today

# Custom rule 1: Mapbox SECRET token (sk.) — not caught by upstream mapbox-api-token rule
[[rules]]
id = "mapbox-secret-token"
description = "Mapbox secret access token (sk.) — never bundles, never commits"
regex = '''\bsk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b'''
keywords = ["sk."]
tags = ["secret", "mapbox"]

# Custom rule 2: Mapbox PUBLIC token (pk.) without keyword "mapbox" nearby
[[rules]]
id = "mapbox-public-token-bare"
description = "Mapbox public access token (pk.) literal — flag for review"
regex = '''\bpk\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{20,}\b'''
keywords = ["pk."]
tags = ["mapbox"]

# Global allowlist for the intentional ESLint guard fixture
[[allowlists]]
description = "Intentional ESLint guard fixture (pre-v1.0 Plan 08); fake sk.eyJ... token"
paths = [
  '''apps/mobile-rn/src/__fixtures__/secret\.lint-fixture\.ts''',
]
```

### §pre-commit-config — `.pre-commit-config.yaml`

```yaml
# .pre-commit-config.yaml — staged-files-only gitleaks scan
# Source: github.com/gitleaks/gitleaks/.pre-commit-hooks.yaml [VERIFIED 2026-05-15]
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.30.1   # pin to latest stable
    hooks:
      - id: gitleaks
        # Default entry uses: gitleaks git --pre-commit --redact --staged --verbose
        # pass_filenames: false (handled by gitleaks itself)
```

**Install per dev:**
```bash
pip install pre-commit==4.6.0   # or brew install pre-commit
pre-commit install              # writes .git/hooks/pre-commit
pre-commit run --all-files      # one-time verify against current tree
```

### §env-require — `envRequire` Go helper

`[PATTERN]` — apply identically to all 8 service main.go files alongside existing `envOr`:

```go
// envRequire returns the value of env var key, or exits 1 with a clear
// message if missing/empty. Use for secrets; use envOr for non-secrets with
// safe defaults.
func envRequire(key string) string {
    v := os.Getenv(key)
    if v == "" {
        slog.Error("required env var missing", "key", key)
        os.Exit(1)
    }
    return v
}
```

**Audit of call sites to convert** (per service main.go — all 8 files):

| Service | envOr → envRequire | Keep envOr | File:Line |
|---------|-------------------|------------|-----------|
| identity | `IDENTITY_DB_URL`, `IDENTITY_JWT_SECRET` | `IDENTITY_HTTP_ADDR`, `IDENTITY_DEV_MODE`, version policy vars | `identity/cmd/server/main.go:46,47` |
| activity-sync | `ACTIVITY_SYNC_DB_URL`, `IDENTITY_JWT_SECRET` | HTTP_ADDR, NATS_URL (has empty default), version policy | `activity-sync/cmd/server/main.go:44,45` |
| feed | `FEED_DB_URL`, `IDENTITY_JWT_SECRET` | HTTP_ADDR, NATS_URL, REDIS_URL, version policy | `feed/cmd/server/main.go:42,43` |
| media | `MEDIA_DB_URL`, `IDENTITY_JWT_SECRET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | HTTP_ADDR, S3_ENDPOINT (compose-provided), bucket name | `media/cmd/server/main.go:51,74,75` |
| messaging | `MESSAGING_DB_URL`, `IDENTITY_JWT_SECRET` | HTTP_ADDR, NATS_URL, REDIS_URL | `messaging/cmd/server/main.go:45,46` |
| notifications | `NOTIFICATIONS_DB_URL`, `IDENTITY_JWT_SECRET` | HTTP_ADDR, NATS_URL, `EXPO_ACCESS_TOKEN` (already `${VAR:-}` in compose — discuss) | `notifications/cmd/server/main.go:48` |
| realtime-gw | `IDENTITY_JWT_SECRET` | HTTP_ADDR, NATS_URL, DB_URL (empty default) | `realtime-gw/cmd/server/main.go:41` |
| social-graph | `SOCIAL_GRAPH_DB_URL`, `IDENTITY_JWT_SECRET` | HTTP_ADDR, REDIS_URL | `social-graph/cmd/server/main.go:45,46` |

**Note on `EXPO_ACCESS_TOKEN`**: `docker-compose.prod.yml:177` uses `${EXPO_ACCESS_TOKEN:-}` (default empty, not `:?`) — service starts even without it (push fanout becomes no-op). Convert to `envOr` (default `""`) NOT `envRequire`, OR change compose to `${VAR:?}` AND use `envRequire` Go-side. **Recommendation**: keep current "optional" semantics for v1.0 (Phase 11/12 Strava is the push consumer; if `EXPO_ACCESS_TOKEN` is empty, notifications service skips push fanout cleanly).

### §dev-mode-safety — `IDENTITY_DEV_MODE` prod-detection guard

`[PATTERN]` — replace `services/backend/identity/cmd/server/main.go:50`:

```go
// IDENTITY_DEV_MODE: emit OTP devCode in /auth/request-code response.
// SAFE only for local dev / smoke. Default: false (prod-safe).
//
// SAFETY: refuse to start if DEV_MODE=true AND DB URL points at non-local host.
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

// ...add at bottom of file:

// isLocalDBURL returns true if the DB URL points at a local development host.
// Used to refuse dev-mode startup against non-local databases.
func isLocalDBURL(url string) bool {
    return strings.Contains(url, "localhost") ||
        strings.Contains(url, "127.0.0.1") ||
        strings.Contains(url, "host.docker.internal") ||
        strings.Contains(url, "@postgres:") // docker-compose dev network
}
```

**Lean: `log.Fatal` (via `os.Exit(1)`) for v1.0** — prevents accidents. Add `strings` to imports.

### §full-history-scan — gitleaks + trufflehog (one-time Phase 2 execution)

```bash
# gitleaks: scan entire git history, including all branches
gitleaks detect \
  --no-banner \
  --redact \
  --report-format json \
  --report-path .planning/phases/02-secrets-and-config-hardening/history-scan-gitleaks.json \
  --log-opts="--all" \
  --source .
# Source: github.com/gitleaks/gitleaks README [VERIFIED 2026-05-15]

# trufflehog: scan entire git history with verified-secret mode
trufflehog git \
  --json \
  --no-update \
  --only-verified \
  file://. \
  > .planning/phases/02-secrets-and-config-hardening/history-scan-trufflehog.json
# Source: github.com/trufflesecurity/trufflehog [VERIFIED 2026-05-15]
```

**Expected outcome (HIGH confidence):** Zero findings on `sk.…`/`pk.…` (pre-v1.0 `git grep` audit was clean). LOW confidence on `MAPBOX_DOWNLOADS_TOKEN=...` pattern in archived planning files — may need allowlist.

### §sops-edit — Developer workflow

```bash
# One-time: set SOPS_AGE_KEY_FILE in shell rc
echo 'export SOPS_AGE_KEY_FILE=$HOME/.config/sops/age/keys.txt' >> ~/.zshrc

# Create new encrypted file
EDITOR=vim sops .secrets/prod/shared.yaml
# Editor opens with empty template; type YAML; save → SOPS encrypts in place

# Edit existing encrypted file
EDITOR=vim sops .secrets/prod/shared.yaml
# SOPS decrypts to tmp file, opens editor, re-encrypts on save

# Decrypt to stdout (read-only, for deploy or inspection)
sops -d .secrets/prod/shared.yaml

# Decrypt to dotenv format
sops -d --output-type=dotenv .secrets/prod/shared.yaml > /tmp/.env

# Rotate recipients (after .sops.yaml edited to add/remove age keys)
sops updatekeys .secrets/prod/shared.yaml
# Source: github.com/getsops/sops + getsops.io/docs/ [VERIFIED 2026-05-15]
```

### §deploy-decrypt — Production deploy sequence (Phase 3 Ansible target)

```bash
#!/usr/bin/env bash
# /opt/sport/deploy.sh — runs on VPS after `git pull`
# Phase 2 lands this as a documented runbook; Phase 3 wraps in Ansible.

set -euo pipefail
umask 077

export SOPS_AGE_KEY_FILE=/etc/sops/age.key   # mode 400, owned by root

ENV_FILE="$(mktemp /run/sport.env.XXXXXX)"   # /run is tmpfs
trap "shred -u '$ENV_FILE'" EXIT

sops -d --output-type=dotenv .secrets/prod/shared.yaml  > "$ENV_FILE"
sops -d --output-type=dotenv .secrets/prod/mapbox.yaml >> "$ENV_FILE"
sops -d --output-type=dotenv .secrets/prod/oauth.yaml  >> "$ENV_FILE"

docker-compose \
  -f services/backend/docker-compose.prod.yml \
  --env-file "$ENV_FILE" \
  up -d
# trap shreds the env file
```

### §mapbox-rotation — Dashboard procedure (existing playbook reuse)

Existing `docs/SECRETS.md` §«Rotation Playbook — Mapbox sk. token (4 шага)» is canonical. Phase 2 EXTENDS that file:

1. Open https://account.mapbox.com/access-tokens (login: `dragon2015516@gmail.com`, username `iassd`)
2. Click **Create a token**, name `sport-mobile-build-sk-2026-05`
3. Check **Secret access token** checkbox (gives `sk.` prefix)
4. Scopes: `DOWNLOADS:READ` (required), `STYLES:READ`, `FONTS:READ`, `TILES:READ`, `DATASETS:LIST`, `DATASETS:READ`
5. URL restrictions: skip for `sk.` (build-time, no URL)
6. **Create token** → copy `sk....` (shown ONCE)
7. Open `EDITOR=vim sops .secrets/prod/mapbox.yaml`, paste new value under `MAPBOX_DOWNLOADS_TOKEN: sk.…`
8. For new `pk.` (runtime): repeat without "Secret access token" checkbox; add Bundle ID + SHA-256 restrictions if dashboard exposes them (see Pitfall 9 fallback)
9. **After verification** (Step 4 of existing playbook): revoke old `dev-public`, `prod-public`, `server-secret` in dashboard
10. Update `docs/SECRETS.md` §«Rotation Log» with date + reason (no token values)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PGP for secrets encryption | age (X25519) | 2019 (age v1 release) | Single binary, no keyring, modern crypto. SOPS supports both; age preferred for new setups. |
| `git-secret` / `git-crypt` | SOPS + age | 2020-2022 | SOPS encrypts per-VALUE so diffs are meaningful; git-crypt encrypts whole files (binary diff). SOPS won the multi-recipient + diff-friendly axis. |
| Bash hooks in `.git/hooks/` committed | `pre-commit` framework | 2018+ | Cross-language, version-pinned hooks, dev-isolated venvs. Now standard for Python/multi-lang repos. |
| gitleaks v7 + bash | gitleaks v8 with native pre-commit hook | 2022 | v8 ships `.pre-commit-hooks.yaml` officially; better config format (TOML w/ extends). |
| trufflehog v2 entropy-only | trufflehog v3 with `--only-verified` | 2023 | v3 actually pings APIs to confirm credentials are live → massive FP reduction. |
| Cloud KMS (AWS/GCP) | age for self-hosted | 2023-2024 trend for sovereignty/privacy | Matches the Sentry self-hosted choice in Phase 5 (privacy). Cloud KMS still valid for AWS-heavy shops. |

**Deprecated/outdated:**

- `git filter-branch` for history rewrite — replaced by `git filter-repo` AND project convention is "don't rewrite, rotate" (per D-12).
- `detect-secrets` (Yelp) — less active, weaker Mapbox coverage than gitleaks. Not recommended.
- `git-secret` — uses GPG; no advantage over SOPS+age for new projects.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Mapbox dashboard exposes Bundle ID + Android SHA-256 restrictions as a UI feature distinct from URL restrictions | Pitfall 9; Code Examples §mapbox-rotation | MEDIUM — if UI doesn't expose it, fallback to scope minimization + URL restrictions + 6-month rotation. Pre-v1.0 `docs/SECRETS.md` documents the restriction WAS applied to `prod-public` in 2026-05, so feature likely exists. |
| A2 | `IDENTITY_DEV_MODE=true` in non-prod (e.g., staging behind a real Hetzner DB host) should also refuse to start (the safety check covers it via "not localhost" check) | Code Examples §dev-mode-safety | LOW — if staging is the intended dev-mode use case, the planner should expand `isLocalDBURL` to include the staging host literal. Current pattern errs on the conservative side (refuse unless explicitly local). |
| A3 | All 10 secret types are single-line opaque strings (no PEM, no spaces, no `$`) | Pitfall 1 | LOW — verified against `02-CONTEXT.md` inventory (passwords, tokens, emails). Phase 10 iOS P8 certificate IS multi-line but is out of Phase 2 scope. |
| A4 | `--no-verify` bypass on pre-commit is acceptable risk given Phase 4 CI runs gitleaks as backstop | Anti-Patterns | LOW — ROADMAP.md §Hard Rules explicitly bans `--no-verify`. Two devs; social contract enforceable. |
| A5 | Two-recipient `.sops.yaml` (no CI key yet) is sufficient for v1.0 — Phase 4 adds CI key | Pattern 1; D-04 | LOW — locked by CONTEXT decision. Phase 4 dependency is explicit. |

**Note for discuss-phase / planner:** A1 (Mapbox Bundle ID restriction availability) is the only assumption with non-trivial risk. Planner adds a verification step EARLY in Wave 4 (before the user does the irreversible dashboard work).

## Open Questions

1. **Does the CADDY_ACME_EMAIL go in `.secrets/<env>/shared.yaml` even though it's not a "secret"?**
   - What we know: D-02 says yes (groups with the deploy bundle for atomicity).
   - What's unclear: Caddy will email the operator about cert expiry; revealing the email is low-stakes leak.
   - Recommendation: Keep in `shared.yaml` per D-02. Document in `docs/SECRETS.md` that it's "deploy config, not a secret per se."

2. **Should `IDENTITY_JWT_SECRET` be the SAME value across dev/staging/prod, or different?**
   - What we know: All 8 services share the same `IDENTITY_JWT_SECRET` env var by design (cross-service JWT verify per `pkg/auth`).
   - What's unclear: Per-env different values are best practice (compromise of staging != compromise of prod), but cross-env consistency simplifies smoke tests.
   - Recommendation: **Different per env**. Each `.secrets/<env>/shared.yaml` has its own JWT_SECRET. Planner adds `openssl rand -hex 32` step to setup.

3. **Where does the SOPS_AGE_KEY_FILE live on the VPS post-Phase-2?**
   - What we know: D-04 says 1Password + USB for the master key.
   - What's unclear: For VPS deploy, the age private key needs to be ON the VPS for `sops -d` to work.
   - Recommendation: Phase 2 documents the placement: `/etc/sops/age.key` mode 400 owned by root, populated manually by operator during one-time VPS setup. Phase 3 Ansible automates the rest, but the key itself is hand-placed (out-of-band per D-04). DO NOT commit; DO NOT email; transfer via SCP from operator's workstation only.

4. **Do we need a SOPS-version pin in `.sops.yaml` or per-file `sops_version` metadata?**
   - What we know: SOPS embeds version in encrypted file metadata.
   - What's unclear: Will mixing sops v3.13.0 (operator) + v3.10.0 (other dev) cause issues?
   - Recommendation: Document version requirement in `docs/RUNBOOKS/sops-edit.md` ("sops >= v3.13.0"). SOPS is forward-compatible within v3.x major version.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Homebrew | Tooling install | ✓ | 5.0.12 | apt/pacman/installer scripts |
| Python 3 | pre-commit framework | ✓ | 3.13.1 | — (required for pre-commit) |
| Go | Build all 8 services | ✓ | 1.22.3 | — |
| `sops` | Encrypt/decrypt YAMLs | ✗ | — | `brew install sops` (Wave 0 task) |
| `age` | SOPS encryption backend | ✗ | — | `brew install age` (Wave 0 task) |
| `gitleaks` | Pre-commit + history scan | ✗ | — | `brew install gitleaks` (Wave 0 task) |
| `trufflehog` | History scan complement | ✗ | — | `brew install trufflehog` (Wave 0 task) |
| `pre-commit` | Framework | ✗ | — | `brew install pre-commit` OR `pip install pre-commit` (Wave 0 task) |
| Mapbox dashboard access | Token rotation | (user) | — | None — user action mandatory per D-16 |
| 1Password / USB drive | Master key backup | (user) | — | Acceptable risk: 2-recipient redundancy from start |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:** All 5 tools installable via single Homebrew command. **Wave 0 task: `brew install sops age gitleaks trufflehog pre-commit`** (≈30 seconds on a modern Mac).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Go test (`go test ./...`) for backend; pytest for `scripts/smoke_otp.py` |
| Config file | `services/backend/go.mod` (per-package implicit); no pytest config — smoke scripts standalone |
| Quick run command | `cd services/backend && go test ./identity/... -count=1 -race` |
| Full suite command | `cd services/backend && go test ./... -count=1 -race` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | gitleaks + trufflehog full-history clean | smoke | `gitleaks detect --no-banner --log-opts="--all" && trufflehog git --only-verified file://.` | ❌ Wave 4 task |
| SEC-02 | 9 SOPS-encrypted YAMLs decrypt successfully | smoke | `for f in .secrets/*/*.yaml; do sops -d "$f" > /dev/null || exit 1; done` | ❌ Wave 1 task |
| SEC-03 | New Mapbox tokens working (pod install + curl /tiles/) | manual + smoke | Manual: dev build renders map; smoke: `curl "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=$NEW_PK"` returns 200 | ❌ Wave 4 task |
| SEC-04 | ADR-0006 file exists with required sections | unit | `test -f docs/DECISIONS/0006-mapbox-token-incident.md && grep -q "## Контекст" docs/DECISIONS/0006-mapbox-token-incident.md` | ❌ Wave 5 task |
| SEC-05 | `IDENTITY_DEV_MODE=true` against non-local DB → service exits 1 | unit | `cd services/backend/identity && IDENTITY_DEV_MODE=true IDENTITY_DB_URL=postgres://re:pw@prod-host:5432/... go run ./cmd/server` should exit 1 | ❌ Wave 2 (add test) |
| SEC-06 | No hardcoded secrets in services/backend/**/*.go | unit | `! grep -rE '"sk\.|"pk\.|sk-ant-|AKIA|AIza' services/backend/*/cmd/ services/backend/*/internal/` | ✓ existing grep clean |
| SEC-07 | `docs/SECRETS.md` has 10 playbook sections | unit | Manual review — 10 H2 sections matching 10 secret types | ❌ Wave 5 task |
| SEC-08 | Pre-commit gitleaks blocks a staged fake `sk.…` | smoke | `echo 'const x = "sk.eyJ1IjoiZmFrZSIsImEiOiJja3FxcWFhYWEwMDFhMm9wbHBpZXh4eHh4eHgifQ.signature-bytes-here-need-to-be-at-least-twenty"' > /tmp/leak.go && cd /tmp && git init && git add leak.go && pre-commit run --files leak.go` should fail | ❌ Wave 3 task |
| SEC-09 | All 8 services exit 1 when JWT_SECRET unset | unit | Per-service: `cd services/backend/<svc> && unset IDENTITY_JWT_SECRET && timeout 5 go run ./cmd/server`; expect exit code 1 within 5s | ❌ Wave 2 (add test) |

### Sampling Rate

- **Per task commit:** `go test ./<changed-package>/... -count=1 -race`
- **Per wave merge:** `go test ./... -count=1 -race && for f in .secrets/*/*.yaml; do sops -d "$f" > /dev/null; done && pre-commit run --all-files`
- **Phase gate:** All 9 SEC-* automated checks green; full-history scan JSON shows zero unallowlisted findings; ADR-0006 + extended SECRETS.md + sops-edit.md exist.

### Wave 0 Gaps

- [ ] `brew install sops age gitleaks trufflehog pre-commit` — tooling install
- [ ] `age-keygen -o ~/.config/sops/age/keys.txt` per developer (2 keys total)
- [ ] Dev exchanges public keys → both keys land in `.sops.yaml` recipients
- [ ] `services/backend/identity/cmd/server/main_test.go` — needs new test cases for `isLocalDBURL` + `envRequire` (if not already present)
- [ ] Smoke script: `scripts/verify_sops_roundtrip.sh` — encrypts then decrypts a test YAML, validates dotenv output (catches Pitfall 1 early)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | `pkg/auth` JWT HS256 with NewSigner ≥32 byte enforcement — already implemented |
| V3 Session Management | no | Session mgmt is Phase 5/6 concern (rate-limit, anti-replay JWT jti) |
| V4 Access Control | no | RBAC already shipped in pre-v1.0 (`pkg/permissions`); this phase doesn't touch access control |
| V5 Input Validation | no | Not in scope — no new user-facing endpoints |
| V6 Cryptography | **yes — primary** | SOPS+age (X25519) for at-rest; `pkg/auth` HS256 for JWT; no hand-rolled crypto |
| V7 Error Handling & Logging | yes | `redactPassword()` already exists at `identity/cmd/server/main.go:130`; pattern reused across services |
| V8 Data Protection | **yes — primary** | Secrets at rest = SOPS-encrypted; secrets in transit = scp/git (encrypted); secrets at runtime = process env only, never logged |
| V10 Malicious Code | yes | gitleaks pre-commit + CI prevents secrets-in-code committed (D-08, D-09) |
| V14 Configuration | **yes — primary** | 12-factor split (SEC-06); fail-fast on missing secrets (SEC-09); IDENTITY_DEV_MODE prod-detection (SEC-05) |

### Known Threat Patterns for backend Go + SOPS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret committed to git as plaintext | Information Disclosure | pre-commit gitleaks (D-08, D-11) + CI gitleaks+trufflehog (D-09) |
| Secret leaked via process listing (`ps eww`) | Information Disclosure | docker-compose `--env-file` reads ENV file once; doesn't propagate to /proc/<pid>/environ for child processes if isolation correct. Caveat: env vars visible in `/proc/self/environ` inside container. Acceptable risk for v1.0; v1.1 could add file-based secrets via `_FILE` suffix convention. |
| Master age key compromise | Elevation of Privilege | 1Password sealed + USB backup (D-04); rotation via `sops updatekeys` (Pitfall 8); 2-recipient minimum |
| Insider threat (dev leaves) | Information Disclosure | `sops updatekeys` to drop their recipient; rotate all secrets they had access to (no automation v1.0; manual playbook) |
| Old leaked Mapbox token still active | Information Disclosure | Full reset per D-15: revoke in dashboard (true revocation, not "unused"); ADR-0006 documents |
| `IDENTITY_DEV_MODE=true` accidentally enabled in prod | Spoofing (OTP code leak) | Default flipped to false (D-13) + prod-detection refuse-to-start (Code Examples §dev-mode-safety) |
| Pre-commit hook bypassed via `--no-verify` | Repudiation | Hard rule per ROADMAP §Hard Rules; Phase 4 CI gitleaks as belt-and-suspenders |
| SOPS-encrypted file diff leaks structure | Information Disclosure | SOPS encrypts VALUES only; KEYS remain readable. Acceptable: leak that "we have a JWT_SECRET" is not material. To hide structure entirely, use file-level encryption (`encrypted_regex: '^(.*)$'`) — overkill for v1.0. |

## Sources

### Primary (HIGH confidence)

- `getsops/sops` v3.13.0 release notes — https://github.com/getsops/sops/releases/latest
- `FiloSottile/age` v1.3.1 release notes — https://github.com/FiloSottile/age/releases/latest
- `gitleaks/gitleaks` v8.30.1 — https://github.com/gitleaks/gitleaks/releases/latest
- `trufflesecurity/trufflehog` v3.95.3 — https://github.com/trufflesecurity/trufflehog/releases/latest
- `pre-commit/pre-commit` v4.6.0 — https://github.com/pre-commit/pre-commit/releases/latest
- Upstream gitleaks default ruleset `mapbox-api-token` regex — https://raw.githubusercontent.com/gitleaks/gitleaks/master/config/gitleaks.toml line 2569 (fetched via curl 2026-05-15)
- `pkg/auth.NewSigner` ≥32 byte enforcement — `services/backend/pkg/auth/jwt.go:43-46`
- 8 service main.go `envOr` patterns — verified via grep across `services/backend/*/cmd/server/main.go`
- docker-compose.prod.yml `${VAR:?}` patterns — verified at `services/backend/docker-compose.prod.yml`

### Secondary (MEDIUM confidence)

- `sops --output-type=dotenv` known issues — GitHub issues #724, #784, #1435, #1951 (open or acknowledged limitations)
- `sops updatekeys` semantics vs full re-encrypt — confirmed in getsops/sops README + multiple blog posts
- `.sops.yaml` `creation_rules` + multi-recipient age — github.com/getsops/sops/discussions/1579 + getsops.io/docs/
- Mapbox URL restrictions (publicly documented) — docs.mapbox.com/help/dive-deeper/access-tokens/
- Mapbox Tokens API exists for programmatic management — docs.mapbox.com/api/accounts/tokens/

### Tertiary (LOW confidence — flagged for execution-time validation)

- Mapbox Bundle ID + Android SHA-256 token restrictions exist as a dashboard feature — based on pre-v1.0 `docs/SECRETS.md` line 219 documenting application to `prod-public`; current Mapbox public docs only describe URL restrictions. **Verify during Wave 4 user-action step (Pitfall 9).**

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all 5 versions verified against `releases/latest`; all available via Homebrew
- Architecture (SOPS + age + decrypt-at-deploy): HIGH — matches CNCF SOPS standard pattern + matches D-03 lock
- Pitfalls: HIGH for #1-#8 + #10 (verified against upstream issues / pre-v1.0 docs / codebase grep); MEDIUM for #9 (Mapbox Bundle ID restriction availability)
- Code examples (`envRequire`, `isLocalDBURL`, gitleaks.toml): HIGH — patterns match existing repo conventions + verified upstream syntax
- Runtime state inventory: HIGH — verified by grep + reading docker-compose.prod.yml + smoke_otp.py

**Research date:** 2026-05-15
**Valid until:** 2026-06-14 (30 days for stable v3.x SOPS / v8.x gitleaks / v3.x trufflehog) OR until any of the 5 pinned versions ships a major release

---

*Phase: 02-Secrets-and-Config-Hardening*
*Researched: 2026-05-15*
*Single-pass research — no questions per autonomous-mode redline.*
