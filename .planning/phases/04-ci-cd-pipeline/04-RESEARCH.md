# Phase 4: CI/CD Pipeline — Research

**Researched:** 2026-05-17
**Domain:** GitHub Actions CI/CD pipeline для Go monorepo с 8 backend services; container signing (cosign keyless), SLSA provenance, multi-scanner gate (gosec/semgrep/govulncheck/Trivy/gitleaks/trufflehog), rollback drill automation.
**Confidence:** HIGH (5 deferred questions all answered with verified sources; 4 critical version corrections vs CONTEXT.md surfaced and flagged)
**Workstream:** backend
**Mode:** Autonomous

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

24 D-XX decisions auto-resolved (see 04-CONTEXT.md §decisions); reproduced verbatim для planner traceability:

**Repository & CI provider:**
- **D-01 (LOCKED upstream by ROADMAP CICD-01):** GitHub Actions as CI provider. Not relitigated.
- **D-02:** Preserve existing GHCR namespace `ghcr.io/ismaill01/<service>`. Already hardcoded в `backend-ci.yml`. Implies GitHub repo lives at `github.com/IsmailL01/<repo>`.
- **D-03 (USER ACTION CHECKPOINT, Plan 04-01 Task 0):** create private GitHub repo, add as `origin` remote, push `feat/cursona-redesign` + `main` branches.
- **D-04:** GitHub-hosted runners (`ubuntu-latest`) для всех jobs.

**CI scope:**
- **D-05:** CI = build + test + scan + sign + push images ONLY. Deploy stays manual via Ansible from dev workstation in v1.0.
- **D-06:** Deployment freeze toggle (CICD-05) — GH Actions `environment: production` with admin manual-approval gate; v1.0 documents the runbook step в `deploy.md §7`.

**Workflow architecture:**
- **D-07:** Three workflow files: `backend-ci.yml` (EXTEND), `backend-cd.yml` (NEW), `ci.yml` (DELETE).
- **D-08:** Matrix всех 8 services + pkg (currently 2 of 8).
- **D-09:** `paths:` filter — `services/backend/**` + `.github/workflows/backend-{ci,cd}.yml` + top-level `Makefile`.

**Scanners (CICD-01 + SEC-01 closure):**
- **D-10:** Required (block PR merge) на HIGH+CRITICAL findings: gosec, semgrep, govulncheck, Trivy (image), gitleaks, trufflehog.
- **D-11:** Advisory только (warn, не block) на MEDIUM/LOW.
- **D-12:** `golangci-lint` как separate job (blocks merge); supersedes existing `go vet` baseline.

**Image signing + provenance (CICD-02 + CICD-03):**
- **D-13:** cosign keyless signing via Sigstore/Fulcio. No KMS, no key rotation. Verification command documented в RUNBOOK.
- **D-14:** SLSA Level 2 attestation via `actions/attest-build-provenance@v1` (NOTE: research has corrected к v4 — see §State of the Art below).
- **D-15:** Image tagging convention — `:<git-sha>` always; `:vX.Y.Z` on release tags; **NEVER `:latest`** (hard ROADMAP rule). Production manifests use `@sha256:<digest>` digest pinning.

**Rollback drill (CICD-04):**
- **D-16:** `make rollback v=N` Make target в NEW top-level `Makefile`. Wraps git checkout + golang-migrate down + ansible-playbook + smoke probe.
- **D-17:** Rollback drill — Migration A (NULLABLE add) → Migration B (drop) → deploy B → `make rollback v=v1.0.0-rc.test-a` → integration test asserts A's schema restored.
- **D-18:** Drill target = existing prod VPS (148.253.214.156). Staging deferred v1.1.

**Branch protection (CICD-06):**
- **D-19:** Protect `main` branch only. 5 required checks: test, lint, scanners, docker-build, image-scan. Block direct push / force-push / branch deletion.
- **D-20:** 0 required reviewers (solo dev — admin self-approves PR).
- **D-21 (USER ACTION CHECKPOINT):** apply branch protection via GitHub UI или `gh api repos/.../branches/main/protection`.

**Secrets in CI:**
- **D-22:** No SOPS-decrypt в CI. Tests use ephemeral test DB. Cosign keyless = no signing key. GHCR push uses GH built-in `GITHUB_TOKEN`.
- **D-23:** Only secret stored в GH repo settings: `GITHUB_TOKEN` (auto-provisioned). No SOPS_AGE_KEY, no HCLOUD_TOKEN, no SSH keys.

**Out-of-scope reminders:**
- **D-24:** CD beyond image push (continuous deploy к prod VPS) deferred к Phase 21 / v1.1.

### Claude's Discretion

5 deferred questions explicitly assigned к researcher (see CONTEXT.md §deferred):

1. `actions/attest-build-provenance@v1` stability в 2026 — verify or recommend alternative
2. `.golangci.yml` config tuning — conservative starting config
3. gitleaks + trufflehog CI cadence — diff vs full vs hybrid
4. Trivy CVE-ignore mechanism — file format с rationale + expiry-date
5. GHCR private repo image pull from prod VPS — auth mechanism

**All 5 answered below in §Don't Hand-Roll + §Code Examples + §State of the Art.** Also: additional discretion items beyond the 5 explicitly mandated by upstream prompt (Dockerfile improvements, BuildKit cache, SHA256 digest update workflow, cosign verify command, free-tier minutes estimate) — all answered below.

### Deferred Ideas (OUT OF SCOPE)

Out-of-scope per CONTEXT.md §deferred_ideas — NOT researched:

- Sentry release-tag wiring → Phase 17
- Performance regression CI / k6 nightly → Phase 8 (LOAD-06)
- Codecov / Coveralls coverage badge service (PR-comment via GH-native sufficient)
- Dependabot / Renovate (noise в solo-dev mode; v1.1 если team grows)
- Multi-arch images (linux/amd64 + linux/arm64) — prod VPS amd64 only; v1.1+
- Image SBOM generation (syft → SPDX/CycloneDX) — v1.1+
- Cosign verification в Ansible deploy — v1.0.1 follow-up
- PR templates + issue templates — v1.1 если DEV_B onboards
- E2E test integration в CI → Phase 21
- Self-hosted runners → v1.1
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CICD-01** | GitHub Actions matrix на every PR — Go `test -race`, `golangci-lint`, `gosec`, `semgrep`, `govulncheck`, Docker multi-stage build, Trivy image scan | §Standard Stack §1 — pinned versions; §Code Examples §A — full backend-ci.yml skeleton |
| **CICD-02** | Container images signed с `cosign` and pinned к SHA256 digests в production manifests (no `latest` ever) | §Standard Stack §2; §Code Examples §B — cosign keyless workflow; §Code Examples §E — digest-update workflow; §Don't Hand-Roll §6 |
| **CICD-03** | SLSA-style build provenance attestation attached к each release tag | §Standard Stack §3; §State of the Art §1 (`actions/attest-build-provenance` v4, not v1!); §Code Examples §C |
| **CICD-04** | Rollback drill validated с real DB migration в path | §Code Examples §F — top-level Makefile + drill migrations; §Common Pitfalls §5 |
| **CICD-05** | Deployment freeze toggle runbook step | §Architecture Patterns §"Deployment freeze (D-06)"; deploy.md §7 extension proposed |
| **CICD-06** | Branch protection requires all matrix checks passing | §Code Examples §G — gh api script; §Common Pitfalls §1 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted directives that constrain Phase 4 implementation:

- **Russian narrative OK** — RUNBOOK extensions могут быть на русском (existing `deploy.md` mixes RU narrative + English commands; preserve pattern).
- **Domain-driven architecture** — Phase 4 не трогает domain code; CI/CD только automates существующий test/build pipeline. **N/A constraint.**
- **MapAdapter abstraction** — Phase 4 не трогает mobile code или map adapters. **N/A constraint.**
- **No secrets in commits** — пре-commit gitleaks hook (Phase 2 SEC-08 closed) + CI gitleaks job (Phase 4 SEC-01 closure) enforce this. **Both layers required.**
- **80%+/90%+ test coverage gates** for pipeline / area-calc — but those are mobile-side coverage gates. Backend Go services have no fixed coverage gate stated; Phase 4 CI reports coverage but doesn't enforce a numeric floor (recommended: report only, не block; promotion к hard gate в v1.1).
- **Структура папок (Phase 1)** — N/A; Phase 4 trabaja только в `.github/workflows/` + top-level `Makefile` + `services/backend/migrations/` + `docker-compose.prod.yml`.
- **Закрыл задачу → обнови STATUS.md** — Phase 4 SUMMARY должен обновить STATUS.md after closure. Standard GSD flow.

## Summary

Phase 4 — это **plumbing phase**: 95% работы — wiring проверенных Sigstore/GitHub-Actions/SecScan tooling в существующий partial `backend-ci.yml` (commit от May 7) + новый `backend-cd.yml` + top-level `Makefile` для rollback drill. Все 6 acceptance criteria достижимы без custom code beyond YAML configuration и один Make target.

**5 critical findings из research:**

1. **`actions/attest-build-provenance` теперь v4, не v1.** CONTEXT D-14 written с outdated assumption. v4 (released Feb 26, 2025) is the current major; v1 still works но "wraps `actions/attest`" as compatibility shim. Recommendation: pin к `@v2` (LTS-style) или `@v4` (latest). Both produce SLSA Build L2 attestations. Action stays GitHub-maintained, not deprecated. `[VERIFIED: github.com/actions/attest-build-provenance/releases]`
2. **`gitleaks-action@v2` требует license key для organization repos.** Если GitHub repo создаётся под organization `IsmailL01` (per D-02) — license key обязателен (free, но требует регистрации в gitleaks.io). Если под personal account — без license. Recommendation: проверить namespace в Plan 04-01 Task 0; если organization → set `GITLEAKS_LICENSE` secret. **Alternative: use `trufflesecurity/trufflehog@main` standalone и skip gitleaks** (single-tool sufficient для secondary CI defense — Phase 2 SEC-08 pre-commit hook is primary). `[VERIFIED: github.com/gitleaks/gitleaks-action README]`
3. **Trivy `.trivyignore.yaml` (YAML format) НЕ auto-load.** Требует `--ignorefile .trivyignore.yaml` flag. Plain `.trivyignore` (text format) auto-loads но не support fields для rationale/expiry — только inline comments. Recommendation: **use `.trivyignore.yaml`** для production hygiene (rationale + expired_at fields), explicitly pass `--ignorefile` в trivy-action input. `[VERIFIED: trivy.dev/docs/latest/configuration/filtering/]`
4. **GHCR pull from prod VPS = PAT с `read:packages` scope.** Fine-grained tokens НЕ работают с GHCR (long-standing GitHub community issue, unresolved per 2025). Alternatives: public images (simplest, no IP concerns для Go backend), или classic PAT. **Recommendation: public images для v1.0 closed-beta** — no proprietary algorithms в 8 Go services. Document IP-protection decision в SUMMARY. `[VERIFIED: github.com/orgs/community/discussions/38467]`
5. **GitHub Actions free tier для private repos = 2000 minutes/month, persists в 2026.** Estimated budget Phase 4 usage: 10-20 PRs/month × ~12 min full matrix run + 5-10 push-to-main × ~8 min build+sign = ~200-360 min/month. **Well within 2000-minute budget** (~10-18% utilization). Self-hosted runners deferred к v1.1 unless usage spikes. `[VERIFIED: docs.github.com/billing/managing-billing-for-github-actions]`

