// Linkify — extract URLs and @username mentions from message text and
// return a token array for rendering as a mix of plain text + tappable
// segments. Pure function; no React deps.
//
// Pattern coverage (closed-beta scope; v1.0.1 can add more):
//   - URLs:  http(s)://... — full RFC-3986 subset, common cases
//   - URLs:  www.example.com — bare with www prefix
//   - Mentions: @username — Telegram-style, 3-32 chars, [a-zA-Z0-9_]
//
// Email addresses + phone numbers intentionally NOT linkified — privacy
// concern in closed-beta (don't auto-trigger calls/SMS from chat messages).

export type LinkifyToken =
  | { kind: 'text'; value: string }
  | { kind: 'url'; value: string; href: string }
  | { kind: 'mention'; value: string; username: string };

// Combined regex: URL (http/https/www) OR @mention.
// URL: scheme://chars-no-space  OR  www.chars-no-space
// Mention: @ followed by [A-Za-z0-9_]{3,32}, NOT preceded by alphanumeric
//   (so `foo@bar.com` doesn't match `@bar` as a mention — email guard).
//
// Lookbehind `(?<![\p{L}\d])` requires Unicode-aware JS engine; Hermes
// supports lookbehind since RN 0.72. Use `u` flag for \p{L}.
const PATTERN =
  /(?<![\p{L}\d])(https?:\/\/[^\s<>]+|www\.[^\s<>]+|@[A-Za-z0-9_]{3,32})/gu;

export function linkifyText(input: string): LinkifyToken[] {
  if (input === '') return [];
  const tokens: LinkifyToken[] = [];
  let lastIndex = 0;

  const matches = input.matchAll(PATTERN);
  for (const m of matches) {
    const matchStart = m.index ?? 0;
    const matchedString = m[0];

    // Preceding plain text.
    if (matchStart > lastIndex) {
      tokens.push({ kind: 'text', value: input.slice(lastIndex, matchStart) });
    }

    // Categorize.
    if (matchedString.startsWith('@')) {
      tokens.push({
        kind: 'mention',
        value: matchedString,
        username: matchedString.slice(1),
      });
    } else {
      const href = matchedString.startsWith('http')
        ? matchedString
        : `https://${matchedString}`;
      tokens.push({ kind: 'url', value: matchedString, href });
    }

    lastIndex = matchStart + matchedString.length;
  }

  // Trailing plain text.
  if (lastIndex < input.length) {
    tokens.push({ kind: 'text', value: input.slice(lastIndex) });
  }

  return tokens;
}
