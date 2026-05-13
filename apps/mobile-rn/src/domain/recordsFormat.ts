// Human-readable форматирование значений рекордов по kind.
// Phase 8 / M10.1.

import { formatCalories, formatDistance, formatDuration, formatPace } from '../ui/format';
import type { RecordKind } from './records';

export function formatRecordValue(kind: RecordKind, value: number): string {
  switch (kind) {
    case 'longest_distance':
      return formatDistance(value);
    case 'longest_duration':
      return formatDuration(Math.floor(value));
    case 'best_pace_1km':
    case 'best_pace_5km':
    case 'best_pace_10km':
      return `${formatPace(value)} /км`;
    case 'most_calories':
      return formatCalories(value);
    case 'max_avg_speed':
      return `${value.toFixed(1)} км/ч`;
  }
}

/** Дельта между новым и предыдущим в человеко-читаемом виде. */
export function formatRecordDelta(kind: RecordKind, value: number, prev: number | null): string {
  if (prev === null) return 'первый рекорд';
  const delta = value - prev;
  const sign = delta > 0 ? '+' : '';
  switch (kind) {
    case 'longest_distance':
      return `${sign}${formatDistance(Math.abs(delta))}`;
    case 'longest_duration':
      return `${sign}${formatDuration(Math.abs(Math.floor(delta)))}`;
    case 'best_pace_1km':
    case 'best_pace_5km':
    case 'best_pace_10km': {
      // pace lower = better, поэтому показываем абсолютную разницу с правильным знаком.
      const absDelta = Math.abs(delta);
      const better = delta < 0;
      const min = Math.floor(absDelta);
      const sec = Math.round((absDelta - min) * 60);
      return `${better ? '−' : '+'}${min}:${sec.toString().padStart(2, '0')} /км`;
    }
    case 'most_calories':
      return `${sign}${Math.round(delta)} ккал`;
    case 'max_avg_speed':
      return `${sign}${delta.toFixed(1)} км/ч`;
  }
}
