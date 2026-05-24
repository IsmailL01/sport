#!/usr/bin/env bash
# Phase 8 Plan 08-01 Task 3 — cross-language sign/verify smoke.
#
# Proves Go's encoding/json (alphabetical struct fields) produces a BYTE-IDENTICAL
# canonical payload to JS's Object.keys().sort() + JSON.stringify. If this smoke
# is green, the mobile-side @noble/ed25519 verifier accepts manifests signed by
# scripts/sign-manifest.go.
#
# Flow:
#   1. Generate fresh Ed25519 keypair (single Go invocation; head/tail captures pair)
#   2. Sign a known fixture manifest with scripts/sign-manifest.go
#   3. Verify it with scripts/verify-manifest.go (Go-side sanity)
#   4. Re-verify with Node + @noble/ed25519 (cross-language proof)
#
# Exit codes: 0 green, 1 cross-language drift detected.

set -euo pipefail
TMP=$(mktemp -d -t mfst-smoke.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

# Find repo root (this script lives in .planning/phases/08-closed-beta-distribution/evidence/)
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"

# 1. Generate keypair (single Go invocation; clean — NIT 11.1 fix)
cat > "$TMP/gen.go" <<'GOEOF'
package main
import ("crypto/ed25519"; "crypto/rand"; "encoding/base64"; "fmt")
func main() {
  pub, priv, _ := ed25519.GenerateKey(rand.Reader)
  fmt.Println(base64.StdEncoding.EncodeToString(priv.Seed()))
  fmt.Println(base64.StdEncoding.EncodeToString(pub))
}
GOEOF
OUT=$(go run "$TMP/gen.go")
PRIV=$(echo "$OUT" | sed -n '1p')
PUB=$(echo "$OUT" | sed -n '2p')
[ ${#PRIV} -eq 44 ] && [ ${#PUB} -eq 44 ] || { echo "❌ keypair generation failed"; exit 1; }
echo "✓ Step 1: fresh keypair generated (priv len=44, pub len=44)"

# 2. Sign a known fixture
go run scripts/sign-manifest.go \
  --version="1.0.0-beta.test" \
  --version-code=42 \
  --min-supported-version="1.0.0-beta.test" \
  --apk-url="https://example.com/test.apk" \
  --apk-sha256="abc123def456abc123def456abc123def456abc123def456abc123def456abcd" \
  --apk-size-bytes=1024 \
  --released-at="2026-05-24T00:00:00Z" \
  --private-key-base64="$PRIV" \
  --output="$TMP/manifest.json"
[ -s "$TMP/manifest.json" ] || { echo "❌ sign-manifest produced empty output"; exit 1; }
echo "✓ Step 2: manifest signed (Go side)"

# 3. Verify Go-side (sanity)
go run scripts/verify-manifest.go --manifest="$TMP/manifest.json" --public-key-base64="$PUB"
echo "✓ Step 3: Go-side verification passed (sanity check)"

# 4. Cross-language: verify with Node + @noble/ed25519 (matches mobile-side verifier)
cat > "$TMP/verify.js" <<JSEOF
const { sha512 } = require('${REPO_ROOT}/apps/mobile-rn/node_modules/@noble/hashes/sha2.js');
const ed = require('${REPO_ROOT}/apps/mobile-rn/node_modules/@noble/ed25519');
ed.hashes.sha512 = sha512;

const manifest = JSON.parse(require('fs').readFileSync('${TMP}/manifest.json'));
const sig = manifest.signature;
const { signature, ...rest } = manifest;
const sortedKeys = Object.keys(rest).sort();
const sortedObj = sortedKeys.reduce((a, k) => (a[k] = rest[k], a), {});
const canonical = JSON.stringify(sortedObj);
const payload = new TextEncoder().encode(canonical);
const sigBytes = Uint8Array.from(Buffer.from(sig, 'base64'));
const pubBytes = Uint8Array.from(Buffer.from('${PUB}', 'base64'));

if (sigBytes.length !== 64) { console.error('FAIL: sig length wrong'); process.exit(1); }
if (pubBytes.length !== 32) { console.error('FAIL: pubkey length wrong'); process.exit(1); }

const valid = ed.verify(sigBytes, payload, pubBytes);
if (!valid) {
  console.error('✗ Node @noble/ed25519 verification FAILED');
  console.error('Canonical payload (JS):', canonical);
  process.exit(1);
}
console.log('✓ Node @noble/ed25519 verification PASSED — cross-language byte-identical');
JSEOF
node "$TMP/verify.js"

echo ""
echo "🎉 cross-language sign/verify smoke green — Go signer + JS verifier agree on canonical JSON byte-by-byte"
