# Phase 4: CI/CD Pipeline — Pattern Map

**Mapped:** 2026-05-17
**Phase:** 04 — ci-cd-pipeline
**Workstream:** backend
**Files analyzed:** 14 (3 workflow YAMLs, 1 top-level Makefile, 2 config files, 4 SQL migrations, 1 modify-in-place compose, 3 RUNBOOK extensions)
**Analogs found:** 11 / 14 (3 greenfield — workflow CD signing, top-level Makefile, `.golangci.yml` — anchored to RESEARCH §Code Examples §B/§F/§D rather than codebase analogs)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/workflows/backend-ci.yml` (EXTEND) | config (CI workflow) | event-driven (PR/push) | `.github/workflows/backend-ci.yml` itself (May 7 partial) — keep skeleton, expand matrix | exact (extend-in-place) |
| `.github/workflows/backend-cd.yml` (NEW) | config (CD workflow) | event-driven (push к main + tag `v*`) | `.github/workflows/backend-ci.yml` `docker` job (BuildKit + matrix shape reusable) + RESEARCH §Code Examples §B | role-match (CI→CD adaptation) |
| `.github/workflows/secret-scan-full.yml` (NEW — OPTIONAL per RESEARCH Pitfall 10) | config (cron workflow) | event-driven (cron schedule + workflow_dispatch) | RESEARCH §Code Examples §H (no codebase analog — nightly cron is greenfield pattern) | greenfield |
| `.github/workflows/ci.yml` (DELETE) | config (placeholder) | — | n/a (deletion) | deletion |
| `Makefile` (top-level, NEW) | utility (cross-cutting ops) | request-response (CLI invocation → shell/SSH/ansible orchestration) | `services/backend/Makefile` (target structure + `.PHONY` + env-var-required-guard pattern) | role-match |
| `.golangci.yml` (NEW) | config (linter) | batch (file-scan) | none in repo (greenfield) — anchored к RESEARCH §Code Examples §D | greenfield |
| `.trivyignore.yaml` (NEW, may start empty) | config (CVE-ignore manifest) | batch (file-scan filter) | none in repo (greenfield) — anchored к RESEARCH §Code Examples §I | greenfield |
| `services/backend/migrations/9990_drill_metadata_col.up.sql` (NEW) | migration | batch (DDL) | `services/backend/migrations/0014_media.up.sql` (CREATE-style migration body shape) + `0021_featureflags.up.sql` (header-comment convention) | role-match |
| `services/backend/migrations/9990_drill_metadata_col.down.sql` (NEW) | migration | batch (DDL) | `services/backend/migrations/0014_media.down.sql` (single-statement DROP) | exact |
| `services/backend/migrations/9991_drill_drop_metadata_col.up.sql` (NEW) | migration | batch (DDL) | same as above — DROP COLUMN | role-match |
| `services/backend/migrations/9991_drill_drop_metadata_col.down.sql` (NEW) | migration | batch (DDL) | same as above — re-add NULLABLE | role-match |
| `services/backend/docker-compose.prod.yml` (MODIFY — image-pin fields) | config (compose) | declarative | file itself, lines 23-30 service block shape | exact (extend-in-place) |
| `docs/RUNBOOKS/deploy.md §6.4 / §7 / §10` (EXTEND) | doc | reference | `docs/RUNBOOKS/deploy.md` existing §6 / §7 sections (heading depth + bash-block style + table format) | exact (extend-in-place) |
| `scripts/setup-branch-protection.sh` (NEW) | utility (one-shot) | request-response | `services/backend/Makefile scan-secrets` pattern (shell guard + executable command) — RESEARCH §Code Examples §G has the actual body | role-match (template structure only) |

---

## Pattern Assignments

### `.github/workflows/backend-ci.yml` (EXTEND existing)

**Analog (extend-in-place):** `.github/workflows/backend-ci.yml` (commit May 7, 89 lines)

**Imports / triggers pattern** (lines 1-14 existing):

```yaml
name: backend-ci

# Запускается на изменения в services/backend/ или сам workflow.
on:
  push:
    branches: [main]
    paths:
      - "services/backend/**"
      - ".github/workflows/backend-ci.yml"
  pull_request:
    branches: [main]
    paths:
      - "services/backend/**"
      - ".github/workflows/backend-ci.yml"
