// Простой O(n²) детект самопересечений для треков до ~1000 точек после
// упрощения Дугласа-Пёкера. ТЗ §6.7.

export type Point2D = { x: number; y: number };

/**
 * Возвращает true если в полилинии есть пересекающиеся не-соседние рёбра.
 * Соседние рёбра (общая вершина) пропускаются.
 */
export function hasSelfIntersection(points: Point2D[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n - 1; i += 1) {
    const a1 = points[i];
    const a2 = points[i + 1];
    for (let j = i + 2; j < n - 1; j += 1) {
      // Пропускаем смежные рёбра.
      if (i === 0 && j === n - 2) continue;
      const b1 = points[j];
      const b2 = points[j + 1];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  // Коллинеарные случаи — для прототипа Phase 1 не критичны.
  return false;
}

function cross(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
