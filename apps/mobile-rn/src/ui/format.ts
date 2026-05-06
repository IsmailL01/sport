// Чистые функции форматирования для UI. Тестируемые.

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${m.toFixed(0)} м`;
  return `${(m / 1000).toFixed(2)} км`;
}

export function formatArea(m2: number): string {
  if (m2 < 10_000) return `${m2.toFixed(0)} м²`;
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(2)} га`;
  return `${(m2 / 1_000_000).toFixed(3)} км²`;
}

/** Темп в формате "5:23" из значения min/km. null → "--:--". */
export function formatPace(paceMinKm: number | null): string {
  if (paceMinKm === null || !Number.isFinite(paceMinKm)) return '--:--';
  const mins = Math.floor(paceMinKm);
  const secs = Math.round((paceMinKm - mins) * 60);
  // edge: 4.999 → 5 минут 0 секунд (carry)
  const adjMins = secs === 60 ? mins + 1 : mins;
  const adjSecs = secs === 60 ? 0 : secs;
  return `${adjMins}:${adjSecs.toString().padStart(2, '0')}`;
}

export function formatCalories(kcal: number): string {
  return `${Math.round(kcal)} ккал`;
}
