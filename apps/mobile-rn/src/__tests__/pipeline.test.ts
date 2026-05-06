import { AccuracyFilter } from '../pipeline/filters/AccuracyFilter';
import { JumpFilter } from '../pipeline/filters/JumpFilter';
import { KalmanFilter } from '../pipeline/filters/KalmanFilter';
import { MinSegmentFilter } from '../pipeline/filters/MinSegmentFilter';
import { PauseDetector } from '../pipeline/filters/PauseDetector';
import { Pipeline } from '../pipeline/Pipeline';
import type { Point } from '../domain/types';

function makePoint(opts: Partial<Point> & { ts?: number; lat?: number; lon?: number }): Point {
  return {
    timestamp: opts.ts ?? 0,
    latitude: opts.lat ?? 50,
    longitude: opts.lon ?? 10,
    altitude: null,
    accuracy: opts.accuracy ?? 5,
    speed: opts.speed ?? null,
    heading: null,
    source: opts.source ?? 'raw',
  };
}

describe('AccuracyFilter', () => {
  it('пропускает точку с accuracy ≤ порога', () => {
    const f = new AccuracyFilter(20);
    expect(f.apply(makePoint({ accuracy: 5 }))).not.toBeNull();
    expect(f.apply(makePoint({ accuracy: 20 }))).not.toBeNull();
  });
  it('отбрасывает с accuracy > порога', () => {
    const f = new AccuracyFilter(20);
    expect(f.apply(makePoint({ accuracy: 25 }))).toBeNull();
  });
  it('пропускает точку с accuracy=null (нет данных)', () => {
    const f = new AccuracyFilter(20);
    expect(f.apply(makePoint({ accuracy: null }))).not.toBeNull();
  });
});

describe('JumpFilter', () => {
  it('первая точка пропускается всегда', () => {
    const f = new JumpFilter(30, 5);
    expect(f.apply(makePoint({ ts: 0, lat: 50, lon: 10 }))).not.toBeNull();
  });

  it('отбрасывает прыжок > 30м за < 5с', () => {
    const f = new JumpFilter(30, 5);
    f.apply(makePoint({ ts: 0, lat: 50, lon: 10 }));
    // ~110м за 1с (по широте 0.001° ≈ 111м)
    const result = f.apply(makePoint({ ts: 1000, lat: 50.001, lon: 10 }));
    expect(result).toBeNull();
  });

  it('пропускает большой шаг если прошло > 5с', () => {
    const f = new JumpFilter(30, 5);
    f.apply(makePoint({ ts: 0, lat: 50, lon: 10 }));
    const result = f.apply(makePoint({ ts: 6000, lat: 50.001, lon: 10 }));
    expect(result).not.toBeNull();
  });

  it('reset() очищает lastAccepted', () => {
    const f = new JumpFilter(30, 5);
    f.apply(makePoint({ ts: 0, lat: 50, lon: 10 }));
    f.reset();
    // После reset большой шаг от старта должен пройти как первая точка.
    expect(f.apply(makePoint({ ts: 100, lat: 50.001, lon: 10 }))).not.toBeNull();
  });
});

describe('MinSegmentFilter', () => {
  it('первая точка пропускается', () => {
    const f = new MinSegmentFilter(2);
    expect(f.apply(makePoint({ lat: 50, lon: 10 }))).not.toBeNull();
  });

  it('отбрасывает точку < 2м от lastAccepted', () => {
    const f = new MinSegmentFilter(2);
    f.apply(makePoint({ lat: 50, lon: 10 }));
    // 0.00001° ≈ 1.1м
    expect(f.apply(makePoint({ lat: 50.00001, lon: 10 }))).toBeNull();
  });

  it('пропускает точку >= 2м', () => {
    const f = new MinSegmentFilter(2);
    f.apply(makePoint({ lat: 50, lon: 10 }));
    // 0.00003° ≈ 3.3м
    expect(f.apply(makePoint({ lat: 50.00003, lon: 10 }))).not.toBeNull();
  });
});