```

**Extension:** add `Makefile`, `.golangci.yml`, `.trivyignore.yaml` к `paths:` per D-09 + RESEARCH §Code Examples §A (lines 528-544 of RESEARCH.md).

**Core test-job pattern** (existing lines 17-57 — `working-directory: services/backend`, `go-version: "1.25"`, `cache-dependency-path:` multi-line, `go mod download` + `go test -race -coverprofile`):

```yaml
jobs:
  test:
    name: Test (Go)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
          cache-dependency-path: |
            services/backend/identity/go.sum
            services/backend/activity-sync/go.sum
            services/backend/pkg/go.sum
```

**Extension per D-08:** convert к matrix-strategy job; matrix entries `[pkg, identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]`; one-line `cache-dependency-path` per matrix entry. RESEARCH §Code Examples §A lines 551-571 шаблон.

**Docker-build pattern** (existing lines 59-89 — keep `cache-from: type=gha` + `cache-to: type=gha,mode=max` BuildKit GHA cache; `push: false` for CI-time verify):

```yaml
docker:
  name: Docker build
  runs-on: ubuntu-latest
  needs: test
  if: github.event_name == 'push'
  strategy:
    fail-fast: false
    matrix:
      service: [identity, activity-sync]
  steps:
    - uses: actions/checkout@v4
    - uses: docker/setup-buildx-action@v3
    - name: Build ${{ matrix.service }}
      uses: docker/build-push-action@v5
      with:
        context: services/backend
        file: services/backend/${{ matrix.service }}/Dockerfile
        push: false
        tags: ghcr.io/ismaill01/${{ matrix.service }}:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

**Extension per D-08:**
- Expand matrix к 8 services (add `feed, media, messaging, notifications, realtime-gw, social-graph`).
- Add `load: true` для downstream trivy scan (per RESEARCH §Code Examples §A line 668).
- Per-service cache scope (`scope=${{ matrix.service }}`) to avoid cross-service cache pollution.

**NEW jobs (no existing analog; copy from RESEARCH §Code Examples §A):**
- `lint` (golangci-lint v2 via `golangci/golangci-lint-action@v8`) — RESEARCH lines 573-585
- `gosec` — RESEARCH lines 587-602 (SARIF → `github/codeql-action/upload-sarif@v3`)
- `govulncheck` — RESEARCH lines 604-613
- `semgrep` — RESEARCH lines 615-631
- `secrets-scan-diff` (gitleaks + trufflehog, PR-only с `fetch-depth: 0`) — RESEARCH lines 633-649
- `no-latest-tag-guard` (negative-grep) — RESEARCH lines 688-700

**Permissions pattern** (NEW top-level block per RESEARCH §Code Examples §A lines 546-548):

```yaml
permissions:
  contents: read
  security-events: write   # SARIF upload к GH Security tab
```

---

### `.github/workflows/backend-cd.yml` (NEW)

**Analog (BuildKit cache + matrix shape):** `.github/workflows/backend-ci.yml` lines 59-89 (`docker` job) — reuse `setup-buildx-action@v3` + `build-push-action@v5` + cache-from/to + matrix-on-service-name skeleton.

**Primary template (full body):** RESEARCH §Code Examples §B (lines 702-790).

**Permissions pattern** (NEW — critical per RESEARCH Pitfall 3; missing `id-token: write` silently breaks cosign):

```yaml
permissions:
  contents: read
  packages: write       # GHCR push
  id-token: write       # cosign keyless OIDC + SLSA attestation
  attestations: write   # actions/attest-build-provenance
```

**Triggers pattern** (push к main + tag `v*` per D-15):

```yaml
on:
  push:
    branches: [main]
    paths:
      - "services/backend/**"
      - ".github/workflows/backend-cd.yml"
    tags:
      - "v*"
```

**Login + build + sign + attest sequence** (RESEARCH §Code Examples §B lines 738-789):

