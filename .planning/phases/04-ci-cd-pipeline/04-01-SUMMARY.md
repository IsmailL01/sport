---
phase: 04-ci-cd-pipeline
plan: 01
subsystem: ci-cd
status: CLOSED 2026-05-18 (Wave 1 — GitHub repo bootstrap + namespace pivot + Phase 0 placeholder removed)
tags: [github, repo-setup, ghcr, namespace-rename, wave-1, prerequisite]

requires:
  - phase: 02-secrets-and-config-hardening (pre-commit gitleaks Phase 2 inheritance — confirmed CI-side coverage continues в Wave 2 04-02)
  - phase: 03-infrastructure-as-code (provider-agnostic deploy seam — CI builds, Ansible deploys в v1.0)
provides:
  - GitHub remote `https://github.com/IsmailL01/sport.git` (PRIVATE) с `feat/cursona-redesign` + `main` branches pushed
  - Default branch set к `main` on GitHub (via `gh repo edit --default-branch main`)
  - Namespace `runningecosystem` (CONTEXT D-02 original assumption) replaced consistently across 11 files с two-case mapping:
    * GHCR image refs (lowercase per GHCR rule): `ghcr.io/ismaill01/<svc>`
    * GitHub URLs + gh api paths (case-preserved): `IsmailL01/sport`
  - `.github/workflows/ci.yml` deleted (Phase 0 placeholder superseded)
  - `gh` CLI installed (`/opt/homebrew/bin/gh`) + authenticated (gho_*** token; scopes `repo + workflow`)
affects: [04-02 backend-ci.yml extend, 04-03a backend-cd.yml namespace, 04-04 git/ansible refs, 04-05 branch protection target, 04-06 freeze toggle doc]

tech-stack:
  added:
    - "gh CLI (Homebrew) — auth scopes repo + workflow (write:packages PENDING — Plan 04-03a will gh auth refresh)"
  patterns:
    - "Two-case GHCR vs GH namespace mapping: GHCR forced lowercase (ismaill01), GH URLs case-preserved (IsmailL01)"
    - "Default branch = main on GitHub (но work-in-progress по-прежнему происходит на feat/cursona-redesign; merge к main делается через PR с Wave 4 Plan 04-05 branch protection)"
  decisions:
    - "D-02 REVISED 2026-05-18: namespace `runningecosystem` → `IsmailL01/sport` (personal account, не org). Implications: gitleaks-action@v2 NOT needs GITLEAKS_LICENSE (only orgs require это per RESEARCH Pitfall 4). Phase 4 SEC-01 closure simpler in Wave 2."

key-files:
  modified:
    - ".github/workflows/backend-ci.yml (namespace ref)"
    - "services/backend/docker-compose.prod.yml (namespace ref — но нет matches; no-op verification)"
    - ".planning/phases/04-ci-cd-pipeline/{04-01..06}-PLAN.md (namespace refs across 7 plans)"
    - ".planning/phases/04-ci-cd-pipeline/04-CONTEXT.md (D-02 + multiple refs)"
    - ".planning/phases/04-ci-cd-pipeline/04-RESEARCH.md (multiple refs)"
    - ".planning/phases/04-ci-cd-pipeline/04-PATTERNS.md (multiple refs)"
    - ".planning/phases/04-ci-cd-pipeline/04-VALIDATION.md (1 ref в Manual-Only Verifications)"
  deleted:
    - ".github/workflows/ci.yml (Phase 0 placeholder noop, superseded by future backend-ci.yml extension в 04-02)"

git-commits:
  - "da105f3 — feat(04-01): Wave 1 — GitHub repo bootstrap + namespace rename + ci.yml DELETE"

