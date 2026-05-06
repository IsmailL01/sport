import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

/**
 * Пользовательские настройки. Персистятся в MMKV между запусками.
 * MMKV выбран как быстрое key-value хранилище (см. ТЗ §2.7), для прототипа
 * избыточно использовать SQLite только ради 5 настроек.
 */

export type Units = 'metric' | 'imperial';
export type Theme = 'light' | 'dark' | 'auto';

type SettingsStore = {
  units: Units;
  theme: Theme;
  /** Вес пользователя в кг — нужен для приближённого расчёта калорий (ТЗ §6). */
  weightKg: number;
  /** Координаты "домашней зоны" — для авто-загрузки offline tile pack (P1-K-03). */
  homeLocation: { latitude: number; longitude: number } | null;
  /** Был ли уже показан battery-optimization-hint (показываем 1 раз). */
  batteryHintShown: boolean;

  setUnits: (units: Units) => void;
  setTheme: (theme: Theme) => void;
  setWeight: (weightKg: number) => void;
  setHomeLocation: (loc: { latitude: number; longitude: number } | null) => void;
  markBatteryHintShown: () => void;
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
      homeLocation: null,
      batteryHintShown: false,

      setUnits: (units) => set({ units }),
      setTheme: (theme) => set({ theme }),
      setWeight: (weightKg) => set({ weightKg }),
      setHomeLocation: (homeLocation) => set({ homeLocation }),
      markBatteryHintShown: () => set({ batteryHintShown: true }),
    }),
    {
      name: 'running-ecosystem-settings',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
    },
  ),
);
