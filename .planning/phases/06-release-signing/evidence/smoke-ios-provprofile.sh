#!/usr/bin/env bash
# Phase 6 / Plan 06-02 Task 3 — smoke: iOS provisioning profile .mobileprovision UUID match
# Verifies VALIDATION row 06-02-02 (will be implemented in Plan 06-02).
#
# Exit codes:
#   0 — smoke green
#   1 — smoke red (probe assertion failed)
#   2 — pre-req missing OR stub not yet implemented (Wave 0 default)
set -euo pipefail
for bin in sops yq base64; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "❌ pre-req missing: $bin (see 06-VALIDATION.md §Wave 0)"; exit 2; }
done
must() {
  local name="$1" expected="$2" actual="$3" detail="${4:-}"
  if [ "$actual" != "$expected" ]; then
    echo "❌ ${name}: expected '${expected}', got '${actual}' ${detail}"; exit 1
  fi
  echo "✓ ${name} → ${actual}"
}
# Wave 0 stub — Plan 06-02 Task 3 will replace this body with the real probe.
echo "Wave 0 stub — smoke-ios-provprofile.sh not yet implemented (see Plan 06-02 Task 3)"
exit 2
