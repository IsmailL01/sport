// All-time territory: рендерит ВСЕ закрытые сессии как набор полупрозрачных
// полигонов. Без union (для прототипа достаточно overlap-визуала).
// Для оптимизации больших историй (Phase 2+) — turf.union в Worker.
//
// Phase 1 / PHASE1-05: длинные сессии (>2000 точек) проходят через
// simplifyForDisplay (Douglas-Peucker) для перимeтра полигона — даёт NFR-006
// (≥50 fps panning) даже при многих длинных сессиях в Journal-overlay.
// ВАЖНО: упрощение применяется только к ВИЗУАЛЬНОМУ полигону. Исходные точки
// (closedSessionsPoints) остаются нетронутыми — Area calc, recovery, GPX export
// читают их напрямую. Закрытие кольца сохраняется явно (first === last).

import { useMemo } from 'react';
import { FillLayer, ShapeSource } from '@rnmapbox/maps';
import type {
  Feature,
  FeatureCollection,
  Polygon,
} from 'geojson';

import type { Point } from '../../domain/types';
import { SIMPLIFY_THRESHOLD_PTS, simplifyForDisplay } from '../util/simplify';

export type HistoryTerritoryLayerProps = {
  /** Map sessionId → точки закрытой сессии. */
  closedSessionsPoints: ReadonlyMap<number, Point[]>;
  color?: string;
  fillOpacity?: number;
  id?: string;
  /**
   * Текущий zoom-уровень камеры — для масштабирования tolerance в
   * simplifyForDisplay (PHASE1-05). По умолчанию 14 — нейтральное среднее.
   */
  zoom?: number;
};

export function HistoryTerritoryLayer({
  closedSessionsPoints,
  color = '#3B82F6',
  fillOpacity = 0.18,
  id = 'history',
  zoom = 14,
}: HistoryTerritoryLayerProps) {
  const collection = useMemo<FeatureCollection<Polygon>>(() => {
    const features: Feature<Polygon>[] = [];
    for (const [sessionId, points] of closedSessionsPoints.entries()) {
      if (points.length < 3) continue;

      let coords: [number, number][];
      if (points.length < SIMPLIFY_THRESHOLD_PTS) {
        // Под порогом — прежний путь без упрощения.
        coords = points.map((p) => [p.longitude, p.latitude]);
      } else {
        // PHASE1-05 / D-15: длинная закрытая сессия → simplify периметр.
        // simplifyForDisplay даёт Feature<LineString>; разворачиваем обратно
        // в плоский массив координат и явно замыкаем кольцо.
        const simplified = simplifyForDisplay({ points, zoom });
        if (simplified === null) continue;
        coords = simplified.geometry.coordinates.map(
          ([lon, lat]) => [lon, lat] as [number, number],
        );
        // Полигон требует минимум 3 уникальных точки (4 координаты с замыканием).
        if (coords.length < 3) continue;
      }

      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
      features.push({
        type: 'Feature',
        properties: { sessionId },
        geometry: { type: 'Polygon', coordinates: [coords] },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [closedSessionsPoints, zoom]);

  return (
    <ShapeSource id={`${id}-source`} shape={collection}>
      <FillLayer
        id={`${id}-fill`}
        style={{ fillColor: color, fillOpacity }}
      />
    </ShapeSource>
  );
}