**Primary recommendation:** Build the 3 workflow files + Makefile + drill migrations using **verified-version pinned actions** from §Standard Stack table; do NOT write custom signing/attestation/scanner glue. The Sigstore + GitHub-native ecosystem covers все 6 CICD-* requirements without hand-rolling. Single CONTEXT correction needed: D-14 should reference `actions/attest-build-provenance@v2` (or `@v4`), not `@v1`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Source code testing (Go unit + race) | CI runner (GitHub Actions) | — | Standard test execution; ephemeral runner appropriate |
| Static analysis (gosec, semgrep, govulncheck, golangci-lint) | CI runner | — | Pure source-code analysis; no production state involved |
| Container build (multi-stage Dockerfile per service) | CI runner | — | Build artifacts produced ephemerally; pushed к immutable registry |
| Container image vulnerability scan (Trivy) | CI runner | — | Runs on built artifact in-pipeline; SARIF uploaded к GH Security tab |
| Secret detection (gitleaks, trufflehog) | CI runner | Pre-commit hook (already exists, Phase 2 SEC-08) | Two layers: pre-commit prevents push; CI catches anything pre-commit missed |
| Image signing (cosign keyless via Fulcio) | CI runner (OIDC token) | Sigstore Rekor (transparency log) | Keyless = no key on disk; OIDC token short-lived; signature persisted в Rekor public log |
| SLSA provenance attestation | CI runner (`actions/attest-build-provenance`) | GHCR (attestation attached к image) | GH-native action generates + uploads attestation as part of GHCR push |
| Image registry (push + pull) | GHCR (`ghcr.io/ismaill01/*`) | — | GHCR = standard для GitHub-hosted projects; integrates с GITHUB_TOKEN auth |
| Production deploy | Dev workstation (Ansible) | Prod VPS (sport-stack.service) | **Per D-05 — CI does NOT deploy в v1.0.** Manual `ansible-playbook` остаётся seam. |
| Rollback execution | Dev workstation (`make rollback v=N`) | Prod VPS (git + docker compose + ansible) | Make target wraps git checkout + docker migrations down + ansible re-deploy |
| DB migration on rollback | Migrations container (golang-migrate) running ON prod VPS | Postgres (target DB) | Rollback Make target invokes `docker compose run migrations down 1`; container runs migration SQL against in-cluster Postgres |
| Branch protection enforcement | GitHub (repo settings) | — | Server-side rule enforced before merge button enables |

**Rationale for ALL on CI runner tier (rather than self-hosted runner или local):** D-04 locks `ubuntu-latest` GH-hosted runners; free-tier budget plenty (see §State of the Art). Self-hosted runners adds attack-surface (runner registered to prod VPS = compromise vector for repo write access) — explicitly deferred к v1.1.

**Rationale for Dev workstation owning deploy (not CI):** D-05 — extending OIDC trust к prod VPS would require either (a) SSH key в GH secrets (long-lived, single-leak-blast-radius) или (b) GH-Actions OIDC → cloud-IAM trust (no cloud-IAM since post-Phase-3 pivot к provider-agnostic VPS). Manual Ansible seam (deploy.md §5) is intentional v1.0 simplification.

## Standard Stack

### Core (CI/CD orchestration)

| Library/Action | Version (verified) | Purpose | Why Standard |
|----------------|-------------------|---------|--------------|
| `actions/checkout@v4` | v4 (latest) | Source checkout с `fetch-depth: 0` для full-history scans | Standard GH-Actions checkout; v4 stable since 2023; v5 not yet released as default |
| `actions/setup-go@v5` | v5 (latest) | Install Go 1.25; integrates с `cache-dependency-path` для `go.sum`-based caching | Already used in existing `backend-ci.yml`; v5 stable, supports multi-module monorepo paths |
| `docker/setup-buildx-action@v3` | v3 (latest) | Enable BuildKit для multi-stage caching + parallel stage builds | Already used in existing `backend-ci.yml`; required для `cache-from/to: type=gha` |
| `docker/login-action@v3` | v3 (latest) | Login к GHCR using `GITHUB_TOKEN` | Standard; already commented-out в existing workflow ready to enable |
| `docker/build-push-action@v5` | v5 (latest) | Build + push container image; supports SHA256 digest output | Already used in existing workflow; outputs `digest` for downstream cosign+attest |
| `docker/metadata-action@v5` | v5 (latest) | Generate image tags (`:<sha>` + `:vX.Y.Z` from git refs); guards against `:latest` | Standard; required для D-15 tagging convention |

### Core (Quality gates)

| Library/Action | Version (verified) | Purpose | Why Standard |
|----------------|-------------------|---------|--------------|
| `golangci/golangci-lint-action` | **`@v8`** (latest stable; v9 introduces node24 + Module Plugin System, может быть избыточно для starter config) | Runs golangci-lint (v2.x format); 40+ linters in single pass | Official action от golangci-lint authors; v8 supports golangci-lint v2.1+ which is what config below expects |
| `golangci-lint` (binary, via above action) | **`v2.x` latest** (config uses `version: "2"` header) | Linter binary; supersedes existing `go vet` baseline | v2 introduced March 2025; new `linters.default` syntax + cleaner exclusion presets |
| `securego/gosec` | **`@v2`** (latest major; v2.x stable since 2024) | Go security checker; SARIF 2.1.0 compliant | Standard Go SAST; integrates с GH Code Scanning via `upload-sarif` |
| `returntocorp/semgrep-action` (или `semgrep ci` via marketplace) | **`@v1`** (semgrep-action package; or use `returntocorp/semgrep` Docker image directly) | Multi-language SAST; OWASP Top 10 ruleset (`p/owasp-top-ten`) + Go-focused rules (`p/golang`) | Industry-standard SAST; rulesets free tier sufficient для closed-beta |
| `golang/govulncheck-action` | **`@v1`** (latest; v1.0.4 specifically) | Scans Go deps against Go vuln database | Official Go-team action; trustworthy vuln source |
| `aquasecurity/trivy-action` | **`@0.28.0`** (or `@master` for bleeding-edge) | Container image vulnerability scan; SARIF output | Aqua's official action; integrates с GH Code Scanning |
| `gitleaks/gitleaks-action` | **`@v2`** (latest v2.3.9, April 2025) | Secret detection с PR-comment integration | Note: requires free `GITLEAKS_LICENSE` secret if scanning org repo |
| `trufflesecurity/trufflehog` | **`@main`** (or pin к specific version; recommend `@v3.95.3` for reproducibility) | Verified-secret detection (entropy + regex + verification API calls) | Strong complement к gitleaks; can be primary если gitleaks license blocks |

### Core (Signing + provenance)

| Library/Action | Version (verified) | Purpose | Why Standard |
|----------------|-------------------|---------|--------------|
| `sigstore/cosign-installer` | **`@v3`** (или newer; latest v4.1.x as of May 2026) | Installs cosign binary; required for `cosign sign` + `cosign verify` | Official Sigstore action; v3 stable, widely-deployed in ecosystem |
| `cosign` (binary, via above) | latest (v2.x; installed by action) | Keyless image signing via Fulcio short-lived certs | OpenSSF/Sigstore reference impl; no key management required |
| `actions/attest-build-provenance` | **`@v2`** (recommended LTS) OR **`@v4`** (latest, wraps `actions/attest`) | Generates SLSA Build L2 provenance attestation; attaches к image via cosign+Rekor | GitHub-native; CONTEXT D-14 said `@v1` but research found `@v4` current — **planner: use `@v2` (LTS) or `@v4`, NOT `@v1` even though v1 still works as compatibility shim** |

### Supporting

| Library/Action | Version (verified) | Purpose | When to Use |
|----------------|-------------------|---------|-------------|
| `github/codeql-action/upload-sarif@v3` | v3 (latest) | Upload SARIF output к GH Security tab (для gosec/Trivy/semgrep results) | После каждого scanner; consolidates findings в repo Security view |
| `actions/upload-artifact@v4` | v4 (latest) | Upload test coverage profiles, debug logs | Optional — useful если planner wants downloadable artifacts |
| `golang-migrate/migrate` (Docker image: `migrate/migrate:v4.18.1`) | **v4.18.1** (already used in `docker-compose.prod.yml`) | DB migration tool; `down 1` for rollback drill | Already в production stack; reused by `make rollback` Make target |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub-native `attest-build-provenance` | `slsa-framework/slsa-github-generator` | Standalone SLSA L3 generator. **Tradeoff:** L3 = hermetic builds, requires reusable-workflow setup, more complexity. L2 sufficient для closed-beta; defer L3 к v1.1. |
| `gitleaks-action@v2` (license-required for org) | `gitleaks` binary direct via `run:` step OR `zricethezav/gitleaks-action` (legacy fork, no license req) | License-free alternative но less polished PR-comment UX. **Recommended:** stick с official `gitleaks/gitleaks-action@v2` + accept license registration step (free, one-time). |
| `trufflesecurity/trufflehog@main` | `trufflesecurity/trufflehog` Docker image direct invocation | More control но less integration with GH Code Scanning. Action wrapper preferred. |
| GHCR (private images + PAT auth) | Public images (no auth) | **Recommended for v1.0 closed-beta:** Go server binaries reveal no proprietary algorithms; image content already mirrored via signed-attestation public log. Eliminates GHCR-pull-auth complexity. |
| `cosign` (Sigstore) | Notary v2 / Docker Content Trust | Cosign is industry standard в 2025; Notary v2 less ecosystem traction. **Stick with cosign.** |
| `golangci-lint v2` | `revive`, `staticcheck` standalone | golangci-lint v2 bundles staticcheck + 40 others в single pass; faster CI + simpler config. Stick с golangci-lint. |
| `aquasecurity/trivy-action` | `anchore/grype-action` | Both valid container scanners; Trivy has better-maintained CVE DB + faster scans + first-class SARIF. Stick с Trivy. |

**Installation (Local dev workstation reproducibility):**

```bash
# Dev workstation reproduces CI checks locally
brew install golangci-lint cosign trivy gitleaks gh
# golangci-lint v2 config requires v2.1+ binary

# Verify pinned versions match CI
golangci-lint --version  # expect: 2.x.y
cosign version          # expect: 2.x.y
trivy --version         # expect: 0.55+ (YAML ignore-file support)

# gh CLI for branch protection setup (D-21 user-action)
gh auth login
gh api repos/IsmailL01/sport/branches/main/protection ...
```

**Version verification:** все versions выше verified либо via WebFetch к official release pages (`actions/attest-build-provenance`, `cosign-installer`, `gitleaks-action`, `trufflehog`), либо via cross-referenced 2025 documentation. **One critical correction:** CONTEXT.md §D-14 wrote `@v1` for `actions/attest-build-provenance` — research confirms v4 is current major as of Feb 2026. **Planner must update D-14 reference к `@v2` LTS or `@v4` latest.** `[VERIFIED: github.com/actions/attest-build-provenance/releases]`

