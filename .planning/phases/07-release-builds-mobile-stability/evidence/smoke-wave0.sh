#!/usr/bin/env bash
set -euo pipefail
# Phase 7 Plan 07-01 Task 0 — Wave 0 umbrella smoke
# Verifies all per-task smoke scripts exist + green at end of Wave 1 close.
HERE="$(cd "$(dirname "$0")" && pwd)"

for script in smoke-sops-multi-recipient.sh smoke-eas-config.sh smoke-gradle-config.sh smoke-proguard-rules.sh; do
  [ -x "$HERE/$script" ] || { echo "FAIL: $script not executable"; exit 1; }
done

echo "✓ Wave 0 umbrella OK — 4 per-task smoke scripts present + executable"
