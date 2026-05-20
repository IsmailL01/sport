#!/usr/bin/env bash
# Phase 6 / Plan 06-01 Task 3 — smoke: SOPS → base64 → keystore round-trip
# Verifies VALIDATION row 06-01-02. Decrypts the SOPS file fresh, extracts the
# keystore via base64 -d, invokes keytool to list the alias, and verifies the
# SHA-256 matches the captured evidence.
#
# Exit codes:
#   0 — smoke green
#   1 — smoke red (probe assertion failed)
#   2 — pre-req missing
#
# Required env vars (if SOPS default lookup doesn't find the age key):
#   SOPS_AGE_KEY_FILE — path to age private key (~/.config/sops/age/keys.txt)
set -euo pipefail
for bin in sops yq keytool base64 awk grep; do
  command -v "$bin" >/dev/null 2>&1 || { echo "❌ pre-req missing: $bin"; exit 2; }
done
must() {
  local name="$1" expected="$2" actual="$3" detail="${4:-}"
  [ "$actual" = "$expected" ] || { echo "❌ ${name}: expected '${expected}', got '${actual}' ${detail}"; exit 1; }
  echo "✓ ${name} → ${actual}"
}
# Provide a sensible default for SOPS_AGE_KEY_FILE if unset:
: "${SOPS_AGE_KEY_FILE:=$HOME/.config/sops/age/keys.txt}"
export SOPS_AGE_KEY_FILE

TMP=$(mktemp -d -t sport-sign-XXXXXX)
trap 'rm -rf "$TMP"; unset VER_PASS' EXIT

sops -d .secrets/prod/mobile-signing.yaml \
  | yq -r '.android.keystore_base64' \
  | base64 -d > "$TMP/keystore.p12"

export VER_PASS=$(sops -d .secrets/prod/mobile-signing.yaml | yq -r '.android.keystore_password')

LISTING=$(keytool -list -keystore "$TMP/keystore.p12" -storepass:env VER_PASS 2>&1 \
  | grep -c 'runningecosystem-release' || true)
must "alias-present-in-roundtrip" "1" "$LISTING"

SHA_RT=$(keytool -list -v -keystore "$TMP/keystore.p12" -alias runningecosystem-release \
  -storepass:env VER_PASS 2>&1 | awk '/SHA256:/ {print $2; exit}')
SHA_ORIG=$(grep -E '^[A-F0-9]{2}(:[A-F0-9]{2}){31}$' .planning/phases/06-release-signing/evidence/keystore-sha256.txt | head -1)
must "sha256-roundtrip-matches-original" "$SHA_ORIG" "$SHA_RT"

echo "🎉 smoke green: SOPS round-trip → base64 -d → keytool lists alias + SHA-256 matches"