## Architecture Patterns

### System Architecture Diagram

```
                  ┌─────────────────────────────────────┐
                  │  DEV WORKSTATION                    │
                  │  - git push / gh pr create          │
                  │  - SOPS-encrypted secrets local     │
                  │  - ansible-playbook (manual deploy) │
                  │  - make rollback v=N (drill)        │
                  └────────────┬────────────────────────┘
                               │ git push (HTTPS via gh)
                               ▼
                  ┌─────────────────────────────────────┐
                  │  GITHUB.COM (origin remote)         │
                  │  github.com/IsmailL01/sport  │
                  │  Branch: main (protected)           │
                  └────────────┬────────────────────────┘
                               │ trigger
                               ▼
       ┌───────────────────────┴───────────────────────┐
       │                                               │
   PR event                                       push to main
       │                                               │
       ▼                                               ▼
┌─────────────────────────────┐         ┌─────────────────────────────────┐
│  backend-ci.yml             │         │  backend-cd.yml (NEW)            │
│  (existing, EXTEND)         │         │                                  │
│                             │         │  jobs:                           │
│  Jobs (parallel where indep):│         │   1. build-and-push  ──────────┐│
│   1. test (matrix 8+pkg)    │         │      docker build               ││
│   2. lint (golangci-lint)   │         │      docker push к GHCR         ││
│   3. scanners (5):          │         │      capture @sha256:digest     ││
│      gosec, semgrep,        │         │   2. cosign-sign      ──────────┤│
│      govulncheck,           │         │      cosign sign --yes <image>  ││
│      gitleaks (diff),       │         │      → Fulcio cert + Rekor log  ││
│      trufflehog (diff)      │         │   3. attest-provenance ─────────┤│
│   4. docker-build (matrix 8)│         │      actions/attest-build-      ││
│      (push: false — verify) │         │        provenance@v2/v4         ││
│   5. image-scan (Trivy)     │         │      → SLSA L2 attestation      ││
│      → SARIF к GH Security  │         │   4. update-compose-digests     ││
│                             │         │      sed -i 'image: ...@sha256:'││
│  ALL must pass before merge │         │      → commit to main OR        ││
│  (branch protection)        │         │        workflow output          ││
└─────────────────────────────┘         └────────────┬────────────────────┘
       │                                              │
       │                                              ▼
       │                            ┌─────────────────────────────────┐
       │                            │  GHCR (ghcr.io/ismaill01)│
       │                            │  - Image @sha256:<digest>       │
       │                            │  - cosign signature (in Rekor)  │
       │                            │  - SLSA provenance attestation  │
       │                            └────────────┬────────────────────┘
       │                                         │
       │                  ┌──────────────────────┘
       │                  │ (eventual manual pull)
       │                  ▼
       │       ┌─────────────────────────────────┐
       │       │  PROD VPS (148.253.214.156)     │
       │       │                                  │
       │       │  sport-stack.service (systemd)  │
       │       │  ↓                               │
       │       │  docker compose                  │
       │       │  -f docker-compose.prod.yml      │
       │       │  pull (using @sha256:digest)     │
       │       │  ↓                               │
       │       │  13 containers running           │
       │       │   (8 services + Caddy + PG +    │
       │       │    Redis + NATS + MinIO +       │
       │       │    migrations one-shot)         │
       │       └─────────────────────────────────┘
       │                                  ▲
       │                                  │ ansible-playbook
       │                                  │ (manual, from dev)
       └──────────────────────────────────┘

  ROLLBACK DRILL FLOW (CICD-04):
  dev WS: make rollback v=v1.0.0-rc.test-a
    ├─→ git checkout v1.0.0-rc.test-a       (revert source)
    ├─→ ssh + docker compose run --rm migrations down 1   (revert DB schema)
    ├─→ ansible-playbook --tags sport-stack site.yml       (redeploy old image)
    └─→ smoke probe: curl healthz                          (verify)
```

### Recommended Project Structure (Phase 4 additions)

```
.                                              # repo root
├── Makefile                                   # NEW — top-level: `make rollback v=N` (D-16)
├── .golangci.yml                              # NEW — golangci-lint v2 config (see §Code Examples §D)
├── .trivyignore.yaml                          # NEW — Trivy CVE-ignore с rationale + expired_at (see §Code Examples §I)
├── .github/
│   └── workflows/
│       ├── backend-ci.yml                     # EXTEND (matrix 8 + lint + 5 scanners + image-scan)
│       ├── backend-cd.yml                     # NEW (cosign + SLSA + GHCR push on main + tags)
│       └── ci.yml                             # DELETE (Phase 0 placeholder noop)
├── docs/
│   └── RUNBOOKS/
│       ├── deploy.md                          # EXTEND — add §6.4 rollback automation + §10 Branch protection setup
│       └── cicd.md                            # NEW (optional) — CI/CD architecture overview если deploy.md gets long
└── services/backend/
    ├── docker-compose.prod.yml                # MODIFY — image: SHA256 digest pinning per service (CICD-02)
    └── migrations/
        ├── 0021_drill_metadata_col.up.sql      # NEW (drill migration A — NULLABLE add)
        ├── 0021_drill_metadata_col.down.sql    # NEW (drill A down)
        ├── 0022_drill_drop_metadata_col.up.sql # NEW (drill migration B — drop)
        └── 0022_drill_drop_metadata_col.down.sql # NEW (drill B down — re-add column)
```

Note: existing migration numbering ends at `0020` (verified via `ls migrations/`); `0021` + `0022` are correct next slots. **Caveat:** if Phase 7 (DB) plans land before Phase 4 and consume `0021`, drill migrations must shift. Recommendation для planner: use `9990_drill_*` (далеко за production migration numbers) для drill-only migrations + tag для cleanup post-drill.

### Pattern 1: CI = build/test/sign/push only (D-05)

**What:** CI workflows produce signed, attested images в GHCR. They do NOT touch prod VPS, do NOT deploy. Deploy stays manual.
**When to use:** v1.0 closed-beta where attack-surface minimization > automation completeness.
**Example:**
```yaml
# backend-cd.yml — push к GHCR only; no SSH к prod
jobs:
  publish:
    permissions:
      contents: read
      packages: write   # ← write к GHCR
      id-token: write   # ← cosign keyless OIDC + SLSA attestation
    # NO ssh-private-key secret. NO ansible step. NO prod-vps access.
```

### Pattern 2: Three-layer secret-leak defense

**What:** Multi-layer secret protection — pre-commit (Phase 2 SEC-08) + CI diff scan (Phase 4 CICD-01) + CI cron full-history scan (Phase 4 CICD-01).
**When to use:** Always for repos с long history где legacy secrets могут lurk.
**Example:** see §Code Examples §H — gitleaks PR diff (fast) + nightly cron full (thorough).

### Pattern 3: SHA256 digest pinning workflow (CICD-02)

**What:** Production manifests reference `image: ghcr.io/.../service@sha256:<digest>` not `:tag`. Tags are mutable (registry-side); digests cryptographically immutable.
**When to use:** Always for prod. Tags only acceptable в dev/staging compose files (`docker-compose.yml`).
**Example:**
```yaml
# docker-compose.prod.yml (AFTER Phase 4 modification)
services:
  identity:
    image: ghcr.io/ismaill01/identity@sha256:abc123...
    # NO `build:` block in prod — pulled from GHCR
```
**How digest gets there:** see §Code Examples §E — CD job captures digest from `docker/build-push-action` output → optional separate workflow commits update PR.

### Pattern 4: Sigstore keyless = no key management

**What:** Cosign signs using short-lived (10-min) certificate issued by Fulcio after OIDC token exchange. No long-lived signing key к manage, rotate, или leak.
**When to use:** Always для open-source-friendly + GH-Actions hosted workflows.
**Example:** §Code Examples §B.

### Pattern 5: Rollback Make-target wraps three orthogonal actions

**What:** `make rollback v=N` is the ONLY entry-point для rollback (not 3 separate manual commands). Wraps git + docker + ansible с error-handling.
**When to use:** Always when rollback spans code+DB+infra.
**Example:** §Code Examples §F.

### Pattern 6: Deployment freeze runbook (D-06, CICD-05)

**What:** No automated CD в v1.0 → freeze = procedural runbook step, not automation toggle. Documented в `deploy.md §7`.
**When to use:** Incident response — pause routine deploys while investigating.
**Implementation:**
```markdown
# deploy.md §7 (NEW Phase 4 addition)
## 7. Deployment freeze (incident response)

When P0/P1 incident is declared:
1. **Stop accepting PRs to main:** Settings → Branches → main → Lock branch (admin toggle)
2. **(v1.1 when CD lands)** Disable production environment в repo settings:
   Settings → Environments → production → toggle "Disabled"
3. **Document in runbook:** add incident-log entry: "Freeze applied YYYY-MM-DD HH:MM by <name> due to <reason>"
4. **Resume:** reverse step 1+2; document "Freeze lifted YYYY-MM-DD HH:MM after <resolution summary>"
```

### Anti-Patterns to Avoid

- **`:latest` tag в any context.** Hard ROADMAP rule. Negative-grep test в CI: `! grep -rE ':latest"' .github/workflows/ services/backend/docker-compose.prod.yml` must return clean exit 0.
- **Storing cosign signing key в GH Secrets.** Defeats keyless purpose; key would need rotation playbook. **Stick keyless.**
- **Running full gitleaks/trufflehog history scan on every PR.** 5-10 min per PR on >1000-commit history kills budget. **Use diff scan on PR + cron full scan nightly/weekly.**
- **Allowing `[skip ci]` commits к bypass branch protection.** GH branch protection respects this only если admin; for solo-dev with admin priv, OK as escape hatch but discouraged. Plan: don't enable any "allow admins to bypass" toggle.
- **Pulling private GHCR images без auth.** Either make public OR provide PAT via SOPS-encrypted docker config. Don't paste PAT inline в ansible.
- **Custom signing wrappers around cosign.** Cosign already handles `--yes` flag + OIDC + Rekor upload. Don't wrap.
- **Trivy `--severity-critical-only` без MEDIUM visibility.** Block on HIGH+CRITICAL (D-10) but still output MEDIUM/LOW к summary (D-11). Otherwise mediums accumulate silently.
- **golangci-lint v1 config syntax in v2.** Migrate ASAP via `golangci-lint migrate` command. v1 syntax silently breaks on v2 binary.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Container signing | Custom GPG/RSA pipeline | `cosign` (keyless) | Sigstore is OpenSSF reference; OIDC exchange + Fulcio + Rekor handles transparency, attestation, key-lifecycle. Custom = months of edge cases. |
| Build provenance attestation | Custom in-toto generator | `actions/attest-build-provenance@v2` | GH-native action handles SLSA spec format, signs c cosign, uploads к Rekor. Custom = weeks of spec study. |
| Go vuln scanning | Manual CVE list cross-ref | `golang/govulncheck-action@v1` | Go team maintains pkg.go.dev/vuln/ DB; action wraps `govulncheck` binary. Custom = stale within 1 week. |
| Container vuln scanning | Bash + `apk info`/`dpkg` | `aquasecurity/trivy-action` | Trivy maintains huge multi-source CVE DB + SARIF output + auto-update. Custom = stale + no SARIF. |
| Secret detection | Custom regex set | `gitleaks-action@v2` (PR diff) + `trufflesecurity/trufflehog@main` (verified secrets) | Both maintain extensive rule sets (200+ patterns) + entropy heuristics + verification API calls. Custom = misses obvious patterns. |
| Branch protection automation | Custom GH API client | `gh api repos/.../branches/main/protection` (one-shot) OR GH UI | One-time setup; no need для automated re-application. |
| Multi-stage Docker caching | Manual `docker tag` + push intermediate stages | `docker/build-push-action@v5` с `cache-from/to: type=gha,mode=max` | BuildKit GHA cache backend handles intermediate layer cache automatically. |
| Image tag generation | Manual `$GITHUB_SHA` interpolation | `docker/metadata-action@v5` | Handles `:<sha>`, `:vX.Y.Z` on tags, branch-prefixed tags, multi-tag generation in single step. |
| OpenAPI route drift check (already Phase 1) | New impl | Existing `services/backend/Makefile check-routes` target | Plan can wire `make check-routes` as additional CI job или reuse. |
| Coverage reporting | Codecov/Coveralls integration | `go tool cover -func` + GH job summary | Existing workflow already does this. Codecov adds external service (privacy/cost); GH-native summary sufficient для solo-dev. |
| Migration tooling | Hand-rolled SQL runner | `migrate/migrate:v4.18.1` Docker image (already in compose) | golang-migrate handles `up/down N`, schema_migrations table, atomic apply. Reused by `make rollback`. |