```yaml
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Compute tags
  id: meta
  uses: docker/metadata-action@v5
  with:
    images: ghcr.io/ismaill01/${{ matrix.service }}
    flavor: |
      latest=false    # CRITICAL — D-15 hard rule (RESEARCH Pitfall 6)
    tags: |
      type=sha,format=short
      type=raw,value={{sha}},enable={{is_default_branch}}
      type=semver,pattern={{version}}

- name: Build + push
  id: build
  uses: docker/build-push-action@v5
  with:
    context: services/backend
    file: services/backend/${{ matrix.service }}/Dockerfile
    push: true
    tags: ${{ steps.meta.outputs.tags }}
    cache-from: type=gha,scope=${{ matrix.service }}
    cache-to: type=gha,mode=max,scope=${{ matrix.service }}

- name: Install cosign
  uses: sigstore/cosign-installer@v3

- name: Sign image (keyless)
  env:
    DIGEST: ${{ steps.build.outputs.digest }}
  run: |
    cosign sign --yes \
      ghcr.io/ismaill01/${{ matrix.service }}@${DIGEST}

- name: Generate SLSA Build L2 attestation
  uses: actions/attest-build-provenance@v2   # NOT v1 — RESEARCH §State of the Art correction
  with:
    subject-name: ghcr.io/ismaill01/${{ matrix.service }}
    subject-digest: ${{ steps.build.outputs.digest }}
    push-to-registry: true
```

**Critical CONTEXT correction:** D-14 says `@v1`; planner MUST use `@v2` (LTS) or `@v4` (latest) per RESEARCH §State of the Art table line 1167.

---

### `Makefile` (top-level, NEW)

**Analog (target structure + env-guard idiom):** `services/backend/Makefile` (88 lines)

**`.PHONY` + help-target pattern** (analog lines 1-21):

```makefile
.PHONY: help up up-stack down migrate migrate-down ...

DB_URL ?= postgres://re:re_dev@localhost:5432/running_ecosystem?sslmode=disable

help:
	@echo "Targets:"
	@echo "  up                  Запустить Postgres + TimescaleDB"
	@echo "  ..."
```

**Required-env-var guard pattern** (analog lines 29-30 `up-stack:`):

```makefile
up-stack:
	@test -n "$$JWT_SECRET" || (echo "Set JWT_SECRET (>=32 chars) before up-stack"; exit 1)
	docker compose --profile stack up -d --build
```

**Apply same pattern для `rollback v=N`:**

```makefile
rollback:
	@test -n "$(v)" || (echo "Usage: make rollback v=<version-tag-or-sha>"; exit 1)
	@git rev-parse --verify $(v) >/dev/null || (echo "Tag/SHA $(v) not found"; exit 1)
```

**Tool-presence guard pattern** (analog `migrate:` lines 47-50 + `scan-secrets:` lines 84-87):

```makefile
migrate:
	@command -v migrate >/dev/null 2>&1 || { \
		echo "golang-migrate не установлен. Установите: brew install golang-migrate"; exit 1; }
	migrate -path migrations -database "$(DB_URL)" up
```

**Apply similarly для `rollback` (ssh + ansible-playbook + curl presence):** RESEARCH §Code Examples §F (lines 964-1020) provides full body. Key adaptations from analog:
- `VPS_HOST ?= deploy@148.253.214.156` matches Phase 3 deploy.md §6.2 SSH user pattern.
- `ssh $(VPS_HOST) "cd /opt/sport/services/backend && sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml run --rm migrations down 1"` — verbatim from existing `deploy.md §6.2` rollback procedure (line 208).
- `cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml` — verbatim from `deploy.md §5.2` routine-deploy + §6.1 code-rollback (lines 171 + 202).

**Smoke-probe step** (analog: `services/backend/scripts/smoke_otp.py` line 24 `BASE = "https://148-253-214-156.sslip.io"`):

```makefile
	curl -fsS -o /dev/null -w "HTTP %{http_code}\n" \
		https://148-253-214-156.sslip.io/healthz
```

---

### `.golangci.yml` (NEW — no codebase analog)

**Anchor:** RESEARCH §Code Examples §D (lines 815-895). Full template copy.

**Key config decisions baked into template:**
- `version: "2"` header (v2 schema mandatory per RESEARCH §State of the Art line 1168)
- `linters.default: none` + explicit-enable list (15 conservative linters) — readability > brevity
- `exclusions.rules` для `_test.go` files (relax `errcheck, gosec, dupl, gocyclo`)
- Deferred linters list comment-block (gocyclo, dupl, revive, gocritic) для post-baseline tuning

**Tuning workflow (planner instruction):** after first `cd services/backend && golangci-lint run`, add per-rule exclusions or `disable:` entries with rationale comment ("Disabled — generates X false-positive per Y; revisit v1.0.1"). RESEARCH lines 897-901 documents this expectation.

