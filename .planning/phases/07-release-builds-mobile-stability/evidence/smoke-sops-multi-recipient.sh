#!/usr/bin/env bash
set -euo pipefail
# Phase 7 Plan 07-01 Task 1 — SOPS multi-recipient smoke
# Verifies that .sops.yaml has 2+ age recipients AND DEV_A key still decrypts cleanly.
# (CI-key decrypt path is exercised by the GH Actions workflow itself — Task 5.)

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# 1. Recipient count check — .sops.yaml must list ≥2 age public keys.
RECIPIENT_COUNT=$(grep -c "age1" .sops.yaml || true)
if [ "$RECIPIENT_COUNT" -lt 2 ]; then
  echo "FAIL: .sops.yaml has $RECIPIENT_COUNT age recipient(s); expected >=2 (DEV_A + CI)"
  exit 1
fi

# 2. DEV_A decrypt — must produce known plaintext field from mobile-signing.yaml.
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
[ -f "$SOPS_AGE_KEY_FILE" ] || { echo "FAIL: SOPS_AGE_KEY_FILE missing at $SOPS_AGE_KEY_FILE"; exit 1; }

KEY_ALIAS=$(sops -d .secrets/prod/mobile-signing.yaml | yq -r '.android.key_alias')
if [ "$KEY_ALIAS" != "runningecosystem-release" ]; then
  echo "FAIL: DEV_A decrypt of mobile-signing.yaml broken (alias=$KEY_ALIAS)"
  exit 1
fi

# 3. Smoke all 5 prod YAMLs decrypt under DEV_A.
for f in .secrets/prod/mobile-signing.yaml \
         .secrets/prod/mapbox.yaml \
         .secrets/prod/shared.yaml \
         .secrets/prod/oauth.yaml \
         .secrets/prod/sentry.yaml; do
  sops -d "$f" > /dev/null 2>&1 || { echo "FAIL: DEV_A cannot decrypt $f"; exit 1; }
done

echo "✓ SOPS multi-recipient OK ($RECIPIENT_COUNT recipients; all 5 prod YAMLs decrypt under DEV_A)"
