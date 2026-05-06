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

export type PolygonFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
};

/**
 * Преобразовать замкнутый трек в GeoJSON Polygon. Автоматически закрывает кольцо
 * (добавляет первую координату в конец), как требует GeoJSON spec для Polygon.
 * Возвращает empty FeatureCollection если точек < 3.
 */
export function pointsToPolygon(
  points: RawPoint[],
): PolygonFeature | EmptyCollection {
  if (points.length < 3) {
    return { type: 'FeatureCollection', features: [] };
  }
  const coords: [number, number][] = points.map((p) => [
    p.longitude,
    p.latitude,
  ]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push(first);
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}
