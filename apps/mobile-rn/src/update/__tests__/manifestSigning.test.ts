// Phase 8 Plan 08-01 Task 5 — manifestSigning.ts unit tests.
//
// Strategy: pin a deterministic test keypair (seed = 0x42 × 32). Mock the
// hardcoded MANIFEST_PUBKEY_BASE64 constant with the test pubkey. Sign sample
// manifests in Node using the same canonical-JSON algorithm + verify with
// the module under test. Mutate one byte → verify rejection.
//
// Pinned via literal base64 strings to avoid jest.mock hoisting issues
// (factory cannot reference out-of-scope variables).

// Pinned test keypair (deterministic):
//   seed = Uint8Array(32).fill(0x42)
//   pub  = ed25519.getPublicKey(seed)
const TEST_SEED_B64 = 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=';
const TEST_PUB_B64 = 'IVL40Zt5HSRFMkLhXy6rbLfP+ntqXtMAl5YOBpiB2xI=';

// NOTE: We don't `jest.mock('../manifestSigning')` to substitute
// MANIFEST_PUBKEY_BASE64 because `verifyManifestSignature` closes over the
// LOCAL const at module load (mock-spread can't override closure vars).
// Instead, the function accepts an optional `pubkeyBase64` arg; tests pass
// the test pubkey explicitly.

import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

ed25519.hashes.sha512 = sha512;

const TEST_SEED = new Uint8Array(Buffer.from(TEST_SEED_B64, 'base64'));

// Helper: sign with the test keypair using the SAME canonical-JSON algorithm
// as scripts/sign-manifest.go (alphabetical keys + JSON.stringify without
// signature field).
function signTestManifest(payload: Record<string, unknown>): string {
  const { signature: _omitted, ...rest } = payload;
  const sortedKeys = Object.keys(rest).sort();
  const sortedObj = sortedKeys.reduce(
    (acc, k) => {
      acc[k] = rest[k];
      return acc;
    },
    {} as Record<string, unknown>,
  );
  const canonical = JSON.stringify(sortedObj);
  const sigBytes = ed25519.sign(new TextEncoder().encode(canonical), TEST_SEED);
  return Buffer.from(sigBytes).toString('base64');
}

import {
  canonicalJsonWithoutSignature,
  verifyManifestSignature,
  MANIFEST_PUBKEY_BASE64,
} from '../manifestSigning';

describe('module setup', () => {
  it('production MANIFEST_PUBKEY_BASE64 is a valid 32-byte base64', () => {
    expect(MANIFEST_PUBKEY_BASE64).toHaveLength(44);
    const decoded = Buffer.from(MANIFEST_PUBKEY_BASE64, 'base64');
    expect(decoded).toHaveLength(32);
  });
});

describe('canonicalJsonWithoutSignature', () => {
  it('strips signature field + sorts keys alphabetically', () => {
    const m = {
      version: '1.0.0',
      apk_url: 'https://x.com/a.apk',
      signature: 'should-be-stripped',
    };
    const canonical = canonicalJsonWithoutSignature(m);
    expect(canonical).toBe(
      JSON.stringify({ apk_url: 'https://x.com/a.apk', version: '1.0.0' }),
    );
    expect(canonical).not.toContain('signature');
  });

  it('produces deterministic output regardless of input key order', () => {
    const m1 = { c: 3, a: 1, b: 2 };
    const m2 = { a: 1, b: 2, c: 3 };
    expect(canonicalJsonWithoutSignature(m1)).toBe(
      canonicalJsonWithoutSignature(m2),
    );
  });
});

describe('verifyManifestSignature', () => {
  const PAYLOAD = {
    apk_sha256: 'a'.repeat(64),
    apk_size_bytes: 1024,
    apk_url: 'https://example.com/test.apk',
    min_supported_version: '1.0.0-beta.1',
    released_at: '2026-05-24T00:00:00Z',
    version: '1.0.0-beta.5',
    version_code: 5,
  };

  it('accepts a valid signature on a known payload', () => {
    const signature = signTestManifest(PAYLOAD);
    const manifest = { ...PAYLOAD, signature };
    expect(verifyManifestSignature(manifest, TEST_PUB_B64)).toBe(true);
  });

  it('rejects a signature when one byte is mutated', () => {
    const signature = signTestManifest(PAYLOAD);
    // Flip one bit in the base64 by changing the first char to a guaranteed-different one.
    const tampered =
      (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
    const manifest = { ...PAYLOAD, signature: tampered };
    expect(verifyManifestSignature(manifest, TEST_PUB_B64)).toBe(false);
  });

  it('rejects when payload field is mutated (signature no longer matches)', () => {
    const signature = signTestManifest(PAYLOAD);
    const manifest = { ...PAYLOAD, signature, version: '99.0.0' };
    expect(verifyManifestSignature(manifest, TEST_PUB_B64)).toBe(false);
  });

  it('rejects when signature field is empty', () => {
    const manifest = { ...PAYLOAD, signature: '' };
    expect(verifyManifestSignature(manifest, TEST_PUB_B64)).toBe(false);
  });

  it('rejects when signature is not valid base64', () => {
    const manifest = { ...PAYLOAD, signature: '!@#$ not base64' };
    expect(verifyManifestSignature(manifest, TEST_PUB_B64)).toBe(false);
  });

  it('rejects manifest with mismatched canonical-JSON shape (extra key)', () => {
    const sig = signTestManifest(PAYLOAD);
    // Add a key not present at signing time → canonical payload differs.
    const manifest = { ...PAYLOAD, signature: sig, extra_field: 'oops' };
    expect(verifyManifestSignature(manifest, TEST_PUB_B64)).toBe(false);
  });
});
