#!/usr/bin/env bash
# Phase 8 Plan 08-01 Wave 0 — umbrella smoke
# Runs all task-specific smokes that have been populated.
set -euo pipefail

cd "$(dirname "$0")"
echo "=== Phase 8 Plan 08-01 — umbrella smoke ==="

run_if_populated() {
  local script="$1"
  if [ ! -x "$script" ]; then
    echo "  ⏭ $script not executable; skipping"
    return 0
  fi
  if head -5 "$script" | grep -q "stub for Task"; then
    echo "  ⏭ $script is a stub; skipping (populated when its Task executes)"
    return 0
  fi
  echo "--- $script ---"
  bash "$script" || { echo "  ❌ $script FAILED"; return 1; }
  echo "  ✓ $script green"
}

run_if_populated smoke-manifest-sign-roundtrip.sh
run_if_populated smoke-release-distribute.sh
run_if_populated smoke-mobile-update-flow.sh

echo ""
echo "🎉 umbrella smoke green (any unpopulated stubs skipped)"
