import {
  defaultHRZones,
  defaultPaceZones,
  estimateMaxHR,
  resolveMaxHR,
} from '../domain/athlete';

describe('estimateMaxHR', () => {
  it('30 лет → 190 уд/мин (220-30)', () => {
    const today = new Date('2026-05-07');
    expect(estimateMaxHR('1996-01-01', today)).toBe(190);
  });

  it('возраст ещё не наступил в этом году → используется previous birthday', () => {
    const today = new Date('2026-05-07');
    // ДР в декабре, ему ещё 29
    expect(estimateMaxHR('1996-12-31', today)).toBe(191);
  });

  it('очень молодой → нижний bound 200', () => {
    expect(estimateMaxHR('2020-01-01', new Date('2026-05-07'))).toBe(200);
  });

  it('очень старый → верхний bound 130', () => {
    expect(estimateMaxHR('1900-01-01', new Date('2026-05-07'))).toBe(130);
  });

  it('невалидная дата → fallback 180', () => {
    expect(estimateMaxHR('not-a-date')).toBe(180);
  });
});

describe('resolveMaxHR', () => {
  it('предпочитает явный maxHR', () => {
    const r = resolveMaxHR(
      { weightKg: 70, heightCm: null, sex: null, birthDate: '1990-01-01', restingHR: null, maxHR: 195 },
      new Date('2026-05-07'),
    );
    expect(r).toBe(195);
  });

  it('падает на оценку по возрасту если maxHR null', () => {
    const r = resolveMaxHR(
      { weightKg: 70, heightCm: null, sex: null, birthDate: '1996-01-01', restingHR: null, maxHR: null },
      new Date('2026-05-07'),
    );
    expect(r).toBe(190);
  });

  it('null если ни maxHR ни birthDate', () => {
    const r = resolveMaxHR({
      weightKg: 70, heightCm: null, sex: null, birthDate: null, restingHR: null, maxHR: null,
    });
    expect(r).toBe(null);
  });
});

describe('defaultHRZones', () => {
  it('5 зон от 50% до 100% maxHR', () => {
    const z = defaultHRZones(200);
    expect(z).toHaveLength(5);
    expect(z[0]).toMatchObject({ index: 1, lowerBpm: 100, upperBpm: 120 });
    expect(z[4]).toMatchObject({ index: 5, lowerBpm: 180, upperBpm: 200 });
  });

  it('зоны сшиты последовательно', () => {
    const z = defaultHRZones(200);
    for (let i = 1; i < z.length; i += 1) {
      expect(z[i].lowerBpm).toBe(z[i - 1].upperBpm);
    }
  });
});

describe('defaultPaceZones', () => {
  it('5 зон, темп монотонно растёт от Z5 (быстрый) к Z1 (медленный)', () => {
    const z = defaultPaceZones(5); // 5 мин/км — LTHR pace
    expect(z).toHaveLength(5);
    // Z5 — самый быстрый (число меньше)
    expect(z[4].fasterMinKm).toBeLessThan(z[0].fasterMinKm);
    // Z1 — самый медленный
    expect(z[0].slowerMinKm).toBeGreaterThan(z[4].slowerMinKm);
  });
});
