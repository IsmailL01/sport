# Phase 8: Closed-beta distribution — Research

**Written:** 2026-05-24 (inline by orchestrator; Phase 7 researcher-agent timeout pattern repeats too often — RESEARCH surface is bounded by the 25-decision CONTEXT.md and was wrapped inline for reliability).
**Status:** Ready for planner.
**Scope:** Implementation patterns + library APIs + Pitfalls for Plan 08-01 (manifest signing + APK distribution + mobile update flow).

CONTEXT.md locks 25 decisions; this RESEARCH only fills in HOW to implement each decision (API signatures, install commands, error-prone edges).

---

## §1 — Ed25519 signing: CI-side (Go) + Mobile-side (JS)

### CI-side (Go) — `crypto/ed25519` stdlib

Go's `crypto/ed25519` is the stdlib implementation (since Go 1.13). Zero external dependencies. Pattern:

```go
package main

import (
    "crypto/ed25519"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "os"
)

// Read private key from SOPS-decrypted YAML; the value is base64-encoded 32-byte
// Ed25519 seed (matches `ed25519.NewKeyFromSeed(seed)` signature).
func loadPrivateKey(b64 string) (ed25519.PrivateKey, error) {
    seed, err := base64.StdEncoding.DecodeString(b64)
    if err != nil {
        return nil, fmt.Errorf("base64 decode seed: %w", err)
    }
    if len(seed) != ed25519.SeedSize {
        return nil, fmt.Errorf("seed must be %d bytes, got %d", ed25519.SeedSize, len(seed))
    }
    return ed25519.NewKeyFromSeed(seed), nil
}

// Canonical JSON serializer (sorted keys, no extra whitespace) — Go's
// encoding/json marshal preserves struct-field declaration order, so define
// the payload struct with fields in alphabetical order to get canonical output
// directly. Alternative: use `github.com/gibson042/canonicaljson-go`.
type Manifest struct {
    APKSHA256          string `json:"apk_sha256"`
    APKSizeBytes       int64  `json:"apk_size_bytes"`
    APKUrl             string `json:"apk_url"`
    MinSupportedVersion string `json:"min_supported_version"`
    ReleasedAt          string `json:"released_at"`
    Signature           string `json:"signature,omitempty"` // omit during sign; set after
    Version             string `json:"version"`
    VersionCode         int    `json:"version_code"`
}

func signManifest(m *Manifest, priv ed25519.PrivateKey) error {
    m.Signature = "" // ensure signature field is excluded from canonical payload
    canonical, err := json.Marshal(m)
    if err != nil { return err }
    sig := ed25519.Sign(priv, canonical)
    m.Signature = base64.StdEncoding.EncodeToString(sig)
    return nil
}
```

**Pitfall 1 — JSON canonicalization in Go:** `encoding/json.Marshal` emits struct fields in **declaration order**, NOT alphabetical. To produce a canonical JSON suitable for cross-language verification, EITHER (a) declare the struct with fields in alphabetical order (as above), OR (b) marshal into `map[string]any`, then re-serialize via a custom canonical marshaller. Option (a) is simpler + zero-dep.

**Pitfall 2 — Seed vs full private key confusion:** Ed25519 has two private-key representations:
- 32-byte "seed" (the secret entropy) — what we store
- 64-byte "expanded private key" (seed + derived public key) — what `ed25519.Sign` requires

`ed25519.NewKeyFromSeed(seed)` does the expansion. Don't store the 64-byte form; always store the 32-byte seed. Public key is `priv.Public().(ed25519.PublicKey)` (32 bytes).

**Pitfall 3 — Signature is over the EXACT bytes:** The verify side MUST produce the byte-identical canonical JSON before verifying. Any whitespace/key-order drift = signature failure. Document the canonicalization rules clearly so the mobile side reproduces them.

### Mobile-side (JS) — `@noble/ed25519` v3.x

`@noble/ed25519` is pure-JS, audited, tree-shakeable, ~6 KB minified. API (v3+):