---

### `.trivyignore.yaml` (NEW — may stay empty initially)

**Anchor:** RESEARCH §Code Examples §I (lines 1105-1134).

**Key constraint per RESEARCH §State of the Art line 1171:** YAML format does NOT auto-load; requires `--ignorefile .trivyignore.yaml` flag passed via `trivy-action` `trivyignores:` input. Plain `.trivyignore` (text) would auto-load but supports only inline comments — no `expired_at` / `statement` fields.

**Stub body (planner can ship this verbatim):**

```yaml
vulnerabilities: []
# Format for new ignores:
#   - id: CVE-YYYY-NNNNN
#     statement: <rationale — why this is OK to ignore>
#     expired_at: YYYY-MM-DD   # MUST set expiry — forces revisit
misconfigurations: []
secrets: []
licenses: []
```

---

### `services/backend/migrations/9990_drill_metadata_col.up.sql` (NEW)

**Analog (header-comment convention):** `services/backend/migrations/0021_featureflags.up.sql` (lines 1-16 — Phase/REL annotation + design narrative + scope-note).

**Analog (body shape — DDL-only, no DML):** `services/backend/migrations/0014_media.up.sql` (CREATE-style + CHECK constraint + INDEX). For drill, simpler ALTER TABLE ADD COLUMN.

**Stub body (per RESEARCH Pitfall 5 backward-compat requirement):**

```sql
-- Phase 4 / CICD-04: drill migration A (backward-compatible NULLABLE add).
-- Numbered 9990 (NOT 0021+) so не collide с Phase 7 production migrations.
-- TRANSIENT: tag для cleanup after Phase 4 drill closes (см. §SUMMARY).

ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN users.metadata IS
  'Drill column для CICD-04 rollback drill. Unused by application code. Safe to drop.';
```

---

### `services/backend/migrations/9990_drill_metadata_col.down.sql` (NEW)

**Analog (single-statement DROP):** `services/backend/migrations/0014_media.down.sql` line 1:

```sql
DROP TABLE IF EXISTS media;
```

**Stub body (symmetric к up):**

```sql
-- Phase 4 / CICD-04: drill migration A — down.
ALTER TABLE users DROP COLUMN IF EXISTS metadata;
```

---

### `services/backend/migrations/9991_drill_drop_metadata_col.up.sql` (NEW)

**Analog:** same as `9990*.down.sql` — drop the column added in A.

**Stub:**

```sql
-- Phase 4 / CICD-04: drill migration B — drop the drill column.
ALTER TABLE users DROP COLUMN IF EXISTS metadata;
```

---

### `services/backend/migrations/9991_drill_drop_metadata_col.down.sql` (NEW)

**Analog:** same as `9990*.up.sql` — re-add NULLABLE.

