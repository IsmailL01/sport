#!/usr/bin/env bash
# Phase 2 / SEC-01 — D-08 — pre-commit installer for new dev workstations.
# Run once per laptop after cloning the repo.
#
# Idempotent: re-running just re-installs the hook (no-op if already current).

set -euo pipefail

command -v pre-commit >/dev/null 2>&1 || {
    echo "pre-commit not installed. Run: brew install pre-commit (or: pip install pre-commit==4.6.0)"
    exit 1
}

cd "$(git rev-parse --show-toplevel)"
pre-commit install
echo "OK pre-commit hook installed at .git/hooks/pre-commit"
echo "   Verify: pre-commit run --all-files"
