#!/usr/bin/env bash
# services/backend/scripts/drill_assert_schema.sh
# Phase 4 / CICD-04 — drill scenario schema assertion.
#
# Usage:
#   bash drill_assert_schema.sh expect-present   # exit 0 if users.metadata exists, exit 1 if absent
#   bash drill_assert_schema.sh expect-absent    # exit 0 if users.metadata absent, exit 1 if present
#
# Called by Makefile rollback-drill target + by user-supervised drill в Plan 04-04.

set -euo pipefail

EXPECTATION="${1:-}"
VPS_HOST="${VPS_HOST:-deploy@148.253.214.156}"

if [[ "$EXPECTATION" != "expect-present" && "$EXPECTATION" != "expect-absent" ]]; then
  echo "Usage: $0 {expect-present|expect-absent}" >&2
  echo "       (VPS_HOST override via env: VPS_HOST=deploy@<ip> bash $0 expect-present)" >&2
  exit 1
fi

command -v ssh >/dev/null 2>&1 || { echo "ssh not installed"; exit 1; }

echo "==> Querying prod DB ($VPS_HOST) для users.metadata column existence..."

# information_schema.columns returns 1 if column exists, empty if not.
# psql -tA = tuples-only + unaligned = pure value output.
RESULT=$(ssh "$VPS_HOST" "sudo docker exec re_postgres psql -U re -d running_ecosystem -tAc \"SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='metadata'\"")

# Trim whitespace
RESULT_TRIMMED=$(echo "$RESULT" | tr -d '[:space:]')

if [[ "$EXPECTATION" == "expect-present" ]]; then
  if [[ "$RESULT_TRIMMED" == "1" ]]; then
    echo "✓ ASSERTION PASS: users.metadata IS PRESENT (expected present)"
    exit 0
  else
    echo "✗ ASSERTION FAIL: users.metadata IS ABSENT (expected present)" >&2
    echo "  (psql returned: '$RESULT_TRIMMED')" >&2
    exit 1
  fi
else  # expect-absent
  if [[ -z "$RESULT_TRIMMED" ]]; then
    echo "✓ ASSERTION PASS: users.metadata IS ABSENT (expected absent)"
    exit 0
  else
    echo "✗ ASSERTION FAIL: users.metadata IS PRESENT (expected absent)" >&2
    echo "  (psql returned: '$RESULT_TRIMMED')" >&2
    exit 1
  fi
fi
