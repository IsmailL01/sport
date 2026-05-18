# Phase 4: CI/CD Pipeline — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Milestone:** v1.0 Production Readiness
**Workstream:** `backend`
**Mode:** Autonomous (`--auto`-equivalent per persistent no-questions instruction; mirrors Phase 2 + Phase 3 CONTEXT posture)

<domain>
## Phase Boundary

**What this phase delivers:** Take repo from "no GitHub remote, partial Go-only test workflow in `.github/workflows/backend-ci.yml` (2 of 8 services), no scanners, no image registry login, no signing, no provenance, no rollback automation, no branch protection" → to "every PR runs full quality-gate matrix (test/race + 5 scanners + multi-stage Docker build for all 8 services + Trivy image scan), merged-to-main commits build cosign-keyless-signed images pushed to GHCR with SLSA-style provenance attestation, `make rollback v=N` proven с real DB migration in path, deployment-freeze toggle documented, branch protection on `main` requires all matrix checks."

**3 GitHub Actions workflows:**
1. `backend-ci.yml` (EXTEND existing) — PR-triggered: test/race + lint + scanners + multi-stage build (no push) — required-checks for branch protection
2. `backend-cd.yml` (NEW) — push-to-main + tag-triggered: build + cosign sign + SLSA attest + push к `ghcr.io/ismaill01/<service>:<sha>` (and `:v1.0.0-rc.N` for release tags)
3. `ci.yml` (DELETE) — Phase 0 placeholder noop, superseded

**Top-level `Makefile` (NEW):** `make rollback v=N` target wraps git-checkout + ansible-redeploy + golang-migrate down. Separate from `services/backend/Makefile` (which scopes only to backend dev ops). Drill scenario lives in `docs/RUNBOOKS/deploy.md §6`.

**Branch protection (manual GitHub UI step, documented):** `main` required checks = all 5 backend-ci jobs (test, lint, scanners, docker-build, security-scan). 0 required reviewers (solo dev — admin self-approves PR). No force push, no deletes.

**Out of scope:**
- Continuous deployment beyond image-push (no GH-Actions OIDC trust extension к prod VPS in v1.0 per D-06 — deploy stays manual via Ansible from dev workstation; revisit Phase 21 if continuous deploy needed for soak)
- Mobile CI/CD (EAS Build territory — Phase 11/12)
- Sentry release-tag wiring (Phase 17)
- Performance regression CI / load-test integration (Phase 8)
- E2E test integration в CI (Phase 21)
- Self-hosted runners (v1.1 if GH-hosted free-tier limits become an issue)
- Codecov/Coveralls coverage badge service (PR coverage-comment via GH-native action sufficient)

</domain>

<scout_findings>
## Current State (verified 2026-05-17)

### Pre-existing partial CI
- **`.github/workflows/backend-ci.yml`** (May 7, 2540 bytes) — Go 1.25 test job (matrix-less: pkg + identity + activity-sync — 2 of 8 services + pkg). `go mod download` + `go vet` + `go test -race -coverprofile`. Docker build job: matrix `[identity, activity-sync]` only, `push: false`, registry login commented out. Tags reference `ghcr.io/ismaill01/<service>:<sha>`. **GHCR namespace `IsmailL01` already established in code** → assumes future GitHub repo under organization or user `IsmailL01`.
- **`.github/workflows/ci.yml`** (May 6, 1184 bytes) — Phase 0 placeholder noop. Single job prints TODO list. **DELETE in Phase 4** (superseded).
- **NO `.github/workflows/backend-cd.yml`** — needs creation.

### Pre-existing Makefile
- **`services/backend/Makefile`** has targets: help/up/down/migrate/migrate-down/test/test-coverage/tidy/scan-secrets. **NO `rollback` target.** Scoped only к backend dev ops.
- **NO top-level `Makefile`** — needs creation for `make rollback v=N` (touches code + DB + ansible — cross-cutting).

### Git remote state
- **NO `origin` remote** (verified: `git remote -v` empty). Phase 4 requires GitHub remote → **USER-ACTION CHECKPOINT 1** (create GitHub repo, add remote, push).

### Go module inventory
- **10 go.mod files** across `services/backend/`: 8 services (identity, feed, social-graph, activity-sync, realtime-gw, messaging, notifications, media) + `pkg/` shared + `scripts/openapi-routes-check/` (test scaffolding). Phase 4 matrix builds 8 services + tests pkg + tests/builds scripts when changed.

