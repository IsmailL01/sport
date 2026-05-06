// Фасад для расчёта площади трека (ТЗ §6.6, §6.7, P1-G-06).
// Объединяет: упрощение Дугласа-Пёкера → проекцию → детект самопересечений → shoelace.

import type { RawPoint } from './types';
import { douglasPeucker } from '../util/douglasPeucker';
import { localProjection, shoelaceArea } from '../util/geo';
import { hasSelfIntersection } from '../util/selfIntersection';

export type AreaResult = {
  /** Площадь в м², null если points < 3. */
  areaM2: number | null;
  /** Алгоритм, которым посчитали. */
  method: 'shoelace_simple' | 'shoelace_with_warning' | null;
  /** Список предупреждений для UI/логов. */
  warnings: AreaWarning[];
};

export type AreaWarning = 'self-intersection' | 'too-few-points';

const DEFAULT_TOLERANCE_M = 5;

/**
 * Посчитать площадь замкнутого трека.
 * Поведение: ТЗ §6.7 — самопересечения отмечаются warning'ом, но shoelace
 * всё равно вычисляется (со знаком). Фолбэк на coverage / convex hull —
 * Phase 2 (ТЗ §6.6 Подход C).
 */
export function calculateArea(points: readonly RawPoint[], options: { toleranceM?: number } = {}): AreaResult {
  if (points.length < 3) {
    return {
      areaM2: null,
      method: null,
      warnings: ['too-few-points'],
    };
  }

  const tolerance = options.toleranceM ?? DEFAULT_TOLERANCE_M;
  const simplified = douglasPeucker([...points], tolerance);
  const xy = localProjection(simplified);
  const intersects = hasSelfIntersection(xy);
  const area = Math.abs(shoelaceArea(xy));

  return {
    areaM2: area,
    method: intersects ? 'shoelace_with_warning' : 'shoelace_simple',
    warnings: intersects ? ['self-intersection'] : [],
  };
}
