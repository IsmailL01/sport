import {
  calculateCalories,
  currentPace,
  currentSpeed,
} from '../domain/metrics';
import type { RawPoint } from '../domain/types';

function p(ts: number, lat: number, lon = 10): RawPoint {
  return {
    timestamp: ts,
    latitude: lat,
    longitude: lon,
    altitude: null,
    accuracy: null,
    speed: null,
    heading: null,
  };
}

describe('currentSpeed', () => {
  it('0 для пустого массива', () => {
    expect(currentSpeed([])).toBe(0);
  });

  it('0 для одной точки', () => {
    expect(currentSpeed([p(0, 50)])).toBe(0);
  });

  it('равномерное движение 1 м/с — возвращает ≈1 м/с', () => {
    // 11 точек по 1 м (0.00001° ≈ 1.11м) с шагом 1с
    const dLat = 1 / 111320;
    const points: RawPoint[] = [];
    for (let i = 0; i <= 10; i += 1) {
      points.push(p(i * 1000, 50 + i * dLat));
    }
    const speed = currentSpeed(points);
    expect(speed).toBeGreaterThan(0.95);
    expect(speed).toBeLessThan(1.05);
  });

  it('считает только последние 10с — старые точки игнорирует', () => {
    // 5 точек в начале с большим шагом, потом 11 точек медленных в окне 10с
    const dLat = 1 / 111320;
    const points: RawPoint[] = [];
    // Старая часть: 1 м/с, в timestamp 0..4с
    for (let i = 0; i <= 4; i += 1) {
      points.push(p(i * 1000, 50 + i * dLat));
    }
    // Новая часть: 5 м/с, в timestamp 100с..110с (через 96с после старой)
    for (let i = 0; i <= 10; i += 1) {
      points.push(p(100_000 + i * 1000, 50.001 + i * 5 * dLat));
    }
    const speed = currentSpeed(points);
    // Только новая часть учитывается → ≈5 м/с
    expect(speed).toBeGreaterThan(4.5);
    expect(speed).toBeLessThan(5.5);
  });
});

describe('currentPace', () => {
  it('null если скорость < 0.5 м/с', () => {
    expect(currentPace(0)).toBeNull();
    expect(currentPace(0.4)).toBeNull();
    expect(currentPace(0.49)).toBeNull();
  });

  it('5:00 мин/км для 3.33 м/с', () => {
    // 3.33 м/с * 60 = 200 м/мин → 5 мин/км
    const pace = currentPace(1000 / (5 * 60))!;
    expect(pace).toBeCloseTo(5, 2);
  });

  it('4:00 мин/км для 4.17 м/с', () => {
    const pace = currentPace(1000 / (4 * 60))!;
    expect(pace).toBeCloseTo(4, 2);
  });
});

describe('calculateCalories', () => {
  it('70 кг × 5 км × 1.036 ≈ 362.6 ккал', () => {
    expect(calculateCalories(70, 5000)).toBeCloseTo(362.6, 1);
  });

  it('0 для 0 дистанции', () => {
    expect(calculateCalories(70, 0)).toBe(0);
  });
});