### Constraints from prior phases
- **Phase 1 (REL-01..05):** OpenAPI 3.1.0 contracts locked + `pkg/clientversion` version negotiation + `pkg/featureflags`. CI must not break these — running existing test suite в CI ensures regression catch.
- **Phase 2 (SEC-01..09):** SOPS canonical secret store + pre-commit gitleaks hook + envRequire fail-fast helpers. **SEC-01 explicitly partial: "gitleaks + trufflehog full-history scan was done one-time 2026-05-16 (0 findings); CI invocation deferred to Phase 4 / CICD-01"** — Phase 4 wires gitleaks + trufflehog into CI as ongoing protection.
- **Phase 3 (INFRA-01..07 active set):** sport-stack systemd umbrella + Ansible deploy seam. **Phase 4 wires CI to deploy.md §5 routine-deploy seam** (when continuous deploy lands; v1.0 keeps manual but documents the future seam).

### Carry-forward from Phase 3 (relevant к Phase 4)
- **`/opt/running-ecosystem/` legacy directory** preserved on prod VPS as emergency fallback (deploy.md §6.3). Phase 4 rollback drill should clarify: rollback uses sport-stack.service / Ansible path, NOT the legacy `/opt/sport/deploy.sh` flow.
- **3 compromised secrets pending rotation** (POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_*) before Phase 21. **Не Phase 4 scope but flagged** for visibility — CI scanners shouldn't trip on them in current SOPS slot (they're encrypted blob).
- **No staging environment** (D-23 pivot — deferred v1.1). Rollback drill MUST target prod VPS (no staging baseline) — risk-mitigation via backward-compatible migration choice per D-16 below.

</scout_findings>

<decisions>
## Implementation Decisions (21 D-XX auto-resolved; 1 explicitly LOCKED upstream)

### Repository & CI provider

- **D-01 (LOCKED upstream by ROADMAP CICD-01):** GitHub Actions as CI provider. Not relitigated.
- **D-02:** **Preserve existing GHCR namespace `ghcr.io/ismaill01/<service>`.** Already hardcoded в `backend-ci.yml` (commit May 7). Implies GitHub repo lives at `github.com/IsmailL01/<repo>` (organization OR personal account "IsmailL01"). If user-side namespace differs, ALL `<image>` references в CI + compose + ansible need parallel rename — flag for user-action checkpoint Plan 04-01 Task 0.
- **D-03:** **USER ACTION CHECKPOINT (Plan 04-01 Task 0):** create private GitHub repo (recommended: `IsmailL01/sport` or matching D-02 namespace), add as `origin` remote, push `feat/cursona-redesign` + `main` branches. Without this, no CI runs, no images push.
- **D-04:** **GitHub-hosted runners (`ubuntu-latest`)** для всех jobs. Free для solo-dev / private repos (GH free-tier covers ~2000 CI-minutes/month, plenty для closed-beta). Self-hosted runners deferred к v1.1 если CI-minutes становятся bottleneck.

### CI scope (build vs deploy split)

- **D-05:** **CI = build + test + scan + sign + push images ONLY. Deploy stays manual via Ansible from dev workstation in v1.0.** Rationale: continuous deployment requires GH-Actions OIDC trust extension к prod VPS (SSH key in GH secrets, OR cloud-API access) — adds attack surface + new credential management. For solo-dev v1.0 closed-beta, manual `ansible-playbook -i inventory/prod site.yml` остаётся deploy seam (deploy.md §5). Phase 21 may revisit if soak requires automated rollouts.
- **D-06:** Deployment freeze toggle (CICD-05) implemented as: GH Actions `environment: production` with admin manual-approval gate on any future deploy-job + repo-settings toggle "set environment to disabled". v1.0 documents the runbook step в `docs/RUNBOOKS/deploy.md §7 Failure modes` (since no automated deploy yet, freeze is N/A in practice — runbook captures the procedure for когда we add automated deploy).

### Workflow file architecture

- **D-07:** **Three workflow files после Phase 4:**
  1. `backend-ci.yml` — EXTEND existing (May 7). PR-triggered + push-to-main. All 8 services matrix. Jobs: test/race, lint (golangci-lint), scanners (gosec + semgrep + govulncheck + gitleaks + trufflehog), docker-build (no push, just verify Dockerfile builds), trivy image-scan.
  2. `backend-cd.yml` — NEW. Push-to-main + tag-triggered (`v*`). Builds + signs + pushes images to GHCR. SLSA provenance attestation.
  3. `ci.yml` (Phase 0 placeholder) — DELETE.
