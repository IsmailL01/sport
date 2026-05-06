import {
  computeArea,
  haversineDistance,
  isClosed,
  localProjection,
  shoelaceArea,
  totalDistance,
} from '../util/geo';
import type { RawPoint } from '../domain/types';

function p(latitude: number, longitude: number): RawPoint {
  return {
    timestamp: 0,
    latitude,
    longitude,
    altitude: null,
    accuracy: null,
    speed: null,
    heading: null,
  };
}

describe('haversineDistance', () => {
  it('возвращает 0 для одной и той же точки', () => {
    expect(haversineDistance(p(50, 10), p(50, 10))).toBeCloseTo(0, 5);
  });

  it('1° широты ≈ 111.2 км (с tolerance 0.5%)', () => {
    const d = haversineDistance(p(0, 0), p(1, 0));
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('1° долготы на экваторе ≈ 111.3 км', () => {
    const d = haversineDistance(p(0, 0), p(0, 1));
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('1° долготы на 60° широты ≈ 55.8 км (cos(60) ≈ 0.5)', () => {
    const d = haversineDistance(p(60, 0), p(60, 1));
    expect(d).toBeGreaterThan(55_000);
    expect(d).toBeLessThan(56_000);
  });
});

describe('totalDistance', () => {
  it('возвращает 0 если меньше 2 точек', () => {
    expect(totalDistance([])).toBe(0);
    expect(totalDistance([p(50, 10)])).toBe(0);
  });

  it('сумма участков пути', () => {
    const points = [p(50, 10), p(50.001, 10), p(50.002, 10)];
    const segment = haversineDistance(points[0], points[1]);
    expect(totalDistance(points)).toBeCloseTo(2 * segment, 1);
  });
});

describe('isClosed', () => {
  it('false если меньше 3 точек', () => {
    expect(isClosed([p(50, 10), p(50, 10)])).toBe(false);
  });

  it('false если общая длина < 200м', () => {
    // 50→50.0005 (≈55м), 50.0005→50 (≈55м) — total 110м < 200м.
    const points = [p(50, 10), p(50.0005, 10), p(50, 10)];
    expect(isClosed(points)).toBe(false);
  });

  it('true для замкнутого треугольника со стороной ~150м', () => {
    // Каждая сторона ~150м (через 0.0013° широты), total ~450м.
    // Финальная точка совпадает со стартовой → gap=0 < 20м.
    const points = [
      p(50, 10),
      p(50.00135, 10),
      p(50.001, 10.001),
      p(50, 10),
    ];
    expect(isClosed(points)).toBe(true);
  });

  it('false если конец далеко от старта (>20м)', () => {
    const points = [
      p(50, 10),
      p(50.003, 10),
      p(50.003, 10.003),
      p(50, 10.003), // ~213м от старта
    ];
    expect(isClosed(points)).toBe(false);
  });
});

describe('localProjection + shoelaceArea', () => {
  it('возвращает площадь 0 для коллинеарных точек', () => {
    const xy = localProjection([p(50, 10), p(50.001, 10), p(50.002, 10)]);
    expect(Math.abs(shoelaceArea(xy))).toBeCloseTo(0, 1);
  });

  it('квадрат 100×100м даёт ≈10000 м² (tolerance 1%)', () => {
    // 100м по широте ≈ 0.0008983° (100 / 111320)
    // 100м по долготе на 50° широты ≈ 0.0013975° (100 / (111320*cos(50°)))
    const dLat = 100 / 111320;
    const cosLat = Math.cos((50 * Math.PI) / 180);
    const dLon = 100 / (111320 * cosLat);
    const square = [
      p(50, 10),
      p(50 + dLat, 10),
      p(50 + dLat, 10 + dLon),
      p(50, 10 + dLon),
    ];
    const xy = localProjection(square);
    const area = Math.abs(shoelaceArea(xy));
    expect(area).toBeGreaterThan(9_500);
    expect(area).toBeLessThan(10_500);
  });
});

describe('computeArea', () => {
  it('null если меньше 3 точек', () => {
    expect(computeArea([])).toBe(null);
    expect(computeArea([p(50, 10), p(50.001, 10)])).toBe(null);
  });

  it('квадрат 200×200м ≈ 40 000 м² (tolerance 2%)', () => {
    const dLat = 200 / 111320;
    const cosLat = Math.cos((50 * Math.PI) / 180);
    const dLon = 200 / (111320 * cosLat);
    const square = [
      p(50, 10),
      p(50 + dLat, 10),
      p(50 + dLat, 10 + dLon),
      p(50, 10 + dLon),
    ];
    const area = computeArea(square)!;
    expect(area).toBeGreaterThan(39_200);
    expect(area).toBeLessThan(40_800);
  });
});