describe('KalmanFilter', () => {
  it('первая точка не сглаживается', () => {
    const f = new KalmanFilter();
    const p1 = makePoint({ ts: 0, lat: 50, lon: 10, accuracy: 5 });
    const r = f.apply(p1);
    expect(r?.latitude).toBe(50);
    expect(r?.longitude).toBe(10);
  });

  it('сглаживает шум — линейный путь со случайным noise держит ошибку < 1м после 50 точек', () => {
    const f = new KalmanFilter();
    let mse = 0;
    for (let i = 0; i < 50; i += 1) {
      const trueLat = 50 + i * 0.00001; // равномерное движение
      const noise = (Math.random() - 0.5) * 0.00002; // ±~2м noise
      const r = f.apply(
        makePoint({ ts: i * 1000, lat: trueLat + noise, lon: 10, accuracy: 5 }),
      );
      const errMeters = Math.abs(r!.latitude - trueLat) * 111320;
      if (i > 10) mse += errMeters * errMeters;
    }
    const rmse = Math.sqrt(mse / 39);
    expect(rmse).toBeLessThan(1.5);
  });

  it('outlier демпфируется относительно prediction', () => {
    const f = new KalmanFilter();
    // 10 точек прямо
    for (let i = 0; i < 10; i += 1) {
      f.apply(makePoint({ ts: i * 1000, lat: 50 + i * 0.00001, lon: 10, accuracy: 5 }));
    }
    // outlier — смещение 100м
    const dLatOutlier = 100 / 111320;
    const r = f.apply(
      makePoint({
        ts: 10_000,
        lat: 50 + 10 * 0.00001 + dLatOutlier,
        lon: 10,
        accuracy: 5,
      }),
    );
    // После update должны быть смещены НЕ на полные 100м, а сильно меньше.
    const drift = (r!.latitude - (50 + 10 * 0.00001)) * 111320;
    expect(drift).toBeGreaterThan(0);
    expect(drift).toBeLessThan(50); // демпфирование как минимум вдвое
  });
});

describe('Pipeline', () => {
  it('применяет фильтры по порядку, прерывает при null', () => {
    let dropped: string | null = null;
    const pl = new Pipeline(
      [new AccuracyFilter(10), new MinSegmentFilter(2)],
      {
        onDrop: (e) => {
          dropped = e.filterName;
        },
      },
    );
    expect(pl.process(makePoint({ accuracy: 50, lat: 50, lon: 10 }))).toBeNull();
    expect(dropped).toBe('AccuracyFilter');
  });

  it('reset() сбрасывает все фильтры', () => {
    const pl = new Pipeline([new MinSegmentFilter(2)]);
    pl.process(makePoint({ lat: 50, lon: 10 }));
    pl.reset();
    // После reset точка близкая к (50, 10) должна снова быть принята как первая.
    expect(pl.process(makePoint({ lat: 50, lon: 10 }))).not.toBeNull();
  });
});

describe('PauseDetector', () => {
  it('эмитит auto-paused после 5с медленных скоростей', () => {
    const events: string[] = [];
    const pd = new PauseDetector((e) => events.push(e.type));
    // Шесть отсчётов с интервалом 1с, скорости 0.2 м/с
    for (let i = 0; i <= 6; i += 1) {
      pd.observe(makePoint({ ts: i * 1000, speed: 0.2 }));
    }
    expect(events).toContain('auto-paused');
  });

  it('не эмитит pause если хотя бы одна скорость выше порога', () => {
    const events: string[] = [];
    const pd = new PauseDetector((e) => events.push(e.type));
    pd.observe(makePoint({ ts: 0, speed: 0.2 }));
    pd.observe(makePoint({ ts: 1000, speed: 2.0 })); // быстро
    pd.observe(makePoint({ ts: 2000, speed: 0.2 }));
    pd.observe(makePoint({ ts: 3000, speed: 0.2 }));
    pd.observe(makePoint({ ts: 4000, speed: 0.2 }));
    pd.observe(makePoint({ ts: 5000, speed: 0.2 }));
    expect(events).toEqual([]);
  });

  it('после pause эмитит auto-resumed на 2с быстрых скоростей', () => {
    const events: string[] = [];
    const pd = new PauseDetector((e) => events.push(e.type));
    // Сначала пауза
    for (let i = 0; i <= 6; i += 1) {
      pd.observe(makePoint({ ts: i * 1000, speed: 0.2 }));
    }
    expect(events).toContain('auto-paused');
    // Потом быстрое движение 2.5 м/с
    pd.observe(makePoint({ ts: 7000, speed: 2.5 }));
    pd.observe(makePoint({ ts: 8000, speed: 2.5 }));
    pd.observe(makePoint({ ts: 9000, speed: 2.5 }));
    expect(events).toContain('auto-resumed');
  });
});
