#!/usr/bin/env bash
# Phase 6 / Plan 06-01 Task 3 — smoke: keystore SHA-256 evidence file internal consistency
# Verifies VALIDATION row 06-01-03 (file exists + both bands present + bare ≡ stripped-colons).
#
# Exit codes:
#   0 — smoke green
#   1 — smoke red (probe assertion failed)
#   2 — pre-req missing
set -euo pipefail
must() {
  local name="$1" expected="$2" actual="$3" detail="${4:-}"
  [ "$actual" = "$expected" ] || { echo "❌ ${name}: expected '${expected}', got '${actual}' ${detail}"; exit 1; }
  echo "✓ ${name} → ${actual}"
}
F=.planning/phases/06-release-signing/evidence/keystore-sha256.txt
must "file-exists" "1" "$([ -f "$F" ] && echo 1 || echo 0)"
must "colon-band-count" "1" "$(grep -cE '^[A-F0-9]{2}(:[A-F0-9]{2}){31}$' "$F")"
must "bare-band-count"  "1" "$(grep -cE '^[A-F0-9]{64}$' "$F")"
# Verify the bare form is the colon-stripped colon form:
COLON=$(grep -E '^[A-F0-9]{2}(:[A-F0-9]{2}){31}$' "$F" | head -1)
BARE=$(grep  -E '^[A-F0-9]{64}$'                  "$F" | head -1)
must "bare-equals-stripped-colon" "$BARE" "$(printf '%s' "$COLON" | tr -d ':')"
echo "🎉 smoke green: keystore SHA-256 evidence file has both bands, internally consistent"
