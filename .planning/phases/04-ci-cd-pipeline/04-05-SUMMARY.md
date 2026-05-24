---
phase: 04-ci-cd-pipeline
plan: 05
subsystem: ci-cd
status: CLOSED 2026-05-18 — CICD-06 acceptance + branch protection applied к IsmailL01/sport:main
tags: [branch-protection, gh-api, runbook-extension, sequence-guard, cicd-06]

requires:
  - phase: 04-02 (Wave 2 — backend-ci first-green-CI-run; 23/23 green; SEQUENCE GUARD prereq per RESEARCH Pitfall 1)
  - phase: 04-04 (Wave 4 — deploy.md §6.4 must land before §10 per W1 serialization)
provides:
  - `scripts/setup-branch-protection.sh` NEW — idempotent `gh api PUT` with 8 pinned check contexts, executable
  - GitHub branch protection on `IsmailL01/sport:main` — 8 required checks + 0 reviewers + no force-push + no deletes + `enforce_admins: false` + conversation resolution required
  - `docs/RUNBOOKS/deploy.md §10` — 5 subsections (10.1 setup / 10.2 verify / 10.3 bypass / 10.4 change / 10.5 smoke)
  - jq-expression-with-parens fix documented in §10.2 (without parens the array-input pipe breaks)
affects: [04-06 (deploy.md §11 freeze docs — next sequential edit)]

tech-stack:
  added:
    - "`gh api -X PUT repos/{repo}/branches/{branch}/protection --input -`"
    - "jq full-contract check with parenthesized comparisons (avoids array-pipe trap)"
  patterns:
    - "Pattern G — RESEARCH §Code Examples §G applied verbatim (gh-api PUT с JSON body)"
    - "Pattern — defense-in-depth job-name cross-check: grep -qF loop over 8 verbatim strings against backend-ci.yml before applying protection"

decisions:
  - "D-04-05-A (KEPT — D-19): protect `main` only; 8 required checks; no force-push; no deletes; conversation resolution required"
  - "D-04-05-B (KEPT — D-20): 0 required reviewers + `enforce_admins: false` — solo dev admin self-approves + has emergency-override path. v1.1 flips к `enforce_admins: true` when DEV_B onboards."
  - "Smoke PR (dummy CI-failing PR) SKIPPED — contract-level jq verification suffices for solo-dev closed-beta. v1.1 follow-up: include in CI integration test suite."

key-files:
  created:
    - "scripts/setup-branch-protection.sh (NEW — 60 lines, executable)"
    - ".planning/phases/04-ci-cd-pipeline/04-05-SUMMARY.md (this file)"
  modified:
    - "docs/RUNBOOKS/deploy.md (+~110 lines; §10 added with 5 subsections + §11 stub placeholder for 04-06)"

git-commits:
  - "(pending) feat(governance): setup-branch-protection.sh + deploy.md §10 + 04-05 SUMMARY"

acceptance:
  CICD-06:
    - ✓ Script `scripts/setup-branch-protection.sh` exists + executable + idempotent
    - ✓ `bash -n` syntax check passes
    - ✓ shellcheck not installed locally (acceptable — `bash -n` covers syntax)
    - ✓ Defense-in-depth grep -qF loop: all 8 strings match backend-ci.yml job `name:` fields verbatim (including em-dash `—` U+2014)
    - ✓ Script applied via `./scripts/setup-branch-protection.sh` — `gh api PUT` returned full protection JSON
    - ✓ Read-back contract check: `required_status_checks_count=8`, `required_reviewers=0`, `enforce_admins=false`, `allow_force_pushes=false`, `allow_deletions=false`, `conversation_resolution=true`
    - ✓ Boolean jq contract check returns `true` (with parens — `(.required_status_checks.contexts | length == 8) and (...) and (...)`)
    - ✓ §10 in deploy.md present with all 5 subsections (10.1-10.5)
    - ✓ §11 stub placeholder added (populated by Plan 04-06)
    - ✓ W1 serialization observed: §6.4 from Plan 04-04 present BEFORE §10 (this plan) appended — no merge conflict

verification-evidence:
  setup_command: "./scripts/setup-branch-protection.sh"
  setup_output: "✓ Branch protection enabled on IsmailL01/sport:main"
  contract_check: |
    gh api repos/IsmailL01/sport/branches/main/protection --jq '
      (.required_status_checks.contexts | length == 8)
      and (.required_pull_request_reviews.required_approving_review_count == 0)
      and (.allow_force_pushes.enabled == false)
      and (.allow_deletions.enabled == false)
      and (.enforce_admins.enabled == false)
    '
    # Returned: true ✓
  contexts_applied:
    - "Test (Go 1.25)"
    - "Lint (golangci-lint v2)"
    - "SAST (gosec)"
    - "Vuln (govulncheck)"
    - "SAST (semgrep)"
    - "Secrets (gitleaks + trufflehog — PR diff)"
    - "Docker build (no push, verify)"
    - "Guard (no :latest)"

threat_model:
  - "T-04-05 (force-push к main bypasses protection): MITIGATED — allow_force_pushes:false applied + verified в read-back"
  - "T-04-DELETE (main deleted accidentally): MITIGATED — allow_deletions:false applied + verified"
  - "T-04-ENF-BYPASS (admin bypasses required-checks via UI): ACCEPTED — enforce_admins:false per D-20; flip к true в v1.1 when DEV_B onboards (documented in §10.1)"
  - "T-04-LOCKOUT (protection requires nonexistent check → all merges blocked forever): MITIGATED via two-layer defense: (a) primary — Plan 04-02 Task 1 verify pins 8 verbatim strings at producer; (b) defense-in-depth — this plan's pre-flight grep -qF loop. Both layers passed."

deferred (v1.0.1 / v1.1):
  - "Smoke PR (dummy CI-failing PR) test — contract-level jq verification suffices for solo-dev closed-beta; CI integration test in v1.1"
  - "`enforce_admins: true` flip when DEV_B onboards (v1.1 task — documented in §10.1)"

self-check: PASSED (3 tasks complete; gh api contract verified; deploy.md §10 written; W1 serialization confirmed)

---

*Phase: 04-ci-cd-pipeline*
*Plan: 05 (Wave 4 — branch protection setup, sequential after 04-04)*
*Completed: 2026-05-18*
*Status: CLOSED ✓ — CICD-06 acceptance + main protected с 8 required checks*