**Stub (per RESEARCH Pitfall 5 — drill rollback verifies this restores A's schema):**

```sql
-- Phase 4 / CICD-04: drill migration B — down (re-creates column).
-- Data loss for any rows written between B's deploy и rollback — acceptable
-- since no real code reads users.metadata (drill column).
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
```

---

### `services/backend/docker-compose.prod.yml` (MODIFY)

**Analog (in-file pattern — first service block, lines 23-38):**

```yaml
services:
  postgres:
    image: timescale/timescaledb:2.17.2-pg16
    container_name: re_postgres
    environment:
      POSTGRES_USER: re
      ...
    restart: unless-stopped
```

**Modification per CICD-02 + D-15:** for each Go service (identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph) replace `build: context: ...` with `image: ghcr.io/ismaill01/<svc>@sha256:<digest>`.

**Two-option path per RESEARCH §Code Examples §E:**
- **Option (a) — full SHA256 digest pinning** (lines 904-946) — requires post-CD-run digest capture + sed-replace. Cleaner immutability guarantee but adds PR churn.
- **Option (b) — tag-based pin + cosign-verify-in-Ansible wrap** (lines 948-960) — `image: ghcr.io/ismaill01/identity:${SPORT_STACK_TAG:-v1.0.0-rc.1}` + Ansible pre-pull step runs `cosign verify`.

**RESEARCH recommendation for v1.0 solo-dev:** Option (b) — simpler, defers digest-tooling complexity к v1.1. Plan can ship either; flag в SUMMARY which was chosen.

**Anti-pattern guard (cross-cutting):** negative-grep `:latest` must return clean exit 0 — see `no-latest-tag-guard` job (Shared Pattern E).

---

### `docs/RUNBOOKS/deploy.md §6.4 / §7 / §10` (EXTEND)

**Analog (heading depth + bash-block + warning-callout style):** `docs/RUNBOOKS/deploy.md §6` existing (lines 190-217).

**Section heading convention** (analog line 190):

```markdown
## 6. Rollback (manual emergency)

> v1.0 не имеет CI-driven rollback drill (Phase 4 owner). Для v1.0 closed-beta — manual.

### 6.1. Code-level rollback

```bash
git checkout <previous-tag-or-sha>
...
```
```

**Failure-mode table convention** (analog §7 lines 222-232 — symptom / cause / fix table):

```markdown
| Симптом | Вероятная причина | Fix |
|---------|-------------------|-----|
| ... | ... | ... |
```

**Mixed RU narrative + English commands pattern** preserved throughout (CLAUDE.md "Russian narrative OK" + RESEARCH line 105). Apply same в new sections.

**New §6.4 (Rollback automation reference):**

```markdown
### 6.4. Automated rollback (Phase 4 / CICD-04)

`make rollback v=<tag>` (top-level Makefile) wraps the §6.1 + §6.2 manual sequence:

```bash
make rollback v=v1.0.0-rc.1
# Internally: git checkout → ssh + docker compose migrations down 1 → ansible-playbook → smoke probe
```

Drill run results (CICD-04 acceptance):

| Drill | Date | Migration | Wall-clock | Result |
|-------|------|-----------|-----------|--------|
| #1 | YYYY-MM-DD | 9990↔9991 (drill A/B) | ~X min | PASS — users.metadata restored |
```

**New §7 (Deployment freeze procedure)** — full body from RESEARCH §Architecture Pattern 6 lines 385-395 (verbatim).

**New §10 (Branch protection setup)** — body from RESEARCH §Code Examples §G + Pitfall 1 sequence guard ("don't enable before first green CI run").

---

### `scripts/setup-branch-protection.sh` (NEW)

**Analog (shell guard + tool-presence check):** `services/backend/Makefile scan-secrets:` lines 84-87 (`command -v gitleaks` check).

**Body:** RESEARCH §Code Examples §G (lines 1024-1067 — full `gh api PUT` invocation с JSON body via heredoc).

**Convention:** `set -euo pipefail` header; `REPO=IsmailL01/sport` + `BRANCH=main` as top-level vars (override-able via env if namespace differs per D-02).

---

## Shared Patterns (Cross-Cutting)

### Pattern A — BuildKit GHA cache backend

**Source:** `.github/workflows/backend-ci.yml` lines 87-88 (existing — already proven).

```yaml
- uses: docker/setup-buildx-action@v3

- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Apply to:**
- `backend-ci.yml` `docker-build` job (EXTEND — add `scope=${{ matrix.service }}` per-service to avoid cross-service cache eviction)
- `backend-cd.yml` `publish` job (NEW — same cache scope)

**Rationale per RESEARCH §Don't Hand-Roll table (line 419):** BuildKit GHA cache backend handles intermediate layer cache automatically — no custom `docker tag` + push intermediate stages.

---

### Pattern B — Job permissions matrix (cosign keyless + GHCR push + SLSA)

**Source:** RESEARCH §Code Examples §B lines 719-723 + Pitfall 3 lines 446-450.

```yaml
permissions:
  contents: read
  packages: write       # GHCR push
  id-token: write       # cosign keyless OIDC token fetch from Fulcio
  attestations: write   # actions/attest-build-provenance push к Rekor
```

**Apply to:**
- `backend-cd.yml` `publish` job (CRITICAL — без `id-token: write` cosign signing silently fails per Pitfall 3)
- Any future job that invokes `cosign sign` или `actions/attest-*`

**Apply to (read-only variant):**
- `backend-ci.yml` top-level — `contents: read` + `security-events: write` (SARIF upload only; no push, no signing)

---

### Pattern C — Matrix entry per Go service

**Source:** `.github/workflows/backend-ci.yml` lines 64-67 (existing `docker` job — 2 services) → extend к 8.

**Existing partial:**

```yaml
strategy:
  fail-fast: false
  matrix:
    service: [identity, activity-sync]
```

**Extended shape (apply identically в test, lint-deferrable, docker-build, publish jobs):**

```yaml
strategy:
  fail-fast: false
  matrix:
    service: [identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]
    # `pkg` added to test job only (no Dockerfile to build);
    # `scripts/openapi-routes-check` reuses existing `make check-routes` invocation если planner wires it.
```

**Apply to:**
- `backend-ci.yml` `test` job (D-08 — currently 3 services hardcoded)
- `backend-ci.yml` `docker-build` job (D-08 — currently 2 services hardcoded)
- `backend-cd.yml` `publish` job (NEW — all 8 services)

**Source list of 8 services verified:** `services/backend/` directory (Bash inventory) — identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph. `pkg` is shared module (testable но not buildable as service); `gateway` is Caddy (no Go build); `scripts/openapi-routes-check` is test scaffolding (reuse `make check-routes`).

---

### Pattern D — Scanner SARIF upload composition

**Source:** RESEARCH §Code Examples §A lines 599-602 + 626-631 + 682-686.

```yaml
- name: Run gosec
  run: |
    go install github.com/securego/gosec/v2/cmd/gosec@latest
    gosec -fmt sarif -out gosec.sarif -severity high ./... || true   # `|| true` — fail downstream, not in scanner
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: services/backend/gosec.sarif
    category: gosec   # unique category per scanner — keeps GH Security tab tidy
```

**Apply to:**
- `gosec` job
- `semgrep` job (same shape — `category: semgrep`)
- `trivy` step inside `docker-build` matrix (`category: trivy-${{ matrix.service }}` per RESEARCH line 686)

**Pitfall guard per RESEARCH Pitfall 8 (line 502):** SARIF upload rate-limited к 20/hour per repo. With matrix 8 × scanners, может blow limit if all upload independently. Solution per RESEARCH: aggregate trivy results across matrix entries into single SARIF before upload (Trivy `--merge-on-error`), or accept per-matrix upload and tolerate occasional throttling.

**`if: always()` qualifier on SARIF upload** (RESEARCH line 683) — ensures findings are reported к Security tab even if the scanner exit-code blocked the job (per D-10 — HIGH+CRITICAL blocks merge, but planner still wants visibility into low-sev findings).

---

### Pattern E — RUNBOOK extension structure

**Source:** `docs/RUNBOOKS/deploy.md` (existing 264 lines, 9 sections — same conventions для new §6.4 / §7 / §10).

**Conventions to preserve:**
- Heading depth: `##` for top-level (1-9), `###` for sub-sections (e.g., `6.1`, `6.2`)
- Russian narrative + English code commands (CLAUDE.md mandate; existing pattern)
- Bash-block с `# comment` annotation (e.g., line 167 `# 5.1. Commit + push code changes`)
- Warning callouts via `> ...` blockquote (line 192 `> v1.0 не имеет CI-driven rollback drill ...`)
- Failure-mode table (§7 lines 222-232 — `| Симптом | Вероятная причина | Fix |`)
- Measured-timing table (§9 lines 251-256) — drill results table can mirror this shape

**Apply to:**
- `§6.4 Rollback automation reference` (extend §6 — add subsection after existing 6.1/6.2/6.3)
- `§7 Failure modes` already exists at line 221; the NEW deployment-freeze sub-procedure adds `### 7.X Deployment freeze (incident response)` subsection — OR planner may insert as new top-level `§7.5` / `§10` if §7 is reserved for troubleshooting (RESEARCH §Architecture Pattern 6 leaves choice open)
- `§10 Branch protection setup` (NEW top-level section after existing §9 Measured timing)

---

## No Analog Found

Files where the closest match is RESEARCH §Code Examples rather than codebase:

| File | Role | Why no codebase analog |
|------|------|------------------------|
| `.golangci.yml` | linter config | Repo has zero prior `.golangci.yml`; existing CI uses `go vet` only (`backend-ci.yml` line 40-44). Greenfield via RESEARCH §Code Examples §D. |
| `.trivyignore.yaml` | CVE-ignore manifest | Repo has zero prior container scanning. Greenfield via RESEARCH §Code Examples §I. |
| `backend-cd.yml` | signing+attestation workflow | No CD workflow exists; backend-ci's docker job only verifies builds, never pushes. Body via RESEARCH §Code Examples §B. |
| `secret-scan-full.yml` (OPTIONAL) | cron secret scan | No prior cron workflow. Pattern via RESEARCH §Code Examples §H. |

---

## Anti-Patterns (Cross-Cutting Hard Rules)

Per RESEARCH §Anti-Patterns + ROADMAP §Hard Rules:

| Anti-Pattern | Enforcement |
|---|---|
| `:latest` image tag anywhere | Negative-grep CI job (`no-latest-tag-guard` per RESEARCH §Code Examples §A lines 688-700) + `flavor: latest=false` в `docker/metadata-action@v5` (RESEARCH Pitfall 6). Applies к workflows + `docker-compose.prod.yml`. |
| Cosign keypair-based signing | RESEARCH recommends keyless для solo-dev v1.0 (D-13). Storing cosign key в GH Secrets defeats keyless purpose per Anti-Pattern (line 401). |
| Enabling branch protection BEFORE first green CI run | Sequence guard: Plan 04-05 (branch protection) `depends_on: [04-02]` (full-green CI iteration). RESEARCH Pitfall 1 + VALIDATION §Sign-Off line 90. |
| Full-history gitleaks/trufflehog on every PR | Split: diff scan on PR (`backend-ci.yml secrets-scan-diff` job, fast) + nightly cron full-scan (`secret-scan-full.yml` per RESEARCH §Code Examples §H). RESEARCH Pitfall 4 + Pitfall 10. |
| SOPS-decrypt в CI workflow | D-22 prohibits. Lint guard per RESEARCH Pitfall 7 lines 496-499 (`! grep -rE 'sops -d\|SOPS_AGE_KEY\|\.secrets/' .github/workflows/`). |
| Apt-installing `caddy` on host (Phase 3 carry-forward hard rule) | D-16 of Phase 3 — Caddy stays containerized. Phase 4 doesn't touch Caddy but cross-cutting reminder for any Ansible-related task. |
| `actions/attest-build-provenance@v1` (deprecation-shim) | Use `@v2` (LTS) or `@v4` (latest). RESEARCH §State of the Art line 1167 + Pitfall 2 — critical CONTEXT D-14 correction. |
| `pull_request_target` trigger with untrusted checkout | RESEARCH §Security Domain Threats line 1327 — use `pull_request` (not `_target`); never checkout untrusted code в privileged context. |
| Unpinned action versions (`@latest` или `@main`) | RESEARCH §Security Domain Threats line 1328 — pin к tag (`@v8`) min; pin к SHA для critical actions (cosign, attest). |
| `enforce_admins: true` для solo-dev | D-20 — 0 required reviewers; admin self-approves. `enforce_admins: false` documented в branch-protection JSON (RESEARCH §Code Examples §G line 1052). v1.1 (DEV_B onboarded) → flip к true. |

---

## Metadata

**Analog search scope:**
- `.github/workflows/` (2 files — both read in full)
- `services/backend/` (top-level — Makefile, Dockerfile sample, migrations sample, scripts/, docker-compose.prod.yml)
- `docs/RUNBOOKS/` (deploy.md sampled §1, §5, §6, §7, §9; sops-edit.md headings only)
- `.pre-commit-config.yaml` (Phase 2 gitleaks pin reference)

**Files scanned:** 14 (3 workflow files + 1 backend Makefile + 1 Dockerfile + 4 migration samples + 1 compose + 2 RUNBOOKs + 1 smoke-test sample + 1 pre-commit config)

**RESEARCH sections cited:**
- §Standard Stack (verified action versions)
- §Code Examples §A (backend-ci.yml skeleton)
- §Code Examples §B (backend-cd.yml — cosign + SLSA)
- §Code Examples §C (attest-build-provenance minimal)
- §Code Examples §D (`.golangci.yml` v2 conservative)
- §Code Examples §E (digest update workflow — 2 options)
- §Code Examples §F (top-level Makefile rollback target)
- §Code Examples §G (branch protection gh api script)
- §Code Examples §H (nightly cron full secret scan)
- §Code Examples §I (`.trivyignore.yaml` template)
- §Code Examples §J (cosign verify command)
- §Architecture Pattern 6 (deployment freeze procedure → §7 RUNBOOK extension)
- §State of the Art (v1→v2/v4 critical correction)
- §Common Pitfalls 1-10 (sequence guards + permissions + cron TZ + fetch-depth)

**Pattern extraction date:** 2026-05-17

---

## PATTERN MAPPING COMPLETE
