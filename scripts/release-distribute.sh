#!/usr/bin/env bash
# Phase 8 Plan 08-01 Task 3 — release distribution pipeline.
#
# Invoked by .github/workflows/android-release.yml AFTER EAS Cloud .aab build
# completes + bundletool has extracted the universal APK to $APK_PATH.
#
# Performs:
#   1. mc alias setup (MinIO client)
#   2. APK upload to private `android-releases` bucket
#   3. Generate 24h presigned URL for the APK
#   4. Build canonical manifest JSON + sign with Ed25519 (Go inline)
#   5. Round-trip self-verify
#   6. Upload signed manifest to public-read `android-manifest` bucket (LAST step
#      — atomicity per CONTEXT D-21: if anything before this fails, no one ever
#      sees the new manifest pointing at the new APK)
#   7. Re-fetch + re-verify (catches MinIO-side corruption)
#
# Required env vars (workflow caller sets):
#   MINIO_ACCESS_KEY       — service-account access key (Task 2 provisioning)
#   MINIO_SECRET_KEY       — service-account secret key
#   MANIFEST_SIGNING_PRIVATE — Ed25519 seed base64 (SOPS-decrypted via workflow step)
#   MANIFEST_SIGNING_PUBLIC  — Ed25519 pubkey base64 (for self-verify; non-secret)

set -euo pipefail

APK_PATH="${1:?usage: release-distribute.sh <apk-path> <tag-name> <version-code>}"
TAG_NAME="${2:?usage: release-distribute.sh <apk-path> <tag-name> <version-code>}"
VERSION_CODE="${3:?usage: release-distribute.sh <apk-path> <tag-name> <version-code>}"
VERSION="${TAG_NAME#v}"

: "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY env var required}"
: "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY env var required}"
: "${MANIFEST_SIGNING_PRIVATE:?MANIFEST_SIGNING_PRIVATE env var required}"
: "${MANIFEST_SIGNING_PUBLIC:?MANIFEST_SIGNING_PUBLIC env var required}"

MINIO_ENDPOINT="${MINIO_ENDPOINT:-https://s3.148-253-214-156.sslip.io}"
RELEASES_BUCKET="${RELEASES_BUCKET:-android-releases}"
MANIFEST_BUCKET="${MANIFEST_BUCKET:-android-manifest}"

echo "→ APK: $APK_PATH"
echo "→ Tag: $TAG_NAME (version $VERSION)"
echo "→ Endpoint: $MINIO_ENDPOINT"

# 1. Configure mc (Pitfall 8 — Caddy serves MinIO via Let's Encrypt cert; mc validates by default)
mc alias set sport-prod "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
echo "✓ mc alias configured"

# 2. Compute APK metadata
APK_SHA256=$(sha256sum "$APK_PATH" | awk '{print $1}')
APK_SIZE=$(stat -c%s "$APK_PATH" 2>/dev/null || stat -f%z "$APK_PATH")  # GNU stat or BSD stat
echo "→ APK sha256: $APK_SHA256"
echo "→ APK size:   $APK_SIZE bytes"

# 3. Upload APK (private bucket)
mc cp "$APK_PATH" "sport-prod/${RELEASES_BUCKET}/${TAG_NAME}.apk"
echo "✓ APK uploaded to ${RELEASES_BUCKET}/${TAG_NAME}.apk"

# 4. Generate 24h presigned URL (RESEARCH Pitfall 10 — `mc share download` output
# parsing is fragile; use robust regex over multiple mc versions)
APK_URL=$(mc share download --expire 24h "sport-prod/${RELEASES_BUCKET}/${TAG_NAME}.apk" 2>/dev/null \
           | grep -oE 'https://[^[:space:]]+' | head -1)
[ -n "$APK_URL" ] || { echo "❌ FAIL: could not parse presigned URL from 'mc share download'"; exit 1; }
echo "✓ presigned URL generated (truncated for log): ${APK_URL:0:80}..."

# 5. Build canonical manifest + sign + self-verify
RELEASED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MIN_SUPPORTED_VERSION="${VERSION}"  # default: same as version

MANIFEST_OUT=$(mktemp)
trap 'rm -f "$MANIFEST_OUT" "${RT_PATH:-}"' EXIT

go run scripts/sign-manifest.go \
  --version="${VERSION}" \
  --version-code="${VERSION_CODE}" \
  --min-supported-version="${MIN_SUPPORTED_VERSION}" \
  --apk-url="${APK_URL}" \
  --apk-sha256="${APK_SHA256}" \
  --apk-size-bytes="${APK_SIZE}" \
  --released-at="${RELEASED_AT}" \
  --private-key-base64="${MANIFEST_SIGNING_PRIVATE}" \
  --output="${MANIFEST_OUT}"
echo "✓ manifest signed"

go run scripts/verify-manifest.go --manifest="${MANIFEST_OUT}" --public-key-base64="${MANIFEST_SIGNING_PUBLIC}"

# 6. Upload manifest LAST (atomicity per CONTEXT D-21)
mc cp "${MANIFEST_OUT}" "sport-prod/${MANIFEST_BUCKET}/manifest.json"
echo "✓ manifest uploaded to ${MANIFEST_BUCKET}/manifest.json"

# 7. Re-fetch + re-verify (catches MinIO-side corruption)
RT_PATH=$(mktemp)
mc cp "sport-prod/${MANIFEST_BUCKET}/manifest.json" "${RT_PATH}"
go run scripts/verify-manifest.go --manifest="${RT_PATH}" --public-key-base64="${MANIFEST_SIGNING_PUBLIC}"
echo "✓ round-trip from MinIO verified"

echo ""
echo "🎉 release distribution complete: ${TAG_NAME} ($VERSION; versionCode=$VERSION_CODE)"
echo "   manifest: ${MINIO_ENDPOINT}/${MANIFEST_BUCKET}/manifest.json"
echo "   APK SHA-256: ${APK_SHA256}"
