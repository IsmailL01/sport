# Phase 2: Secrets & Config Hardening — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 02-secrets-and-config-hardening
**Milestone:** v1.0 Production Readiness
**Workstream:** `backend` (NON-NEGOTIABLE — gates Phase 3 strictly)
**Mode:** Autonomous (`--auto`-equivalent per persistent user instruction)
**Areas discussed:** 15 gray areas across 9 REQ-ID groups (SEC-01..09)

---

## SOPS Architecture (SEC-02)

### Gray Area 1 — Encryption backend

| Option | Description | Selected |
|--------|-------------|----------|
| age (X25519) | Modern, single binary, multi-recipient | ✓ |
| PGP / GPG | Industry-deployed, keyring complexity | |
| AWS KMS / GCP KMS | Cloud-managed, requires cloud account | |
| HashiCorp Vault | Heavy infra for team-of-2 | |

**Rationale:** age is the SOPS-native modern choice; matches Sentry self-hosted privacy theme; no PGP keyring ceremony; no cloud lock-in.

### Gray Area 2 — Secret file layout

| Option | Description | Selected |
|--------|-------------|----------|
| `.secrets/<env>/{shared,mapbox,oauth}.yaml` (3 envs × 3 categories) | Per-env + per-category split; rotation cycles differ | ✓ |
| `.secrets/<env>.yaml` (single file per env) | Simpler but mixes Mapbox cycle with infra cycle | |
| `.secrets/<service>/<env>.yaml` (per-service) | Over-segmented for shared secrets like POSTGRES_PASSWORD | |
| Vault hierarchical | Defer; not v1.0 | |

**Rationale:** Mapbox tokens rotate on a different cycle (dashboard-driven) than infra secrets (manual rotation). OAuth client secrets are partially populated. Splitting by category lets each rotation playbook stay focused.

### Gray Area 3 — Loading mechanism in Go

| Option | Description | Selected |
|--------|-------------|----------|
| SOPS decrypt → `.env` file → docker-compose env-file consumption | Matches existing `${VAR:?need}` pattern; no Go refactor | ✓ |
| `sops exec-env` per service (sidecar invocation) | Per-process; complex compose integration | |
| `github.com/getsops/sops/v3` library at Go boot | Embeds age key into binary; bigger attack surface | |
| Vault sidecar | v1.1+ | |

**Rationale:** Existing `docker-compose.prod.yml` already consumes env vars. SOPS becomes a deploy-time concern, not a runtime concern.

### Gray Area 4 — Master key storage strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 1Password sealed entry + offline USB backup per dev | Mirrors Phase 9 Android keystore strategy | ✓ |
| YubiKey HSM | Better security but ceremony overhead for closed beta | |
| Plain ~/.config/sops/age/keys.txt with file permissions | Single-machine; bus factor 1 | |
| Encrypted file with passphrase | Manageable but no recovery without passphrase | |

**Rationale:** Symmetric with keystore backup strategy already decided for Phase 9. HSM is v1.1.

---

## Loading Convention (SEC-06, SEC-09)

### Gray Area 5 — When decryption happens

| Option | Description | Selected |
|--------|-------------|----------|
| `sops -d` at deploy time → `.env` consumed by compose | Single decrypt; bounded attack window | ✓ |
| Per-service at process boot | More attack surface (age key per binary) | |
| Continuous (Vault Agent sidecar refreshing) | v1.1+ when auto-rotation lands | |

### Gray Area 6 — Fail-fast on missing secret

| Option | Description | Selected |
|--------|-------------|----------|
| Add `envRequire(key)` companion to existing `envOr()` — `log.Fatal` on empty | Minimal addition; idiomatic | ✓ |
| Keep current `envOr` with default ""; check downstream | Silent failures possible | |
| Pull both into `pkg/config` shared lib | v1.1 refactor; over-engineered for v1.0 | |

**Rationale:** Belt-and-suspenders — docker-compose `${VAR:?}` plus in-Go check.

---

## Pre-Commit + CI Scanning (SEC-01, SEC-08)

### Gray Area 7 — Pre-commit framework

| Option | Description | Selected |
|--------|-------------|----------|
| `pre-commit` Python framework | Industry-standard; gitleaks has official hook | ✓ |
| `lefthook` (Go-native) | Faster but smaller ecosystem | |
| `husky` (Node-based) | Forces Node tooling on backend devs | |
| Shell-only git hooks | No version-pin; per-dev install drift | |

### Gray Area 8 — gitleaks vs trufflehog