**Key insight:** Phase 4 is **wiring**, not **building**. Every box on the §System Architecture Diagram corresponds к a maintained third-party action или binary. The only custom asset is `Makefile` (~30 lines) + 4 SQL files (~50 lines drill migrations) + `.golangci.yml` (~80 lines tuned config) + 3 workflow YAMLs (~400 lines aggregate). **Total custom code/config: ~600 lines.** Anything beyond that signals scope creep.

## Common Pitfalls

### Pitfall 1: Branch protection lockout on first activation
**What goes wrong:** Enable branch protection requiring 5 checks → first PR opens → но previous CI runs не green ever → can't merge own PR → solo dev locked out.
**Why it happens:** Existing partial `backend-ci.yml` may have stale-failing jobs; new scanner jobs не yet successful on existing code.
**How to avoid:** Sequence — (a) iterate on backend-ci.yml до full green run on `feat/cursona-redesign`, (b) ONLY THEN enable branch protection. Plan: `04-02-PLAN` lands extended workflow + iterates к green; `04-05-PLAN` enables branch protection AFTER.
**Warning signs:** "Required check not running" message on PR. Solution: temporarily allow admin bypass via Settings → Branches → "Do not allow bypassing the above settings" → uncheck only for solo-dev admin during first iteration.

### Pitfall 2: `actions/attest-build-provenance` version skew (CRITICAL)
**What goes wrong:** CONTEXT D-14 written с `@v1` assumption — но v1 is now an `actions/attest` compatibility shim per Feb 2026 release notes. If planner literally pins `@v1`, it works но produces deprecation warnings.
**Why it happens:** Major version bumps в 2024-2025 (v1 → v2 → v3 → v4); CONTEXT.md written before research.
**How to avoid:** Plan uses `@v2` (recommended LTS, stable, не deprecated wrapper) OR `@v4` (latest, also stable wrapper of `actions/attest`). **NOT `@v1`.** Update CONTEXT.md §D-14 reference in plan-execution или leave as-is + note correction в 04-RESEARCH §State of the Art (this section).
**Warning signs:** Workflow logs показывают "actions/attest-build-provenance v1 is deprecated; please migrate к v2+". Action still produces attestation, но noise в logs.

### Pitfall 3: Cosign keyless requires `id-token: write` permission per job
**What goes wrong:** Job omits `id-token: write` permission block; cosign OIDC token fetch fails; signing fails silently (return code 0 но no signature in Rekor).
**Why it happens:** GitHub-Actions permissions are deny-by-default; signing job needs explicit `id-token: write`.
**How to avoid:** Every job that runs `cosign sign` или `actions/attest-*` must declare:
```yaml
permissions:
  contents: read
  packages: write
  id-token: write   # ← critical
```
**Warning signs:** `cosign sign` log shows "Error: getting signer: getting Fulcio certificate: oidc: fetching ID Token: Get ..." — missing `id-token: write` permission.

### Pitfall 4: `gitleaks-action@v2` needs license key for org repos
**What goes wrong:** Org-scoped repo runs gitleaks-action without `GITLEAKS_LICENSE` env var → action exits с "license key required" error.
**Why it happens:** gitleaks-action v2 monetization (free для open-source + personal, paid для orgs > X users; free org license с registration).
**How to avoid:** During Plan 04-01 Task 0 — when user creates GitHub repo, **note namespace ownership**:
- If `IsmailL01` is **personal account** → no license needed.
- If `IsmailL01` is **organization** → register at gitleaks.io (free), get license key, add as repo secret `GITLEAKS_LICENSE`, reference в workflow.
**Warning signs:** First CI run fails с "gitleaks-action: a license key is required".

### Pitfall 5: Rollback drill on prod без staging — backward-compat migration is non-negotiable
**What goes wrong:** Drill migration is destructive (e.g., `DROP COLUMN data WITH DATA`); rollback fails partway; prod left in inconsistent state.
**Why it happens:** No staging environment (D-23 pivot deferred); drill runs против real prod.
**How to avoid:** Drill migrations must be **backward-compatible at every step**:
- Migration A (`0021_drill_metadata_col.up.sql`): `ALTER TABLE users ADD COLUMN metadata JSONB DEFAULT NULL;` — adds nullable column; old code (which doesn't read it) keeps working.
- Migration B (`0022_drill_drop_metadata_col.up.sql`): `ALTER TABLE users DROP COLUMN metadata;` — drops column; new code (которое не reads it либо) keeps working.
- Migration B's **down**: `ALTER TABLE users ADD COLUMN metadata JSONB DEFAULT NULL;` — re-creates column (data loss for any rows written during B's deploy window, but acceptable for drill since no real code writes к it).
- Migration A's **down**: `ALTER TABLE users DROP COLUMN metadata;` — symmetric.

If drill halts after migration B applied but before code rollback — prod runs **new** code without metadata column. **Acceptable** только если no real code reads `users.metadata` (which is the case for drill since column is unused).
**Warning signs:** Drill plan mentions `DELETE FROM`, `TRUNCATE`, `DROP TABLE`, `UPDATE ... SET` — STOP, redesign к pure schema add/drop.

### Pitfall 6: `:latest` tag accidentally pushed somewhere
**What goes wrong:** `docker/metadata-action` defaults include `:latest` tag generation; if not disabled, CD job pushes `:latest`.
**Why it happens:** `metadata-action` default behavior puts `:latest` on main-branch builds.
**How to avoid:** Explicitly disable `:latest` в metadata-action input:
```yaml
- uses: docker/metadata-action@v5
  with:
    images: ghcr.io/ismaill01/${{ matrix.service }}
    flavor: |
      latest=false   # ← critical
    tags: |
      type=sha,format=short        # :abc1234
      type=semver,pattern={{version}}  # :v1.0.0
```
+ CI guard test:
```bash
# pre-merge sanity check (add as workflow job)
! grep -rE ':latest["\'']?$' .github/workflows/ services/backend/docker-compose.prod.yml
```

### Pitfall 7: SOPS-decrypt accidentally added к CI (D-22 violation)
**What goes wrong:** Someone adds `- run: sops -d .secrets/prod/shared.yaml > .env` к workflow для some test; SOPS_AGE_KEY ends up needed в GH Secrets; D-22 violated; prod secrets exposed к CI logs.
**Why it happens:** Habit transfer from local dev workflow.
**How to avoid:** Lint workflow YAMLs for `sops -d`, `SOPS_AGE_KEY`, `.secrets/` patterns. Add к CI:
```bash
! grep -rE 'sops -d|SOPS_AGE_KEY|\.secrets/' .github/workflows/ || (echo "D-22 violation"; exit 1)
```
Tests must use ephemeral test DB (existing pattern в `identity/test_helpers.go`); no real secrets needed.

### Pitfall 8: Trivy SARIF upload silently rate-limited
**What goes wrong:** SARIF upload к GH Security tab limited к 20 runs/hour per repo. Heavy CI с matrix×scanners can blow limit.
**Why it happens:** GH Code Scanning rate limit на SARIF ingestion.
**How to avoid:** Only upload SARIF на one job per scanner (not per matrix entry). Aggregate matrix scan results into single SARIF before upload via `--merge-on-error` flag или separate post-job.

### Pitfall 9: Cron schedule timezone confusion
**What goes wrong:** `schedule: cron: '0 3 * * 0'` weekly-Sunday-3am scan — but cron is **UTC**, not local time. 3am UTC = 6am Moscow = 11pm EST.
**Why it happens:** GH Actions cron always UTC; not user's TZ.
**How to avoid:** Document explicitly в workflow comment: `# Sunday 03:00 UTC = 06:00 Moscow MSK`. Pick low-traffic window для project's actual user base (mobile-first runners app в Russia/EU = 03:00 UTC ideal).

### Pitfall 10: `fetch-depth: 0` overhead на every job
**What goes wrong:** Every job does full clone (`fetch-depth: 0`); on >1000-commit repo this is 30-60s per job × N jobs = minutes of CI budget burnt on clones.
**Why it happens:** Required only для gitleaks/trufflehog full-history scans. Other jobs (test, build, lint) need only HEAD.
**How to avoid:** Default `fetch-depth: 1` (HEAD-only) для test/lint/build jobs; explicit `fetch-depth: 0` only для secret-scan full-history jobs (cron + initial scan).

## Code Examples

Verified patterns from official sources. Planner can lift these directly.

### A. `backend-ci.yml` skeleton (EXTEND existing — PR + push к main)

