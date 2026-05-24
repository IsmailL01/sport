// Phase 8 Plan 08-01 Task 1 — Ed25519 manifest signature verification.
//
// Public key is HARDCODED per 08-CONTEXT D-09 (NOT app.json, NOT remote).
// Rotation = ship new app version with new pubkey (compromise recovery
// same as keystore — see docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md).
//
// Signature algorithm: Ed25519 (RFC 8032) via @noble/ed25519.
// Canonical JSON contract: keys sorted alphabetically, no whitespace, signature
// field excluded from payload. Must match the Go signer in
// scripts/sign-manifest.go byte-for-byte. Cross-language smoke
// (.planning/phases/08-closed-beta-distribution/evidence/smoke-manifest-sign-roundtrip.sh)
// exercises Go-sign → Node-verify on a known payload to catch drift.

import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';

// Wire SHA-512 backend (RESEARCH Pitfall 4 — @noble/ed25519 v2+ requires
// explicit hash; injection happens at module load).
ed25519.etc.sha512Sync = (...m: Uint8Array[]) =>
  sha512(ed25519.etc.concatBytes(...m));

/**
 * Embedded manifest-signing public key (32-byte Ed25519, base64).
 * Generated via Plan 08-01 Task 1; private half lives in
 * .secrets/prod/manifest-signing.yaml (SOPS-encrypted, age recipients
 * DEV_A + CI). Fingerprint: b57acd1efa3f.
 */
export const MANIFEST_PUBKEY_BASE64 = 'rDfoNbDp88ls1yoiuuKONsJ/PdstLOrioQqvXYIA40I=' as const;

export type ManifestForSigning = Record<string, unknown> & { signature?: string };

export function canonicalJsonWithoutSignature(
  manifest: ManifestForSigning,
): string {
  const { signature: _omitted, ...rest } = manifest;
  const sortedKeys = Object.keys(rest).sort();
  const sortedObj = sortedKeys.reduce(
    (acc, k) => {
      acc[k] = (rest as Record<string, unknown>)[k];
      return acc;
    },
    {} as Record<string, unknown>,
  );
  return JSON.stringify(sortedObj);
}

// Pure-JS base64 decoder (RESEARCH Pitfall 5 — no Buffer in RN runtime).
export function base64ToBytes(b64: string): Uint8Array {
  // atob is available in Hermes (RN's JS engine) + Node v22+.
  const binary =
    typeof globalThis.atob === 'function'
      ? globalThis.atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function verifyManifestSignature(manifest: {
  signature: string;
  [k: string]: unknown;
}): boolean {
  try {
    const payload = canonicalJsonWithoutSignature(manifest);
    const payloadBytes = new TextEncoder().encode(payload);
    const sigBytes = base64ToBytes(manifest.signature);
    const pubBytes = base64ToBytes(MANIFEST_PUBKEY_BASE64);
    if (sigBytes.length !== 64) return false;
    if (pubBytes.length !== 32) return false;
    return ed25519.verify(sigBytes, payloadBytes, pubBytes);
  } catch {
    return false;
  }
}
