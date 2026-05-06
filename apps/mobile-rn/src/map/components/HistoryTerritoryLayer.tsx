// All-time territory: рендерит ВСЕ закрытые сессии как набор полупрозрачных
// полигонов. Без union (для прототипа достаточно overlap-визуала).
// Для оптимизации больших историй (Phase 2+) — turf.union в Worker.

import { useMemo } from 'react';
import { FillLayer, ShapeSource } from '@rnmapbox/maps';
import type {
  Feature,
  FeatureCollection,
  Polygon,
} from 'geojson';

import type { Point } from '../../domain/types';

export type HistoryTerritoryLayerProps = {
  /** Map sessionId → точки закрытой сессии. */
  closedSessionsPoints: ReadonlyMap<number, Point[]>;
  color?: string;
  fillOpacity?: number;
  id?: string;
};

export function HistoryTerritoryLayer({
  closedSessionsPoints,
  color = '#3B82F6',
  fillOpacity = 0.18,
  id = 'history',
}: HistoryTerritoryLayerProps) {
  const collection = useMemo<FeatureCollection<Polygon>>(() => {
    const features: Feature<Polygon>[] = [];
    for (const [sessionId, points] of closedSessionsPoints.entries()) {
      if (points.length < 3) continue;
      const coords: [number, number][] = points.map((p) => [
        p.longitude,
        p.latitude,
      ]);
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
  }, [closedSessionsPoints]);

  return (
    <ShapeSource id={`${id}-source`} shape={collection}>
      <FillLayer
        id={`${id}-fill`}
        style={{ fillColor: color, fillOpacity }}
      />
    </ShapeSource>
  );
}
