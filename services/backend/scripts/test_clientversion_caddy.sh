#!/usr/bin/env bash
# test_clientversion_caddy.sh — integration smoke for X-Client-Version + Caddy passthrough.
#
# Phase 1 / REL-02 (Plan 01-02 Task 1 Subtask C).
#
# Что проверяем:
#   1. Skip-path /healthz возвращает 200 без X-Client-Version (graceful).
#   2. Защищённый endpoint с старым X-Client-Version: 0.9.0 (12) → HTTP 426
#      + JSON body { error: "client_too_old", min_version: "1.0.0", ... }.
#   3. Защищённый endpoint с допустимым X-Client-Version: 1.0.0 (1) → проходит
#      middleware, далее отвечает 401 (нет JWT) или 200 (если endpoint открытый).
#      Главное — НЕ 426.
#
# Подразумевает что docker-compose стек запущен (gateway/identity), Caddy слушает :8080.
# Если стэк не поднят — выходит с информативным сообщением, не падает CI.
#
# Usage:
#   bash services/backend/scripts/test_clientversion_caddy.sh
#   GATEWAY_URL=http://localhost:8080 bash ./scripts/test_clientversion_caddy.sh

set -u

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
ENDPOINT_HEALTH="${ENDPOINT_HEALTH:-/healthz}"
ENDPOINT_GUARDED="${ENDPOINT_GUARDED:-/me}"

PASS=0
FAIL=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

check_gateway_alive() {
  if ! curl -sf -o /dev/null --max-time 3 "${GATEWAY_URL}${ENDPOINT_HEALTH}"; then
    blue "Caddy gateway at ${GATEWAY_URL} is not reachable."
    blue "This script is a manual runbook step — start docker-compose first:"
    blue "  cd services/backend && docker compose up -d gateway identity"
    blue "Then re-run this script. Exit 0 (skip, not fail) for CI friendliness."
    exit 0
  fi
}

assert_status() {
  local got="$1" expected="$2" label="$3"
  if [[ "$got" == "$expected" ]]; then
    green "PASS [${label}] got status ${got} (expected ${expected})"
    PASS=$((PASS+1))
  else
    red "FAIL [${label}] got status ${got}, expected ${expected}"
    FAIL=$((FAIL+1))
  fi
}

assert_contains() {
  local body="$1" needle="$2" label="$3"
  if [[ "$body" == *"$needle"* ]]; then
    green "PASS [${label}] body contains \"${needle}\""
    PASS=$((PASS+1))
  else
    red "FAIL [${label}] body missing \"${needle}\""
    red "  body: $body"
    FAIL=$((FAIL+1))
  fi
}

check_gateway_alive

# --- Test 1: skip-path bypasses without header ---
status=$(curl -s -o /dev/null -w "%{http_code}" "${GATEWAY_URL}${ENDPOINT_HEALTH}")
assert_status "$status" "200" "skip-path /healthz no header"

# --- Test 2: skip-path bypasses even with old version (defensive) ---
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Client-Version: 0.0.1" \
  "${GATEWAY_URL}${ENDPOINT_HEALTH}")
assert_status "$status" "200" "skip-path with old X-Client-Version still 200"

# --- Test 3: guarded path with too-old client → 426 + structured body ---
response=$(curl -s -w "\n---STATUS:%{http_code}" \
  -H "X-Client-Version: 0.9.0 (12)" \
  "${GATEWAY_URL}${ENDPOINT_GUARDED}")
status="${response##*---STATUS:}"
body="${response%---STATUS:*}"
assert_status "$status" "426" "guarded path with old version"
assert_contains "$body" "client_too_old" "426 body has error code"
assert_contains "$body" "min_version" "426 body has min_version"
assert_contains "$body" "force_update_url_android" "426 body has android URL"
assert_contains "$body" "force_update_url_ios" "426 body has ios URL"

# --- Test 4: guarded path with at-min client → middleware passes; downstream may 401 (no JWT) ---
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Client-Version: 1.0.0 (1)" \
  "${GATEWAY_URL}${ENDPOINT_GUARDED}")
if [[ "$status" == "426" ]]; then
  red "FAIL [guarded with current version] got 426 — middleware wrongly rejected current client"
  FAIL=$((FAIL+1))
else
  green "PASS [guarded with current version] status ${status} (not 426 — middleware passed)"
  PASS=$((PASS+1))
fi

# --- Test 5: guarded path with malformed header → middleware passes through (graceful) ---
status=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Client-Version: garbage" \
  "${GATEWAY_URL}${ENDPOINT_GUARDED}")
if [[ "$status" == "426" ]]; then
  red "FAIL [malformed header] got 426 — graceful pass-through broken"
  FAIL=$((FAIL+1))
else
  green "PASS [malformed header] status ${status} (passed through, not 426)"
  PASS=$((PASS+1))
fi

echo
echo "==============================="
echo "PASS=${PASS} FAIL=${FAIL}"
echo "==============================="
if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