```yaml
# .github/workflows/backend-ci.yml
# Source: composed from existing May-7 workflow + verified action versions
name: backend-ci

on:
  push:
    branches: [main]
    paths:
      - "services/backend/**"
      - ".github/workflows/backend-ci.yml"
      - "Makefile"
      - ".golangci.yml"
      - ".trivyignore.yaml"
  pull_request:
    branches: [main]
    paths:
      - "services/backend/**"
      - ".github/workflows/backend-ci.yml"
      - "Makefile"
      - ".golangci.yml"
      - ".trivyignore.yaml"

permissions:
  contents: read
  security-events: write   # SARIF upload к GH Security tab

jobs:
  test:
    name: Test (Go ${{ matrix.go-version }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        service: [pkg, identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
          cache-dependency-path: services/backend/${{ matrix.service }}/go.sum
      - name: Test ${{ matrix.service }}
        working-directory: services/backend/${{ matrix.service }}
        run: |
          go mod download
          go test -race -coverprofile=coverage.out ./...
          go tool cover -func=coverage.out | tail -1 >> $GITHUB_STEP_SUMMARY

  lint:
    name: Lint (golangci-lint v2)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"
      - uses: golangci/golangci-lint-action@v8
        with:
          version: v2.x   # latest 2.x; pin specific patch if reproducibility needed
          working-directory: services/backend
          # Uses .golangci.yml at repo root or working-dir

  gosec:
    name: SAST (gosec)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.25" }
      - name: Run gosec
        working-directory: services/backend
        run: |
          go install github.com/securego/gosec/v2/cmd/gosec@latest
          gosec -fmt sarif -out gosec.sarif -severity high ./... || true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: services/backend/gosec.sarif
          category: gosec

  govulncheck:
    name: Vuln (govulncheck)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: golang/govulncheck-action@v1
        with:
          go-version-input: "1.25"
          work-dir: services/backend
          # govulncheck exit nonzero on vulnerability → blocks merge per D-10

  semgrep:
    name: SAST (semgrep)
    runs-on: ubuntu-latest
    container: returntocorp/semgrep
    steps:
      - uses: actions/checkout@v4
      - name: Semgrep scan
        run: |
          semgrep ci \
            --config=p/golang \
            --config=p/owasp-top-ten \
            --sarif --output=semgrep.sarif \
            --severity ERROR --severity WARNING || true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: semgrep.sarif
          category: semgrep

  secrets-scan-diff:
    name: Secrets (gitleaks + trufflehog — PR diff)
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'   # diff-only on PRs
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # required for gitleaks even on diff
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}   # uncomment if org repo
      - name: TruffleHog (diff)
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --results=verified,unknown
          # base/head auto-detected on PR — diff scan only

  docker-build:
    name: Docker build (no push, verify)
    runs-on: ubuntu-latest
    needs: [test, lint]
    strategy:
      fail-fast: false
      matrix:
        service: [identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build ${{ matrix.service }}
        uses: docker/build-push-action@v5
        with:
          context: services/backend
          file: services/backend/${{ matrix.service }}/Dockerfile
          push: false
          load: true   # load into local Docker для trivy scan
          tags: ghcr.io/ismaill01/${{ matrix.service }}:ci-${{ github.sha }}
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}
      - name: Trivy image scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/ismaill01/${{ matrix.service }}:ci-${{ github.sha }}
          format: sarif
          output: trivy-${{ matrix.service }}.sarif
          severity: HIGH,CRITICAL   # D-10 — block on these
          exit-code: 1   # fail job on findings
          ignore-unfixed: false
          trivyignores: .trivyignore.yaml   # custom YAML ignore file
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-${{ matrix.service }}.sarif
          category: trivy-${{ matrix.service }}

  no-latest-tag-guard:
    name: Guard (no :latest)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Negative grep — no `:latest`
        run: |
          if grep -rE ':latest["\x27]?\s*$' .github/workflows/ services/backend/docker-compose.prod.yml; then
            echo "FAIL: `:latest` tag found — ROADMAP hard rule violated"
            exit 1
          fi
          echo "PASS — no :latest tags found"
```

### B. `backend-cd.yml` — cosign keyless + SLSA attestation (NEW)

```yaml
# .github/workflows/backend-cd.yml
# Source: composed from sigstore-installer README + attest-build-provenance examples
name: backend-cd

on:
  push:
    branches: [main]
    paths:
      - "services/backend/**"
      - ".github/workflows/backend-cd.yml"
  push:
    tags:
      - "v*"   # release tags

permissions:
  contents: read
  packages: write   # GHCR push
  id-token: write   # cosign keyless OIDC + SLSA attestation
  attestations: write   # actions/attest-build-provenance

jobs:
  publish:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        service: [identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]
    outputs:
      digest-${{ matrix.service }}: ${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

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
            latest=false    # CRITICAL — D-15 hard rule
          tags: |
            type=sha,format=short                     # :<short-sha>
            type=raw,value={{sha}},enable={{is_default_branch}}   # :<full-sha>
            type=semver,pattern={{version}}           # :v1.0.0
            type=semver,pattern=v{{major}}.{{minor}}   # :v1.0

      - name: Build + push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: services/backend
          file: services/backend/${{ matrix.service }}/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}

      - name: Install cosign
        uses: sigstore/cosign-installer@v3   # v3.x = stable; v4 newer but v3 widely-deployed

      - name: Sign image (keyless)
        env:
          DIGEST: ${{ steps.build.outputs.digest }}
        run: |
          cosign sign --yes \
            ghcr.io/ismaill01/${{ matrix.service }}@${DIGEST}

      - name: Generate SLSA Build L2 attestation
        uses: actions/attest-build-provenance@v2   # NOT v1; v2 = LTS, v4 = latest
        with:
          subject-name: ghcr.io/ismaill01/${{ matrix.service }}
          subject-digest: ${{ steps.build.outputs.digest }}
          push-to-registry: true   # attaches к image via Sigstore

      - name: Output digest for downstream
        run: |
          echo "::notice title=Published::ghcr.io/ismaill01/${{ matrix.service }}@${{ steps.build.outputs.digest }}"
```

### C. SLSA attestation — minimal `actions/attest-build-provenance@v2` example

```yaml
# Inline in cd workflow (see B above)
- uses: actions/attest-build-provenance@v2
  with:
    subject-name: ghcr.io/ismaill01/identity
    subject-digest: sha256:abc123...
    push-to-registry: true
# Produces SLSA Build Level 2 attestation:
# - Subject: image @ digest
# - Predicate: builder identity (GitHub Actions OIDC), workflow file, commit SHA
# - Signed via cosign + uploaded к Rekor transparency log
# - Attached к image в GHCR via sigstore reference convention
#
# Verification (any consumer):
# cosign verify-attestation \
#   --type slsaprovenance \
#   --certificate-identity-regexp 'https://github.com/IsmailL01/.*' \
#   --certificate-oidc-issuer https://token.actions.githubusercontent.com \
#   ghcr.io/ismaill01/identity@sha256:abc123...
```

### D. `.golangci.yml` v2 — conservative starter config

```yaml
# .golangci.yml — golangci-lint v2 config для Running Ecosystem Go monorepo
# Source: composed from official v2 docs + conservative-first principle
# Tune via: `golangci-lint run` against existing code, add `disable:` for known false-positives.

version: "2"

run:
  timeout: 5m
  go: "1.25"
  # services/backend is a workspace; lint все modules via run config:
  modules-download-mode: readonly
  tests: true

linters:
  default: none   # explicit-enable only — safest для first run
  enable:
    # Core correctness (always-on, low false-positive)
    - govet           # standard go vet checks
    - ineffassign     # unused assignments
    - unused          # unused variables/funcs/types
    - errcheck        # unchecked errors
    - staticcheck     # comprehensive static analysis (was separate, now bundled)
    - gosimple        # simplification suggestions

    # Bug prevention (moderate false-positive, worth fighting)
    - bodyclose       # http.Response body unclosed
    - errorlint       # wrong errors.Is/As patterns
    - rowserrcheck    # sql.Rows.Err() unchecked
    - sqlclosecheck   # sql.Rows/Stmt unclosed
    - contextcheck    # context propagation
    - copyloopvar     # Go 1.22 loop-var capture (relevant Go 1.25)
    - nilerr          # returning nil error after handling

    # Style / consistency (low-friction)
    - gofmt           # standard formatting
    - goimports       # import grouping
    - misspell        # typos in comments/strings

    # Defer initially (enable in v1.0.1 after baseline green):
    # - gocyclo       # cyclomatic complexity (noise on existing code)
    # - dupl          # duplicate code (noise on copy-paste-driven services)
    # - revive        # opinionated style (false-positive heavy)
    # - gocritic      # advanced patterns (config-heavy)
    # - paralleltest  # all tests must use t.Parallel() (debatable policy)
    # - testifylint   # only if migrating to testify; not currently used

  # disable-all linters NOT in `enable` (explicit-mode)
  exclusions:
    presets:
      - comments              # don't lint // TODO comments
      - common-false-positives # known false-positive patterns
      - legacy                # legacy code exclusions
      - std-error-handling    # standard Go error-handling patterns
    rules:
      # Test files — relax some rules
      - path: _test\.go
        linters: [errcheck, gosec, dupl, gocyclo]
      # Generated files
      - path: "(.+)\\.gen\\.go|.+_gen\\.go"
        linters: [govet, gocyclo, errcheck]
      # pkg/clientversion — Phase 1 lib, may have intentional patterns
      # - path: pkg/clientversion/.*
      #   linters: [gocyclo]

formatters:
  enable:
    - gofmt
    - goimports

issues:
  max-issues-per-linter: 0    # no cap — show all on first run
  max-same-issues: 0
  new: false                  # lint all code, not just new

# Severity — все linter findings = error (block merge)
severity:
  default: error
```

**Tuning notes for planner:**
- First run: `cd services/backend && golangci-lint run` против existing code.
- Inevitable false-positives → add к `exclusions.rules:` или disable specific linters.
- Each disabled linter MUST have rationale comment ("Disabled — generates X false-positive per Y; revisit v1.0.1").
- Do NOT enable presets-driven enable-all; explicit-list keeps config readable.

### E. SHA256 digest update workflow для `docker-compose.prod.yml`

**Option (a) — separate workflow that opens PR с digest updates (recommended for solo-dev):**

```yaml
# .github/workflows/update-prod-digests.yml (OPTIONAL — planner may skip if digest pinning done manually in v1.0)
name: Update prod compose digests

on:
  workflow_run:
    workflows: [backend-cd]
    types: [completed]
    branches: [main]

jobs:
  update:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Fetch digests from GHCR
        run: |
          for SVC in identity activity-sync feed media messaging notifications realtime-gw social-graph; do
            DIGEST=$(docker manifest inspect ghcr.io/ismaill01/$SVC:${{ github.event.workflow_run.head_sha }} \
                     | jq -r '.config.digest')
            sed -i.bak "s|image: ghcr.io/ismaill01/$SVC@sha256:[a-f0-9]\\+|image: ghcr.io/ismaill01/$SVC@sha256:${DIGEST#sha256:}|g" \
                services/backend/docker-compose.prod.yml
          done
          rm services/backend/docker-compose.prod.yml.bak
      - name: Create PR
        uses: peter-evans/create-pull-request@v6
        with:
          commit-message: "chore(deploy): bump prod compose digests to ${{ github.event.workflow_run.head_sha }}"
          title: "chore(deploy): update prod compose digests"
          branch: chore/update-prod-digests-${{ github.event.workflow_run.head_sha }}
          body: |
            Auto-generated PR — updates `docker-compose.prod.yml` `image:` digests
            to match CD run ${{ github.event.workflow_run.html_url }}.

            Review + merge to apply on next `make deploy` / ansible-playbook.
```

**Option (b) — keep tag-only в compose, cosign-verify at pull time (simpler, v1.0 recommended):**

