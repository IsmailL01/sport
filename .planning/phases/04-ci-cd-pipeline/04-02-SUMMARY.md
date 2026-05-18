---
phase: 04-ci-cd-pipeline
plan: 02
subsystem: infra
tags: [ci, github-actions, golangci-lint, gosec, govulncheck, semgrep, trivy, gitleaks, trufflehog, sec-01-closure, cicd-01]

# Dependency graph
requires:
  - phase: 04-ci-cd-pipeline
    provides: GitHub repo bootstrap (Plan 04-01) — github.com/IsmailL01/sport, ghcr.io/ismaill01/<svc> namespace, branch feat/cursona-redesign pushed
provides:
  - Extended backend-ci.yml: 9-entry test matrix + 8-entry docker-build matrix + 5 scanner jobs + no-latest guard
  - secret-scan-full.yml: Sunday-03:00-UTC cron full-history scan (closes SEC-01)
  - .golangci.yml: golangci-lint v2 conservative starter (13 linters, doc'd exclusions)
  - .trivyignore.yaml: empty rationale-per-CVE template
  - First green CI run record (PR #1, run 26037119000) — sequence-guard prerequisite for Plan 04-05 branch protection
  - 8 verbatim job-`name:` strings pinned — upstream half of Plan 04-05 branch-protection contract
affects: [04-03a (backend-cd.yml — similar patterns), 04-03b (Makefile paths-filter inclusion), 04-05 (branch protection consumes 8 job names + first-green run record)]

# Tech tracking
tech-stack:
  added:
    - golangci-lint v2.5.0 (replaces prior `go vet` step)
    - gosec v2 (Go SAST, HIGH severity gating)
    - govulncheck (Go vuln scan, blocks merge per D-10)
    - semgrep (with p/golang + p/owasp-top-ten rulesets, ERROR-only blocking)
    - gitleaks-action@v2 + trufflesecurity/trufflehog@main (PR-diff secrets)
    - aquasecurity/trivy-action@master (HIGH+CRITICAL image scan)
  patterns:
    - "Shell-loop-per-module scanner pattern (workspace+go.work doesn't support `./...` from root — loop inside each module directory)"
    - "Single check-context preservation: loop inside one job rather than matrix dimension (prevents `Vuln (govulncheck) (pkg)` etc. — keeps Plan 04-05 contract intact)"
    - "Block-on-HIGH без SARIF on private repos: GHAS is paid; scanners surface findings via stdout, gate via exit codes"
    - "Cron-only full-history secret scan separate from PR-diff fast path (RESEARCH Pitfall 10)"
    - "`:ci-${{ github.sha }}` build tag distinguishes CI verify-builds от CD-published `:${{ github.sha }}` (Plan 04-03a hybrid)"

key-files:
  created:
    - .github/workflows/secret-scan-full.yml (40 lines — Sunday cron + workflow_dispatch)
    - .golangci.yml (87 lines — v2 schema, 13 linters, 5 tactical exclusions с revisit tags)
    - .trivyignore.yaml (30 lines — empty initially, rationale+expiry format documented)
    - .planning/phases/04-ci-cd-pipeline/04-02-SUMMARY.md
  modified:
    - .github/workflows/backend-ci.yml (89 → 187 lines: full extension)
    - .gitignore (add `.claude/worktrees/` exclude — fixes blocking gitlinks issue)
    - 42 files в services/backend/ (gofmt -w + 4 small lint fixes)

key-decisions:
  - "Drop SARIF uploads to GitHub Security tab — Code Scanning requires GHAS на private repos (paid). Scanners surface findings via stdout; block-on-HIGH preserved via exit codes. Revisit v1.0.1 если GHAS enabled OR repo made public."
  - "Use shell-loop-per-module pattern for lint/gosec/govulncheck — services/backend is go.work workspace без top-level go.mod; upstream actions fail с 'no go.mod file' or 'pattern ./... does not contain modules'."
  - "Pin golangci-lint к v2.5.0 (not v2.x) — action's parseVersion regex rejects glob form; strict v1.2|v1.2.3 only."
  - "Single check-context preservation: govulncheck loops 9 modules inside one job (not matrix) — keeps verbatim job-`name:` `Vuln (govulncheck)` для Plan 04-05 branch-protection contract."
  - "Semgrep с `--severity ERROR --error` (blocks ERROR only; WARNING dropped to reduce noise per D-11)."

patterns-established:
  - "Workspace-aware scanner pattern: when services/backend uses go.work без top-level go.mod, run scanners inside each module's directory via shell loop"
  - "SARIF-less scanner gating: stdout output + exit-code-based blocking — viable replacement for GHAS-dependent Security tab on private repos"
  - "Negative-grep workflow guard с `grep -v '^#'` filter — prevents header-comment self-invalidation (RESEARCH Pitfall 6)"

requirements-completed: [CICD-01, SEC-01]

# Metrics
duration: ~110min
completed: 2026-05-18
---

# Phase 4 Plan 02: backend-ci.yml 8-service matrix + 5 scanners + Trivy + nightly cron secret scan

**CI now blocks merge на HIGH+CRITICAL findings via lint/gosec/govulncheck/semgrep/trivy + secrets via gitleaks/trufflehog (PR-diff) and Sunday-cron full-history scan; all 23 check contexts green on PR #1.**

## Performance

- **Duration:** ~110 min (incl. 2 CI iteration cycles)
- **Started:** 2026-05-18T12:00:00Z (approx)
- **Completed:** 2026-05-18T13:48:56Z
- **Tasks:** 5 (Tasks 1-4 file creation, Task 5 CI iteration к green)
- **Files modified/created:** 4 plan deliverables + 42 services/backend code fixes + .gitignore + 1 SUMMARY = 48 total
- **CI iterations until green:** 3 pushes (initial + 2 fix-rounds)
- **PR-#1:** https://github.com/IsmailL01/sport/pull/1

## First-green CI run record (sequence-guard для Plan 04-05)

- **first-green-CI-run-record:** `26037119000`
- **URL:** https://github.com/IsmailL01/sport/actions/runs/26037119000
- **SHA:** `8e7d850` (worktree commit; rebased onto origin/feat/cursona-redesign at push time)
- **Check contexts green:** 23
  - Test (Go 1.25) × 9 matrix entries (pkg + 8 services)
  - Docker build (no push, verify) × 8 matrix entries
  - Lint (golangci-lint v2)
  - SAST (gosec)
  - SAST (semgrep)
  - Vuln (govulncheck)
  - Secrets (gitleaks + trufflehog — PR diff)
  - Guard (no :latest)

`gh pr view 1 --json statusCheckRollup --jq '.statusCheckRollup[].conclusion' | sort -u` → `SUCCESS` only.

## Accomplishments

- 9-entry test matrix (was 3 hardcoded)
- 8-entry docker-build matrix (was 2 hardcoded) с per-service GHA cache scope + Trivy block-on-HIGH+CRITICAL
- 4 new scanner jobs: lint, gosec, semgrep, govulncheck — each gates merge
- gitleaks + trufflehog PR-diff scanner (closes SEC-01 ongoing-protection gap)
- Sunday-03:00-UTC nightly cron full-history secret scan workflow (workflow_dispatch trigger included)
- Conservative `.golangci.yml` v2 (13 linters) с baseline 0 issues across all 9 modules
- `.trivyignore.yaml` template с CVE+rationale+90d-expiry process documented
- `no-latest-tag-guard` standalone job (comment-line-stripped negative grep — RESEARCH Pitfall 6 mitigation)
- Top-level `permissions:` block (least-privilege incl. `pull-requests: read` для gitleaks API access)
- 8 verbatim job-`name:` strings pinned (Plan 04-05 branch-protection upstream contract satisfied)

## Task Commits

Each task committed atomically:

1. **Task 1: EXTEND `.github/workflows/backend-ci.yml`** — `75ed0c9` → rebased к `78eb778` (feat: 8-service matrix + 5 scanners + Trivy + :latest guard)
2. **Task 2: CREATE `.github/workflows/secret-scan-full.yml`** — `5554dec` → `be38305` (feat: nightly cron, closes SEC-01)
3. **Task 3 part A: CREATE `.golangci.yml`** — `508070d` → `a9e60be` (feat: golangci-lint v2 config)
4. **Task 3 part B: lint baseline code fixes** — `6ad3394` → `a30243f` (style: gofmt + 4 small lint fixes — Rule 1)
5. **Task 4: CREATE `.trivyignore.yaml`** — `b80b2dd` → `78ccf34` (feat: empty rationale-per-CVE template)
6. **Deviation Rule 3 fix: remove .claude/worktrees gitlinks** — `a6adde6` (fix: unblocks CI checkout)
7. **Iter 1: pin golangci-lint version, expand permissions, per-module scanners** — `b1e4f1f` (fix: 5 first-CI-run issues)
8. **Iter 2: drop SARIF (GHAS-only on private), per-module lint** — `8e7d850` (fix: final CI green)
9. **Plan SUMMARY** — (this commit will be created с docs(04-02): ...)

_Multiple commits per task were used because: Task 3 split into config + baseline-code-fix (separation of concerns); CI iteration produced fix commits beyond original task definitions (allowed per Plan 04-02 Task 5 spec)._

## Files Created/Modified

### Plan deliverables (4 files)
- `.github/workflows/backend-ci.yml` — extended от 89 к 187 lines
- `.github/workflows/secret-scan-full.yml` — new, 40 lines
- `.golangci.yml` — new, 87 lines
- `.trivyignore.yaml` — new, 30 lines (empty arrays)

### Deviation fixes (2 files)
- `.gitignore` — add `.claude/worktrees/` exclude
- 3 orphan gitlinks removed from index: `.claude/worktrees/agent-a2cf95f1a5cb08640` + `agent-a3105aec3440ccf87` + `agent-a5ba17aa0a2a6814b`

### Lint baseline fixes (42 files в services/backend/)
- `gofmt -w` applied к 39 files (doc-comment formatting drift из Go 1.19+ era)
- `pkg/clientversion/parse.go`: staticcheck S1008 — `if x { return false }; return true` → `return !x`
- `activity-sync/internal/repository/xp.go`: errorlint — `err == pgx.ErrNoRows` → `errors.Is(err, pgx.ErrNoRows)`
- `activity-sync/internal/handler/http_test.go`: govet httpresponse — check err before deferring `resp.Body.Close()`
- `social-graph/internal/service/svc.go`: staticcheck QF1001 — De Morgan rewrite of validUsername guard

## Decisions Made

1. **SARIF upload removed** — Code Scanning requires GHAS (GitHub Advanced Security, paid) на private repos. Scanners surface findings via stdout + step summary; block-on-HIGH gating preserved via exit codes. **accept_risk:** MEDIUM (Security tab integration would be nice; not blocking). Documented revisit-к-v1.0.1 (either enable GHAS OR make repo public after privacy-zone clipping в Phase 21).
2. **Shell-loop scanner pattern for workspace** — services/backend is go.work workspace без top-level go.mod. Upstream actions (`golangci-lint-action@v8` с `./...`, `govulncheck-action@v1` с `work-dir: services/backend`, `gosec ./... ` from там) all fail "no go.mod file" or "pattern ./... does not contain modules". Replaced с shell-loop per service. **Single check-context preserved** (Plan 04-05 contract): instead of matrix dimension (`Vuln (govulncheck) (pkg)`), one job loops 9 modules.
3. **golangci-lint v2.5.0 pinned** (not `v2.x`) — action's `parseVersion` regex strict v1.2|v1.2.3 only.
4. **semgrep `--severity ERROR --error`** — `--error` makes ERROR-level findings exit 1 (proper gating); dropped WARNING level to reduce noise per D-11 (WARNING-tier is advisory only).
5. **5 tactical `.golangci.yml` exclusions с revisit-v1.0.1 annotations** (NOT silent disables):
   - test files: relax errcheck/dupl/gocyclo/bodyclose/govet (legitimate test-code patterns)
   - `defer nc.Drain()` errcheck — NATS idempotent shutdown idiom
   - `defer tx.Rollback(ctx)` errcheck — pgx after-Commit idiom (returns intentional `tx.ErrTxClosed`)
   - `realtime-gw/internal/gw/*.go` contextcheck — WebSocket goroutines deliberately use long-lived `serverCtx`
6. **Gitleaks license decision: confirmed personal account** — `github.com/IsmailL01/sport` ownership=personal (verified в Plan 04-01); `GITLEAKS_LICENSE` env var stays commented в backend-ci.yml. Inline note ties decision к 04-01 ownership state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed orphan `.claude/worktrees/*` gitlinks blocking CI checkout**
- **Found during:** Task 5 (first CI run)
- **Issue:** 3 directory paths committed as gitlinks (mode 160000) by prior commit `91cfa9f` без `.gitmodules` entries. GitHub Actions `actions/checkout@v4` failed for ALL jobs с `fatal: No url found for submodule path '.claude/worktrees/agent-a2cf95f1a5cb08640' в .gitmodules`. Made CI unable to fetch repo on every job (test/lint/scanners/docker-build).
- **Fix:** `git rm --cached` of the 3 gitlinks; added `.claude/worktrees/` к `.gitignore` so parallel Claude Code worktrees never get staged again.
- **Files modified:** `.gitignore`, 3 deleted gitlink entries
- **Verification:** CI iter-1 checkout succeeded
- **Committed in:** `a6adde6` (was `e6df...` pre-rebase)

**2. [Rule 1 - Bug] gofmt drift в 39 files**
- **Found during:** Task 3 (first local `golangci-lint run`)
- **Issue:** Doc-comment indentation drift из Go 1.19+ formatter rules (tab-indent inside `//` doc comments). 39 files affected.
- **Fix:** `gofmt -w services/backend` — mechanical, no behavior change.
- **Files modified:** 39 services/backend `.go` files
- **Verification:** `gofmt -l services/backend` returns empty
- **Committed in:** `a30243f` (was `6ad3394` pre-rebase)

**3. [Rule 1 - Bug] 4 small lint findings fixed inline**
- **Found during:** Task 3 (first local `golangci-lint run` after gofmt -w)
- **Issue:** Real (not false-positive) lint findings: staticcheck S1008, errorlint, govet httpresponse, staticcheck QF1001.
- **Fix:** Inline edits (see Files Created/Modified for specifics).
- **Verification:** local `golangci-lint run --config=.golangci.yml ./...` → 0 issues per module
- **Committed in:** `a30243f`

**4. [Rule 3 - Blocking] CI iteration 1 — 5 first-run issues fixed**
- **Found during:** Task 5 (CI run 26036404564)
- **Issues + fixes:**
  - `version: v2.x` → `v2.5.0` (action parseVersion strict)
  - `permissions:` extend (`pull-requests: read` + `actions: read`)
  - `gosec ./...` from workspace root → per-module loop (workspace has no go.mod)
  - `govulncheck-action@v1 work-dir: services/backend` → shell loop per module (same root cause)
  - `semgrep ci --severity ...` → `semgrep scan --severity ERROR --error` (`ci` rejects `--severity`)
- **Committed in:** `b1e4f1f`

**5. [Rule 4 → accept_risk] CI iteration 2 — Code Scanning unavailable on private repo**
- **Found during:** Task 5 (CI run 26036773146)
- **Issue:** `github/codeql-action/upload-sarif@v3` fails on private repo без GHAS (paid). Scanner steps succeeded but SARIF upload step caused job failure.
- **Decision (accept_risk per Plan 04-02 instructions):** Remove SARIF uploads entirely. Scanners still run + still block merge on HIGH (via exit code), но findings surface via stdout instead of Security tab. Documented в `.golangci.yml` / scanner step comments с `revisit v1.0.1`.
- **Files modified:** `.github/workflows/backend-ci.yml` (4 jobs lose `upload-sarif` step; trivy switches from `format: sarif` к `format: table`)
- **Verification:** CI iter-2 (run 26037119000) all 23 checks green
- **Committed in:** `8e7d850`

---

**Total deviations:** 5 auto-fixed (3 Rule 3 blocking, 1 Rule 1 bug w/ 2 sub-fixes, 1 Rule 4 accept_risk).
**Impact on plan:** All deviations directly necessary for Task 5 acceptance ("all CI green"). None changed plan scope. accept_risk #5 is the only externally-visible compromise (Security tab integration deferred); plan's intent (block-on-HIGH) fully preserved.

## Iteration Log

| Iter | Run ID      | Outcome | Key Findings Addressed | Fix Commit |
|------|-------------|---------|------------------------|-----------|
| 1    | 26036404564 | 5 fail / 10 pass | golangci-lint version, permissions, workspace+gosec/govulncheck/semgrep, gitlinks | `a6adde6` + `b1e4f1f` |
| 2    | 26036773146 | 3 fail / 15 pass | SARIF upload (GHAS), lint workspace, semgrep CLI | `8e7d850` |
| 3    | 26037119000 | 0 fail / 23 pass | **ALL GREEN — sequence-guard satisfied** | (final state) |

## Exclusions added к `.golangci.yml` (each с rationale + revisit-v1.0.1)

| Rule | Linter(s) excluded | Path/pattern | Rationale |
|------|--------------------|--------------|-----------|
| 1 | errcheck, dupl, gocyclo, bodyclose, govet | `_test\.go` | Test-file relaxations — short-lived bodies; relaxed control-flow OK in tests. Revisit v1.0.1 если integration tests grow longer-running. |
| 2 | govet, gocyclo, errcheck | `*\.gen\.go` / `*_gen\.go` | Auto-generated files. |
| 3 | errcheck | text: `nc.Drain` | NATS connection drain on shutdown — error returned only when conn already closed (idempotent). Standard idiom. |
| 4 | errcheck | text: `tx.Rollback` | pgx idiom: Rollback after Commit returns intentional `tx.ErrTxClosed`. |
| 5 | contextcheck | `realtime-gw/internal/gw/.*\.go` | WebSocket per-connection goroutines deliberately use `serverCtx` (long-lived), not the request ctx (would cancel on HTTP handler exit). |

## Entries added к `.trivyignore.yaml`

**None — Trivy ran against все 8 service images and reported no HIGH+CRITICAL on multi-stage `gcr.io/distroless/static-debian12:nonroot` runtime base.** File ready for future entries with documented process (rationale + 90d-expiry).

## Issues Encountered

- **Pre-existing gitlinks от commit 91cfa9f ("c")** — incidental discovery during Task 5; would have blocked any future CI on this branch. Fixed inline as Rule 3 deviation.
- **Private repo + no GHAS = no SARIF Security tab** — common gotcha; documented decision + revisit-tag.
- **Workspace + actions assuming top-level go.mod** — golangci-lint-action, govulncheck-action, and `./...` invocations all hit this. Shell-loop replacement is verbose but explicit + reliable.

## SEC-01 Closure Confirmation

- **Phase 2 commits** `28acb2d..ac2ebd5` initially ran gitleaks + trufflehog as one-time scans (2026-05-16); CI invocation was deferred к Phase 4.
- **Phase 4 Plan 04-02 deliverable:**
  - `backend-ci.yml` `secrets-scan-diff` job: PR-diff gitleaks + trufflehog (every PR)
  - `secret-scan-full.yml`: Sunday-03:00-UTC cron full-history scan (gitleaks + trufflehog with `fetch-depth: 0`)
- **SEC-01 status:** **CLOSED** (ongoing protection wired).

## Patterns worth noting для Plan 04-03a (backend-cd.yml)

The shell-loop-per-module pattern from gosec/govulncheck/lint will also apply к anything в backend-cd.yml that traverses code (e.g., если CD adds an SBOM generation step с `syft`, it'll need per-module invocation на the workspace). The `:ci-${{ github.sha }}` vs `:${{ github.sha }}` tag distinction is now in active use; backend-cd.yml SHOULD use the bare-SHA form (no `ci-` prefix) so published images differ from CI verify-builds.

## Next Phase Readiness

- **Plan 04-05 sequence guard:** SATISFIED. First green CI run recorded (26037119000). Branch protection setup may proceed.
- **Plan 04-03a (backend-cd.yml):** Ready. Patterns established: per-service cache scope, workspace-aware scanner pattern, single check-context preservation.
- **Plan 04-03b (top-level Makefile):** No conflicts; `Makefile` already в `paths:` filter trigger of backend-ci.yml.
- **PR #1 status:** Open, 23/23 green. Recommended next step: merge PR (lands tuned `.golangci.yml` + `.trivyignore.yaml` к main + first green-run record for Plan 04-05) — deferred к Wave 4 per orchestrator instructions ("decision-к-merge defers к Wave 4").

## Self-Check

Verified before writing this Summary:

- `[ -f .github/workflows/backend-ci.yml ]` → FOUND
- `[ -f .github/workflows/secret-scan-full.yml ]` → FOUND
- `[ -f .golangci.yml ]` → FOUND
- `[ -f .trivyignore.yaml ]` → FOUND
- `git log --oneline | grep -F 8e7d850` → FOUND (CI-iter-2 final commit, run 26037119000 GREEN)
- All 8 verbatim job-`name:` strings grep verified (Task 1 acceptance loop)
- `! grep -q 'attest-build-provenance' .github/workflows/backend-ci.yml` → exits 0 (negative-grep fail-closed)
- `grep -qF 'tags: ghcr.io/ismaill01/${{ matrix.service }}:ci-${{ github.sha }}'` → present
- `gh pr view 1 --json statusCheckRollup --jq '.statusCheckRollup[].conclusion' | sort -u` → `["SUCCESS"]` only

## Self-Check: PASSED

---
*Phase: 04-ci-cd-pipeline*
*Plan: 02*
*Completed: 2026-05-18*
*First-green-CI-run-record: 26037119000 — sequence-guard for Plan 04-05 satisfied*
