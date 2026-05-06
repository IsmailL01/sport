import { calculateArea } from '../domain/AreaCalculator';
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

const COS50 = Math.cos((50 * Math.PI) / 180);

function squareAround(centerLat: number, centerLon: number, sideM: number): RawPoint[] {
  const dLat = sideM / 2 / 111320;
  const dLon = sideM / 2 / (111320 * Math.cos((centerLat * Math.PI) / 180));
  return [
    p(centerLat - dLat, centerLon - dLon),
    p(centerLat + dLat, centerLon - dLon),
    p(centerLat + dLat, centerLon + dLon),
    p(centerLat - dLat, centerLon + dLon),
  ];
}

describe('AreaCalculator.calculateArea', () => {
  it('< 3 точек → null + warning too-few-points', () => {
    const r = calculateArea([p(50, 10), p(50.001, 10)]);
    expect(r.areaM2).toBeNull();
    expect(r.method).toBeNull();
    expect(r.warnings).toContain('too-few-points');
  });

  it('квадрат 200×200м (≈40 000 м²) — tolerance 5%', () => {
    const sq = squareAround(50, 10, 200);
    const r = calculateArea(sq);
    expect(r.method).toBe('shoelace_simple');
    expect(r.warnings).toEqual([]);
    expect(r.areaM2).toBeGreaterThan(38_000);
    expect(r.areaM2).toBeLessThan(42_000);
  });

  it('футбольное поле FIFA 105×68 ≈ 7140 м² (tolerance 5%)', () => {
    const dLat = 68 / 2 / 111320;
    const dLon = 105 / 2 / (111320 * COS50);
    const field = [
      p(50 - dLat, 10 - dLon),
      p(50 + dLat, 10 - dLon),
      p(50 + dLat, 10 + dLon),
      p(50 - dLat, 10 + dLon),
    ];
    const r = calculateArea(field);
    expect(r.method).toBe('shoelace_simple');
    expect(r.areaM2).toBeGreaterThan(6_780);
    expect(r.areaM2).toBeLessThan(7_500);
  });

  it('самопересекающаяся восьмёрка → method=shoelace_with_warning', () => {
    // Две петли образуют восьмёрку — self-intersection детектируется.
    const sq = squareAround(50, 10, 100);
    // Подмена: меняем местами две точки, получая bowtie/восьмёрку
    const bowtie = [sq[0], sq[2], sq[1], sq[3]];
    const r = calculateArea(bowtie);
    expect(r.method).toBe('shoelace_with_warning');
    expect(r.warnings).toContain('self-intersection');
  });

  it('круговой трек (32 точки на окружности r=100м) ≈ π·100² (tolerance 5%)', () => {
    const N = 32;
    const r0 = 100; // м
    const points: RawPoint[] = [];
    for (let i = 0; i < N; i += 1) {
      const angle = (i / N) * 2 * Math.PI;
      const dx = r0 * Math.cos(angle);
      const dy = r0 * Math.sin(angle);
      const dLat = dy / 111320;
      const dLon = dx / (111320 * COS50);
      points.push(p(50 + dLat, 10 + dLon));
    }
    const expected = Math.PI * r0 * r0; // ≈ 31_416 м²
    const r = calculateArea(points);
    expect(r.areaM2).toBeGreaterThan(expected * 0.93);
    expect(r.areaM2).toBeLessThan(expected * 1.02);
  });
});
