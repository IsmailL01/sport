#!/usr/bin/env bash
# Phase 6 / Plan 06-01 + 06-02 — umbrella smoke runner.
# Exits 0 only if ALL implemented sub-smokes are green.
# Sub-smokes still in Wave-0 stub state (exit 2) cause overall exit 2 (NOT 1) — they're pending implementation, not failures.
#
# Exit codes:
#   0 — all sub-smokes green
#   1 — at least one sub-smoke failed (red)
#   2 — at least one sub-smoke still in stub state (pending)
set -uo pipefail
cd "$(dirname "$0")"
SMOKES=(
  smoke-keystore-generated.sh
  smoke-sops-roundtrip.sh
  smoke-sha256-captured.sh
  smoke-ios-cert-roundtrip.sh
  smoke-ios-provprofile.sh
  smoke-asc-api-key.sh
)
PASS=0; FAIL=0; PENDING=0
for s in "${SMOKES[@]}"; do
  echo "--- $s ---"
  bash "$s"; rc=$?
  case "$rc" in
    0) PASS=$((PASS+1));;
    2) PENDING=$((PENDING+1)); echo "(pending — sub-smoke not yet implemented)";;
    *) FAIL=$((FAIL+1));;
  esac
done
echo
echo "=== umbrella summary: PASS=$PASS FAIL=$FAIL PENDING=$PENDING ==="
[ "$FAIL" -eq 0 ] || { echo "❌ umbrella red ($FAIL failures)"; exit 1; }
[ "$PENDING" -eq 0 ] || { echo "⏳ umbrella pending ($PENDING stubs); exit 2"; exit 2; }
echo "🎉 umbrella green: all $PASS sub-smokes green"
