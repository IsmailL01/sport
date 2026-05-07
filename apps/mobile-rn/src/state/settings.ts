import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

import type { AthleteProfile, Sex } from '../domain/athlete';

/**
 * Пользовательские настройки. Персистятся в MMKV между запусками.
 */

export type Units = 'metric' | 'imperial';
export type Theme = 'light' | 'dark' | 'auto';
export type WeekStartDay = 'monday' | 'sunday';

export type Goals = {
  /** Цель: км в неделю (null = без цели). */
  weeklyDistanceKm: number | null;
  /** Цель: пробежек в месяц (null = без цели). */
  monthlySessionCount: number | null;
};

type SettingsStore = {
  units: Units;
  theme: Theme;
  /** weightKg на корне сохранён для backward-compat. Канонический источник теперь — athlete.weightKg. */
  weightKg: number;
  athlete: AthleteProfile;
  homeLocation: { latitude: number; longitude: number } | null;
  batteryHintShown: boolean;
  weekStartDay: WeekStartDay;
  goals: Goals;

  setUnits: (units: Units) => void;
  setTheme: (theme: Theme) => void;
  setWeight: (weightKg: number) => void;
  setHomeLocation: (loc: { latitude: number; longitude: number } | null) => void;
  markBatteryHintShown: () => void;
  setAthlete: (patch: Partial<AthleteProfile>) => void;
  setGoals: (patch: Partial<Goals>) => void;
  setWeekStartDay: (d: WeekStartDay) => void;
};

const DEFAULT_ATHLETE: AthleteProfile = {
  weightKg: 70,
  heightCm: null,
  sex: null,
  birthDate: null,
  restingHR: null,
  maxHR: null,
};

const DEFAULT_GOALS: Goals = {
  weeklyDistanceKm: null,
  monthlySessionCount: null,
};

const mmkv = createMMKV();

const mmkvStorage = {
  getItem: (name: string): string | null => {
    const value = mmkv.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string): void => {
    mmkv.set(name, value);
  },
  removeItem: (name: string): void => {
    mmkv.remove(name);
  },
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      units: 'metric',
      theme: 'auto',
      weightKg: 70,
      athlete: DEFAULT_ATHLETE,
      homeLocation: null,
      batteryHintShown: false,
      weekStartDay: 'monday',
      goals: DEFAULT_GOALS,

      setUnits: (units) => set({ units }),
      setTheme: (theme) => set({ theme }),
      setWeight: (weightKg) =>
        set((s) => ({ weightKg, athlete: { ...s.athlete, weightKg } })),
      setHomeLocation: (homeLocation) => set({ homeLocation }),
      markBatteryHintShown: () => set({ batteryHintShown: true }),
      setAthlete: (patch) =>
        set((s) => ({
          athlete: { ...s.athlete, ...patch },
          weightKg: patch.weightKg ?? s.weightKg,
        })),
      setGoals: (patch) => set((s) => ({ goals: { ...s.goals, ...patch } })),
      setWeekStartDay: (weekStartDay) => set({ weekStartDay }),
    }),
    {
      name: 'running-ecosystem-settings',
      storage: createJSONStorage(() => mmkvStorage),
      version: 2,
      // v1 → v2: добавились athlete/goals/weekStartDay. Старые поля сохраняются.
      migrate: (persisted, fromVersion) => {
        const p = (persisted ?? {}) as Partial<SettingsStore>;
        if (fromVersion < 2) {
          const w = p.weightKg ?? DEFAULT_ATHLETE.weightKg ?? 70;
          return {
            ...(p as object),
            weightKg: w,
            athlete: { ...DEFAULT_ATHLETE, weightKg: w },
            weekStartDay: 'monday',
            goals: DEFAULT_GOALS,
          } as SettingsStore;
        }
        return p as SettingsStore;
      },
    },
  ),
);

export type { AthleteProfile, Sex };