- **D-08:** **Matrix всех 8 services + pkg** в backend-ci test job (currently 2 of 8). Adds: feed, social-graph, media, messaging, notifications, realtime-gw + pkg. Plus migrations container (build-only).
- **D-09:** **`paths:` filter remains:** `services/backend/**` + `.github/workflows/backend-{ci,cd}.yml` + `Makefile` (top-level rollback target). Workflows don't run on docs/planning/mobile changes — saves CI minutes.

### Scanners (CICD-01 + SEC-01 closure)

- **D-10:** **Required (block PR merge) на HIGH+CRITICAL findings:**
  - `gosec` — static analysis для Go (G-series rules)
  - `semgrep` — multi-language SAST с Go-focused ruleset
  - `govulncheck` — known-CVE check против Go module deps
  - `Trivy` (image scan) — vulnerability scan на built Docker images
  - `gitleaks` (full-history + diff) — closes SEC-01 partial (Phase 2 one-time scan была manual; CI runs it on every PR + push)
  - `trufflehog` (full-history + diff) — second-opinion на secret detection
- **D-11:** **Advisory только (warn, не block) на MEDIUM/LOW.** ROADMAP §Acceptance Gate 4 hard rule: "Zero critical/high in CI security scans" — block только этот уровень. MEDIUM/LOW сурфятся в job summary для visibility.
- **D-12:** **`golangci-lint` как separate job (style/quality gate).** Blocks merge. Existing `go vet` baseline в backend-ci.yml gets superseded by golangci-lint (which runs vet + ~40 other linters).

### Image signing + provenance (CICD-02 + CICD-03)

- **D-13:** **cosign keyless signing via Sigstore/Fulcio.** No KMS, no key rotation, no GH-secrets-stored cosign key. Uses GH-Actions native OIDC token (`id-token: write` permission) → Fulcio issues short-lived signing cert → cosign signs → signature stored в Rekor transparency log. Verification: `cosign verify --certificate-identity-regexp 'https://github.com/IsmailL01/.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com <image>`. Documented в RUNBOOK.
- **D-14:** **SLSA Level 2 attestation via `actions/attest-build-provenance@v1`** (GitHub-native action). Generates provenance describing how the image was built (commit SHA, workflow file, runner, dependencies). Attached к image via cosign, queryable via `cosign verify-attestation`. Level 2 = "build platform identity authenticated" (GitHub Actions OIDC token). Level 3 (hermetic builds) deferred к v1.1.
- **D-15:** **Image tagging convention:**
  - Always: `:<git-sha>` (immutable, points к specific commit)
  - On release tags `vX.Y.Z`: also `:vX.Y.Z` (e.g., `:v1.0.0-rc.1`)
  - **NEVER `:latest`** (ROADMAP hard rule §"No latest image tags ever — pin to immutable SHA256 digests").
  - Production manifests (`docker-compose.prod.yml`) MUST reference `image: ghcr.io/ismaill01/<service>@sha256:<digest>` (NOT a tag) per CICD-02. Phase 4 plan includes Ansible task to look up digest after push and template into compose at deploy time, OR a separate step that updates compose with digests on each release.

### Rollback drill (CICD-04 — user redline)

- **D-16:** **`make rollback v=N` Make target в NEW top-level `Makefile`.** Wraps:
  ```make
  rollback:
  	@test -n "$(v)" || (echo "Usage: make rollback v=<version-tag>"; exit 1)
  	git checkout $(v)
  	cd services/backend && docker compose -f docker-compose.prod.yml run --rm migrations -path migrations -database "$$DATABASE_URL" down 1
  	cd infra/ansible && ansible-playbook -i inventory/prod --tags sport-stack site.yml
  	@echo "Rollback к $(v) complete. Verify smoke: curl -sI https://<vps-ip>.sslip.io/healthz"
  ```
  Lives at top-level (not `services/backend/Makefile`) because rollback spans code (git checkout) + DB (migrate down) + infra (ansible-playbook).
