// simplifyForDisplay: Douglas-Peucker simplification ТОЛЬКО для визуальной отрисовки трека.
// Phase 1 / PHASE1-05. См. CONTEXT.md D-12..D-15, ТЗ §10.5, DEVELOPMENT_PLAN.md §3 P1-D-04.
// ВАЖНО: area calc и closure detection используют RAW points — никогда не передавать
// simplified output в AreaCalculator (это даст 5-15% ошибки площади, см. RESEARCH.md Pitfall 3).
//
// Layering: pure-domain helper, без Mapbox / React / state импортов. Живёт в src/map/util/
// исключительно для логической группировки с TrackLayer / HistoryTerritoryLayer.

import simplify from '@turf/simplify';
import { lineString } from '@turf/helpers';
import type { Feature, LineString } from 'geojson';

/** Порог числа точек, выше которого включаем Douglas-Peucker. */
export const SIMPLIFY_THRESHOLD_PTS = 2000;

/** Базовая толерантность в градусах (~5 м на экваторе) на zoom=12. */
export const BASE_TOLERANCE_DEG = 0.00005;

/**
 * Толерантность для текущего zoom: на каждый +1 zoom — половина толерантности
 * (вдвое точнее). Реализовано как `BASE_TOLERANCE_DEG * 2^(12 - zoom)`.
 */
export function dynamicTolerance(zoom: number): number {
  return BASE_TOLERANCE_DEG * Math.pow(2, 12 - zoom);
}

/**
 * Возвращает Feature<LineString> для отрисовки в ShapeSource:
 * - `points.length < 2` → `null` (LineString невалиден).
 * - `points.length < SIMPLIFY_THRESHOLD_PTS` → raw lineString (no simplification cost).
 * - иначе → Douglas-Peucker с `tolerance = dynamicTolerance(zoom)`, `mutate=false`.
 *
 * НЕ мутирует входной массив (явное `mutate: false`). НЕ предназначен для area calc.
 */
export function simplifyForDisplay(opts: {
  points: ReadonlyArray<{ latitude: number; longitude: number }>;
  zoom?: number;
}): Feature<LineString> | null {
  const { points, zoom = 14 } = opts;
  if (points.length < 2) return null;
  const coords: [number, number][] = points.map(
    (p) => [p.longitude, p.latitude] as [number, number],
  );
  const raw = lineString(coords) as Feature<LineString>;
  if (points.length < SIMPLIFY_THRESHOLD_PTS) return raw;
  return simplify(raw, {
    tolerance: dynamicTolerance(zoom),
    highQuality: false,
    mutate: false,
  });
}
