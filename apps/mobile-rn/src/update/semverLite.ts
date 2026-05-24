// Phase 8 Plan 08-01 Task 5 — minimal semver comparator.
//
// Supports the project's tag-versioning convention: MAJOR.MINOR.PATCH[-(beta|rc).N]
// Examples that parse: 1.0.0, 1.0.0-beta.1, 1.0.0-rc.5, 2.10.42-beta.99
// Examples that throw:  invalid, 1.0, 1.0.0-alpha.1 (alpha NOT supported in v1.0)
//
// Why not the `semver` npm package: not installed; adds ~50 KB for one
// function. Plan 08-01 RESEARCH §9 open question Q1 resolved as hand-roll.

export type SemverParts = {
  major: number;
  minor: number;
  patch: number;
  pre: 'beta' | 'rc' | null;
  preN: number;
};

const RE = /^(\d+)\.(\d+)\.(\d+)(?:-(beta|rc)\.(\d+))?$/;

export function parse(v: string): SemverParts | null {
  const m = RE.exec(v);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: (m[4] as 'beta' | 'rc' | undefined) ?? null,
    preN: m[5] ? Number(m[5]) : 0,
  };
}

// Returns -1, 0, 1 (a<b, a==b, a>b). Throws on invalid input.
export function compare(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) {
    throw new Error(`semverLite: invalid version comparing "${a}" vs "${b}"`);
  }
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  // Equal core. Pre-release < release.
  if (pa.pre === null && pb.pre !== null) return 1;
  if (pa.pre !== null && pb.pre === null) return -1;
  if (pa.pre === null && pb.pre === null) return 0;
  // Both pre. beta < rc per our naming convention.
  const order: Record<string, number> = { beta: 0, rc: 1 };
  if (pa.pre !== pb.pre) return order[pa.pre!] < order[pb.pre!] ? -1 : 1;
  if (pa.preN !== pb.preN) return pa.preN < pb.preN ? -1 : 1;
  return 0;
}

export const gt = (a: string, b: string): boolean => compare(a, b) > 0;
export const lt = (a: string, b: string): boolean => compare(a, b) < 0;
export const eq = (a: string, b: string): boolean => compare(a, b) === 0;
