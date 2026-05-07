import {
  bestTSS,
  computeHrTSS,
  computeRTSS,
} from '../domain/training/tss';
import {
  buildDailyTSS,
  computePMC,
  tsbZone,
} from '../domain/training/banister';
import {
  paceMinKmFromTime,
  predictCameron,
  predictRiegel,
  STANDARD_DISTANCES_M,
} from '../domain/training/racePredictor';
import {
  vo2maxCategory,
  vo2maxCooper,
  vo2maxFrom5K,
} from '../domain/training/vo2max';
import {
  estimateLthrFromHistory,
  estimateLthrPaceFromHistory,
} from '../domain/training/lthr';
import {
  resolveHrTargetBpm,
  WORKOUT_LIBRARY,
  workoutTotalDurationS,
} from '../domain/training/workout';

// === TSS ===

describe('computeHrTSS', () => {
  it('null при отсутствии HR / LTHR', () => {
    expect(computeHrTSS(null, 165, 3600)).toBeNull();
    expect(computeHrTSS(150, null, 3600)).toBeNull();
    expect(computeHrTSS(150, 0, 3600)).toBeNull();
    expect(computeHrTSS(150, 165, 0)).toBeNull();
  });

  it('TSS = 100 для 1 час на пороге (HR == LTHR)', () => {
    expect(computeHrTSS(165, 165, 3600)).toBe(100);
  });

  it('TSS быстро растёт с интенсивностью (квадрат IF)', () => {
    const easy = computeHrTSS(132, 165, 3600)!; // IF = 0.8 → TSS = 64
    const tempo = computeHrTSS(148, 165, 3600)!; // IF ≈ 0.897 → TSS ≈ 80
    expect(easy).toBeCloseTo(64, 0);
    expect(tempo).toBeGreaterThanOrEqual(78);
    expect(tempo).toBeLessThanOrEqual(82);
  });
});

describe('computeRTSS', () => {
  it('rTSS = 100 для 1 час на LTHR pace', () => {
    expect(computeRTSS(5, 5, 3600)).toBe(100);
  });

  it('темп быстрее LTHR pace → rTSS > 100', () => {
    const r = computeRTSS(4.5, 5, 3600); // IF = 5/4.5 ≈ 1.11
    expect(r).toBeGreaterThan(120);
  });

  it('темп медленнее → rTSS < 100', () => {
    const r = computeRTSS(6, 5, 3600);
    expect(r).toBeLessThan(80);
  });
});

describe('bestTSS', () => {
  it('предпочитает HR-based если есть HR данные', () => {
    const r = bestTSS({
      avgHrBpm: 150, lthrBpm: 165, avgPaceMinKm: 5, lthrPaceMinKm: 4.5, durationS: 3600,
    });
    expect(r?.method).toBe('hr');
  });

  it('fallback на pace-based если нет HR', () => {
    const r = bestTSS({
      avgHrBpm: null, lthrBpm: 165, avgPaceMinKm: 5, lthrPaceMinKm: 5, durationS: 3600,
    });
    expect(r?.method).toBe('pace');
    expect(r?.value).toBe(100);
  });

  it('null если ни HR ни pace', () => {
    const r = bestTSS({
      avgHrBpm: null, lthrBpm: null, avgPaceMinKm: null, lthrPaceMinKm: null, durationS: 3600,
    });
    expect(r).toBeNull();
  });
});

// === Banister ===

describe('computePMC', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('CTL/ATL → 0 если нет нагрузки', () => {
    const r = computePMC({}, 0, 7 * DAY);
    expect(r).toHaveLength(7);
    r.forEach((p) => {
      expect(p.ctl).toBeCloseTo(0, 5);
      expect(p.atl).toBeCloseTo(0, 5);
    });
  });

  it('одиночная тренировка 100 TSS — ATL и CTL растут, потом затухают', () => {
    const r = computePMC({ '0': 100 }, 0, 30 * DAY);
    // День 0 — оба растут от 0
    expect(r[0].ctl).toBeCloseTo(100 / 42, 4);
    expect(r[0].atl).toBeCloseTo(100 / 7, 4);
    // К дню 30 — ATL должен почти затухнуть, CTL медленно падает
    expect(r[29].atl).toBeLessThan(0.5);
    expect(r[29].ctl).toBeLessThan(r[0].ctl);
  });

  it('равная ежедневная нагрузка → CTL и ATL сходятся к этому значению', () => {
    // CTL τ=42 → нужно 200+ дней для ~99% convergence.
    const daily: Record<string, number> = {};
    for (let i = 0; i < 240; i += 1) daily[String(i * DAY)] = 50;
    const r = computePMC(daily, 0, 240 * DAY);
    // Через 240 дней (≈ 6 × τ для CTL) оба должны быть очень близко к 50.
    expect(r[239].ctl).toBeGreaterThan(48);
    expect(r[239].ctl).toBeLessThan(51);
    expect(r[239].atl).toBeGreaterThan(48);
    expect(r[239].atl).toBeLessThan(51);
  });
});

