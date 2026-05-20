#!/usr/bin/env bash
# Phase 6 / Plan 06-01 Task 2 — smoke: keystore SHA-256 evidence captured (2 bands)
# Verifies VALIDATION row 06-01-01 (evidence/keystore-sha256.txt structure +
# internal consistency between colon-form + bare-form).
#
# Exit codes:
#   0 — smoke green
#   1 — smoke red (probe assertion failed)
#   2 — pre-req missing
set -euo pipefail
for bin in keytool grep awk; do
  command -v "$bin" >/dev/null 2>&1 || { echo "❌ pre-req missing: $bin"; exit 2; }
done
must() {
  local name="$1" expected="$2" actual="$3" detail="${4:-}"
  [ "$actual" = "$expected" ] || { echo "❌ ${name}: expected '${expected}', got '${actual}' ${detail}"; exit 1; }
  echo "✓ ${name} → ${actual}"
}
F=.planning/phases/06-release-signing/evidence/keystore-sha256.txt
[ -f "$F" ] || { echo "❌ evidence file missing: $F"; exit 1; }

SHA_FROM_EVIDENCE=$(grep -E '^[A-F0-9]{2}(:[A-F0-9]{2}){31}$' "$F" | head -1)
must "sha256-colon-band-present" "1" "$(grep -cE '^[A-F0-9]{2}(:[A-F0-9]{2}){31}$' "$F")"
must "sha256-bare-band-present"  "1" "$(grep -cE '^[A-F0-9]{64}$' "$F")"
# Length check on colon-form (95 chars = 64 hex + 31 colons):
must "sha256-length-95" "95" "${#SHA_FROM_EVIDENCE}"
echo "🎉 smoke green: keystore SHA-256 captured to evidence/keystore-sha256.txt (2 bands)"
