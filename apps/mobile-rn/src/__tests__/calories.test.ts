import { estimateCaloriesRun } from '../domain/calories';

describe('estimateCaloriesRun', () => {
  it('null если вес не задан', () => {
    expect(estimateCaloriesRun(null, 1800, 5000)).toBeNull();
  });

  it('null если durationS = 0', () => {
    expect(estimateCaloriesRun(70, 0, 5000)).toBeNull();
  });

  it('70 кг × 30 мин лёгкого бега 6:00 → ≈ 290 kcal', () => {
    // Pace 6:00 = MET 8.3; 0.5h × 70 × 8.3 = 290.5
    const k = estimateCaloriesRun(70, 1800, 5000);
    expect(k).toBeGreaterThanOrEqual(280);
    expect(k).toBeLessThanOrEqual(300);
  });

  it('60 кг × 60 мин темпового 5:00 → ≈ 590 kcal', () => {
    // Pace 5:00 = MET 9.8; 1h × 60 × 9.8 = 588
    const k = estimateCaloriesRun(60, 3600, 12_000);
    expect(k).toBeGreaterThanOrEqual(575);
    expect(k).toBeLessThanOrEqual(605);
  });

  it('80 кг × 30 мин очень быстрого 4:00 → ≈ 510 kcal', () => {
    // Pace 4:00 = MET 12.8; 0.5h × 80 × 12.8 = 512
    const k = estimateCaloriesRun(80, 1800, 7500);
    expect(k).toBeGreaterThanOrEqual(495);
    expect(k).toBeLessThanOrEqual(525);
  });

  it('очень быстрый темп clamps на 16 MET', () => {
    // Pace 2:30 → clamped MET = 18 (last entry); 0.25h × 70 × 18 = 315
    const k = estimateCaloriesRun(70, 900, 6000);
    expect(k).toBeGreaterThan(300);
  });

  it('очень медленный темп clamps на ~5 MET', () => {
    // Pace 10:00 → clamped к самой медленной таблицы (5 MET).
    // 1h × 70 × 5 = 350
    const k = estimateCaloriesRun(70, 3600, 6000);
    expect(k).toBeGreaterThanOrEqual(330);
    expect(k).toBeLessThanOrEqual(370);
  });

  it('нет дистанции (общий jog) → MET 5', () => {
    // 30 мин при весе 70 кг: 0.5h × 70 × 5 = 175
    const k = estimateCaloriesRun(70, 1800, 0);
    expect(k).toBe(175);
  });

  it('больше дистанция / меньше время = быстрее темп = больше kcal', () => {
    const slow = estimateCaloriesRun(70, 1800, 4000)!; // pace 7:30
    const fast = estimateCaloriesRun(70, 1800, 6000)!; // pace 5:00
    expect(fast).toBeGreaterThan(slow);
  });
});
