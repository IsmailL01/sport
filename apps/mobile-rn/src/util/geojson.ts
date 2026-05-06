import type { RawPoint } from '../domain/types';

export type LineFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
};

export type EmptyCollection = {
  type: 'FeatureCollection';
  features: [];
};

/**
 * Преобразовать список raw-точек в GeoJSON LineString feature.
 * Возвращает empty FeatureCollection если точек < 2 (нечего рисовать).
 */
export function pointsToLineString(
  points: RawPoint[],
): LineFeature | EmptyCollection {
  if (points.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.longitude, p.latitude]),
    },
  };
}