describe('buildDailyTSS', () => {
  it('суммирует TSS из нескольких сессий в одном дне', () => {
    const map = buildDailyTSS([
      { startedAt: new Date('2026-05-01T08:00:00').getTime(), tss: 50 },
      { startedAt: new Date('2026-05-01T18:00:00').getTime(), tss: 40 },
      { startedAt: new Date('2026-05-02T08:00:00').getTime(), tss: 30 },
    ]);
    const day1 = new Date(2026, 4, 1).getTime();
    const day2 = new Date(2026, 4, 2).getTime();
    expect(map[String(day1)]).toBe(90);
    expect(map[String(day2)]).toBe(30);
  });

  it('игнорирует null TSS', () => {
    const map = buildDailyTSS([
      { startedAt: new Date('2026-05-01').getTime(), tss: null },
    ]);
    expect(Object.keys(map)).toHaveLength(0);
  });
});

describe('tsbZone', () => {
  it('возвращает все зоны', () => {
    expect(tsbZone(50).zone).toBe('fresh');
    expect(tsbZone(15).zone).toBe('optimal');
    expect(tsbZone(0).zone).toBe('neutral');
    expect(tsbZone(-20).zone).toBe('fatigued');
    expect(tsbZone(-50).zone).toBe('overreached');
  });
});

// === Race Predictor ===

describe('predictRiegel', () => {
  it('5K 25:00 → 10K ≈ 51:55', () => {
    const t = predictRiegel(5000, 25 * 60, 10000);
    // 25min × 2^1.06 ≈ 51:53
    expect(t).toBeGreaterThan(51 * 60);
    expect(t).toBeLessThan(53 * 60);
  });

  it('10K → marathon (4.2x) даёт оптимистичный, но разумный прогноз', () => {
    const t = predictRiegel(10000, 40 * 60, 42195);
    // 40 × 4.2^1.06 ≈ 184 мин = ~3:04
    expect(t).toBeGreaterThan(180 * 60);
    expect(t).toBeLessThan(190 * 60);
  });

  it('0 на нулевой вход', () => {
    expect(predictRiegel(0, 0, 0)).toBe(0);
  });
});

describe('predictCameron', () => {
  it('для marathon из 10K даёт МЕНЕЕ оптимистичный прогноз чем Riegel', () => {
    const r = predictRiegel(10000, 40 * 60, 42195);
    const c = predictCameron(10000, 40 * 60, 42195);
    expect(c).toBeGreaterThan(r);
  });

  it('для коротких дистанций совпадает с Riegel', () => {
    const r = predictRiegel(5000, 20 * 60, 1000);
    const c = predictCameron(5000, 20 * 60, 1000);
    expect(c).toBeCloseTo(r, 5);
  });
});

describe('STANDARD_DISTANCES_M', () => {
  it('содержит ключевые дистанции', () => {
    const ids = STANDARD_DISTANCES_M.map((d) => d.id);
    expect(ids).toContain('5k');
    expect(ids).toContain('10k');
    expect(ids).toContain('marathon');
  });
});

describe('paceMinKmFromTime', () => {
  it('5K за 25 мин → 5 мин/км', () => {
    expect(paceMinKmFromTime(5000, 25 * 60)).toBe(5);
  });
  it('null при нулях', () => {
    expect(paceMinKmFromTime(0, 60)).toBeNull();
  });
});

// === VO2max ===

