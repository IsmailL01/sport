# Phase 2: Secrets & Config Hardening — Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Milestone:** v1.0 Production Readiness
**Workstream:** `backend` (NON-NEGOTIABLE — gates Phase 3 strictly; no parallelization per user redline)
**Mode:** Autonomous (`--auto`-equivalent per persistent no-questions instruction)

<domain>
## Phase Boundary

**What this phase delivers:** Take the repo from "secrets manually exported on prod VPS, `IDENTITY_DEV_MODE=true` shipped as default, Mapbox tokens leaked through chat once" → to "every secret in SOPS-encrypted files committed to repo, decrypted at deploy time only, rotation playbooks for all 10 secret types, pre-commit + CI scans clean on full history, Mapbox tokens fully reset as a treated-as-compromise incident, `IDENTITY_DEV_MODE` default flipped to `false`."

**This phase is the strict gate for Phase 3 (IaC).** Ansible templates in Phase 3 MUST consume from SOPS, not from inline values. No parallelization between Phase 2 and Phase 3.

**Out of scope:**
- IaC / Ansible playbooks (Phase 3)
- CI security scans wired into GitHub Actions matrix (Phase 4 — Phase 2 lands the scanner CONFIG, Phase 4 wires the CI invocation)
- HSM-backed master key (v1.1 — closed beta uses age key + 1Password + USB backup)
- Vault sidecar (v1.1+; SOPS is sufficient for team-of-2 + Hetzner VPS scale)
- Secret rotation automation (manual rotation per playbook is v1.0; auto-rotation is v1.1)

</domain>

<scout_findings>
## Current State of Secret Handling (verified 2026-05-15)

### What's already in place (good baseline)
- **12-factor config split is ~85% done.** All 8 Go services use `os.Getenv()` with a shared `envOr(key, default)` helper at the bottom of each `main.go`. Pattern is consistent.
- **Per-service env var taxonomy is clean:** `{SERVICE}_DB_URL`, `{SERVICE}_HTTP_ADDR`, plus shared: `JWT_SECRET`, `EXPO_ACCESS_TOKEN`, `CADDY_ACME_EMAIL`, `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_ENDPOINT`, `NATS_URL`, `REDIS_URL`.
- **`docker-compose.prod.yml` declares all required vars** via `${VAR:?need ...}` shell-substitution — startup fails loud if a secret is missing.
- **`.gitignore` blocks `.env` + `.env.*` + `*.key` + `*.keystore` + `secrets/`** but allows `.env.example` (in good shape).
- **Mobile `.env` + `.env.example` exist** at `apps/mobile-rn/.env` (gitignored) and `apps/mobile-rn/.env.example` (checked in, placeholder values).
- **ESLint v9 token-secret guard already shipped in pre-v1.0 Plan 08** (`apps/mobile-rn/eslint.config.js`) — rejects `EXPO_PUBLIC_*_SECRET` env-var names + `^sk\.[40,]` string literals. Repo-wide pre-commit hook in this phase complements it (not duplicates).

