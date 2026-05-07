import { associateHrToPoints } from '../domain/sensorAssociation';
import type { Point } from '../domain/types';
import { parseHeartRateMeasurement } from '../sensors/adapters/BleSensorAdapter';
import type { SensorReading } from '../sensors/SensorAdapter';

function pt(ts: number): Point {
  return {
    timestamp: ts,
    latitude: 50,
    longitude: 10,
    altitude: null,
    accuracy: 5,
    speed: null,
    heading: null,
    source: 'kalman',
  };
}

function hr(ts: number, bpm: number): SensorReading {
  return { timestamp: ts, type: 'hr', value: bpm, sourceId: 'mock' };
}

describe('parseHeartRateMeasurement', () => {
  it('null если меньше 2 байт', () => {
    expect(parseHeartRateMeasurement(new Uint8Array([0x00]))).toBeNull();
    expect(parseHeartRateMeasurement(new Uint8Array([]))).toBeNull();
  });

  it('uint8 HR (flag bit 0 = 0)', () => {
    expect(parseHeartRateMeasurement(new Uint8Array([0x00, 145]))).toBe(145);
  });

  it('uint16 HR (flag bit 0 = 1, little-endian)', () => {
    // 0x012C = 300 (выше нормы, но проверяем парсинг)
    expect(parseHeartRateMeasurement(new Uint8Array([0x01, 0x2c, 0x01]))).toBe(300);
  });

  it('null если flag заявил uint16 но данных нет', () => {
    expect(parseHeartRateMeasurement(new Uint8Array([0x01, 145]))).toBeNull();
  });
});

describe('associateHrToPoints', () => {
  it('null hrBpm для каждой точки если нет readings', () => {
    const out = associateHrToPoints([pt(1000), pt(2000)], []);
    expect(out.map((p) => p.hrBpm)).toEqual([null, null]);
  });

  it('берёт ближайший reading в пределах maxGapMs', () => {
    const points = [pt(1000), pt(2000), pt(3000)];
    const readings = [hr(800, 130), hr(2100, 145), hr(5000, 160)];
    const out = associateHrToPoints(points, readings, { maxGapMs: 500 });
    expect(out[0].hrBpm).toBe(130); // ближайший @ 800ms (gap 200ms ≤ 500)
    expect(out[1].hrBpm).toBe(145); // ближайший @ 2100ms (gap 100ms ≤ 500)
    expect(out[2].hrBpm).toBe(null); // ближайший @ 5000ms (gap 2000ms > 500)
  });

  it('значения округляются до целого', () => {
    const out = associateHrToPoints([pt(1000)], [hr(1000, 130.7)]);
    expect(out[0].hrBpm).toBe(131);
  });

  it('игнорирует non-hr readings', () => {
    const cad: SensorReading = {
      timestamp: 1000, type: 'cadence', value: 180, sourceId: 'm',
    };
    const out = associateHrToPoints([pt(1000)], [cad, hr(1000, 145)]);
    expect(out[0].hrBpm).toBe(145);
  });
});
