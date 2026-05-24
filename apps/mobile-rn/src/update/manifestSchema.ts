// Phase 8 Plan 08-01 Task 5 — manifest runtime schema validator.
//
// Why hand-rolled (not zod): zod not installed in apps/mobile-rn/package.json
// (verified); zod is ~30 KB minified for a 7-field shape. RESEARCH §9 Q2
// resolved as hand-roll matching the schema locked in 08-CONTEXT.md D-06.

export type Manifest = {
  apk_sha256: string;
  apk_size_bytes: number;
  apk_url: string;
  min_supported_version: string;
  released_at: string;
  signature: string;
  version: string;
  version_code: number;
};

const SEMVER_RE = /^\d+\.\d+\.\d+(-(beta|rc)\.\d+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const URL_RE = /^https?:\/\//;
// Ed25519 signature: 64 bytes → 88 base64 chars (with "==" padding from
// Go's StdEncoding). Allow trailing padding 0-2.
const SIG_B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export type ParseResult =
  | { ok: true; value: Manifest }
  | { ok: false; error: string };

export function parseManifest(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'not an object' };
  }
  const o = raw as Record<string, unknown>;
  const checks: Array<[keyof Manifest, (v: unknown) => boolean]> = [
    [
      'apk_sha256',
      (v) => typeof v === 'string' && SHA256_RE.test(v),
    ],
    [
      'apk_size_bytes',
      (v) => typeof v === 'number' && Number.isInteger(v) && v > 0,
    ],
    ['apk_url', (v) => typeof v === 'string' && URL_RE.test(v)],
    [
      'min_supported_version',
      (v) => typeof v === 'string' && SEMVER_RE.test(v),
    ],
    ['released_at', (v) => typeof v === 'string' && RFC3339_RE.test(v)],
    [
      'signature',
      (v) =>
        typeof v === 'string' && SIG_B64_RE.test(v) && v.length >= 86 && v.length <= 88,
    ],
    ['version', (v) => typeof v === 'string' && SEMVER_RE.test(v)],
    [
      'version_code',
      (v) => typeof v === 'number' && Number.isInteger(v) && v > 0,
    ],
  ];
  for (const [field, pred] of checks) {
    if (!pred(o[field])) {
      return {
        ok: false,
        error: `field "${field}" invalid (got ${typeof o[field]}: ${JSON.stringify(o[field])})`,
      };
    }
  }
  return { ok: true, value: o as unknown as Manifest };
}