describe('vo2maxCooper', () => {
  it('2400м за 12 мин → ≈42.4', () => {
    const r = vo2maxCooper(2400)!;
    expect(r).toBeCloseTo(42.4, 1);
  });
  it('null если 0', () => {
    expect(vo2maxCooper(0)).toBeNull();
  });
});

describe('vo2maxFrom5K', () => {
  it('5K за 25 мин → разумная оценка для recreational бегуна (~30-45)', () => {
    // Daniels формула: velocity = 200 м/мин → -4.6 + 0.18*200 + 0.000104*40000 ≈ 36
    const r = vo2maxFrom5K(25 * 60)!;
    expect(r).toBeGreaterThan(30);
    expect(r).toBeLessThan(45);
  });

  it('5K за 18 мин (sub-elite) → ~55-65', () => {
    const r = vo2maxFrom5K(18 * 60)!;
    expect(r).toBeGreaterThan(50);
    expect(r).toBeLessThan(75);
  });
});

describe('vo2maxCategory', () => {
  it('возрастная корректировка делает ту же VO2max лучше для пожилых', () => {
    const young = vo2maxCategory(50, 30, 'male');
    const older = vo2maxCategory(50, 60, 'male');
    // 60-летний с тем же 50 → adjusted += 12 → попадает в более высокую категорию
    const order = ['poor', 'fair', 'good', 'excellent', 'superior'] as const;
    expect(order.indexOf(older)).toBeGreaterThan(order.indexOf(young));
  });

  it('60 vo2max + 30 лет → excellent (male)', () => {
    expect(vo2maxCategory(60, 30, 'male')).toBe('excellent');
  });
});

// === LTHR ===

describe('estimateLthrFromHistory', () => {
  it('null если нет данных', () => {
    expect(estimateLthrFromHistory([])).toMatchObject({ bpm: null, sessionsUsed: 0 });
  });
  it('возвращает 95-й перцентиль', () => {
    const r = estimateLthrFromHistory([130, 140, 145, 150, 155, 160, 165]);
    expect(r.bpm).toBe(165);
    expect(r.confidence).toBe('medium');
  });
  it('confidence high для 10+ сессий', () => {
    const arr = Array.from({ length: 12 }, (_, i) => 150 + i);
    expect(estimateLthrFromHistory(arr).confidence).toBe('high');
  });
});

describe('estimateLthrPaceFromHistory', () => {
  it('возвращает 5-й перцентиль (быстрейший темп)', () => {
    const r = estimateLthrPaceFromHistory([5.5, 5.0, 6.0, 4.5, 5.2, 4.8, 5.3]);
    // sorted: [4.5, 4.8, 5.0, 5.2, 5.3, 5.5, 6.0]; 5% от 7 ≈ 0 → 4.5
    expect(r.paceMinKm).toBe(4.5);
  });
});

// === Workouts ===

describe('WORKOUT_LIBRARY', () => {
  it('содержит >= 4 предустановленных тренировок', () => {
    expect(WORKOUT_LIBRARY.length).toBeGreaterThanOrEqual(4);
  });
  it('каждая имеет id, name, level, steps', () => {
    WORKOUT_LIBRARY.forEach((w) => {
      expect(w.id).toBeTruthy();
      expect(w.name).toBeTruthy();
      expect(['easy', 'moderate', 'hard']).toContain(w.level);
      expect(w.steps.length).toBeGreaterThan(0);
    });
  });
});

describe('workoutTotalDurationS', () => {
  it('считает только time-based steps', () => {
    const tempo = WORKOUT_LIBRARY.find((w) => w.id === 'tempo-40')!;
    // 10 + 20 + 10 = 40 минут = 2400 секунд
    expect(workoutTotalDurationS(tempo)).toBe(2400);
  });
});

describe('resolveHrTargetBpm', () => {
  it('конвертирует %HRmax в BPM', () => {
    const easy = WORKOUT_LIBRARY.find((w) => w.id === 'easy-30')!;
    const r = resolveHrTargetBpm(easy.steps[0], 200);
    expect(r).toEqual({ minBpm: 120, maxBpm: 140 });
  });

  it('null если step не HR-based', () => {
    const r = resolveHrTargetBpm(
      { type: 'recovery', durationType: 'time', durationValue: 60, targetType: 'rpe', targetMin: 3, targetMax: 4 },
      200,
    );
    expect(r).toBeNull();
  });
});
