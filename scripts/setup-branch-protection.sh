#!/usr/bin/env bash
# scripts/setup-branch-protection.sh
# Phase 4 / CICD-06 — branch protection setup for main.
#
# Idempotent: re-run is safe; gh api PUT overwrites existing config.
# Usage: ./scripts/setup-branch-protection.sh [<repo>] [<branch>]
#   defaults: repo=IsmailL01/sport branch=main
#
# SEQUENCE GUARD (RESEARCH Pitfall 1): MUST be run AFTER first green CI run on Plan 04-02.
# Enabling branch protection BEFORE first green CI run = lockout (cannot merge fixes
# if a required check has never passed).
#
# JOB-NAME CONTRACT: The 8 context strings below MUST match backend-ci.yml job `name:` fields
# verbatim (including em-dash `—` U+2014 in the secrets job). Primary enforcement of these
# strings lives in Plan 04-02 Task 1 verify (producer side). The cross-check loop in the
# calling plan (04-05 Task 1 verify) is defense-in-depth — catches late drift between waves.

set -euo pipefail

REPO="${1:-IsmailL01/sport}"
BRANCH="${2:-main}"

command -v gh >/dev/null 2>&1 || { echo "gh CLI not installed. brew install gh"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq not installed. brew install jq"; exit 1; }

echo "==> Applying branch protection to ${REPO}:${BRANCH}"
echo "==> 9 required status checks (8 from Plan 04-02 + pii-audit from Plan 05-03)"

gh api -X PUT "repos/${REPO}/branches/${BRANCH}/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
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
      "Guard (no :latest)",
      "PII Audit (slog grep)"
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

echo ""
echo "✓ Branch protection enabled on ${REPO}:${BRANCH}"
echo ""
echo "==> Verifying via read-back:"
gh api "repos/${REPO}/branches/${BRANCH}/protection" --jq '{
  required_status_checks_count: (.required_status_checks.contexts | length),
  required_reviewers: .required_pull_request_reviews.required_approving_review_count,
  enforce_admins: .enforce_admins.enabled,
  allow_force_pushes: .allow_force_pushes.enabled,
  allow_deletions: .allow_deletions.enabled,
  conversation_resolution: .required_conversation_resolution.enabled,
  contexts: .required_status_checks.contexts
}'
