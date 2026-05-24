import { parseManifest } from '../manifestSchema';

const VALID = {
  apk_sha256: 'a'.repeat(64),
  apk_size_bytes: 1024,
  apk_url: 'https://example.com/test.apk',
  min_supported_version: '1.0.0-beta.1',
  released_at: '2026-05-24T00:00:00Z',
  signature: 'A'.repeat(86) + '==',
  version: '1.0.0-beta.5',
  version_code: 5,
};

describe('parseManifest', () => {
  it('accepts a fully-populated valid manifest', () => {
    const result = parseManifest(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe('1.0.0-beta.5');
    }
  });

  it('rejects non-object input', () => {
    expect(parseManifest(null)).toEqual({ ok: false, error: 'not an object' });
    expect(parseManifest('string')).toEqual({
      ok: false,
      error: 'not an object',
    });
    expect(parseManifest(42)).toEqual({
      ok: false,
      error: 'not an object',
    });
  });

  it('rejects invalid apk_sha256', () => {
    const bad = { ...VALID, apk_sha256: 'too-short' };
    const r = parseManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/apk_sha256/);
  });

  it('rejects negative apk_size_bytes', () => {
    const bad = { ...VALID, apk_size_bytes: -1 };
    const r = parseManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/apk_size_bytes/);
  });

  it('rejects non-https apk_url', () => {
    const bad = { ...VALID, apk_url: 'ftp://example.com/test.apk' };
    const r = parseManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/apk_url/);
  });

  it('rejects invalid min_supported_version (alpha)', () => {
    const bad = { ...VALID, min_supported_version: '1.0.0-alpha.1' };
    const r = parseManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/min_supported_version/);
  });

  it('rejects malformed released_at', () => {
    const bad = { ...VALID, released_at: '2026-05-24' };
    const r = parseManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/released_at/);
  });

  it('rejects signature wrong length', () => {
    const bad = { ...VALID, signature: 'short' };
    const r = parseManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/signature/);
  });

  it('rejects invalid version format', () => {
    const bad = { ...VALID, version: '1.0' };
    const r = parseManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version/);
  });

  it('rejects zero version_code', () => {
    const bad = { ...VALID, version_code: 0 };
    const r = parseManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version_code/);
  });
});
