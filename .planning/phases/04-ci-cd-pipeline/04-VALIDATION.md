---
phase: 4
slug: ci-cd-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-17
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | YAML linting (`actionlint` or `yamllint`) для workflow files · `golangci-lint run` · `gosec` · `semgrep --config=auto` · `govulncheck ./...` · `trivy image` · `cosign verify` · `gh api` (branch protection state read-back) · `make rollback v=N` exit code · `psql` for drill schema assertion |
| **Config file** | `.github/workflows/backend-ci.yml` · `.github/workflows/backend-cd.yml` · `.golangci.yml` · `.trivyignore.yaml` · top-level `Makefile` |
| **Quick run command** | `actionlint .github/workflows/*.yml && golangci-lint run --new-from-rev=HEAD~1 ./...` (locally — fast feedback) |
| **Full suite command** | Push to PR branch → GitHub Actions runs all 5 jobs (test/lint/scanners/docker-build/image-scan) → assert green via `gh pr checks <pr-num>` |
| **Estimated runtime** | ~5 min (local lint + vet quick run) · ~10-15 min full PR CI run · ~5-10 min push-to-main CD run (build + sign + attest + push 8 images) · ~10 min rollback drill on prod |

---

## Sampling Rate

- **After every task commit:** Run `actionlint .github/workflows/*.yml` if workflow file changed; otherwise `make -n rollback v=foo` (syntax-check). For Go-touching tasks: `cd services/backend/<svc> && go vet ./...`.
- **After every plan wave:** Push к scratch PR branch + wait для CI green (use `gh pr checks --watch` or `gh run watch`). Wave 1 verifies first-push triggers CI; Wave 2 verifies full matrix green; Wave 3 verifies CD job signs+pushes images cleanly; Wave 4 verifies rollback drill exits 0 + branch protection blocks unverified merge attempt.
- **Before `/gsd-verify-work`:** ALL 6 CICD-* acceptance criteria assertions green (см. table ниже).
- **Max feedback latency:** 5 min локально (actionlint + go vet) · 15 min full CI run · 30 min для full Wave 3 cycle (build all 8 services + cosign + SLSA + push к GHCR).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-* | 01 | 1 | CICD-01 (prereq) | T-04-01 (GH repo public exposes proprietary code) | Repo visibility = private until intentional public flip; SOPS encrypted blobs are OK to commit | manual | `git remote -v \| grep origin` returns GHCR-namespace URL + `gh repo view --json visibility` returns `PRIVATE` | ❌ W0 | ⬜ pending |
| 04-02-* | 02 | 2 | CICD-01, SEC-01 (closure) | T-04-02 (scanner false-positive avalanche → ignored, real vuln slips through) | All 8 services + pkg in test matrix; 5 scanners gating HIGH+CRITICAL; gitleaks+trufflehog diff-on-PR + nightly full-scan | integration | `gh workflow run backend-ci.yml --ref <branch>` + `gh run watch` exits 0; PR-checks API shows all 5 jobs green | ❌ W0 | ⬜ pending |
| 04-03a-* | 03a | 3 | CICD-02, CICD-03 | T-04-03 (cosign signature missing → unverified image pulled к prod) | cosign keyless signature attached к each pushed image; SLSA L2 attestation queryable via `cosign verify-attestation`; image references в compose use SHA256 digest (no `:latest`) | integration | `cosign verify --certificate-identity-regexp ... ghcr.io/runningecosystem/<svc>:<sha>` exits 0; `cosign verify-attestation --type slsaprovenance` exits 0; `grep -rE ':latest"' .github/workflows/` returns empty | ❌ W0 | ⬜ pending |
| 04-03b-* | 03b | 3 | CICD-04 (drill scaffold) | T-04-04 (rollback fails partway → prod stuck in inconsistent state) | `make rollback v=N` is atomic: git checkout → migrate down → ansible-playbook re-deploy; aborts cleanly если any step fails; drill migrations backward-compatible (NULLABLE add/drop) | unit | `make -n rollback v=v1.0.0-rc.test-a` shows expected command sequence; SQL migrations linted; integration test script exists | ❌ W0 | ⬜ pending |
| 04-04-* | 04 | 4 | CICD-04 (drill execution) | T-04-04 mitigation verification | Drill executes successfully on prod VPS; integration test confirms A's schema restored; cutover-window measured | manual | Live drill: `make rollback v=v1.0.0-rc.test-a` exits 0 + `psql -c "\d users" \| grep metadata` confirms column present (A's schema) + smoke probe HTTP 202 | ❌ W0 | ⬜ pending |
| 04-05-* | 05 | 4 | CICD-06 | T-04-05 (force-push к main bypasses branch protection) | `main` protected: 5 required checks (test/lint/scanners/docker-build/image-scan), no force-push, no deletes; admin self-approves PR | integration | `gh api repos/runningecosystem/sport/branches/main/protection \| jq '.required_status_checks.contexts \| length == 5 and .required_pull_request_reviews \| .required_approving_review_count == 0 and .allow_force_pushes.enabled == false'` returns true | ❌ W0 | ⬜ pending |
| 04-06-* | 06 | 4 | CICD-05 | T-04-06 (deployment freeze toggle not documented → incident response unclear) | `docs/RUNBOOKS/deploy.md §7` (или §10) describes freeze toggle: disable GH Actions environment `production` OR set workflow `enabled: false` via repo settings | docs | `grep -q "deployment freeze\|production environment\|workflow disable" docs/RUNBOOKS/deploy.md` returns match | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `gh` CLI installed на dev workstation (`brew install gh`); authenticated via `gh auth login` (one-time)
- [ ] `actionlint` для local workflow linting (`brew install actionlint`)
- [ ] `cosign` CLI для local verify testing (`brew install cosign`)
- [ ] `psql` для drill schema-assertion (typically already installed via Postgres client)
- [ ] **NEW workflow files:** `.github/workflows/backend-ci.yml` (EXTEND), `.github/workflows/backend-cd.yml` (CREATE), `.github/workflows/ci.yml` (DELETE)
- [ ] **NEW config files:** `.golangci.yml`, `.trivyignore.yaml`, top-level `Makefile`
- [ ] **NEW drill migrations:** `services/backend/migrations/9990_drill_metadata_col.{up,down}.sql` + `9991_drill_drop_metadata_col.{up,down}.sql` (per RESEARCH §Open Q 3 recommendation — `9990/9991` to never collide с Phase 7 production migrations)
- [ ] **MODIFY:** `services/backend/docker-compose.prod.yml` per-service `image:` field updated к SHA256 digest pinning (after first CD run produces digests)
- [ ] **DOCS:** `docs/RUNBOOKS/deploy.md` extended with §6.4 (rollback automation), §7 (deployment freeze toggle), §10 (branch protection setup)
- [ ] **USER ACTION:** GitHub repo created at `runningecosystem/sport` (or alternative namespace + Claude updates D-02 refs); `origin` remote added; initial push completes; first CI run triggered + visible в Actions tab.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub repo created + origin remote pushed | CICD-01 prereq | Account-side interaction with GitHub UI / `gh repo create`; не automatable from this workspace | Plan 04-01 Task 0 user-action checkpoint |
| Rollback drill execution on prod VPS | CICD-04 (user-redline acceptance) | Live mutation на 148.253.214.156; brief downtime window; needs human supervision | Plan 04-04 user-action checkpoint; documented в deploy.md §6.4 after success |
| Branch protection enable via `gh api` или GitHub UI | CICD-06 | GitHub API auth required (PAT or `gh auth`); admin-level repo settings | Plan 04-05 user-action checkpoint; idempotent script provided |
| First successful CI run (sequence guard per RESEARCH Pitfall 1) | CICD-01 + CICD-06 prereq | Branch protection MUST NOT be enabled BEFORE first green CI run — otherwise lock yourself out (cannot merge fixes если check is required but doesn't exist yet) | Plan 04-02 wait для green; Plan 04-05 only after Plan 04-02 green |
| GHCR image registry visibility (public vs private) decision | CICD-02 prereq | RESEARCH recommends public для v1.0 closed-beta (no proprietary algorithms in Go services) — eliminates GHCR auth complexity on prod VPS | Plan 04-01 Task 0 user-action checkpoint includes "set GHCR package visibility = public after first push" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (gh CLI, actionlint, cosign, workflow files, configs, drill migrations, docs extensions, GitHub repo)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5 min локально / < 15 min full CI run / < 30 min full CD wave
- [ ] `nyquist_compliant: true` set в frontmatter
- [ ] **Sequence guard:** branch protection (04-05) marked `depends_on: [04-02]` — enforces "first green CI run before lock-down" (RESEARCH Pitfall 1)

**Approval:** pending