```typescript
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';

// noble/ed25519 v2+ requires you to wire SHA-512 manually (lets you choose hash impl).
// One-time setup at module load:
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// Then verify:
const pubKeyBytes  = base64ToUint8Array(EMBEDDED_PUBKEY_BASE64);    // 32 bytes
const sigBytes     = base64ToUint8Array(manifest.signature);         // 64 bytes
const payloadBytes = utf8Encode(canonicalJsonWithoutSignature(manifest));

const isValid = ed25519.verify(sigBytes, payloadBytes, pubKeyBytes);
```

**Pitfall 4 — SHA-512 backend wiring:** `@noble/ed25519` v2+ does NOT bundle a hash function; you must inject one via `etc.sha512Sync`. Forgetting this throws `Error: etc.sha512Sync is not set`. Use `@noble/hashes/sha2.sha512` (the sibling library; also pure JS, tree-shakeable).

**Pitfall 5 — `Uint8Array` vs `Buffer` on RN:** React Native does NOT provide Node's `Buffer` natively. Use `Uint8Array` end-to-end. `base64` decode requires either `react-native-quick-base64` (already common in RN projects) OR a 20-line pure-JS implementation. The Mapbox SDK ALREADY ships `Buffer` polyfills via the Mapbox dep tree — verify behavior in a real RN build before relying on `global.Buffer`.

**Pitfall 6 — Canonical JSON in JS:** Native `JSON.stringify` does NOT sort keys. Either (a) sort manually before stringify:

```typescript
function canonicalJson(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {} as Record<string, unknown>);
  return JSON.stringify(sorted);
}
```

OR (b) use `json-stable-stringify-without-jsonify` (no deps, 1 KB). Both produce identical output to Go's struct-field-order-alphabetical pattern above.

### Keypair generation (one-time, locally)

```bash
# Generate keypair via Go inline helper (vendored as scripts/gen-ed25519-keypair.go)
cat > /tmp/gen-ed25519.go <<'EOF'
package main
import (
  "crypto/ed25519"
  "crypto/rand"
  "encoding/base64"
  "fmt"
)
func main() {
  pub, priv, _ := ed25519.GenerateKey(rand.Reader)
  seed := priv.Seed()
  fmt.Println("private_seed_base64:", base64.StdEncoding.EncodeToString(seed))
  fmt.Println("public_base64:      ", base64.StdEncoding.EncodeToString(pub))
}
EOF
go run /tmp/gen-ed25519.go
rm /tmp/gen-ed25519.go
```

Alternative one-liner (no Go install needed):
```bash
node -e '
  const { generateKeyPairSync } = require("crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubRaw = publicKey.export({ format: "der", type: "spki" }).slice(-32);
  const privRaw = privateKey.export({ format: "der", type: "pkcs8" }).slice(-32);
  console.log("private_seed_base64:", privRaw.toString("base64"));
  console.log("public_base64:      ", pubRaw.toString("base64"));
'
```

**Pitfall 7 — Node crypto's PKCS8 vs raw:** Node's `KeyObject.export({type: "pkcs8"})` returns a PKCS8 DER wrapper, NOT the raw 32-byte seed. The seed is at the END of the DER blob. The `.slice(-32)` extracts it. Same for `spki` public key. This is why we slice.

---

## §2 — MinIO operations: mc CLI + presigned URLs

### Install `mc` (MinIO client) in CI

```yaml
- name: Install mc
  run: |
    curl -sSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
    chmod +x /usr/local/bin/mc
    mc --version
```

Pinning a version: `https://dl.min.io/client/mc/release/linux-amd64/archive/mc.RELEASE.2025-XX-XX...` (lock specific version in evidence/tool-versions.txt; the `release` URL points to latest).

### Configure mc with credentials

```bash
# CI-side
mc alias set sport-prod https://s3.148-253-214-156.sslip.io \
  "$MINIO_RELEASES_ACCESS_KEY" "$MINIO_RELEASES_SECRET_KEY"
mc admin info sport-prod  # smoke check
```

**Pitfall 8 — TLS verification:** Caddy serves the MinIO proxy with a Let's Encrypt cert via the sslip.io domain (Phase 3 Caddyfile.prod). `mc` validates by default — should just work. If self-signed in dev/staging, `--insecure` would suppress (don't use in prod).