| Option | Description | Selected |
|--------|-------------|----------|
| Both — gitleaks pre-commit (fast); gitleaks + trufflehog CI (depth) | Complementary; pre-commit speed + CI depth | ✓ |
| gitleaks only | Misses entropy-based detection | |
| trufflehog only | Too slow for pre-commit | |
| Custom regex only | Reinvents scanners | |

### Gray Area 9 — Pre-commit hook scope

| Option | Description | Selected |
|--------|-------------|----------|
| Changed files only (`pre-commit` default) | Fast; commits feel responsive | ✓ |
| Full repo on every commit | Slow; annoying | |
| Full repo on every push | Defer to CI in Phase 4 instead | |

### Gray Area 10 — Initial full-history scan handling

| Option | Description | Selected |
|--------|-------------|----------|
| Run once during Phase 2 execute; rotate any findings; document; do NOT rewrite history | Pre-v1.0 Plan 08 precedent | ✓ |
| Rewrite history to scrub findings | High risk; breaks all clones | |
| Skip; trust ESLint guard | Existing guard is mobile-only; backend Go unsanitized | |

---

## IDENTITY_DEV_MODE Fix (SEC-05)

### Gray Area 11 — How to handle the flag

| Option | Description | Selected |
|--------|-------------|----------|
| Flip default to `false` + add prod-detection safety check | Keep flag for local dev; safety prevents accidents | ✓ |
| Remove the flag entirely; force explicit env | Inconvenient for local dev; smoke_otp.py also breaks | |
| Keep default `true` with louder warning | Doesn't fix the P0 | |
| Move to feature-flag table | Over-couples to Phase 1 featureflags | |

**Rationale:** Smallest change that closes the P0 without disrupting local-dev workflow.

---

## Mapbox Token Incident Reset (SEC-03, SEC-04)

### Gray Area 12 — Rotation scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full reset (all 3 tokens) treated as compromise | All 3 touched chat; can't partial-trust | ✓ |
| Partial: only revoke `server-secret` mis-creation | Leaves other 2 chat-leaked tokens active | |
| Keep + restrict more tightly | Doesn't undo the leak | |

### Gray Area 13 — Token type assignment

| Option | Description | Selected |
|--------|-------------|----------|
| New `sk.` for CI/build-time + new `pk.` for mobile runtime; both Bundle-ID + SHA-256 restricted | Matches Mapbox best practice + corrects pre-v1.0 mis-creation | ✓ |
| Single `pk.` for everything | Wrong type for CI; Mapbox SDK download fails | |
| Multiple `sk.` for different services | Overkill for closed beta single-VPS | |

### Gray Area 14 — Dashboard execution path

| Option | Description | Selected |
|--------|-------------|----------|
| User does dashboard work; Claude generates playbook + ADR + SOPS commands | User has the Mapbox account credentials | ✓ |
| Claude attempts via Mapbox API | Requires master API token; circular dependency | |
| Defer all token work to Phase 18 distribution | Misses pre-Phase-9 keystore dependency | |

---

## Documentation (SEC-07)

### Gray Area 15 — Playbook organization

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing `docs/SECRETS.md` + new `docs/RUNBOOKS/sops-edit.md` | Builds on pre-v1.0 Plan 08 work | ✓ |
| New `docs/RUNBOOKS/secrets/` directory per type | More files; same info | |
| Single monolithic doc | Hard to navigate | |

---

## Claude's Discretion (small decisions)

- age v1.x latest stable
- SOPS v3.x latest stable
- `pre-commit` framework v3.x latest stable
- `.sops.yaml` single creation rule for all `.secrets/**`
- `sops --output-type=dotenv` for one-step env-file generation
- Per-service `--extract` deferred until needed

## Deferred Ideas (preserved for v1.1+)

- HashiCorp Vault
- HSM-backed master key (YubiKey for age)
- Automated rotation
- NATS authentication
- `pkg/config` shared Go lib
- Cloud KMS migration
- Sealed Secrets / External Secrets Operator
- Strava client_secret actual value (Phase 11/12)
- Google / Apple OAuth secrets (HEALTH-01..03 are v1.1)

## Phase 2 → Phase 3 Strict Sequencing (carried from user redline)

Phase 2 → Phase 3 is **strict, no parallelization**. Ansible templates in Phase 3 MUST consume from SOPS, not from inline values. The plan-checker will reject any Phase 3 plan attempting to start before Phase 2 SUMMARY.md lands. Noted in CONTEXT.md domain section.

---

*Mode note: This session ran in autonomous mode per persistent user instruction. Alternatives tables above list what would have been presented via AskUserQuestion in interactive mode; the ✓ column shows the auto-selected option. The user can redirect any decision by editing CONTEXT.md directly — downstream agents read CONTEXT.md, not this log.*
