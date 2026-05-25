// Avatar initials + deterministic gradient palette.
//
// When src is null/empty, Avatar falls back to a colored circle with the
// user's initials. Color is picked from a fixed 12-color palette indexed by
// hash(name) — so the same name always produces the same color across the
// app (deterministic across sessions + devices).

/** 12-color palette. Tuned for dark theme: each is ~mid-saturation, ~50% lightness. */
const PALETTE: ReadonlyArray<{ start: string; end: string }> = [
  { start: '#F87171', end: '#DC2626' }, // red
  { start: '#FB923C', end: '#EA580C' }, // orange
  { start: '#FBBF24', end: '#D97706' }, // amber
  { start: '#A3E635', end: '#65A30D' }, // lime
  { start: '#34D399', end: '#059669' }, // emerald
  { start: '#22D3EE', end: '#0891B2' }, // cyan
  { start: '#60A5FA', end: '#2563EB' }, // blue
  { start: '#818CF8', end: '#4F46E5' }, // indigo
  { start: '#A78BFA', end: '#7C3AED' }, // violet
  { start: '#E879F9', end: '#C026D3' }, // fuchsia
  { start: '#F472B6', end: '#DB2777' }, // pink
  { start: '#9CA3AF', end: '#4B5563' }, // gray (fallback for empty-string name)
];

/**
 * Cheap, stable string hash. Same algorithm as Avatar's pravatar fallback
 * to preserve back-compat for any tests asserting on hash bucket.
 */
export function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/**
 * Returns deterministic color pair for the avatar gradient given a name.
 * Empty string → gray bucket; never crashes.
 */
export function colorForName(name: string): { start: string; end: string } {
  if (name === '') return PALETTE[PALETTE.length - 1];
  const idx = Math.abs(hashName(name)) % PALETTE.length;
  return PALETTE[idx];
}

/**
 * Extracts up to 2 initial letters from a display name.
 *
 *   "Ismail" → "I"
 *   "Ismail Latifov" → "IL"
 *   "Иван Петров" → "ИП"
 *   "@username" → "U"  (strips leading @)
 *   "j" → "J"
 *   "" → "?"
 *
 * Always uppercase. Stripped of leading `@` so `@nickname` doesn't show as "@".
 */
export function initialsForName(name: string): string {
  const cleaned = name.trim().replace(/^@+/, '');
  if (cleaned === '') return '?';

  // Split on whitespace; take first letter of first 1-2 tokens.
  const tokens = cleaned.split(/\s+/).filter((s) => s.length > 0);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) {
    return tokens[0]!.charAt(0).toUpperCase();
  }
  return (tokens[0]!.charAt(0) + tokens[1]!.charAt(0)).toUpperCase();
}
