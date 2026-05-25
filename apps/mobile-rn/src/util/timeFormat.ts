// Reusable time formatters for chat/social UI. Keeps the formatting policy in
// one place so ChatRow / FeedItem / NotificationRow / etc. can render
// consistent labels.
//
// Strategy (Telegram-style):
//   today        → "14:30"          (24h time)
//   yesterday    → "Вчера"
//   within 6 days → "Пн" / "Вт" / …  (Russian short weekday)
//   older        → "10.05" or "10.05.24" if previous year

const RU_WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

/** ms in one day; using a constant avoids per-call new Date() construction overhead. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Format a timestamp for chat-list-style relative display.
 *
 * @param ts        Unix epoch ms.
 * @param nowMs     Optional clock injection for tests. Defaults to Date.now().
 */
export function formatChatTime(ts: number, nowMs: number = Date.now()): string {
  const d = new Date(ts);
  const now = new Date(nowMs);

  if (sameDay(d, now)) {
    return formatHHmm(d);
  }

  const yesterday = new Date(nowMs - ONE_DAY_MS);
  if (sameDay(d, yesterday)) {
    return 'Вчера';
  }

  // Within last 6 days (excluding today + yesterday) → weekday short.
  const diffDays = daysBetweenDateOnly(d, now);
  if (diffDays >= 2 && diffDays <= 6) {
    return RU_WEEKDAY_SHORT[d.getDay()];
  }

  // Older — same year shows dd.mm; prior years show dd.mm.yy.
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) {
    return `${dd}.${mm}`;
  }
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Calendar-day delta (ignores hours), e.g. today vs yesterday = 1 even at 23:59 → 00:01. */
function daysBetweenDateOnly(earlier: Date, later: Date): number {
  const e = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate()).getTime();
  const l = new Date(later.getFullYear(), later.getMonth(), later.getDate()).getTime();
  return Math.round((l - e) / ONE_DAY_MS);
}

function formatHHmm(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
