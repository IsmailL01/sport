#!/usr/bin/env bash
# debug-tail.sh — tail Loki by user-id for closed-beta debug-on-demand ops
#
# Usage:
#   scripts/debug-tail.sh <user-id> [--since 30m] [--service identity]
#
# Examples:
#   scripts/debug-tail.sh 1c8a2f3e-...
#   scripts/debug-tail.sh 1c8a2f3e-... --since 1h
#   scripts/debug-tail.sh 1c8a2f3e-... --service activity-sync --since 15m
#
# Per ADR-0011: this script is the solo-dev operational substitute for the
# dropped OBS-08 mobile Settings toggle. Queries Loki on srv1561293 via
# Caddy at https://82-25-71-215.sslip.io:8443 (self-signed cert, basicauth).
#
# Auth: reads LOKI_BASICAUTH from SOPS-decrypted .secrets/prod/sentry.yaml
# (key path: grafana.basicauth_b64). Falls back to LOKI_BASICAUTH env var
# if SOPS isn't on PATH.

set -euo pipefail

LOKI_BASE="${LOKI_BASE:-https://82-25-71-215.sslip.io:8443/loki/api/v1}"
SOPS_PATH=".secrets/prod/sentry.yaml"

USER_ID="${1:-}"
SINCE="30m"
SERVICE=""

shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --since)   SINCE="$2"; shift 2 ;;
    --service) SERVICE="$2"; shift 2 ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$USER_ID" ]; then
  echo "usage: scripts/debug-tail.sh <user-id> [--since 30m] [--service NAME]" >&2
  exit 2
fi

# Resolve basicauth: env var wins if set, else SOPS, else fail
if [ -z "${LOKI_BASICAUTH:-}" ]; then
  if command -v sops >/dev/null 2>&1 && [ -f "$SOPS_PATH" ]; then
    LOKI_BASICAUTH="$(sops -d "$SOPS_PATH" | grep -E '^[[:space:]]*basicauth_b64:' | head -1 | sed -E 's/^[[:space:]]*basicauth_b64:[[:space:]]*//; s/^"//; s/"$//')"
  fi
fi

if [ -z "${LOKI_BASICAUTH:-}" ]; then
  echo "FATAL: LOKI_BASICAUTH not set in env, and could not decrypt $SOPS_PATH via sops." >&2
  echo "Either: export LOKI_BASICAUTH='base64(user:pass)'  OR  ensure sops can read $SOPS_PATH." >&2
  exit 3
fi

# Build LogQL: scrub_status="OK" filters out PII-scrubber drops; we want pre-scrub user_id matches.
# user_id appears in slog default attrs (per pkg/observability/slog_handler.go) — quoted JSON match.
if [ -n "$SERVICE" ]; then
  QUERY="{service=\"$SERVICE\"} | json | user_id=\"$USER_ID\""
else
  QUERY="{job=~\".+\"} | json | user_id=\"$USER_ID\""
fi

echo "==> Querying Loki: $LOKI_BASE/query_range" >&2
echo "==> LogQL: $QUERY" >&2
echo "==> Since: $SINCE" >&2
echo "" >&2

# query_range is the right endpoint for time-windowed log retrieval; tail (/tail) is for live streaming
# via WebSocket which curl doesn't speak natively. Use query_range with start=now-SINCE end=now.
END_NS=$(date -u +%s%N)
case "$SINCE" in
  *h) START_NS=$(( END_NS - ${SINCE%h} * 3600 * 1000000000 )) ;;
  *m) START_NS=$(( END_NS - ${SINCE%m} * 60 * 1000000000 )) ;;
  *s) START_NS=$(( END_NS - ${SINCE%s} * 1000000000 )) ;;
  *)  echo "unknown SINCE format (use 30m, 1h, 90s): $SINCE" >&2; exit 2 ;;
esac

# --insecure: self-signed cert per D-37; --silent + --show-error: clean output unless error
curl --silent --show-error --insecure \
  --header "Authorization: Basic $LOKI_BASICAUTH" \
  --get \
  --data-urlencode "query=$QUERY" \
  --data-urlencode "start=$START_NS" \
  --data-urlencode "end=$END_NS" \
  --data-urlencode "limit=1000" \
  --data-urlencode "direction=forward" \
  "$LOKI_BASE/query_range" \
| python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"FATAL: Loki returned non-JSON (likely HTML error page): {e}", file=sys.stderr)
    sys.exit(4)

status = data.get("status")
if status != "success":
    print(f"FATAL: Loki status={status}: {data}", file=sys.stderr)
    sys.exit(4)

streams = data.get("data", {}).get("result", [])
if not streams:
    print("(no matching log lines in window)", file=sys.stderr)
    sys.exit(0)

count = 0
for stream in streams:
    labels = stream.get("stream", {})
    svc = labels.get("service", labels.get("job", "?"))
    for ts_ns, line in stream.get("values", []):
        ts_s = int(ts_ns) // 1_000_000_000
        from datetime import datetime, timezone
        ts_iso = datetime.fromtimestamp(ts_s, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        print(f"{ts_iso} [{svc}] {line}")
        count += 1

print(f"\n--- {count} log lines matched user_id={sys.argv[1]} ---", file=sys.stderr)
' "$USER_ID"
