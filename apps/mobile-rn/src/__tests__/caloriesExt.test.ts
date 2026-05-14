import {
  caloriesFromHr,
  estimateCaloriesBest,
  estimateCaloriesForActivity,
} from '../domain/calories';
import type { AthleteProfile } from '../domain/athlete';

const MALE_30: AthleteProfile = {
  weightKg: 70,
  heightCm: 180,
  sex: 'male',
  birthDate: new Date(Date.now() - 30 * 365.25 * 24 * 3600 * 1000).toISOString(),
  restingHR: null,
  maxHR: null,
};

const FEMALE_35: AthleteProfile = {
  weightKg: 60,
  heightCm: 170,
  sex: 'female',
  birthDate: new Date(Date.now() - 35 * 365.25 * 24 * 3600 * 1000).toISOString(),
  restingHR: null,
  maxHR: null,
};

describe('estimateCaloriesForActivity', () => {
  it('running 5km in 25min @ 70kg ≈ 300 kcal', () => {
    const c = estimateCaloriesForActivity('run', 70, 25 * 60, 5000);
    expect(c).not.toBeNull();
    expect(c!).toBeGreaterThan(250);
    expect(c!).toBeLessThan(400);
  });

  it('walking 5km in 60min @ 70kg ≈ much less than run', () => {
    const cRun = estimateCaloriesForActivity('run', 70, 25 * 60, 5000)!;
    const cWalk = estimateCaloriesForActivity('walk', 70, 60 * 60, 5000)!;
    expect(cWalk).toBeLessThan(cRun);
    expect(cWalk).toBeGreaterThan(100);
  });

  it('cycling 30km in 60min @ 70kg → reasonable estimate', () => {
    const c = estimateCaloriesForActivity('cycle', 70, 60 * 60, 30000);
    expect(c).not.toBeNull();
    expect(c!).toBeGreaterThan(400);
    expect(c!).toBeLessThan(1200);
  });

  it('treadmill without distance still returns estimate', () => {
    const c = estimateCaloriesForActivity('treadmill', 70, 30 * 60, 0);
    expect(c).not.toBeNull();
    expect(c!).toBeGreaterThan(100);
  });

  it('null weight → null', () => {
    expect(estimateCaloriesForActivity('run', null, 60, 1000)).toBeNull();
  });
});

describe('caloriesFromHr (Keytel)', () => {
  it('male @ 70kg, age 30, 150bpm, 30min → reasonable kcal', () => {
    const c = caloriesFromHr(150, 30 * 60, MALE_30);
    expect(c).not.toBeNull();
    expect(c!).toBeGreaterThan(200);
    expect(c!).toBeLessThan(500);
  });

  it('female @ 60kg, age 35, 140bpm, 30min → reasonable kcal', () => {
    const c = caloriesFromHr(140, 30 * 60, FEMALE_35);
    expect(c).not.toBeNull();
    expect(c!).toBeGreaterThan(100);
    expect(c!).toBeLessThan(400);
  });

  it('higher HR → higher kcal', () => {
    const low = caloriesFromHr(120, 30 * 60, MALE_30)!;
    const high = caloriesFromHr(170, 30 * 60, MALE_30)!;
    expect(high).toBeGreaterThan(low);
  });

  it('null HR → null', () => {
    expect(caloriesFromHr(null, 1800, MALE_30)).toBeNull();
  });

  it('HR out of range → null', () => {
    expect(caloriesFromHr(20, 1800, MALE_30)).toBeNull();
    expect(caloriesFromHr(250, 1800, MALE_30)).toBeNull();
  });

  it('missing sex → null', () => {
    const noSex: AthleteProfile = { ...MALE_30, sex: null };
    expect(caloriesFromHr(150, 1800, noSex)).toBeNull();
  });

  it('missing birthDate → null', () => {
    const noAge: AthleteProfile = { ...MALE_30, birthDate: null };
    expect(caloriesFromHr(150, 1800, noAge)).toBeNull();
  });
});

describe('estimateCaloriesBest', () => {
  it('prefers HR-based when biometrics complete + HR present', () => {
    const hrBased = caloriesFromHr(150, 30 * 60, MALE_30)!;
    const best = estimateCaloriesBest('run', MALE_30, 150, 30 * 60, 5000)!;
    expect(best).toBe(hrBased);
  });

  it('falls back to MET when no HR', () => {
    const metBased = estimateCaloriesForActivity('run', MALE_30.weightKg, 30 * 60, 5000)!;
    const best = estimateCaloriesBest('run', MALE_30, null, 30 * 60, 5000)!;
    expect(best).toBe(metBased);
  });

  it('falls back to MET when biometrics incomplete', () => {
    const partial: AthleteProfile = { ...MALE_30, sex: null };
    const metBased = estimateCaloriesForActivity('run', partial.weightKg, 30 * 60, 5000)!;
    const best = estimateCaloriesBest('run', partial, 150, 30 * 60, 5000)!;
    expect(best).toBe(metBased);
  });
});