### Upload APK

```bash
mc cp /tmp/build.apk sport-prod/android-releases/v1.0.0-beta.1.apk
```

### Set bucket policies (one-time, via mc admin)

```bash
# Private bucket (default behavior; explicit policy for clarity)
mc anonymous set none   sport-prod/android-releases

# Public-read bucket for manifest
mc anonymous set download sport-prod/android-manifest
```

**Pitfall 9 — Bucket creation race:** `mc cp` to a non-existent bucket creates the bucket but with default (private) policy. If you `mc cp` manifest BEFORE setting `mc anonymous set download`, the manifest object is private + fetches 403. Sequence in scripts/release-distribute.sh: create buckets explicitly + set policies BEFORE first upload.

### Presigned URL for APK (24h)

```bash
# Returns a URL valid for 24h (default --expire is 7 days; explicit for clarity)
APK_URL=$(mc share download --expire 24h sport-prod/android-releases/v1.0.0-beta.1.apk | grep '^Share:' | sed 's/^Share: //')
echo "$APK_URL"
```

**Pitfall 10 — `mc share download` output format:** parsing the "Share:" line is fragile across mc versions. More robust: invoke Go inline helper using the AWS SDK v2 S3 presigner (matches the existing pattern in `services/backend/media/internal/s3/client.go`). Trade-off: Go install in CI runner (already needed for the Ed25519 signer anyway).

Cleanest CI pattern: single `scripts/release-distribute.go` that does presign + sign + upload manifest in one binary, invoked by the workflow with env vars.

### Public-read object via Caddy proxy

The manifest is at `https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json`. With `mc anonymous set download`, anonymous `GET` returns the object body. Caddy reverse-proxies without modification — no Host-header tricks needed (existing Caddyfile.prod already preserves the host header for s3.* subdomain).

**Pitfall 11 — Caddy + sslip.io subdomain wildcard:** The existing Caddyfile.prod defines `s3.148-253-214-156.sslip.io { reverse_proxy minio:9000 }`. This is a SINGLE subdomain block. The manifest fetch hits this exact subdomain — works as-is. No new Caddy config needed (matches CONTEXT D-03).

---

## §3 — Bundletool: .aab → universal APK

### Install in CI

```bash
# Option A: npm global (simplest)
npm install -g bundletool

# Option B: jar download (more reliable; fewer transitive deps)
BUNDLETOOL_VERSION=1.18.1
curl -sSL "https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar" -o /usr/local/bin/bundletool.jar
echo '#!/bin/sh' > /usr/local/bin/bundletool
echo 'java -jar /usr/local/bin/bundletool.jar "$@"' >> /usr/local/bin/bundletool
chmod +x /usr/local/bin/bundletool
```

Plan 07-01 evidence/tool-versions.txt already flagged "bundletool missing — `brew install bundletool` required". CI installs via Option B (jar) for version pinning + reproducibility.

### Extract universal APK from .aab

```bash
bundletool build-apks \
  --bundle=/tmp/build.aab \
  --output=/tmp/build.apks \
  --mode=universal

# Unzip the .apks (it's a zip containing universal.apk + toc.pb)
unzip -p /tmp/build.apks universal.apk > /tmp/build.apk
```

**Pitfall 12 — Signing during bundletool:** bundletool can re-sign the APK during conversion if you pass `--ks=...`. **Don't** — the .aab is already signed by EAS Cloud with our keystore (Plan 07-01 verified this). bundletool in `--mode=universal` without `--ks` PRESERVES the existing signature. Verify with `apksigner verify --print-certs` post-conversion — cert SHA-256 should match `C6:33:47:6C:63:11:40:3F:5D:19:E2:3A:07:3A:15:F6:EA:BC:D6:40:FB:7F:F5:49:A5:B1:C3:A5:18:30:D7:BB`.

**Pitfall 13 — bundletool requires Java 11+:** GitHub-hosted ubuntu-latest has Java 17 by default. setup-java@v4 step in android-release.yml already sets JDK 17 (Plan 07-01). Reuse.

