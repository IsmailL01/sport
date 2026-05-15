// Unit tests для simplifyForDisplay (Phase 1 / PHASE1-05).
// Покрытие: порог 2000 точек, scaling tolerance по zoom, mutate=false invariant,
// edge cases (0/1/2 точки). См. CONTEXT.md D-12..D-14, PLAN-big-track-simplify.md Task 1.

import {
  BASE_TOLERANCE_DEG,
  SIMPLIFY_THRESHOLD_PTS,
  dynamicTolerance,
  simplifyForDisplay,
} from '../map/util/simplify';

type LatLng = { latitude: number; longitude: number };

/**
 * Генератор точек вдоль прямой (почти-коллинеарной — Douglas-Peucker
 * должен сильно сжать). dlat / dlon — шаг по широте/долготе.
 */
function makeLinePoints(
  count: number,
  dlat: number = 0.00001,
  dlon: number = 0.00001,
): LatLng[] {
  return Array.from({ length: count }, (_, i) => ({
    latitude: 50.0 + i * dlat,
    longitude: 10.0 + i * dlon,
  }));
}

describe('simplifyForDisplay — threshold gate', () => {
  it('возвращает raw lineString для < SIMPLIFY_THRESHOLD_PTS точек (no-op)', () => {
    const pts = makeLinePoints(100);
    const result = simplifyForDisplay({ points: pts, zoom: 12 });
    expect(result).not.toBeNull();
    expect(result?.geometry.type).toBe('LineString');
    // Под порогом — точки сохраняются 1:1.
    expect(result?.geometry.coordinates.length).toBe(100);
  });

  it('применяет упрощение для >= SIMPLIFY_THRESHOLD_PTS точек', () => {
    const pts = makeLinePoints(3000);
    const result = simplifyForDisplay({ points: pts, zoom: 12 });
    expect(result).not.toBeNull();
    // 3000 почти-коллинеарных точек должны схлопнуться в малое число.
    expect(result!.geometry.coordinates.length).toBeLessThan(100);
    expect(result!.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
  });
});

describe('simplifyForDisplay — zoom scaling', () => {
  it('zoom=16 даёт более плотную линию (выше детализация) чем zoom=12 для того же входа', () => {
    const pts = makeLinePoints(3000);
    const z12 = simplifyForDisplay({ points: pts, zoom: 12 });
    const z16 = simplifyForDisplay({ points: pts, zoom: 16 });
    expect(z12).not.toBeNull();
    expect(z16).not.toBeNull();
    // Тighter tolerance на zoom=16 → больше или равное число координат.
    expect(z16!.geometry.coordinates.length).toBeGreaterThanOrEqual(
      z12!.geometry.coordinates.length,
    );
  });

  it('dynamicTolerance(12) === BASE_TOLERANCE_DEG', () => {
    expect(dynamicTolerance(12)).toBe(BASE_TOLERANCE_DEG);
  });

  it('dynamicTolerance(14) === BASE_TOLERANCE_DEG * 0.25', () => {
    expect(dynamicTolerance(14)).toBeCloseTo(BASE_TOLERANCE_DEG * 0.25, 12);
  });

  it('dynamicTolerance(10) === BASE_TOLERANCE_DEG * 4', () => {
    expect(dynamicTolerance(10)).toBeCloseTo(BASE_TOLERANCE_DEG * 4, 12);
  });
});

describe('simplifyForDisplay — invariants', () => {
  it('mutate=false: input array не модифицируется', () => {
    const pts = makeLinePoints(3000);
    const before = JSON.stringify(pts);
    simplifyForDisplay({ points: pts, zoom: 12 });
    const after = JSON.stringify(pts);
    expect(after).toBe(before);
  });

  it('возвращает null для пустого массива', () => {
    expect(simplifyForDisplay({ points: [], zoom: 12 })).toBeNull();
  });

  it('возвращает null для одной точки (LineString требует >= 2)', () => {
    expect(
      simplifyForDisplay({ points: [{ latitude: 1, longitude: 1 }], zoom: 12 }),
    ).toBeNull();
  });

  it('возвращает 2-coord LineString для минимально валидной линии (2 точки)', () => {
    const result = simplifyForDisplay({
      points: [
        { latitude: 50, longitude: 10 },
        { latitude: 51, longitude: 11 },
      ],
      zoom: 12,
    });
    expect(result).not.toBeNull();
    expect(result?.geometry.coordinates.length).toBe(2);
    // Контракт GeoJSON: [longitude, latitude].
    expect(result?.geometry.coordinates[0]).toEqual([10, 50]);
    expect(result?.geometry.coordinates[1]).toEqual([11, 51]);
  });
});
