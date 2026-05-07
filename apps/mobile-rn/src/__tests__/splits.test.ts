import { computeSplits, fastestAndSlowestKm, type SplitInput } from '../domain/splits';

// Утилита: создать набор точек по дистанции и темпу.
// startLat/startLon — стартовая позиция; делаем восточный пробег по долготе.
function makePoints(distancesM: number[], paceMinKm: number, hr: number | null = null): SplitInput[] {
  const startLat = 55.0;
  const startLon = 37.0;
  // 1° долготы на широте 55° ≈ 63712 м, упрощённо берём ~111000 на 0° чтобы было предсказуемо;
  // вместо этого работаем через прямой пересчёт meters → degrees приближённо.
  const metersPerDegLon = 111320 * Math.cos((startLat * Math.PI) / 180);
  const points: SplitInput[] = [];
  let cumDist = 0;
  let ts = 1_700_000_000_000;
  points.push({
    timestamp: ts,
    latitude: startLat,
    longitude: startLon,
    altitude: 100,
    accuracy: 5,
    speed: 1000 / (paceMinKm * 60),
    heading: 90,
    hrBpm: hr,
  });
  for (const d of distancesM) {
    cumDist += d;
    ts += Math.round((d / 1000) * paceMinKm * 60_000);
    points.push({
      timestamp: ts,
      latitude: startLat,
      longitude: startLon + cumDist / metersPerDegLon,
      altitude: 100 + cumDist * 0.01,
      accuracy: 5,
      speed: 1000 / (paceMinKm * 60),
      heading: 90,
      hrBpm: hr,
    });
  }
  return points;
}

describe('computeSplits', () => {
  it('пустой список → пустой результат', () => {
    expect(computeSplits([])).toEqual([]);
  });

  it('одна точка → пустой результат', () => {
    expect(computeSplits([{
      timestamp: 0,
      latitude: 55,
      longitude: 37,
      altitude: 0,
      accuracy: 5,
      speed: null,
      heading: null,
    }])).toEqual([]);
  });

  it('меньше 1км → 0 сплитов (если < 100m partial)', () => {
    const pts = makePoints([50, 50], 5);
    expect(computeSplits(pts)).toEqual([]);
  });

  it('ровно 1 км — 1 сплит, темп ≈ заданному', () => {
    // 5 точек по 200м = 1000м, темп 5:00 мин/км.
    const pts = makePoints([200, 200, 200, 200, 200], 5);
    const splits = computeSplits(pts);
    expect(splits).toHaveLength(1);
    expect(splits[0].km).toBe(1);
    expect(splits[0].paceMinKm).toBeCloseTo(5, 1);
    expect(splits[0].durationS).toBeCloseTo(300, 0);
  });

  it('5 км — 5 сплитов с правильной нумерацией', () => {
    // 25 точек по 200м = 5000м.
    const dists = Array(25).fill(200);
    const pts = makePoints(dists, 5);
    const splits = computeSplits(pts);
    expect(splits.map((s) => s.km)).toEqual([1, 2, 3, 4, 5]);
    splits.forEach((s) => expect(s.paceMinKm).toBeCloseTo(5, 1));
  });

  it('partial split за последние 500м', () => {
    // 1500м всего → 1 полный + partial 500м.
    const dists = Array(15).fill(100);
    const pts = makePoints(dists, 5);
    const splits = computeSplits(pts);
    expect(splits.length).toBe(2);
    expect(splits[0].km).toBe(1);
    expect(splits[1].km).toBe(2);
    // Partial split темп должен быть тоже ≈5
    expect(splits[1].paceMinKm).toBeCloseTo(5, 1);
  });

  it('avgHr — среднее по точкам', () => {
    const pts = makePoints(Array(10).fill(100), 5, 150);
    const splits = computeSplits(pts);
    expect(splits[0].avgHrBpm).toBe(150);
  });

  it('elevation gain считается только положительное', () => {
    const pts = makePoints(Array(10).fill(100), 5);
    const splits = computeSplits(pts);
    // 1000м × 0.01 = 10м accumulated.
    expect(splits[0].elevationGainM).toBeGreaterThanOrEqual(8);
    expect(splits[0].elevationGainM).toBeLessThanOrEqual(12);
  });

  it('пременный темп — последовательные сплиты разные', () => {
    // Первая половина быстро (4:00), вторая медленно (6:00).
    const fast = makePoints(Array(5).fill(200), 4);
    // Перенесём время старта второй части на конец первой.
    const lastTs = fast[fast.length - 1].timestamp;
    const slow = makePoints(Array(5).fill(200), 6).map((p, i) => ({
      ...p,
      // Сдвиг по долготе после первой части.
      longitude: p.longitude + 0.013, // ~1км на широте 55°
      timestamp: lastTs + (i === 0 ? 0 : (p.timestamp - 1_700_000_000_000)),
    }));
    // Соединить: первая точка slow это финальная fast (skip dup).
    const pts = [...fast, ...slow.slice(1)];
    const splits = computeSplits(pts);
    expect(splits).toHaveLength(2);
    expect(splits[0].paceMinKm).toBeLessThan(splits[1].paceMinKm);
  });
});

describe('fastestAndSlowestKm', () => {
  it('null если нет сплитов', () => {
    expect(fastestAndSlowestKm([])).toEqual({ fastestKm: null, slowestKm: null });
  });

  it('находит min/max по pace', () => {
    const splits = [
      { km: 1, paceMinKm: 5.0, durationS: 300, startedAt: 0, endedAt: 0, avgHrBpm: null, elevationGainM: null },
      { km: 2, paceMinKm: 4.5, durationS: 270, startedAt: 0, endedAt: 0, avgHrBpm: null, elevationGainM: null },
      { km: 3, paceMinKm: 5.5, durationS: 330, startedAt: 0, endedAt: 0, avgHrBpm: null, elevationGainM: null },
    ];
    const r = fastestAndSlowestKm(splits);
    expect(r.fastestKm).toBe(2);
    expect(r.slowestKm).toBe(3);
  });
});