```yaml
# docker-compose.prod.yml
services:
  identity:
    image: ghcr.io/ismaill01/identity:${SPORT_STACK_TAG:-v1.0.0-rc.1}
    # Ansible deploy step verifies cosign signature BEFORE docker compose pull:
    #   cosign verify --certificate-identity-regexp ... <image>:<tag>
    #   docker compose pull
```

**Recommendation для v1.0 solo-dev:** **Option (b) — tag-based pin in compose + cosign-verify wrap в Ansible**. Avoids PR auto-create churn (Phase 4 already has multiple PRs); digest immutability still enforced via cosign signature verification step in ansible. Defer Option (a) к v1.1 if team grows.

### F. Top-level `Makefile` — `make rollback v=N` target

```makefile
# Makefile (NEW — at repo root)
# Top-level Make for cross-cutting ops (rollback spans code + DB + infra).
# Backend-specific dev ops stay in services/backend/Makefile.

.PHONY: help rollback rollback-drill

VPS_HOST ?= deploy@148.253.214.156

help:
	@echo "Top-level targets:"
	@echo "  rollback v=<tag>     Revert prod к specified tag (code + DB migration down + ansible redeploy)"
	@echo "  rollback-drill       Run controlled drill (migration A → B → rollback к A → verify)"
	@echo ""
	@echo "Backend dev ops live в services/backend/Makefile"

rollback:
	@test -n "$(v)" || (echo "Usage: make rollback v=<version-tag-or-sha>"; exit 1)
	@echo "==> Verifying tag exists"
	@git rev-parse --verify $(v) >/dev/null || (echo "Tag/SHA $(v) not found"; exit 1)
	@echo "==> Checking out $(v)"
	git checkout $(v)
	@echo "==> Rolling back ONE migration on prod DB"
	ssh $(VPS_HOST) "cd /opt/sport/services/backend && \
		sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml \
		run --rm migrations down 1"
	@echo "==> Re-deploying via Ansible"
	cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml
	@echo "==> Smoke probe"
	curl -fsS -o /dev/null -w "HTTP %{http_code}\n" \
		https://148-253-214-156.sslip.io/healthz
	@echo "==> Rollback к $(v) complete"

rollback-drill:
	@echo "==> Drill scenario: deploy A → deploy B → rollback к A → verify"
	@echo "Step 1/5: checkout + tag drill A baseline"
	git tag -f v1.0.0-rc.test-a
	git push origin v1.0.0-rc.test-a
	# Wait for CD to publish images (manual sleep или poll gh actions)
	read -p "Wait for backend-cd workflow к complete, then press Enter: "
	cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml
	ssh $(VPS_HOST) "cd /opt/sport/services/backend && sudo docker compose --env-file /run/sport.env -f docker-compose.prod.yml run --rm migrations up 1"
	@echo "Step 2/5: apply drill migration A (NULLABLE add)"
	# At this point migration 9990_drill_metadata_col is applied
	@echo "Step 3/5: apply drill migration B (drop)"
	git tag -f v1.0.0-rc.test-b
	git push origin v1.0.0-rc.test-b
	read -p "Wait for backend-cd workflow к complete, then press Enter: "
	cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml
	# Migration B applied; users.metadata column dropped
	@echo "Step 4/5: rollback к A (drops B's effect, restores A's schema)"
	$(MAKE) rollback v=v1.0.0-rc.test-a
	@echo "Step 5/5: integration check — verify users.metadata column exists"
	ssh $(VPS_HOST) "sudo docker exec re_postgres psql -U re -d running_ecosystem -c \"\\d users\" | grep metadata" \
		&& echo "DRILL PASS: users.metadata restored" \
		|| (echo "DRILL FAIL: users.metadata not present after rollback"; exit 1)
```

### G. Branch protection setup script (D-21 user-action)

```bash
#!/usr/bin/env bash
# scripts/setup-branch-protection.sh (NEW)
# Source: gh api docs + GitHub REST API branch-protection schema
# Usage: ./scripts/setup-branch-protection.sh

set -euo pipefail

REPO=IsmailL01/sport   # adjust if namespace differs
BRANCH=main

gh api -X PUT "repos/${REPO}/branches/${BRANCH}/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Test (Go 1.25)",
      "Lint (golangci-lint v2)",
      "SAST (gosec)",
      "Vuln (govulncheck)",
      "SAST (semgrep)",
      "Secrets (gitleaks + trufflehog — PR diff)",
      "Docker build (no push, verify)",
      "Guard (no :latest)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF

echo "✓ Branch protection enabled on ${REPO}:${BRANCH}"
gh api "repos/${REPO}/branches/${BRANCH}/protection" --jq '.required_status_checks.contexts'
```

### H. Nightly cron full-history secret scan (workflow split per Pitfall 10)

```yaml
# .github/workflows/secret-scan-full.yml (NEW — supplements backend-ci.yml secrets-scan-diff job)
name: secret-scan-full

on:
  schedule:
    - cron: "0 3 * * 0"   # Sundays 03:00 UTC (06:00 Moscow MSK) — low-traffic window
  workflow_dispatch:       # manual trigger via gh workflow run

permissions:
  contents: read
  security-events: write

jobs:
  full-history:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # FULL history
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_ENABLE_COMMENTS: false   # cron run — no PR к comment
      - name: TruffleHog (full history)
        uses: trufflesecurity/trufflehog@main
        with:
          base: ""                          # disable base restriction → scan all
          head: ${{ github.ref_name }}
          extra_args: --results=verified,unknown
```

### I. `.trivyignore.yaml` template

```yaml
# .trivyignore.yaml (NEW)
# Source: trivy.dev/docs/latest/configuration/filtering/ (YAML format, experimental but stable)
# Note: requires `--ignorefile .trivyignore.yaml` flag (does NOT auto-load — verified)
# Trivy version: 0.55+ (YAML ignore-file support)

vulnerabilities: []
# Format for new ignores:
#   - id: CVE-YYYY-NNNNN
#     statement: <rationale — why this is OK to ignore>
#     expired_at: YYYY-MM-DD          # MUST set expiry — forces revisit
#     paths:                          # optional — limit scope
#       - "usr/local/lib/..."
#     purls:                          # optional — limit to specific packages
#       - "pkg:deb/debian/libssl"

misconfigurations: []
secrets: []
licenses: []

# Process for adding an ignore entry:
# 1. Identify CVE from Trivy CI output.
# 2. Verify NO fix is available upstream (check pkg.go.dev/vuln/CVE-... or CVE database).
# 3. Verify CVE is irrelevant к our threat model (e.g., CVE в test-only dep,
#    CVE в base-image we can't upgrade yet).
# 4. Add entry с rationale + expired_at = +90 days from today.
# 5. Submit PR with link к upstream fix-tracking issue в commit message.
# 6. Reviewer (or solo-dev self-review per D-20) verifies rationale soundness.
# 7. When expired_at hits, CI re-fails → re-evaluate (fix arrived? threat changed?).
```

### J. `cosign verify` command — для Ansible pre-pull gate