acceptance:
  - ✓ `git remote -v` показывает `origin https://github.com/IsmailL01/sport.git`
  - ✓ `gh repo view --json visibility` returns `PRIVATE`
  - ✓ `gh repo view --json defaultBranchRef` returns `{"name":"main"}`
  - ✓ Both `feat/cursona-redesign` + `main` pushed к origin; tips at SHA `da105f3`
  - ✓ `.github/workflows/ci.yml` deleted; `ls .github/workflows/` shows only `backend-ci.yml`
  - ✓ Namespace replacement verified clean: `grep -rln "runningecosystem" .github/ .planning/phases/04*/` returns empty
  - ✓ Plan 04-02 Wave 2 unblocked: backend-ci.yml exists с correct image-ref namespace; ready к EXTEND с full 8-service matrix + scanners

observed-ci-activity:
  - "Run 26034941655 (workflow=CI, name=`c`) — Phase 0 placeholder ran one last time on main push BEFORE ci.yml deletion landed; completed 8s success. Will not run again (deleted)."
  - "Run 26034942784 (workflow=Dependency Graph, name=Graph Update) — GitHub's automated дependency-graph sweep; in_progress. Not our workflow."
  - "backend-ci.yml: NOT yet triggered on the latest push (`da105f3`). May be queued OR paths filter (`services/backend/**` + `.github/workflows/backend-ci.yml`) didn't fully evaluate yet — backend-ci.yml itself was modified в this commit and should match. Will surface на next push or via Plan 04-02 Wave 2 first-iteration."

deviations:
  - "GHCR namespace ownership type — RESEARCH Q1 deferred к Plan 04-01 Task 0 outcome. RESOLVED: personal account `IsmailL01` (not org). Implication: gitleaks-action@v2 in 04-02 Task 1 step 7 does NOT need `GITLEAKS_LICENSE` env var (org-only requirement)."
  - "GHCR package visibility flip к public — RESEARCH recommendation для eliminating GHCR auth complexity on prod VPS. DEFERRED к Plan 04-03a Task 3 first CD run (no packages exist yet к make public)."
  - "Top-level Makefile (`make rollback v=N`) — Plan 04-03b deliverable. Not Wave 1 scope. Pre-flight verified нет conflict с existing `services/backend/Makefile` (different file path)."
  - "Worktree-agent leftover branches (worktree-agent-a2cf95f1a5cb08640, ...a3105aec3440ccf87, ...a5ba17aa0a2a6814b) — from Phase 1-3 executor agents. Locked locally; not pushed к origin (only `main` + `feat/cursona-redesign` pushed). Не блокирует Phase 4. Hygiene cleanup deferred (low priority — local-only)."

carry-forward:
  - "Plan 04-02 Task 1 — extend backend-ci.yml matrix к 8 services + add 5 scanners + golangci-lint + Trivy. Use `IsmailL01/sport` repo URLs and `ghcr.io/ismaill01/<svc>` image refs throughout (D-02 REVISED). gitleaks-action@v2 — skip GITLEAKS_LICENSE (personal account)."
  - "Plan 04-03a Task 1 — `gh auth refresh -s write:packages` will be needed before backend-cd.yml first run (current scopes lack write:packages для GHCR push). Plan 04-03a Task 0 sub-step OR mid-task instruction должен flag this."
  - "Plan 04-03a Task 3 — set GHCR package visibility = public via GitHub UI после first CD push (per RESEARCH §Q1 — eliminates prod-VPS GHCR auth complexity for solo-dev closed-beta where Go services don't expose proprietary algorithms)."
  - "Plan 04-05 Task 2 (branch protection) — target branch = main (default branch). API path = `repos/IsmailL01/sport/branches/main/protection`. Already namespace-corrected в plan."

self-check: PASSED (Wave 1 minimum scope delivered: repo exists, default branch set, namespace consistent, Phase 0 placeholder removed)

---

*Phase: 04-ci-cd-pipeline*
*Plan: 01 (Wave 1 — repo + namespace + placeholder cleanup)*
*Completed: 2026-05-18*
*Status: CLOSED ✓ — Wave 2 unblocked*
