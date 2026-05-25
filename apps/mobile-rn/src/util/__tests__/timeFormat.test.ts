import { formatChatTime } from '../timeFormat';

// Fixed reference clock: Friday, 2026-05-22 15:00:00 local time.
// (Picking Friday so that "within last 6 days" includes the prior Sun/Mon/etc.
//  without crossing year boundary.)
const NOW = new Date(2026, 4, 22, 15, 0, 0).getTime(); // May = month index 4

function at(year: number, month1to12: number, day: number, hour = 12, min = 0): number {
  return new Date(year, month1to12 - 1, day, hour, min, 0).getTime();
}

describe('formatChatTime', () => {
  describe('today → HH:mm', () => {
    it('formats today same hour', () => {
      expect(formatChatTime(at(2026, 5, 22, 14, 30), NOW)).toBe('14:30');
    });
    it('zero-pads single-digit hour/minute', () => {
      expect(formatChatTime(at(2026, 5, 22, 9, 5), NOW)).toBe('09:05');
    });
    it('handles midnight today', () => {
      expect(formatChatTime(at(2026, 5, 22, 0, 0), NOW)).toBe('00:00');
    });
    it('handles 23:59 today', () => {
      expect(formatChatTime(at(2026, 5, 22, 23, 59), NOW)).toBe('23:59');
    });
  });

  describe('yesterday → "Вчера"', () => {
    it('formats yesterday at any hour', () => {
      expect(formatChatTime(at(2026, 5, 21, 10, 0), NOW)).toBe('Вчера');
    });
    it('formats yesterday 23:59 (calendar-day boundary, not 24h)', () => {
      expect(formatChatTime(at(2026, 5, 21, 23, 59), NOW)).toBe('Вчера');
    });
    it('formats yesterday 00:00', () => {
      expect(formatChatTime(at(2026, 5, 21, 0, 0), NOW)).toBe('Вчера');
    });
  });

  describe('within last 6 days → Russian short weekday', () => {
    it('2 days ago (Wed → Wed display)', () => {
      // NOW is Fri 2026-05-22; 2 days before = Wed 2026-05-20 → "Ср"
      expect(formatChatTime(at(2026, 5, 20, 10, 0), NOW)).toBe('Ср');
    });
    it('3 days ago → "Вт" (Tue)', () => {
      expect(formatChatTime(at(2026, 5, 19, 10, 0), NOW)).toBe('Вт');
    });
    it('6 days ago → "Сб" (Sat)', () => {
      // 6 days before Fri May 22 = Sat May 16 → "Сб"
      expect(formatChatTime(at(2026, 5, 16, 10, 0), NOW)).toBe('Сб');
    });
  });

  describe('older same year → "dd.mm"', () => {
    it('7 days ago → date format', () => {
      // 7 days before May 22 = May 15
      expect(formatChatTime(at(2026, 5, 15, 10, 0), NOW)).toBe('15.05');
    });
    it('January same year', () => {
      expect(formatChatTime(at(2026, 1, 3, 10, 0), NOW)).toBe('03.01');
    });
  });

  describe('previous years → "dd.mm.yy"', () => {
    it('shows 2-digit year for prior year', () => {
      expect(formatChatTime(at(2025, 12, 1, 10, 0), NOW)).toBe('01.12.25');
    });
    it('shows 2-digit year for much older', () => {
      expect(formatChatTime(at(2024, 6, 15, 10, 0), NOW)).toBe('15.06.24');
    });
  });
});