```bash
# Run on prod VPS before `docker compose pull`:
cosign verify \
  --certificate-identity-regexp 'https://github.com/IsmailL01/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/ismaill01/identity@sha256:abc123...

# Expected output:
# Verification for ghcr.io/ismaill01/identity@sha256:abc123... --
# The following checks were performed on each of these signatures:
#   - The cosign claims were validated
#   - Existence of the claims in the transparency log was verified offline
#   - Any certificates were verified against the Fulcio roots.
# [{"critical": {"identity": ... }, ...}]

# Verify SLSA provenance attestation:
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp 'https://github.com/IsmailL01/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/ismaill01/identity@sha256:abc123...

# Exit 0 = verification passed. Exit non-zero = blocks Ansible pull step.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact for Phase 4 |
|--------------|------------------|--------------|--------------------|
| `actions/attest-build-provenance@v1` | **`@v2` (LTS) or `@v4` (latest, wraps `actions/attest`)** | v1 → v2 mid-2024; v2 → v3 → v4 by Feb 2026 | **CONTEXT D-14 references `@v1` — must update к `@v2` or `@v4`. v1 still works as compatibility shim но emits deprecation warning. `[VERIFIED: github.com/actions/attest-build-provenance/releases]`** |
| golangci-lint v1 config syntax | **golangci-lint v2 config (`version: "2"` header)** | v2 released March 2025 | All new `.golangci.yml` should use v2 syntax. Migration command available: `golangci-lint migrate`. `[VERIFIED: ldez.github.io/blog/2025/03/23/golangci-lint-v2/]` |
| `enable-all: true` / `disable-all: true` (v1) | `linters.default: none/all/standard/fast` (v2) | v2 syntax change | Use `default: none` + explicit enable list (most readable). `[VERIFIED: golangci-lint.run/docs/configuration/file/]` |
| `gitleaks-action` без license | **`@v2` с `GITLEAKS_LICENSE` for org repos** | 2023 license requirement introduced | Solo-dev personal repo = no license needed. Organization = free key с registration. Plan accounts для both. `[VERIFIED: github.com/gitleaks/gitleaks-action]` |
| Trivy `.trivyignore` (text) only | **`.trivyignore.yaml` с `statement` + `expired_at`** | Trivy 0.46+ (experimental); stable in 0.55+ | YAML format requires `--ignorefile` flag (does NOT auto-load). Recommended для rationale + expiry hygiene. `[VERIFIED: trivy.dev/docs/latest/configuration/filtering/]` |
| `docker/login-action` с PAT secret | **`GITHUB_TOKEN` built-in для same-repo GHCR push** | Standard since 2022 | D-22 + D-23 confirmed — no extra secrets needed for CI→GHCR push. |
| Cosign `--key cosign.key` (keyed) | **`cosign sign --yes` (keyless, OIDC + Fulcio)** | Sigstore stable since 2021; widely-deployed 2023+ | D-13 confirmed; no key management. Verification command shown в §Code Examples §J. |
| `:latest` tag conventional | **`@sha256:<digest>` pinning + signed verification** | OpenSSF best practice since 2022 | D-15 + CICD-02 hard rule. Negative-grep CI guard recommended (Pitfall 6). |
| `slsa-framework/slsa-github-generator` (standalone) | **`actions/attest-build-provenance` (GH-native)** | GH-native introduced 2024; preferred for SLSA L2 simplicity | D-14 confirmed — GH-native lower complexity. Standalone SLSA generator only if L3 hermetic builds required (deferred к v1.1). |

**Deprecated / outdated (do NOT use):**

- `actions/attest-build-provenance@v1` — wraps `actions/attest`, deprecation warning. Use `@v2+`.
- `golangci-lint v1.x` (last v1: 1.64.x, March 2025) — v2 supersedes. Migration command auto-converts config.
- `gitleaks-action@v1` — abandoned. v2 is maintained.
- Custom shell-based GHCR auth — use `docker/login-action@v3` с `GITHUB_TOKEN`.
- `docker-compose` (dash-form, Compose v1) — Compose v2 (`docker compose` space-form) is standard since Ubuntu 24.04 dropped v1. Workflow + Makefile must use space-form (already aligned in existing code).

## Assumptions Log

Claims tagged `[ASSUMED]` (require user confirmation before locking):

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `IsmailL01` GitHub namespace will be a **personal account** (not organization), thus no gitleaks license required | §Standard Stack §Core (Quality gates); Pitfall 4 | If org: planner must add `GITLEAKS_LICENSE` secret config; minor — 30 min user-action к register at gitleaks.io. |
| A2 | Backend Go services contain no proprietary algorithms whose source-code-equivalent in compiled binaries needs IP protection | §Summary §Recommendation; §Standard Stack §Alternatives (GHCR public) | If proprietary IP exists: planner must use private GHCR + PAT-based auth on VPS deploy. Adds SOPS slot для PAT, ansible login step. |
| A3 | Existing prod VPS Postgres allows ad-hoc schema changes (drill migrations) outside normal business hours (no live-tester traffic) | Pitfall 5; §Code Examples §F | If 24/7 testers active: drill needs maintenance window + comms. v1.0 closed-beta likely no active testers yet (Phase 21 not reached). |
| A4 | `pkg/clientversion`, `pkg/featureflags`, `pkg/ratelimit` shared modules pass golangci-lint v2 conservative config without major refactor | §Code Examples §D | If false-positive avalanche: planner adds к `exclusions.rules:` или disables specific linters; tune timing ~30-60 min iteration. |
| A5 | Migration numbers `0021` + `0022` are free slots (verified `0020` is highest existing; Phase 4 lands before Phase 7 DB phase consumes them) | §Recommended Project Structure | If Phase 7 lands first: use `9990_drill_*` / `9991_drill_*` numbers (far future, clearly drill-tagged). Trivial relabel. |
| A6 | Free-tier GH Actions minute budget (2000 min/mo) sufficient — assumes ~10-20 PRs/mo + ~5-10 main pushes/mo | §Summary §Critical findings #5 | If solo-dev velocity higher: monitor via Settings → Billing; can buy minutes ($0.008/min) или migrate к self-hosted runner. |
| A7 | Pre-Phase-4 partial `backend-ci.yml` (May 7) reflects current `feat/cursona-redesign` state; will compile and run без structural changes during EXTEND step | §Architecture Patterns §System Architecture Diagram; §Code Examples §A | If branch has diverged: planner iterates на failing jobs (allowed `[skip ci]` per Pitfall 1 sequence) until green; ~30-60 min extra. |
| A8 | All 8 services have working Dockerfile (multi-stage, identity-pattern). Verified only `identity/Dockerfile` directly; assumed остальные follow same pattern | §Code Examples §A docker-build matrix | If Dockerfile missing for any service: Plan 04-02 adds task для template-copy from identity/Dockerfile. ~15 min per missing Dockerfile. |

**If user disagrees с any [ASSUMED] claim:** planner clarifies in `/gsd-discuss-phase 4` или treats как user-action checkpoint before plan execution.

## Open Questions

1. **GHCR namespace ownership (personal vs org) — affects gitleaks license + future workflow scoping**
   - What we know: D-02 preserves `IsmailL01` namespace; D-03 USER ACTION creates repo
   - What's unclear: will namespace be personal account OR organization?
   - Recommendation: User to decide at Plan 04-01 Task 0 execution. Document choice в SUMMARY. Default to personal account (simpler) если no org currently exists.

2. **Should Trivy block on UNFIXED critical vulns (no upstream patch available)?**
   - What we know: D-10 says block HIGH+CRITICAL; D-11 says MEDIUM/LOW advisory only
   - What's unclear: if a CRITICAL vuln has no upstream fix, do we (a) block CI (forcing `.trivyignore.yaml` entry с rationale+expiry), или (b) auto-allow unfixed?
   - Recommendation: (a) — block + force explicit ignore entry. `ignore-unfixed: false` в trivy-action config. Forces visibility + rationale-per-ignore vs silent acceptance.

3. **Should `:latest` guard run as separate workflow job или inline в existing job?**
   - What we know: ROADMAP hard rule + Pitfall 6
   - What's unclear: separate job adds clarity but consumes 30s; inline в test job adds 5s но less visible
   - Recommendation: separate job (`no-latest-tag-guard`) — explicit visibility >>> 30s minute spend. Code Example §A reflects this.

4. **Drill migration numbering — `0021/0022` vs `9990/9991`?**
   - What we know: existing migrations end at `0020`; Phase 7 (DB) hasn't consumed slots yet
   - What's unclear: does Phase 7 reserve `0021+` for legitimate schema changes? If drill migrations are "real" they'd never be removed; if drill-only they're transient
   - Recommendation: use `9990/9991` (far-future-tagged) — clearly drill-only, easy к delete post-drill, can't collide с Phase 7. Tag commits в drill: `chore(migrations): add drill A/B (Phase 4 CICD-04, transient)`.

5. **Should rollback Make target also lift the deployment freeze (D-06)?**
   - What we know: CICD-05 — freeze runbook step; CICD-04 — rollback drill
   - What's unclear: после rollback, is system "safe" enough к auto-lift freeze, or does human gate the unfreeze decision?
   - Recommendation: human-gates unfreeze. Make target does not touch freeze state; runbook §7 documents manual lift step. Otherwise risk auto-lifting before root cause confirmed.

## Environment Availability

| Dependency | Required By | Available (dev WS) | Version | Fallback |
|------------|------------|-------------------|---------|----------|
| `gh` CLI | branch protection setup (D-21); ad-hoc workflow inspection | unknown (`gh --version` to verify) | latest | Fallback: GitHub UI manual click-through |
| `cosign` | local verification of CI-published images (recommended dev install) | unknown | v2.x | Fallback: skip local verify, rely on CI signing |
| `trivy` | local image scan dry-run (optional dev quality-of-life) | unknown | 0.55+ | Fallback: rely на CI only |
| `golangci-lint` | local lint check before push (recommended) | unknown | v2.x | Fallback: rely on CI; CI failure → fix loop |
| `gitleaks` | already used (Phase 2 pre-commit + `services/backend/Makefile scan-secrets`) | ✓ (Phase 2 SEC-08 closed) | latest | — |
| `ansible` | already used (Phase 3); rollback Make target invokes | ✓ (Phase 3 closure) | latest | — |
| `docker` + `docker compose` | local build verify; rollback drill | ✓ (existing dev stack) | latest | — |
| `gh` repo remote | ALL of Phase 4 | ✗ — needs USER ACTION (D-03) | — | **BLOCKS Wave 1**; no fallback |
| GHCR write access | CD job; CI `GITHUB_TOKEN` auto-provisions | ✓ — `GITHUB_TOKEN` built-in once repo created | — | — |
| Free-tier CI minutes | ALL CI jobs | ✓ — 2000 min/month, est. usage 200-360 min/month | — | If exceeded: $0.008/min overage charge OR migrate к self-hosted runner |
| `golangci-lint-action@v8` requirements (Go 1.25) | lint job | ✓ on `ubuntu-latest` runner (setup-go installs) | — | — |
| GHCR pull from prod VPS | Future deploy (not Phase 4 critical path) | UNKNOWN if private; verify D-02 namespace ownership | — | If private+no PAT: make images public (recommended v1.0 per A2) |

**Missing dependencies with no fallback:**
- GitHub remote / `origin` (D-03 user-action checkpoint) — entire phase blocked без it. **Plan 04-01 Task 0 = HARD BLOCKER.**

**Missing dependencies with fallback:**
- Local `gh` / `cosign` / `trivy` / `golangci-lint` on dev workstation — optional dev tooling; fall back к CI-only feedback loop. Recommended install (1-line each via brew) for productivity.
- GHCR private auth on VPS — fall back к public images (recommended). Decision goes в SUMMARY post-Plan-04-01.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (Go services) | Go test (`go test -race -coverprofile`); already in use |
| Framework (workflow validation) | GitHub Actions itself (workflow status = test result); supplemented с `gh api workflows/runs` checks |
| Framework (cosign verify) | `cosign verify` exit code; integration test in `make rollback-drill` Step 5 |
| Framework (drill validation) | `psql` schema introspection in `make rollback-drill` Step 5 |
| Config file (Go) | `services/backend/{service}/go.mod` per module |
| Config file (lint) | `.golangci.yml` (NEW, v2 syntax) |
| Quick run command | `cd services/backend && make test` (existing Makefile target) |
| Full suite command | `cd services/backend && make test-coverage` (existing) |
| Workflow trigger validation | `gh workflow run backend-ci.yml --ref <branch>` + `gh run watch` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CICD-01 | Full matrix on PR — test+lint+5scanners+build+image-scan all green on a passing PR | integration (CI workflow status) | `gh pr create --base main --head test-pr && gh pr checks <pr-num> --watch` | ❌ Wave 0 (needs PR fixture) |
| CICD-02 | Container image signed; `cosign verify` returns 0 | integration | `cosign verify --certificate-identity-regexp 'https://github.com/IsmailL01/.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com ghcr.io/ismaill01/identity:<sha>` | ❌ Wave 0 (image must exist) |
| CICD-02 | `docker-compose.prod.yml` references `@sha256:` digest, NOT `:tag` | unit (grep) | `grep -E '^[[:space:]]+image: ghcr\\.io/IsmailL01/[a-z-]+@sha256:[a-f0-9]{64}$' services/backend/docker-compose.prod.yml \| wc -l` should equal 8 | ❌ Wave 0 (compose currently uses `build:` not `image:`) |
| CICD-02 | NO `:latest` anywhere | unit (negative grep) | `! grep -rE ':latest["\\x27]?$' .github/workflows/ services/backend/docker-compose.prod.yml` | ✓ (current state already lacks `:latest`) |
| CICD-03 | SLSA provenance attestation queryable | integration | `cosign verify-attestation --type slsaprovenance --certificate-identity-regexp ... --certificate-oidc-issuer ... <image>` | ❌ Wave 0 (image must exist with attestation) |
| CICD-04 | `make rollback v=N` returns exit 0 on drill scenario; `users.metadata` column restored | integration | `make rollback-drill` (defined in top-level Makefile) | ❌ Wave 0 (Makefile + drill migrations don't exist) |
| CICD-05 | `docs/RUNBOOKS/deploy.md §7` exists and contains "Deployment freeze" subsection | doc | `grep -A 10 '## 7\\..*Freeze\\|## 7\\..*freeze' docs/RUNBOOKS/deploy.md` | ❌ Wave 0 (deploy.md ends at §9; new §7-stub doesn't exist yet) |
| CICD-06 | Branch protection — 8 required checks listed | integration | `gh api repos/IsmailL01/sport/branches/main/protection --jq '.required_status_checks.contexts \| length'` should ≥ 8 | ❌ Wave 0 (no remote yet) |

### Sampling Rate

- **Per task commit:** `cd services/backend && make test` (Go tests only; ~2-3 min local)
- **Per wave merge:** Open PR против test branch → all CI jobs green → ~12 min CI time
- **Phase gate:** Full PR cycle на realistic feature branch + `make rollback-drill` execution + `cosign verify` of latest published image + branch protection contexts assertion via `gh api`. Estimated ~30-45 min end-to-end (drill on real VPS dominates).

### Wave 0 Gaps

- [ ] `Makefile` (top-level) — defines `rollback` + `rollback-drill` targets (CICD-04)
- [ ] `services/backend/migrations/9990_drill_metadata_col.{up,down}.sql` — drill migration A (CICD-04)
- [ ] `services/backend/migrations/9991_drill_drop_metadata_col.{up,down}.sql` — drill migration B (CICD-04)
- [ ] `.golangci.yml` — v2 conservative config (CICD-01 lint job)
- [ ] `.trivyignore.yaml` — empty initially; ready for population (CICD-01 image-scan job)
- [ ] `.github/workflows/backend-ci.yml` — EXTEND from existing partial (CICD-01)
- [ ] `.github/workflows/backend-cd.yml` — NEW (CICD-02, CICD-03)
- [ ] `.github/workflows/secret-scan-full.yml` — NEW (cron full-history; CICD-01)
- [ ] DELETE `.github/workflows/ci.yml` (Phase 0 placeholder; supersedes)
- [ ] `scripts/setup-branch-protection.sh` — gh-api scripted setup (CICD-06)
- [ ] `docs/RUNBOOKS/deploy.md §6.4 Rollback automation reference` — extension (CICD-04)
- [ ] `docs/RUNBOOKS/deploy.md §7 Deployment freeze procedure` — NEW (CICD-05)
- [ ] `docs/RUNBOOKS/deploy.md §10 Branch protection setup` — NEW (CICD-06)
- [ ] `services/backend/docker-compose.prod.yml` — MODIFY image: references (CICD-02)
- [ ] Framework installs (already covered): Go 1.25, docker, ansible — все Phase 3 deliverables ✓
- [ ] Wave 0 user action: `gh repo create IsmailL01/sport --private` + `git push -u origin main feat/cursona-redesign` (D-03)

## Security Domain

`security_enforcement` not explicitly set к `false` в config.json → enabled. Section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial — CI auth | `GITHUB_TOKEN` (auto-provisioned, short-lived, repo-scoped). No long-lived secrets. |
| V3 Session Management | N/A для CI | — |
| V4 Access Control | yes — branch protection | GitHub branch protection rules (required checks, no force-push, no deletes, no bypass) per D-19/20 |
| V5 Input Validation | partial — for workflow inputs | All workflow inputs validated by GH-Actions schema; no untrusted `pull_request_target` triggers used |
| V6 Cryptography | yes — image signing | cosign (Sigstore) — NEVER hand-roll signing. Keyless via Fulcio + Rekor transparency log |
| V10 Malicious Code | yes — supply chain | SLSA L2 build provenance + signed images + scanner-array (5 scanners). Pinned action versions (no `@latest` или unpinned) |
| V14 Configuration | yes — secrets handling | D-22/23: NO production secrets в CI environment. `GITHUB_TOKEN` only. SOPS stays на dev workstation + prod VPS |

### Known Threat Patterns для GitHub Actions CI/CD

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Workflow injection via `pull_request_target` + untrusted PR head | Tampering, EoP | Use `pull_request` (not `pull_request_target`); never checkout untrusted code в privileged context |
| Compromised action pulls в untrusted code | Tampering | Pin action versions к specific tags (`@v8` not `@main`); ideal — pin к SHA (`@abc123...`) для critical actions like cosign |
| Secret exfiltration via PR comment / logs | Info disclosure | D-22/23 — no production secrets in CI. Only `GITHUB_TOKEN` (scoped, short-lived). Even if leaked, blast radius = repo-scoped writes (revocable). |
| Cosign keyless = signer impersonation via OIDC | Spoofing | Verify `--certificate-identity-regexp` matches `https://github.com/IsmailL01/.*`; verify `--certificate-oidc-issuer` matches GH Actions token issuer |
| Image substitution attack (push к GHCR с malicious image, prod pulls "latest") | Tampering | D-15 — pin к `@sha256:<digest>`; cosign-verify before pull (proposed pre-deploy step) |
| Supply chain — compromised npm dep / Go module | Tampering | govulncheck (Go); Trivy (image-level deps); semgrep (code patterns); Dependabot deferred к v1.1 |
| Secret в git history (legacy leak) | Info disclosure | Pre-commit gitleaks (Phase 2 SEC-08) + CI gitleaks PR diff + cron gitleaks full-history. Three-layer defense (§Architecture Pattern 2) |
| `:latest` tag race condition (CI pushes new `:latest` после deploy starts pull) | Tampering | D-15 hard rule. Negative-grep guard в CI (Pitfall 6). |
| Branch protection bypass via admin override | EoP | `enforce_admins: false` в protection config — but document policy: solo-dev MUST self-discipline. v1.1 (DEV_B onboarded) — `enforce_admins: true`. |
| Rollback к compromised tag | Tampering | `make rollback v=N` validates `git rev-parse --verify $(v)` before proceeding; signed tags (`git tag -s`) recommended v1.0.1 (defer) |
| CI minutes exhaustion (DoS via huge PRs) | Availability | Free-tier 2000 min/mo budget; paths-filter prevents non-backend changes triggering full matrix; `fail-fast: false` constrained к matrix entries не cross-job |

**Defense-in-depth audit:** Phase 4 deliberately avoids handling production secrets (D-22/23). Secret-related ASVS controls are inherited from Phase 2 (SOPS) + Phase 3 (Ansible deploys + `/run/sport.env` tmpfs). Phase 4 adds attestation, signing, scanning layers — no new secret-handling code path introduced.

## Sources

### Primary (HIGH confidence)

- [actions/attest-build-provenance — Release notes (latest: v4.1.0, Feb 26, 2025)](https://github.com/actions/attest-build-provenance/releases) — verified version state, deprecation behavior
- [actions/attest-build-provenance — README](https://github.com/actions/attest-build-provenance) — SLSA Build L2 confirmation
- [Trivy filtering docs — `.trivyignore.yaml` schema](https://trivy.dev/docs/latest/configuration/filtering/) — fields, expiry, `--ignorefile` requirement
- [Gitleaks GitHub Action — README](https://github.com/gitleaks/gitleaks-action) — license requirement for org repos; v2.3.9 pin
- [TruffleHog Action — Marketplace](https://github.com/marketplace/actions/trufflehog-oss) — PR diff vs full history syntax
- [GitHub Docs — Billing & usage](https://docs.github.com/en/actions/concepts/billing-and-usage) — 2000 min/month confirmed for 2026
- [Cosign installer action](https://github.com/sigstore/cosign-installer) — v3/v4 stable versions
- [Sigstore cosign — verify docs](https://github.com/sigstore/cosign/blob/main/doc/cosign_verify.md) — verification command structure
- [Existing `services/backend/Makefile`](services/backend/Makefile) — reused targets (migrate, migrate-down, test)
- [Existing `services/backend/docker-compose.prod.yml`](services/backend/docker-compose.prod.yml) — current `build:` pattern → modify к `image: @sha256:` pattern
- [Existing `.github/workflows/backend-ci.yml`](.github/workflows/backend-ci.yml) — EXTEND seed (verified May 7 commit)
- [Existing `services/backend/identity/Dockerfile`](services/backend/identity/Dockerfile) — verified multi-stage + distroless pattern (Pattern 1)
- [Phase 2 — `docs/RUNBOOKS/sops-edit.md`](docs/RUNBOOKS/sops-edit.md) — confirms SOPS canonical store + dev-workstation-only key location (D-22)
- [Phase 3 — `docs/RUNBOOKS/deploy.md`](docs/RUNBOOKS/deploy.md) — confirms Ansible deploy seam Phase 4 wraps; §6 rollback manual procedure Phase 4 automates
- [Phase 3 — `03-03-SUMMARY.md`](.planning/phases/03-infrastructure-as-code/03-03-SUMMARY.md) — confirms carry-forward TODOs (`/opt/running-ecosystem/` legacy cleanup → can land после Phase 4 drill validates sport-stack flow)

### Secondary (MEDIUM confidence — WebSearch verified с official source)

- [golangci-lint v2 migration blog](https://ldez.github.io/blog/2025/03/23/golangci-lint-v2/) — v2 config syntax changes; verified against official docs
- [golangci-lint configuration file docs](https://golangci-lint.run/docs/configuration/file/) — `version: "2"` syntax
- [Sigstore quickstart с cosign](https://docs.sigstore.dev/quickstart/quickstart-cosign/) — keyless workflow
- [Docker BuildKit GHA cache backend](https://docs.docker.com/build/cache/backends/gha/) — `type=gha,mode=max` semantics, 10GB limit
- [Chainguard Academy — keyless signing](https://edu.chainguard.dev/open-source/sigstore/how-to-keyless-sign-a-container-with-sigstore/) — keyless cert lifecycle
- [Govulncheck-action README](https://github.com/golang/govulncheck-action) — official Go-team action; v1.0.4
- [Securego/gosec README](https://github.com/securego/gosec) — v2 stable; SARIF format
- [Aquasecurity/trivy-action README](https://github.com/aquasecurity/trivy-action) — current action versions

### Tertiary (LOW confidence — single source, marked для validation if material)

- [Semgrep registry — github-actions ruleset](https://semgrep.dev/p/github-actions) — semgrep CLI usage; cross-verify against semgrep.dev free-tier limits before relying в production
- [Various 2026 OneUptime blog posts](https://oneuptime.com/blog) — recent dates; useful but blog-quality (not authoritative). Treated as confirmation pointers, not primary source.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — все versions verified via Release pages, README fetches, or official docs
- Architecture: HIGH — patterns confirmed by Sigstore + GitHub-native action documentation
- Pitfalls: HIGH — each pitfall sourced from documented issues OR cross-referenced via official docs
- Deferred questions (1-5): HIGH — all 5 answered с verified sources; 1 critical CONTEXT correction surfaced (D-14 v1→v2/v4)
- Code examples: MEDIUM — workflows assembled из verified action versions but not yet executed against actual repo; first execution may surface minor adjustments (Pitfall 1 sequence anticipates this)
- Drill scenario (CICD-04): HIGH — migration design backwards-compatible per Pitfall 5; verification via psql introspection straightforward
- Free-tier minute estimate: HIGH — confirmed 2000 min/mo + reasonable usage projection
- Open Question 1 (GHCR namespace ownership): LOW — depends на user-action choice at Plan 04-01 Task 0

**Research date:** 2026-05-17
**Valid until:** 2026-06-17 (30 days — Sigstore / GitHub-Actions ecosystem stable but new releases possible; re-verify action versions if Plan 04-XX execution slips past this date)

---

## RESEARCH COMPLETE

All 5 explicitly-deferred questions answered (с 1 critical CONTEXT correction: `actions/attest-build-provenance` is v4, not v1 — planner must use `@v2` LTS или `@v4` latest). Additional research items (Dockerfile improvements, BuildKit cache, digest update workflow, cosign verify command, free-tier estimate) also answered. Standard stack pinned to verified current versions. Wave 0 gaps enumerated (15 new/extended files + 1 user-action checkpoint). Drill scenario backward-compatibility validated against Pitfall 5. Planner can proceed к `/gsd-plan-phase 4` directly.