- **D-17:** **Rollback drill scenario (CICD-04 acceptance — "no-op doesn't count"):**
  - **Migration A (controlled, backward-compatible):** add NULLABLE column to a non-load-bearing table (e.g., `users.metadata JSONB DEFAULT NULL`). Tagged `v1.0.0-rc.test-a`.
  - **Migration B (subsequent):** rename/drop the column added in A. Tagged `v1.0.0-rc.test-b`.
  - **Deploy B → prod** (sport-stack umbrella picks up new code + runs migration B).
  - **`make rollback v=v1.0.0-rc.test-a`** reverts service binaries (git checkout A) + runs `migrate down 1` (undoes B's migration).
  - **Integration test:** assert `users.metadata` column exists post-rollback (= A's schema restored).
  - Tag `v1.0.0-rc.test-a` and `v1.0.0-rc.test-b` may be deleted after drill closes if user prefers clean tag history; documented в SUMMARY.
- **D-18:** **Drill target = existing prod VPS (148.253.214.156).** Staging не существует (deferred v1.1 per Phase 3 D-23). Risk-mitigation: drill migrations are intentionally **backward-compatible** (NULLABLE add → NULLABLE drop) so если drill aborts mid-way, prod stays serving valid data. Cutover window estimate: ~5 min для both migrations + 2 rollbacks. Acceptable solo-dev closed-beta.

### Branch protection (CICD-06)

- **D-19:** **Protect `main` branch only** (no `release/*` yet — single-track v1.0). Required checks (must pass before merge):
  - `backend-ci / test` (Go test/race for all matrix entries)
  - `backend-ci / lint` (golangci-lint)
  - `backend-ci / scanners` (5 scanners combined job)
  - `backend-ci / docker-build` (all 8 services Dockerfiles build)
  - `backend-ci / image-scan` (Trivy на built images)
  Block direct push к main (PR-only). Block force-push. Block branch deletion.
- **D-20:** **0 required reviewers** (solo dev — admin self-approves PR). User-level setting "Allow specified actors to bypass required pull requests" stays OFF (admin still must open PR, can self-approve). When DEV_B onboards (post-v1.0), bump к 1 required reviewer.
- **D-21:** **USER ACTION CHECKPOINT (Plan 04-XX):** apply branch protection via GitHub UI OR via `gh api repos/IsmailL01/<repo>/branches/main/protection` (script provided в plan). Cannot be automated by Ansible since GitHub Console interaction. Documented в `docs/RUNBOOKS/deploy.md §10 (NEW — Branch protection setup)`.

### Secrets in CI (D-06 implication)

- **D-22:** **No SOPS-decrypt в CI.** CI builds + tests + signs + pushes images — none of these need production secrets. Tests use ephemeral test DB (existing pattern в `services/backend/identity/test_helpers.go`). Cosign keyless = no signing key to manage. GHCR push uses GH built-in `GITHUB_TOKEN` (no extra secret).
- **D-23:** **Only secret stored в GH repo settings:** `GITHUB_TOKEN` (auto-provisioned by GH, scoped к repo only — packages:write для GHCR). No SOPS_AGE_KEY, no HCLOUD_TOKEN, no SSH keys. Reduces attack surface если GH compromised.

### Out-of-scope reminders (deferred ideas captured)

- **D-24:** **CD beyond image push:** when continuous deploy lands (Phase 21 if soak demands it, или v1.1), мы revisit OIDC trust extension к prod VPS (e.g., GH Actions OIDC → cloud-IAM → SSH session, или dedicated CI-only deploy user on VPS с key-only auth + narrow sudoers). Hard requirement upfront: deploy job ИСКЛЮЧИТЕЛЬНО triggers on release tags `v*` (not every push к main).

</decisions>

<deferred>
## Deferred to Researcher (Plan 04-XX research-phase)

Open questions where research clarifies best-practice details:

1. **`actions/attest-build-provenance@v1` vs alternatives** — verify это GitHub-native action существует и stable в 2026; alternatives: standalone SLSA Generator (slsa-framework/slsa-github-generator), in-toto attestation framework. Recommend simplest для solo-dev.
2. **golangci-lint config** — what `.golangci.yml` config matches current code-style? Сначала run против существующего code, tune `disable:` list для legacy false-positives, document tuning.
3. **gitleaks + trufflehog CI invocation paths** — full-history scan на каждый PR может быть slow (5-10 min on large history). Either: incremental scan (--since-commit) OR weekly full-scan cron + PR-only diff-scan. Researcher picks.
4. **Trivy severity threshold + CVE-ignore mechanism** — when ground-truth CVE has no fix yet OR is irrelevant к our threat model (e.g., CVE in test-only dep), need `.trivyignore` mechanism с rationale-per-CVE. Researcher proposes format.
5. **GHCR private repo image pull from VPS** — for `docker compose pull` from `ghcr.io/ismaill01/<service>@sha256:<digest>` to work on prod VPS, deploy user needs GHCR auth. Options: (a) personal access token с `read:packages` stored в SOPS, (b) GitHub deploy key, (c) keep images public (no auth needed). Researcher recommends; v1.0 simplest = public images (no proprietary algorithms in our Go services that need hiding).

</deferred>

<deferred_ideas>
## Out-of-Scope Ideas (Captured for Roadmap Backlog / future phases)

Из analysis surfaced but не Phase 4 scope:

- **Sentry release-tag wiring** — when image built с specific tag, push release event к Sentry via SDK before deploy. Phase 17 (crash reporting).
- **Performance regression CI** — k6 nightly run + alert on P99 regression vs baseline. Phase 8 (load + chaos).
- **Codecov / Coveralls coverage badge** — PR coverage delta comment via GH-native already sufficient для v1.0.
- **Dependabot / Renovate** — automated dep-update PRs. Cool but adds noise to PR queue в solo-dev mode. v1.1 если team grows.
- **Multi-arch images** (linux/amd64 + linux/arm64) — prod VPS is amd64 only (Hetzner default). v1.1+ if ARM-based VPS adoption или mobile-build пipelines diverge.
- **Image SBOM generation** (syft → SPDX/CycloneDX) — beyond SLSA. Useful для security audit but не required для v1.0 closed-beta. v1.1+.
- **Cosign verification в Ansible deploy** — currently Ansible-driven deploy just pulls `image:tag` без cosign verify gate. Wire verification step в deploy.md §4 / sport-stack role в v1.0.1 follow-up.
- **PR templates + issue templates** — adds friction в solo-dev mode; v1.1 если DEV_B onboards.

</deferred_ideas>

<canonical_refs>
## Canonical Documents (MUST READ before plan/research)

| Path                                                                    | Why it matters                                                                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/ROADMAP.md §Phase 4`                                         | Goal, success criteria 1-6, CICD-01..06 mapping                                                                                            |
| `.planning/REQUIREMENTS.md §CICD-01..06`                                | Numbered requirement definitions; CICD-04 user-redline ("no-op doesn't count")                                                            |
| `.planning/phases/03-infrastructure-as-code/03-03-SUMMARY.md`           | Phase 3 closure + 7 carry-forward TODOs; INFRA-07 baseline 66.5s; Ansible deploy seam Phase 4 wires CI к                                  |
| `docs/RUNBOOKS/deploy.md §5 Routine deploy`                             | Manual `ansible-playbook` flow Phase 4 preserves в v1.0 (no auto-deploy)                                                                  |
| `docs/RUNBOOKS/deploy.md §6 Rollback`                                   | Existing manual rollback procedure Phase 4 wraps в `make rollback v=N` Make target (D-16)                                                  |
| `.github/workflows/backend-ci.yml`                                      | Pre-existing partial CI (May 7). EXTEND this in Phase 4 — do NOT rewrite from scratch.                                                    |
| `.github/workflows/ci.yml`                                              | Phase 0 placeholder noop. DELETE in Phase 4.                                                                                              |
| `services/backend/Makefile`                                             | Existing dev-ops Makefile. Phase 4 adds NEW top-level Makefile (for `rollback v=N`) — does NOT modify backend/Makefile.                    |
| `services/backend/docker-compose.prod.yml`                              | Production stack; CICD-02 requires `image:` fields use SHA256 digest pinning (currently uses build context).                              |
| `services/backend/migrations/`                                          | golang-migrate format paired `*.up.sql` / `*.down.sql`. CICD-04 drill needs 2 controlled migrations added здесь.                          |
| `.planning/phases/02-secrets-and-config-hardening/02-03-SUMMARY.md`     | Phase 2 SEC-01 partial closure — Phase 4 CI wiring for gitleaks + trufflehog closes SEC-01 fully                                          |
| `.planning/codebase/CONCERNS.md`                                        | Outstanding concerns; verify nothing CI-related forgotten                                                                                  |

</canonical_refs>

<code_context>
## Reusable Assets

- **`.github/workflows/backend-ci.yml`** is the SEED для Phase 4's extended CI. Plan keeps test-job structure (Go 1.25, `go test -race -coverprofile`), expands matrix from 2 → 8 services + pkg, adds 5 scanner jobs, splits docker-build into separate PR-time (no push) vs main-time (push + sign + attest).
- **`services/backend/Makefile`** has `migrate` + `migrate-down` targets — `make rollback v=N` (top-level) делегирует к these for DB rollback piece.
- **`services/backend/docker-compose.prod.yml`** with `name: running-ecosystem` pin (commit `4ceece7`) — Phase 4 task updates `image:` field per service from `build: context` к `image: ghcr.io/ismaill01/<service>@sha256:<digest>` for digest-pinned deploys.
- **`docs/RUNBOOKS/deploy.md`** has §6 Rollback manual procedure that Phase 4 wraps в Make target (preserves manual fallback но adds automated path).

## New Files Expected (per ROADMAP success criteria)

```
.github/
  workflows/
    backend-ci.yml          # EXTEND (matrix 8 + scanners + lint)
    backend-cd.yml          # NEW (cosign + SLSA + GHCR push on main + tags)
    [DELETE ci.yml]         # Phase 0 placeholder, superseded
.golangci.yml               # NEW — golangci-lint config (tuned for codebase)
.trivyignore                # NEW (if any CVE-ignore needed; may stay empty initially)
Makefile                    # NEW top-level — `rollback v=N` target (D-16)
docs/
  RUNBOOKS/
    deploy.md               # EXTEND — add §6.4 rollback automation reference, §10 Branch protection setup
    cicd.md                 # NEW (optional) — CI/CD architecture overview если deploy.md gets too long; може merge into deploy.md
services/backend/
  docker-compose.prod.yml   # MODIFY — image: SHA256 digest pinning per service (CICD-02)
  migrations/
    <NNNN>_drill_metadata_col.up.sql / .down.sql      # NEW — drill migration A (add NULLABLE column)
    <NNNN+1>_drill_drop_metadata_col.up.sql / .down.sql  # NEW — drill migration B (drop the column)
```

## Pitfalls to Avoid (Pre-Researcher Heads-Up)

1. **Don't enable branch protection BEFORE first successful CI run** — chicken-and-egg: можно lock yourself out если CI jobs не green ever. Sequence: push existing code → fix any CI failures iteratively (PR with `[skip ci]` exempt) → THEN enable branch protection with all checks required.
2. **Don't push к `:latest` even by accident** — ROADMAP hard rule. CI workflow MUST validate that no `:latest` tag exists в any push step; pre-merge check: `! grep -rE ':latest"' .github/workflows/` should return empty (negative grep test).
3. **Cosign keyless requires `id-token: write` permission per job** — easy to forget; if absent, OIDC token fetch fails, signing fails silently. Plan job-permissions block explicitly.
4. **Don't run gitleaks + trufflehog full-history on every PR** — slow (5-10 min on >1000-commit history). Use diff-scan на PR + nightly cron full-scan. Researcher confirms.
5. **Rollback drill must use backward-compatible migration** — if drill aborts mid-way, prod stays serving valid data. DON'T pick an irreversible / destructive migration (column drop с data) для drill.
6. **GHCR image pull от prod VPS requires auth** — if images stay private, deploy user needs `read:packages` PAT. v1.0 simplest path = public images. Researcher verifies whether Go binaries can stay public from IP-protection POV (нет proprietary algorithms).
7. **Don't conflate Phase 4 CI scope with Phase 21 staging soak** — Phase 4 ships CI plumbing (jobs, signing, attestation, rollback Make target, drill). Phase 21 actually runs the soak с >=8 testers + validates rollback drill в real-world conditions.

</code_context>

<dependencies>
## Plan-Level Dependencies (Within Phase 4)

Expected plan breakdown (refined в `/gsd-plan-phase 4` after research):

- **Wave 1 (sequential — blocks everything):**
  - `04-01` — **GitHub repo setup + push** (CICD-01 prereq). USER ACTION: create repo `IsmailL01/sport` (или matching D-02 namespace), generate GH-Actions-ready visibility settings, add `origin` remote, push `feat/cursona-redesign` + `main`. Verify existing partial CI (`backend-ci.yml`, `ci.yml`) shows up в Actions tab on first push.
- **Wave 2 (sequential after Wave 1):**
  - `04-02` — **Extend backend-ci.yml** к full 8-service matrix + golangci-lint + 5 scanners + Trivy image-scan. Delete `ci.yml` placeholder. Iterate on failing jobs until green (allowed to `[skip ci]` commits до stable). REQUIREMENTS: CICD-01, SEC-01 (closure).
- **Wave 3 (parallel after Wave 2):**
  - `04-03a` — **Create backend-cd.yml** + GHCR auth + cosign keyless + SLSA attestation (CICD-02, CICD-03). On main push + tag push.
  - `04-03b` — **Top-level Makefile** with `rollback v=N` target + drill migrations A/B + integration test (CICD-04 — user-redline drill). Documented в deploy.md §6 (extension).
- **Wave 4 (sequential after Wave 3):**
  - `04-04` — **Run rollback drill on prod VPS** (USER ACTION — controlled, supervised). Records timing + outcome в SUMMARY. Updates `docs/RUNBOOKS/deploy.md §6` с drill results.
  - `04-05` — **Branch protection setup** (CICD-06). USER ACTION: enable protected branch via `gh api` или GitHub UI. Verify with PR test (create dummy PR, confirm checks block merge until green). Documents в `deploy.md §10 (NEW — Branch protection setup)`.
  - `04-06` — **Deployment freeze toggle runbook** (CICD-05). Add §7 entry к deploy.md describing how to pause CI / disable production environment в GH repo settings. Lightweight doc-only task.

</dependencies>

<success_criteria>
## Phase 4 Acceptance (from ROADMAP, no expansion)

1. ✓ GitHub Actions matrix runs on every PR: Go `test -race`, `golangci-lint`, `gosec`, `semgrep`, `govulncheck`, multi-stage Docker build для всех 8 services, Trivy image scan. (D-08 + D-10 + D-12 + D-21)
2. ✓ Container images signed с `cosign` (keyless via Sigstore/Fulcio per D-13) and `image:` references в `docker-compose.prod.yml` pinned к SHA256 digests (D-15). No `:latest` tags anywhere — verified by negative-grep test в CI (D-15 + Pitfall 2).
3. ✓ SLSA Level 2 build provenance attestation via `actions/attest-build-provenance@v1` attached к each release tag (D-14).
4. ✓ **Rollback drill validated:** `make rollback v=v1.0.0-rc.test-a` reverts service binaries (git checkout) + runs `migrate down 1` (undoes B's migration) + integration test confirms A's schema restored. No-op rollback не counts per user redline. (D-16 + D-17 + D-18)
5. ✓ Deployment freeze toggle runbook step в `deploy.md §7` (D-06).
6. ✓ Branch protection on `main`: 5 required checks must pass before merge; no force push; no deletes. (D-19 + D-20 + D-21)

</success_criteria>

<user_checkpoints>
## Anticipated User-Action Checkpoints

Phase 4 has 3-4 `autonomous: false` checkpoints:

1. **Plan 04-01 Task 0 — GitHub repo + remote setup** (Wave 1): User logs into GitHub, creates private repo `IsmailL01/sport` (или confirms alternative namespace + Claude updates D-02 references throughout). `gh repo create IsmailL01/sport --private --source=. --remote=origin --push`. Claude verifies via `git remote -v` then watches Actions tab confirm first CI run triggers.
2. **Plan 04-04 Task X — Rollback drill on prod** (Wave 4): User supervises live drill on 148.253.214.156 (5-10 min wall-clock + observation). Confirms each step (deploy A, deploy B, rollback к A, integration test) interactively OR pre-approves автоном run. Recommends за-window когда no active mobile-client traffic.
3. **Plan 04-05 Task X — Branch protection** (Wave 4): User runs `gh api` script OR clicks through GitHub UI to enable 5 required checks. Trivially undoable, low-risk.
4. **(Optional) — Phase 2 secret rotation trigger** (carry-forward, recommended но не Phase 4 critical-path): rotate POSTGRES_PASSWORD + JWT_SECRET + MINIO_ROOT_USER/PASSWORD before Phase 21 staging soak. Can happen в parallel к Phase 4 OR deferred к Phase 21 prep. NOT a Phase 4 blocker.

</user_checkpoints>

---

*Phase: 04-ci-cd-pipeline*
*Context gathered: 2026-05-17 (autonomous mode)*
*Next: `/gsd-plan-phase 4` (research recommended — D-05..D-23 cited 4 deferred questions for researcher)*
