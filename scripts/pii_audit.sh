#!/usr/bin/env bash
# Phase 5 / OBS-06 / D-14 — grep audit for PII attr names in slog calls.
#
# Blocks PRs (via .github/workflows/backend-ci.yml `pii-audit` job + branch
# protection required-check) when a new slog.*Context call uses any
# attribute key in the D-12 PII deny-list.
#
# Defense-in-depth: pkg/observability slog handler drops these attrs at
# emit time anyway, but the grep gate keeps new call-sites visible — if
# an engineer types `slog.InfoContext(ctx, "x", "phone", phone)`, the PR
# fails fast instead of silently relying on the handler.
#
# Allowlist:
#   - identity/internal/service/otp.go line containing
#     `DebugContext.*otp dev-mode echo` — the gated D-13 emission that
#     ONLY runs when devMode=true AND LOG_LEVEL=debug AND even then
#     pkg/observability scrubs the "code" attr from output.
#
# Future engineers adding a second exception MUST update both the grep
# filter (LEAK pipeline below) AND this script header rationale.
#
# Exit codes:
#   0 = clean (no PII attribute names in slog calls)
#   1 = leak detected (offending lines printed to stderr)
#
set -euo pipefail

# 29 D-12 keys (must stay in lock-step with services/backend/pkg/observability/pii_deny_list.go)
PII_KEYS='code|otp_code|otp|phone|phone_number|phoneNumber|tel|displayName|display_name|external_uuid|strava_external_id|garmin_external_id|lat|lon|latitude|longitude|coords|gps|location|dm_content|message_body|mapbox_token|strava_token|jwt|access_token|refresh_token|password'

# Locate the repo root (works whether the script is invoked from anywhere)
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." &> /dev/null && pwd)"

cd "$REPO_ROOT"

# Match slog.*Context(...) calls whose first attr-name string literal
# matches a deny-list key. Excludes _test.go (tests intentionally exercise
# the scrub path with deny-list keys).
HITS="$(grep -rnE 'slog\.\w+Context\([^)]*"('"$PII_KEYS"')"' \
  --include='*.go' \
  --exclude='*_test.go' \
  services/backend/ \
  || true)"

# Allowlist filter: drop the legitimate D-13 OTP dev-mode line.
LEAK="$(echo "$HITS" | grep -v 'identity/internal/service/otp.go.*DebugContext.*otp dev-mode echo' || true)"

if [ -n "$LEAK" ]; then
    echo "❌ PII attribute leak detected — see grep hits below:" >&2
    echo "$LEAK" >&2
    echo "" >&2
    echo "    Defense-in-depth: handler still scrubs at emit-time, but" >&2
    echo "    call-sites must use scrubbed alternatives (email_hash," >&2
    echo "    user_cohort buckets) — or, if a new legitimate exception" >&2
    echo "    is required, update the allowlist filter in this script" >&2
    echo "    AND the header rationale before merging." >&2
    exit 1
fi

echo "✓ PII grep audit clean — no slog calls use D-12 deny-list attribute names"
exit 0
