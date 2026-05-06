// Алгоритм упрощения Дугласа-Пёкера. Используется перед расчётом площади
// для устранения шума GPS и снижения сложности shoelace.
// ТЗ §6.6 рекомендует толерантность 5м для треков.

import type { RawPoint } from '../domain/types';
import { haversineDistance } from './geo';

/**
 * Упростить трек, оставив точки с offsetом > tolerance метров.
 * Сохраняет первую и последнюю точки.
 */
export function douglasPeucker<P extends Pick<RawPoint, 'latitude' | 'longitude'>>(
  points: P[],
  toleranceM: number = 5,
): P[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start <= 1) continue;

    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceM && maxIdx !== -1) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }

  const result: P[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}

/**
 * Расстояние от точки p до отрезка [a, b], в метрах. Использует haversine
 * — для треков диаметром до ~10 км ошибка <0.5%.
 */
function perpendicularDistance<P extends Pick<RawPoint, 'latitude' | 'longitude'>>(
  p: P,
  a: P,
  b: P,
): number {
  const lenAB = haversineDistance(
    { latitude: a.latitude, longitude: a.longitude } as RawPoint,
    { latitude: b.latitude, longitude: b.longitude } as RawPoint,
  );
  if (lenAB < 1e-6) {
    return haversineDistance(
      { latitude: a.latitude, longitude: a.longitude } as RawPoint,
      { latitude: p.latitude, longitude: p.longitude } as RawPoint,
    );
  }
  // Площадь треугольника через haversine — приближённо.
  const dAP = haversineDistance(
    { latitude: a.latitude, longitude: a.longitude } as RawPoint,
    { latitude: p.latitude, longitude: p.longitude } as RawPoint,
  );
  const dBP = haversineDistance(
    { latitude: b.latitude, longitude: b.longitude } as RawPoint,
    { latitude: p.latitude, longitude: p.longitude } as RawPoint,
  );
  // Heron's formula → площадь, делим на основание для высоты.
  const s = (dAP + dBP + lenAB) / 2;
  const areaSq = Math.max(0, s * (s - dAP) * (s - dBP) * (s - lenAB));
  const area = Math.sqrt(areaSq);
  return (2 * area) / lenAB;
}