### What's missing / broken
- **`IDENTITY_DEV_MODE` defaults to `true`** at [services/backend/identity/cmd/server/main.go:50](services/backend/identity/cmd/server/main.go#L50) — CONCERNS.md P0 confirmed. The comment literally says "В production выставить `IDENTITY_DEV_MODE=false`" but ships `true`. P0 fix here.
- **No SOPS encryption anywhere.** Prod secrets live as plain `.env` on the VPS shell or as exported env vars before `docker-compose up`. Bus factor of 1.
- **No master key strategy.** Whoever has SSH to the VPS has the secrets.
- **No `.gitleaks.toml` / `.trufflehog/` config.** History has never been scanned.
- **Mapbox `pk.` / `sk.` token state:** `docs/SECRETS.md` (created in pre-v1.0 Plan 08) notes the `server-secret` was mistakenly created as `pk.` rather than `sk.`, and all 3 tokens "однажды передавались в чат с AI" — explicit Phase 1 → Phase 2 carry-over. Treated as compromise incident per CONTEXT D-32 (carry-over from pre-v1.0 Phase 1; relocated here as SEC-03/04).
- **No OAuth client secrets yet** (Google/Apple/Strava not integrated). Phase 11/12 will integrate Strava; the secret store should have placeholder entries documented.
- **Pre-commit hook framework not installed.** No `.pre-commit-config.yaml`. No git hooks beyond the implicit ESLint v9 lint via separate npm scripts.

### Inferred secret inventory (10 types)

| # | Secret type | Current storage | Phase 2 target |
|---|-------------|-----------------|----------------|
| 1 | Mapbox **`sk.`** secret (CI/build-time) | `~/.gradle/gradle.properties` + `~/.netrc` local only | SOPS `.secrets/prod/mapbox.yaml` + CI vault entry (Phase 4 wires) |
| 2 | Mapbox **`pk.`** public runtime | Bundled into mobile binary via EAS env var | Same — but rotate AND restrict by Bundle ID + SHA-256 per Phase 1 D-32 |
| 3 | Postgres password | Shell var on VPS | SOPS `.secrets/<env>/shared.yaml` |
| 4 | NATS auth | None today (NATS open on internal network) | Document; consider adding NATS auth in Phase 2 (small surface) or defer to v1.1 |
| 5 | MinIO root user + password | Shell var on VPS | SOPS `.secrets/<env>/shared.yaml` |
| 6 | Expo Push access token (`EXPO_ACCESS_TOKEN`) | Shell var on VPS | SOPS `.secrets/<env>/shared.yaml` |
| 7 | JWT signing secret (`JWT_SECRET`, 32+ chars) | Shell var on VPS | SOPS `.secrets/<env>/shared.yaml` |
| 8 | Caddy ACME email (`CADDY_ACME_EMAIL`) | Shell var on VPS | SOPS `.secrets/<env>/shared.yaml` (not truly secret but goes with deploy bundle) |
| 9 | OAuth client secrets (Google / Apple / Strava) | None yet | SOPS placeholder entries; populated when Phase 11/12 integrates |
| 10 | SOPS master key itself (`SOPS_AGE_KEY`) | N/A (no SOPS yet) | 1Password sealed entry + USB encrypted backup per dev (2 age keys); 3rd key for CI later (Phase 4) |

</scout_findings>

<decisions>
## Implementation Decisions (15 gray areas auto-resolved)

### SOPS Architecture (SEC-02)

- **D-01: SOPS backend = `age`** (not PGP, not cloud KMS). Why: single-binary, modern X25519-based encryption, no GPG keyring complexity, supports multi-recipient (multiple devs + CI), mature for team-of-2 + Hetzner VPS scale. Cloud KMS rejected for v1.0 (privacy concern matching Sentry self-hosted choice). PGP rejected for friction (smartcard ceremony, key signing).
- **D-02: Layout = `.secrets/<env>/{shared,mapbox,oauth}.yaml`** with three envs (`dev/`, `staging/`, `prod/`). `shared.yaml` holds runtime secrets all services consume (`POSTGRES_PASSWORD`, `JWT_SECRET`, MinIO creds, Expo token, Caddy email). `mapbox.yaml` separates Mapbox `pk.`/`sk.` because rotation cycle is independent (Mapbox dashboard) and build-time use differs from runtime. `oauth.yaml` holds Google/Apple/Strava client secrets (mostly placeholders for v1.0 — Strava populated in Phase 11/12).
- **D-03: Loading mechanism = `sops -d` at deploy time → `.env` file consumed by docker-compose.** Matches existing `docker-compose.prod.yml` `${VAR:?need ...}` pattern. Deploy step: `sops -d .secrets/prod/shared.yaml > /opt/sport/.env && docker-compose -f docker-compose.prod.yml up -d`. Per-service split via `--extract` flag if needed later. Go services don't import a SOPS library — they read env vars as today. Why: simplest seam, matches existing pattern, no Go code refactor.
- **D-04: Master key storage = age private key in 1Password sealed entry per dev + encrypted USB physical backup per dev.** Mirrors Phase 9 Android keystore strategy. 2 age keys committed as recipients in `.sops.yaml`. CI gets a 3rd age key when Phase 4 wires GitHub Actions (separate key = easier to rotate without rotating devs). Recovery playbook in `docs/SECRETS.md`.
- **D-05: `.sops.yaml` config at repo root** declares creation rules: encrypt `.secrets/**/*.yaml` with age recipients. Encrypted-at-rest YAMLs committed to repo (the **decrypted** values never are). SOPS encrypts values, not keys — diff stays meaningful.

### Loading Convention (SEC-06, SEC-09)

- **D-06: SOPS decrypt happens ONCE at deploy time**, not per service at boot. Deploy script writes `.env` to a tmpfs-mounted path or short-lived file; `docker-compose up` reads it; file is shredded after compose-up completes. Services see env vars in their process and read via existing `os.Getenv()`. Why: avoids embedding SOPS library + age key into every Go binary; reduces attack surface; matches "secrets are deploy-time concern" principle.
- **D-07: Each Go service main.go must FAIL TO START** if any required secret env var is missing or empty. Today `docker-compose.prod.yml` enforces `${VAR:?need ...}` at compose level; SEC-09 adds redundant in-Go check. The `envOr(key, default)` helper stays for non-secrets (`HTTP_ADDR`, etc.) but secrets MUST be required (use new `envRequire(key)` helper that `os.Exit(1)`s on miss). Audit ALL `envOr("SECRET_LIKE_NAME", ...)` call sites for this — JWT_SECRET, *_DB_URL with embedded password, etc.

### Pre-Commit + CI Scanning (SEC-01, SEC-08)

- **D-08: Pre-commit framework = `pre-commit` (Python).** Most widely adopted, gitleaks has an official hook, ecosystem mature. Installed via `pip install pre-commit && pre-commit install`. Config in `.pre-commit-config.yaml` at repo root.
- **D-09: gitleaks for pre-commit (changed files only — speed), gitleaks + trufflehog for CI (full repo + history — depth).** Phase 2 lands the configs (`.gitleaks.toml`, optional `.trufflehog/` config); Phase 4 wires the GH Actions invocation. Why split: pre-commit must be fast (<5s) to not annoy devs; CI can take 5-10min.
- **D-10: `.gitleaks.toml` ruleset** = default gitleaks rules + project-specific extensions: `sk\.[A-Za-z0-9_-]{40,}` (Mapbox secret), `pk\.[A-Za-z0-9_-]{40,}` (Mapbox public — flag but lower severity), `MAPBOX_(DOWNLOADS_)?TOKEN` env var name. Allowlist: `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` (intentional fixture per pre-v1.0 Plan 08).
- **D-11: Pre-commit hook scope** = files staged for the current commit (default `pre-commit` behavior). NOT full-repo on every commit (would be slow). Full-repo scan is the CI's job.
- **D-12: Initial full-history scan happens once during Phase 2 execution** — run `gitleaks detect --no-banner --redact --log-opts="--all"` on the full clone. Document findings in `docs/SECRETS.md` Incident Log. ANY findings trigger immediate rotation of the affected secret, NOT history rewrite (per pre-v1.0 Plan 08 §Аудит истории — do not rewrite history; document + rotate).

### IDENTITY_DEV_MODE Fix (SEC-05)

- **D-13: Flip default to `false`** at `services/backend/identity/cmd/server/main.go:50` — change `envOr("IDENTITY_DEV_MODE", "true")` → `envOr("IDENTITY_DEV_MODE", "false")`. KEEP the flag (still useful for local dev). Add **prod-detection safety check**: if `IDENTITY_DEV_MODE=true` AND `IDENTITY_DB_URL` does not contain `localhost` / `127.0.0.1` / `host.docker.internal`, log a critical warning and refuse to start. Why: a dev with stale env vars can't accidentally enable dev mode on prod.
- **D-14: Update `services/backend/scripts/smoke_otp.py` SMOKE_DEV_MODE default** to also `false` (matches identity service default; explicit opt-in for local smoke tests). Document in script comment.

### Mapbox Token Incident Reset (SEC-03, SEC-04)

- **D-15: Treated-as-compromise full reset.** All 3 tokens that ever touched chat history (per `docs/SECRETS.md` known issue #4 from pre-v1.0 Plan 08) are revoked. New tokens created with correct types:
  - **New `sk.` secret token** for CI/build-time (Mapbox SDK download via Maven/CocoaPods). Restrict to Bundle ID `com.runningecosystem.mobile` + Android SHA-256 fingerprint. Stored in SOPS `.secrets/prod/mapbox.yaml`.
  - **New `pk.` public runtime token** for mobile binary (map rendering at runtime). Restrict to Bundle ID + SHA-256. Stored in SOPS + bundled into EAS production profile via env var.
  - **Old `pk.` mistakenly named `server-secret`** revoked.
  - **Old `dev-public` and original `prod-public`** revoked.
- **D-16: User action required for Mapbox dashboard work.** Claude generates ADR-0006 + rotation playbook + SOPS encryption commands. User logs into Mapbox dashboard at `account.mapbox.com` (account `iassd` / `dragon2015516@gmail.com` per pre-v1.0 Plan 08 SUMMARY), creates new tokens, restricts by Bundle ID + SHA-256, revokes old tokens, copies new token values into local SOPS edit session.
- **D-17: ADR-0006 file path:** `docs/DECISIONS/0006-mapbox-token-incident.md`. Russian headings matching ADR-0001/0007 style. Sections: Context (what leaked / when / how), Decision (full reset, treat as compromise), Consequences (downtime window during rotation; CI builds re-broken until new sk. lands), Mitigation (Bundle ID + SHA-256 restriction; Phase 4 secret-scan in CI prevents recurrence).

### Documentation (SEC-07)

- **D-18: Rotation playbooks in `docs/SECRETS.md`** for all 10 secret types from §scout_findings table. Each playbook: trigger condition, dashboard/CLI procedure, SOPS update command, deploy step, validation step. Russian headings matching existing `docs/SECRETS.md` style (already created in pre-v1.0 Plan 08). EXTEND the existing file; don't replace.
- **D-19: `docs/RUNBOOKS/sops-edit.md`** — quick reference for `sops .secrets/prod/shared.yaml` edit workflow + `sops -d` decrypt + `age-keygen` key generation. NEW file.

### NATS Auth (out-of-scope for v1.0)

- **D-20: NATS auth deferred to v1.1.** Current setup: NATS open on internal Docker network with no AuthN. Internal-only access via Docker network is acceptable for v1.0 closed-beta single-VPS deploy. NATS auth + token rotation is a v1.1 hardening when (a) multi-region deploy lands or (b) any service moves off the single VPS. Documented in `docs/SECRETS.md` as known limitation.

### Claude's Discretion (small decisions)

- Specific `age` version pin: latest stable (`v1.x`).
- SOPS version pin: latest stable (`v3.x`).
- `pre-commit` framework version pin: `~3.x` (latest stable).
- Whether `.sops.yaml` config supports `creation_rules` per-env-prefix or single rule for all `.secrets/**`: single rule for v1.0 simplicity.
- Whether to use `sops --output-type=dotenv` (writes `.env` format directly) vs `sops -d | yq -o=env` pipeline: lean `--output-type=dotenv` (one command).
- Per-service split via `sops --extract` deferred — single env per env-dir is sufficient for v1.0 single-VPS deploy.

### Folded Todos

None — `.planning/todos/` not initialized.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.0 Milestone & Phase Specs
- `.planning/PROJECT.md` §Current Milestone v1.0 Production Readiness
- `.planning/REQUIREMENTS.md` §Phase 2 — Secrets & Config Hardening (SEC-01..09)
- `.planning/ROADMAP.md` §Phase 2
- `.planning/MILESTONES.md` v1.0 phase progress table

### Phase 1 Decisions Inherited
- `.planning/phases/01-release-contract-and-version-baseline/01-CONTEXT.md` §D-21 (SCP-throughout deploy principle; Phase 2 sops files are deployed via SCP per Ansible in Phase 3)
- `docs/DECISIONS/0007-v1.0-release-contract.md` §SCP-throughout cross-cut
- Pre-v1.0 archive: `.planning/phases/_archive/pre-v1.0-territory-refactors/01-08-SUMMARY.md` (token-rotation playbook + ESLint guard + chat-history audit findings — Phase 2 builds on these)

### Existing Codebase Anchors
- `services/backend/identity/cmd/server/main.go:50` — `IDENTITY_DEV_MODE` default to flip (P0)
- `services/backend/identity/cmd/server/main.go:122` (and 6 sibling main.go's) — `envOr(key, default)` helper to extend with `envRequire(key)` companion
- `services/backend/docker-compose.prod.yml` — env-var taxonomy that maps to SOPS shared.yaml schema
- `apps/mobile-rn/eslint.config.js` — existing ESLint token-secret guard (pre-commit hook complements, doesn't replace)
- `docs/SECRETS.md` — existing rotation playbook scaffold from pre-v1.0 Plan 08; Phase 2 extends to all 10 secret types
- `.gitignore` — already blocks `.env`, `*.key`, `*.keystore`, `secrets/`; SOPS-encrypted `.secrets/**/*.yaml` ARE committed (encryption protects them)

### Tool / Library Anchors
- `getsops/sops` v3.x (the encryption tool)
- `FiloSottile/age` v1.x (the encryption backend)
- `gitleaks/gitleaks` (pre-commit + CI scanner)
- `trufflesecurity/trufflehog` (CI deep-scan + entropy detection)
- `pre-commit/pre-commit` Python framework

### Future ADRs Scheduled (Phase 2 writes 0006)
- `docs/DECISIONS/0006-mapbox-token-incident.md` — written in this phase (SEC-04)
- `docs/RUNBOOKS/sops-edit.md` — written in this phase (SEC-07 supporting)

### CLAUDE.md Rules Applied
- Russian-language doc headers (apply to ADR-0006 + `docs/SECRETS.md` extension)
- "Не коммитить секреты" — extends to SOPS-encrypted state being OK (encryption is the safety)
- Pinned units N/A

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`envOr(key, default)` helper** repeated in all 8 service main.go files — extend with `envRequire(key) string` that calls `log.Fatal` on empty. Pattern: copy-paste the new helper alongside `envOr` in each file (or pull both into `pkg/config` shared lib — lean keep per-service for minimal blast radius).
- **`docker-compose.prod.yml` `${VAR:?need ...}` enforcement** — already fails-fast on missing required vars at compose level. SOPS doesn't change this; just changes the source of the var values.
- **`.gitignore` already excludes `.env`** — preserves the safety net even if SOPS workflow fails.
- **`apps/mobile-rn/eslint.config.js` token guard** (pre-v1.0 Plan 08) — covers mobile source. Repo-wide pre-commit hook complements for backend Go files + docs + scripts.

### Established Patterns
- **Russian-language module headers + English code identifiers** — ADR-0006 follows ADR-0001/0007 RU-heading + EN-content pattern.
- **`docs/SECRETS.md` extends, not replaces** — pre-v1.0 Plan 08 created this; Phase 2 adds sections for 10 secret types, SOPS workflow, ADR-0006 incident reference.
- **Atomic per-secret-type commits** — each rotation playbook commit can land independently if some secret types have edge cases that need iteration.
- **Branching strategy** — `feat/cursona-redesign` IS the v1.0 line. Phase 2 commits land here.

### Integration Points
- **`docker-compose.prod.yml`** is the integration point for SOPS-decrypted `.env` consumption (D-06 deploy step writes `.env` adjacent to compose file).
- **Each Go service `main.go`** gets a tiny `envRequire()` addition next to existing `envOr()` (D-07 fail-fast on missing secret).
- **`.pre-commit-config.yaml`** at repo root is the integration point for gitleaks pre-commit hook (D-08).
- **`.sops.yaml`** at repo root is the integration point for age recipient configuration (D-05).
- **GitHub Actions** integration is deferred to Phase 4 (CICD-01) — Phase 2 lands `.gitleaks.toml` + `.trufflehog/` config; Phase 4 wires them into the matrix.

</code_context>

<specifics>
## Specific Ideas

- **`.sops.yaml` config sketched** (planner refines):
  ```yaml
  creation_rules:
    - path_regex: '\.secrets/.*\.yaml$'
      key_groups:
        - age:
            - age1devA…  # public key of dev A
            - age1devB…  # public key of dev B
            - age1ci…    # public key of CI (Phase 4 will populate)
  ```
- **SOPS edit workflow:** `EDITOR=vim sops .secrets/prod/shared.yaml` decrypts → opens in editor → re-encrypts on save. Document in `docs/RUNBOOKS/sops-edit.md`.
- **`docker-compose.prod.yml` deploy sequence post-Phase-2** (lands as runbook; actual implementation in Phase 3 Ansible playbook):
  ```bash
  # On VPS, after `git pull`:
  sops -d --output-type=dotenv .secrets/prod/shared.yaml > /opt/sport/.env
  sops -d --output-type=dotenv .secrets/prod/mapbox.yaml >> /opt/sport/.env
  sops -d --output-type=dotenv .secrets/prod/oauth.yaml >> /opt/sport/.env
  docker-compose -f services/backend/docker-compose.prod.yml --env-file /opt/sport/.env up -d
  shred -u /opt/sport/.env
  ```
- **ADR-0006 sections** (RU per ADR-0001 style):
  ```
  # ADR-0006 — Mapbox Token Incident & Full Reset
  
  Дата: 2026-05-15
  Статус: ✅ финализирован
  Решение: Полный reset всех Mapbox токенов как treated-as-compromise incident.
  
  ## Контекст
  …какие токены, когда созданы, какая была утечка (передача в чат с AI)…
  
  ## Решение
  Все 3 предыдущих токена revoked. Новые токены созданы с правильными типами…
  
  ## Альтернативы (отклонены)
  - Частичная ротация только server-secret — отклонено (все токены touched-by-chat)…
  
  ## Последствия
  - Краткий downtime CI build pipeline на время ротации…
  - SOPS .secrets/prod/mapbox.yaml — единственное место хранения…
  
  ## Митигации
  - Bundle ID + Android SHA-256 restriction на все новые токены
  - Phase 4 gitleaks + trufflehog в CI — fail PR при детекции `sk\.|pk\.`
  - Existing ESLint v9 token-secret guard — pre-commit для mobile
  - This phase's repo-wide pre-commit hook — все file types
  
  ## Сценарии пересмотра
  - При публичном launch (v1.5 GDPR) — пересмотреть на v1.5 pen-test
  - При смене Mapbox tier — пересмотреть scope restrictions
  
  ## Ссылки
  - docs/SECRETS.md §«Mapbox tokens»
  - .planning/phases/_archive/pre-v1.0-territory-refactors/01-08-SUMMARY.md
  ```

</specifics>

<deferred>
## Deferred Ideas

- **HashiCorp Vault** — v1.1+; SOPS is sufficient for v1.0 closed beta scale.
- **HSM-backed master key** (YubiKey for age) — v1.1+; closed beta uses 1Password + USB backup.
- **Automated secret rotation** (Mapbox + Postgres + JWT_SECRET on a schedule) — v1.1+; v1.0 is manual per playbook.
- **NATS authentication** — v1.1+; v1.0 relies on Docker network isolation.
- **`pkg/config` shared Go lib for env loading** — v1.1 refactor; v1.0 keeps `envOr` / new `envRequire` per main.go.
- **SOPS with cloud KMS** (AWS / GCP / Azure key) — v2.0 if we ever multi-region.
- **Sealed Secrets / External Secrets Operator** — v2.0 if Kubernetes ever lands (currently systemd + Docker).
- **CI's own age key** — generated and committed-as-recipient in Phase 4 when GitHub Actions wires gitleaks/trufflehog into the matrix.
- **Strava `client_secret` actually populated** — Phase 11/12 when HEALTH-04 lands. Phase 2 just adds the placeholder slot in `.secrets/prod/oauth.yaml`.
- **Google / Apple OAuth secrets** — deferred indefinitely (HEALTH-01..03 are v1.1; native sign-in is v1.1+). Placeholders only.

</deferred>

---

*Phase: 02-Secrets-and-Config-Hardening*
*Context gathered: 2026-05-15*
*Auto-mode log: 20 decisions D-01..D-20 across 15 gray areas grounded in scout findings (12-factor 85% done, docker-compose.prod.yml taxonomy, ESLint guard already shipped, gitleaks/trufflehog never run, `IDENTITY_DEV_MODE=true` confirmed at line 50). Single-pass — no re-read of own output.*