### Compute APK SHA-256

```bash
sha256sum /tmp/build.apk | awk '{print $1}'
# → 64-hex chars; embed in manifest.apk_sha256
```

---

## §4 — Mobile-side fetch + verify flow

### Module structure

```
apps/mobile-rn/src/update/
  manifestSchema.ts          # zod-style validator + TS type
  manifestSigning.ts          # ed25519 verify + canonical JSON serializer
  manifestCheck.ts            # fetch + verify + dispatch (banner vs force)
  UpdateBanner.tsx            # non-blocking banner component
  useUpdateCheckOnForeground.ts  # AppState 'active' listener + 6h throttle
  __tests__/
    manifestCheck.test.ts
    manifestSigning.test.ts
    UpdateBanner.test.tsx
```

### `manifestSchema.ts` — type + runtime guard

```typescript
import { z } from 'zod';
// OR if zod isn't in deps yet (check apps/mobile-rn/package.json), use a hand-rolled validator.

export const ManifestSchema = z.object({
  version:                z.string().regex(/^\d+\.\d+\.\d+(-beta\.\d+|-rc\.\d+)?$/),
  version_code:           z.number().int().positive(),
  min_supported_version:  z.string().regex(/^\d+\.\d+\.\d+(-beta\.\d+|-rc\.\d+)?$/),
  apk_url:                z.string().url(),
  apk_sha256:             z.string().regex(/^[a-f0-9]{64}$/),
  apk_size_bytes:         z.number().int().positive(),
  released_at:            z.string().datetime(),
  signature:              z.string().regex(/^[A-Za-z0-9+/]{86}==$/),  // base64 of 64-byte sig
});

export type Manifest = z.infer<typeof ManifestSchema>;
```

