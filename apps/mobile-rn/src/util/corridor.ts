import buffer from '@turf/buffer';
import { lineString } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import type { RawPoint } from '../domain/types';
import { localProjection, shoelaceArea } from './geo';

export type CorridorFeature = Feature<Polygon | MultiPolygon>;

/**
 * Построить буфер заданной ширины (в метрах) вокруг полилинии трека.
 * ТЗ §6.6 Подход B / FR-014: ширина 2.5м с каждой стороны = коридор 5м.
 *
 * Возвращает null если точек < 2 (нечего буферизовать).
 */
export function bufferTrack(
  points: readonly RawPoint[],
  widthM = 2.5,
): CorridorFeature | null {
  if (points.length < 2) return null;
  const line = lineString(points.map((p) => [p.longitude, p.latitude]));
  const buffered = buffer(line, widthM, { units: 'meters' });
  if (!buffered || !buffered.geometry) return null;
  return buffered as CorridorFeature;
}

/**
 * Площадь корридора в м². Для FillLayer'а удобно знать сколько накрыли.
 * Использует ту же локальную проекцию что и shoelace (см. ТЗ §6.6).
 */
export function corridorArea(corridor: CorridorFeature): number {
  const geom = corridor.geometry;
  if (geom.type === 'Polygon') {
    return polygonArea(geom.coordinates);
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.reduce(
      (sum, polygon) => sum + polygonArea(polygon),
      0,
    );
  }
  return 0;
}

function polygonArea(rings: number[][][]): number {
  if (rings.length === 0) return 0;
  const outer = rings[0];
  const xy = localProjection(
    outer.map(
      (c): RawPoint => ({
        timestamp: 0,
        latitude: c[1],
        longitude: c[0],
        altitude: null,
        accuracy: null,
        speed: null,
        heading: null,
      }),
    ),
  );
  return Math.abs(shoelaceArea(xy));
}
