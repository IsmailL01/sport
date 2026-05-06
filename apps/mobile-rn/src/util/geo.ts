import type { RawPoint } from '../domain/types';

const EARTH_RADIUS_M = 6371000;
const DEG2RAD = Math.PI / 180;

/**
 * Haversine distance между двумя точками, в метрах. ТЗ §6.2.
 * Достаточно для пробежек до ~100 км; Vincenty избыточен.
 */
export function haversineDistance(a: RawPoint, b: RawPoint): number {
  const phi1 = a.latitude * DEG2RAD;
  const phi2 = b.latitude * DEG2RAD;
  const dphi = (b.latitude - a.latitude) * DEG2RAD;
  const dlambda = (b.longitude - a.longitude) * DEG2RAD;
  const x =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_M * c;
}

/** Накопительная дистанция по списку точек, в метрах. */
export function totalDistance(points: RawPoint[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    sum += haversineDistance(points[i - 1], points[i]);
  }
  return sum;
}

/** Замкнут ли трек: ТЗ §6.5 — длина >200м И dist(first,last) <20м. */
export function isClosed(points: RawPoint[], totalDistanceM?: number): boolean {
  if (points.length < 3) return false;
  const dist = totalDistanceM ?? totalDistance(points);
  if (dist < 200) return false;
  return haversineDistance(points[0], points[points.length - 1]) < 20;
}

/**
 * Локальная плоская проекция точек относительно их центроида (ТЗ §6.6).
 * Возвращает {x, y} в метрах. Применима для треков диаметром до ~10 км
 * с погрешностью <1%.
 */
export function localProjection(points: RawPoint[]): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const lat0 =
    points.reduce((acc, p) => acc + p.latitude, 0) / points.length;
  const lon0 =
    points.reduce((acc, p) => acc + p.longitude, 0) / points.length;
  const cosLat0 = Math.cos(lat0 * DEG2RAD);
  return points.map((p) => ({
    x: (p.longitude - lon0) * DEG2RAD * cosLat0 * EARTH_RADIUS_M,
    y: (p.latitude - lat0) * DEG2RAD * EARTH_RADIUS_M,
  }));
}

/**
 * Shoelace area для последовательности точек в локальной плоскости (м).
 * Возвращает площадь со знаком (negative — clockwise). Для UI используйте abs.
 */
export function shoelaceArea(xy: { x: number; y: number }[]): number {
  if (xy.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const j = (i + 1) % xy.length;
    s += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
  }
  return s / 2;
}

/**
 * Площадь замкнутого трека в м². Возвращает null если points < 3.
 * Формула: проекция → shoelace → abs.
 */
export function computeArea(points: RawPoint[]): number | null {
  if (points.length < 3) return null;
  const xy = localProjection(points);
  return Math.abs(shoelaceArea(xy));
}