**Pitfall 14 — zod presence:** check `apps/mobile-rn/package.json` first. If zod is NOT installed, EITHER install it (it's already a transitive dep of many RN packages — likely already present) OR hand-roll the validator. Hand-rolled is fine for a 7-field schema.

### `manifestSigning.ts` — verify + canonical serializer

```typescript
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';

// Wire SHA-512 backend at module load.
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// HARDCODED PUBLIC KEY — replace placeholder when Plan 08-01 Task 1 runs.
// Rotation: ship new app version with new pubkey (see D-09 in CONTEXT.md).
const MANIFEST_PUBKEY_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';  // 32-byte base64

function base64ToBytes(b64: string): Uint8Array {
  // Use built-in atob (available in Hermes / RN) — outputs binary string;
  // convert via charCodeAt.
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function canonicalJsonWithoutSignature(manifest: Manifest): string {
  // Strip signature, alphabetize keys, JSON.stringify with no whitespace.
  const { signature: _omitted, ...rest } = manifest;
  const sortedKeys = Object.keys(rest).sort();
  const sortedObj = sortedKeys.reduce((acc, k) => {
    acc[k] = (rest as Record<string, unknown>)[k];
    return acc;
  }, {} as Record<string, unknown>);
  return JSON.stringify(sortedObj);
}

export function verifyManifestSignature(manifest: Manifest): boolean {
  try {
    const payload = canonicalJsonWithoutSignature(manifest);
    const payloadBytes = new TextEncoder().encode(payload);
    const sigBytes = base64ToBytes(manifest.signature);
    const pubBytes = base64ToBytes(MANIFEST_PUBKEY_BASE64);
    return ed25519.verify(sigBytes, payloadBytes, pubBytes);
  } catch {
    return false;
  }
}
```

### `manifestCheck.ts` — orchestration

```typescript
import { useForceUpdateStore } from '../state/forceUpdate';
import { useUpdateBannerStore } from './updateBannerStore';
import { useUpdateCheckStore } from './updateCheckStore';
import { verifyManifestSignature } from './manifestSigning';
import { ManifestSchema } from './manifestSchema';
import semver from 'semver';  // or hand-roll comparator (CONTEXT decision)

const MANIFEST_URL = 'https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json';
const THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 hours

const APP_VERSION = require('../../app.json').expo.version;  // OR import Constants.expoConfig

export async function checkForUpdate(opts: { force?: boolean } = {}): Promise<void> {
  const { force = false } = opts;
  const { lastCheckedAt, checking } = useUpdateCheckStore.getState();
  if (checking) return;
  if (!force && lastCheckedAt && Date.now() - lastCheckedAt < THROTTLE_MS) return;

  useUpdateCheckStore.setState({ checking: true, lastError: null });

  try {
    const res = await fetch(MANIFEST_URL, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const parsed = ManifestSchema.safeParse(json);
    if (!parsed.success) throw new Error('Invalid manifest schema');
    const manifest = parsed.data;

    if (!verifyManifestSignature(manifest)) {
      throw new Error('Signature verification failed');
    }

    // Replay protection (D-24): reject if manifest.released_at < stored installed_released_at
    // (impl detail: stored in MMKV; skip if first time)
    // ... see scripts/update-installed-released-at.ts ...

    useUpdateCheckStore.setState({ lastCheckedAt: Date.now(), checking: false });

    // Dispatch by version comparison
    if (semver.gt(manifest.min_supported_version, APP_VERSION)) {
      // Force update path — REUSE REL-02
      useForceUpdateStore.setState({
        required: true,
        minVersion: manifest.min_supported_version,
        forceUpdateUrl: manifest.apk_url,
      });
    } else if (semver.gt(manifest.version, APP_VERSION)) {
      // Optional update — non-blocking banner
      useUpdateBannerStore.setState({ available: true, manifest });
    } else {
      useUpdateBannerStore.setState({ available: false, manifest: null });
    }
  } catch (err) {
    // SILENT failure per CONTEXT D-13. Log only.
    console.warn('[update] check failed', err);
    useUpdateCheckStore.setState({ checking: false, lastError: String(err) });
  }
}
```

### `useUpdateCheckOnForeground.ts`

```typescript
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { checkForUpdate } from './manifestCheck';

export function useUpdateCheckOnForeground(): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void checkForUpdate();
      }
    });
    // Also fire once on mount (covers first-launch case before any AppState change).
    void checkForUpdate();
    return () => sub.remove();
  }, []);
}
```

Mount in `App.tsx` alongside `subscribeToRecordingTick()`:

```tsx
useEffect(() => {
  const unsub = subscribeToRecordingTick();
  return () => unsub();
}, []);

useUpdateCheckOnForeground();   // ← new hook from Plan 08-01
```

**Pitfall 15 — semver in RN:** `semver` is a Node-conventional package. It works in RN (pure JS), but adds ~50 KB. Hand-rolled comparator for our `major.minor.patch[-beta.N|-rc.N]` format is ~30 lines. Decide in plan: install semver OR write `compareVersions(a, b)` in `manifestSigning.ts`.

### `UpdateBanner.tsx`

```tsx
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useUpdateBannerStore } from './updateBannerStore';

const SUPPRESS_MS = 24 * 60 * 60 * 1000; // 24h

export function UpdateBanner() {
  const { available, manifest, suppressedUntil } = useUpdateBannerStore(s => s);
  if (!available || !manifest) return null;
  if (suppressedUntil && Date.now() < suppressedUntil) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Доступна версия {manifest.version}</Text>
      <View style={styles.actions}>
        <Pressable onPress={() => Linking.openURL(manifest.apk_url)}>
          <Text style={styles.primaryAction}>Обновить</Text>
        </Pressable>
        <Pressable
          onPress={() => useUpdateBannerStore.setState({ suppressedUntil: Date.now() + SUPPRESS_MS })}
        >
          <Text style={styles.secondaryAction}>Позже</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ /* RU-styled per CLAUDE.md; dark theme */ });
```

Mounted at top of `TrackerStartScreen` + `FeedScreen` per CONTEXT D-11.

---

## §5 — End-to-end workflow extension

### android-release.yml — added steps

Current workflow (Plan 07-01) ends at "Trigger EAS build" with `--no-wait`. Phase 8 needs to wait + post-process. Extension:

```yaml
      - name: Trigger EAS build
        # ... existing ...
        run: |
          eas build --platform android --profile production --non-interactive \
            --message "Phase 7 release — ${GITHUB_REF_NAME}" \
            > /tmp/eas-build.log 2>&1
          # Extract build ID from log
          BUILD_ID=$(grep -oE 'builds/[a-f0-9-]+' /tmp/eas-build.log | head -1 | sed 's|builds/||')
          echo "build_id=$BUILD_ID" >> $GITHUB_OUTPUT
        id: trigger

      # ↓↓↓ Phase 8 additions ↓↓↓

      - name: Wait for EAS build to finish
        run: |
          eas build:view ${{ steps.trigger.outputs.build_id }} --json > /tmp/build.json
          # Poll until finished/errored
          while [[ "$(jq -r .status /tmp/build.json)" == "in-queue" || "$(jq -r .status /tmp/build.json)" == "in-progress" ]]; do
            sleep 30
            eas build:view ${{ steps.trigger.outputs.build_id }} --json > /tmp/build.json
          done
          STATUS=$(jq -r .status /tmp/build.json)
          if [ "$STATUS" != "finished" ]; then
            echo "EAS build $STATUS"
            exit 1
          fi
          echo "artifact_url=$(jq -r .artifacts.applicationArchiveUrl /tmp/build.json)" >> $GITHUB_OUTPUT
        id: wait

      - name: Download .aab + extract universal APK
        run: |
          curl -L -o /tmp/build.aab "${{ steps.wait.outputs.artifact_url }}"
          bundletool build-apks --bundle=/tmp/build.aab --output=/tmp/build.apks --mode=universal
          unzip -p /tmp/build.apks universal.apk > /tmp/build.apk

      - name: Install mc + bundletool
        run: |
          curl -sSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
          chmod +x /usr/local/bin/mc

      - name: Decrypt manifest-signing key
        env:
          SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY_CI }}
        run: |
          mkdir -p ~/.config/sops/age
          echo "$SOPS_AGE_KEY" > ~/.config/sops/age/keys.txt
          chmod 600 ~/.config/sops/age/keys.txt
          # Decrypt the new manifest-signing.yaml
          MANIFEST_SIGNING_PRIVATE=$(sops -d .secrets/prod/manifest-signing.yaml | yq -r '.manifest_signing.ed25519_private_base64')
          echo "::add-mask::$MANIFEST_SIGNING_PRIVATE"
          echo "MANIFEST_SIGNING_PRIVATE=$MANIFEST_SIGNING_PRIVATE" >> "$GITHUB_ENV"

      - name: Upload APK + sign manifest + publish
        env:
          MINIO_ACCESS_KEY: ${{ secrets.MINIO_RELEASES_ACCESS_KEY }}
          MINIO_SECRET_KEY: ${{ secrets.MINIO_RELEASES_SECRET_KEY }}
        run: scripts/release-distribute.sh /tmp/build.apk "${GITHUB_REF_NAME}"
```

`scripts/release-distribute.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
APK_PATH="$1"
TAG_NAME="$2"      # e.g., "v1.0.0-beta.5"
VERSION="${TAG_NAME#v}"   # strip leading "v"

# Configure mc
mc alias set sport-prod https://s3.148-253-214-156.sslip.io \
  "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"

# Compute APK sha + size
APK_SHA256=$(sha256sum "$APK_PATH" | awk '{print $1}')
APK_SIZE=$(stat -c%s "$APK_PATH")

# Upload APK (private bucket)
mc cp "$APK_PATH" "sport-prod/android-releases/${TAG_NAME}.apk"

# Generate presigned URL (24h)
APK_URL=$(mc share download --expire 24h "sport-prod/android-releases/${TAG_NAME}.apk" | grep '^Share:' | sed 's/^Share: //')

# Build canonical manifest JSON (Go inline signer)
RELEASED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MIN_SUPPORTED_VERSION="${VERSION}"  # by default same as version; raise to force-update from prior

# Invoke Go signer (vendored as scripts/sign-manifest.go OR built into release-distribute binary)
go run scripts/sign-manifest.go \
  --version="${VERSION}" \
  --version-code=$(date +%s) \
  --min-supported-version="${MIN_SUPPORTED_VERSION}" \
  --apk-url="${APK_URL}" \
  --apk-sha256="${APK_SHA256}" \
  --apk-size-bytes="${APK_SIZE}" \
  --released-at="${RELEASED_AT}" \
  --private-key-base64="${MANIFEST_SIGNING_PRIVATE}" \
  --output=/tmp/manifest.json

# Upload manifest (public-read bucket)
mc cp /tmp/manifest.json sport-prod/android-manifest/manifest.json

# Round-trip verify: re-download + verify signature locally
mc cp sport-prod/android-manifest/manifest.json /tmp/manifest-roundtrip.json
go run scripts/verify-manifest.go --manifest=/tmp/manifest-roundtrip.json --public-key-base64="${MANIFEST_PUBLIC_KEY_BASE64}"
echo "✓ manifest signed + uploaded + round-trip verified"
```

**Pitfall 16 — `eas build` arg form for wait:** `--non-interactive --no-wait` (Plan 07-01 pattern) returns immediately + needs separate `eas build:view --wait`. Alternative: `--non-interactive` WITHOUT `--no-wait` blocks until completion (no need for the separate wait step). Plan 08-01 uses the simpler "drop --no-wait" path; total workflow time becomes ~15 min but reduces moving parts.

**Pitfall 17 — Tag-derived versionCode:** ROADMAP success criterion 6 was "Build number auto-bumps on each CI run (CFBundleVersion += 1)" — that's iOS-only and DEFERRED. Android uses `versionCode` (different from semver versionName). EAS's `appVersionSource: "remote"` already handles this auto-increment (Plan 07-01 D-10). Manifest's `version_code` mirrors what EAS assigned.

---

## §6 — Mobile state stores

Two NEW Zustand+MMKV stores (matches existing pattern in `apps/mobile-rn/src/state/settings.ts` + `featureflags.ts`):

### `updateBannerStore.ts`

```typescript
import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Manifest } from './manifestSchema';

const mmkv = createMMKV({ id: 'update-banner' });

type UpdateBannerState = {
  available: boolean;
  manifest: Manifest | null;
  suppressedUntil: number | null;
};

export const useUpdateBannerStore = create<UpdateBannerState>()(
  persist(
    () => ({ available: false, manifest: null, suppressedUntil: null }),
    {
      name: 'update-banner-store',
      storage: createJSONStorage(() => ({
        getItem: (key) => mmkv.getString(key) ?? null,
        setItem: (key, value) => mmkv.set(key, value),
        removeItem: (key) => mmkv.remove(key),
      })),
    },
  ),
);
```

### `updateCheckStore.ts` — same pattern, simpler shape

```typescript
type UpdateCheckState = {
  lastCheckedAt: number | null;
  checking: boolean;
  lastError: string | null;
};
```

`useForceUpdateStore` (REL-02, existing) — DO NOT modify; the manifest path just calls `useForceUpdateStore.setState({ required: true, ... })`.

---

## §7 — Settings entry

`apps/mobile-rn/src/navigation/screens/me/SettingsScreen.tsx` — add a new row in the appropriate section ("App" / "About" / new "Обновления" group):

```tsx
<View style={settingsRow}>
  <Pressable
    onPress={async () => {
      await checkForUpdate({ force: true });
      const { available } = useUpdateBannerStore.getState();
      if (!available) {
        toast.show('У вас актуальная версия');
      }
    }}
  >
    <Text style={rowTitle}>Проверить обновления</Text>
    <Text style={rowSubtitle}>{formatRelativeTime(lastCheckedAt)}</Text>
  </Pressable>
</View>
```

`formatRelativeTime(ts)` outputs "только что", "3 минуты назад", "вчера", etc. — write inline (~15 lines) or use existing helper if one exists in `apps/mobile-rn/src/ui/format.ts`.

---

## §8 — Tests

### Unit tests

- `manifestSchema.test.ts` — round-trip parse + accept/reject valid/invalid shapes (10 cases).
- `manifestSigning.test.ts` — sign a known canonical payload with a test keypair, verify accept; mutate single byte, verify reject; canonical-JSON edge cases (unicode, trailing whitespace, key reorder).
- `manifestCheck.test.ts` — mock `fetch` + run `checkForUpdate`; assert state transitions for force / banner / no-op / silent-failure cases; throttle behavior.
- `UpdateBanner.test.tsx` — RN Testing Library; "Обновить" tap → Linking.openURL called; "Позже" tap → suppressedUntil set + banner unmounts.

### Integration / smoke

- `scripts/smoke-manifest-roundtrip.sh` — generate keypair locally, sign sample manifest via Go signer, verify via Node script using `@noble/ed25519` (catches cross-language canonicalization drift).
- End-to-end pipeline smoke = Task 7 USER ACTION (tag + watch full CI).

### Coverage target

Per CLAUDE.md test posture: pipeline ≥80%; manifestSigning + manifestCheck are "critical" → aim ≥90%. UpdateBanner UI test fine at ≥70% (smoke level).

---

## §9 — Open questions for planner (NOT for user; planner decides)

1. **semver dep vs hand-roll?** — installed already? check package.json; if not, hand-roll 30 lines.
2. **zod dep vs hand-roll?** — same check.
3. **`scripts/release-distribute.sh` vs single Go binary?** — both work; Go binary is more atomic + testable. Plan body picks one.
4. **Versioning of `version_code` in manifest?** — EAS auto-assigns; manifest mirrors. Plan body specifies WHERE to pull it from (EAS API response in workflow OR app.json after EAS Cloud builds + commits the result).
5. **`released_at` source-of-truth?** — workflow-side `date -u` is simplest. Mobile-side stores `installed_released_at = manifest.released_at` after first verified manifest fetch (for D-24 replay protection).
6. **Suppressed-banner UX edge case:** if `manifest.version` changes during the 24h suppression window, should the banner re-show? **Decision for plan:** YES — when banner-store's `manifest.version` field changes, automatically clear `suppressedUntil` (different version = different banner).

---

## §10 — Confidence + risk

**HIGH confidence (well-understood):**
- Ed25519 sign/verify in Go (stdlib) + JS (@noble/ed25519).
- MinIO presigned URLs (existing pattern in services/backend/media/internal/s3/client.go).
- Caddy reverse-proxy for MinIO (already deployed, no changes).
- REL-02 force-update reuse (Phase 1 shipped; just import the store).

**MEDIUM confidence (will-require-empirical-check):**
- Canonical JSON byte-identity across Go (alphabetized struct fields) + JS (manual sort). Plan 08-01 Task 5 includes a cross-language smoke (Go signs → JS verifies on a known payload).
- bundletool universal-mode preserving EAS Cloud's signature (Plan 07-01 didn't extract universal APK yet; first empirical check happens in Plan 08-01 Task 7).
- `mc share download` output parsing stability across mc versions. Mitigation: use Go S3 SDK presigner instead (one-time setup; matches services/backend/media pattern).

**LOW confidence (unknowns):**
- None significant. CONTEXT.md locked 25 decisions including all the architecturally-load-bearing ones.

---

## Refs

- `crypto/ed25519` Go stdlib — https://pkg.go.dev/crypto/ed25519
- `@noble/ed25519` — https://github.com/paulmillr/noble-ed25519
- bundletool — https://github.com/google/bundletool
- mc — https://min.io/docs/minio/linux/reference/minio-mc.html
- AWS S3 presigner Go SDK — https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/s3-example-presigned-urls.html
- Existing patterns in repo:
  - `services/backend/media/internal/s3/client.go` (MinIO presign)
  - `services/backend/gateway/Caddyfile.prod` (Caddy MinIO reverse-proxy)
  - `apps/mobile-rn/src/state/forceUpdate.ts` (REL-02 store; REUSE 1:1)
  - `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` (REL-02 force-update UX)
  - `.github/workflows/android-release.yml` (Plan 07-01 — extend with post-build steps)
  - `.secrets/prod/mobile-signing.yaml` (SOPS pattern for new manifest-signing.yaml sibling)
