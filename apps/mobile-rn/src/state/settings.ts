import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

import type { AthleteProfile, Sex } from '../domain/athlete';

/**
 * Пользовательские настройки. Персистятся в MMKV между запусками.
 */

export type Units = 'metric' | 'imperial';
export type Theme = 'light' | 'dark' | 'auto';
export type MapStyle = 'streets' | 'outdoors' | 'satellite';
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
  /** Стиль карты (Mapbox style URI dispatcher). */
  mapStyle: MapStyle;
  /** weightKg на корне сохранён для backward-compat. Канонический источник теперь — athlete.weightKg. */
  weightKg: number;
  athlete: AthleteProfile;
  homeLocation: { latitude: number; longitude: number } | null;
  batteryHintShown: boolean;
  weekStartDay: WeekStartDay;
  goals: Goals;
  /** Стабильный deviceId этого устройства (для real-time WebSocket). Phase 8 / A5. */
  deviceId: string | null;
  /** Номер телефона E.164 (для будущего поиска чатов; пока хранится локально). */
  phoneE164: string | null;
  /**
   * Порог gap-resume в секундах (Phase 1 / PHASE1-12, D-31).
   * Когда приложение возвращается из background после > этого порога GPS-молчания,
   * pipeline сбрасывается чтобы Kalman не выдавал stale-предсказание.
   * Дефолт 30s; clamped к (0, 600] в setGpsGapTriggerS.
   */
  gpsGapTriggerS: number;

  setUnits: (units: Units) => void;
  setTheme: (theme: Theme) => void;
  setMapStyle: (style: MapStyle) => void;
  setWeight: (weightKg: number) => void;
  setHomeLocation: (loc: { latitude: number; longitude: number } | null) => void;
  markBatteryHintShown: () => void;
  setAthlete: (patch: Partial<AthleteProfile>) => void;
  setGoals: (patch: Partial<Goals>) => void;
  setWeekStartDay: (d: WeekStartDay) => void;
  setDeviceId: (id: string) => void;
  setPhoneE164: (phone: string | null) => void;
  /** Установить gpsGapTriggerS. Clamped к (0, 600]; out-of-range игнорируется. */
  setGpsGapTriggerS: (seconds: number) => void;
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

/** Phase 1 / PHASE1-12, D-31: дефолтный порог gap-resume в секундах. */
const DEFAULT_GPS_GAP_TRIGGER_S = 30;

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
      mapStyle: 'outdoors',
      weightKg: 70,
      athlete: DEFAULT_ATHLETE,
      homeLocation: null,
      batteryHintShown: false,
      weekStartDay: 'monday',
      goals: DEFAULT_GOALS,
      deviceId: null,
      phoneE164: null,
      gpsGapTriggerS: DEFAULT_GPS_GAP_TRIGGER_S,

      setUnits: (units) => set({ units }),
      setTheme: (theme) => set({ theme }),
      setMapStyle: (mapStyle) => set({ mapStyle }),
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
      setDeviceId: (deviceId) => set({ deviceId }),
      setPhoneE164: (phoneE164) => set({ phoneE164: normalizePhoneE164(phoneE164) }),
      setGpsGapTriggerS: (seconds) =>
        set((s) => {
          // Clamp к (0, 600]. Out-of-range — игнорируем (защита от T-01-07-01).
          if (!Number.isFinite(seconds)) return s;
          if (seconds <= 0 || seconds > 600) return s;
          return { gpsGapTriggerS: seconds };
        }),
    }),
    {
      name: 'running-ecosystem-settings',
      storage: createJSONStorage(() => mmkvStorage),
      version: 6,
      // v1 → v2: добавились athlete/goals/weekStartDay. Старые поля сохраняются.
      // v2 → v3: добавился deviceId (Phase 8 / A5).
      // v3 → v4: добавился mapStyle.
      // v4 → v5: добавился phoneE164 (локальный, для будущего поиска чатов).
      // v5 → v6: добавился gpsGapTriggerS (Phase 1 / PHASE1-12, D-31).
      migrate: (persisted, fromVersion) => {
        let p = (persisted ?? {}) as Partial<SettingsStore>;
        if (fromVersion < 2) {
          const w = p.weightKg ?? DEFAULT_ATHLETE.weightKg ?? 70;
          p = {
            ...(p as object),
            weightKg: w,
            athlete: { ...DEFAULT_ATHLETE, weightKg: w },
            weekStartDay: 'monday',
            goals: DEFAULT_GOALS,
          } as Partial<SettingsStore>;
        }
        if (fromVersion < 3) {
          p = { ...p, deviceId: null };
        }
        if (fromVersion < 4) {
          p = { ...p, mapStyle: 'outdoors' };
        }
        if (fromVersion < 5) {
          p = { ...p, phoneE164: null };
        }
        if (fromVersion < 6) {
          p = { ...p, gpsGapTriggerS: DEFAULT_GPS_GAP_TRIGGER_S };
        }
        return p as SettingsStore;
      },
    },
  ),
);

export type { AthleteProfile, Sex };

/**
 * Нормализация телефона в E.164-подобный формат: оставляем только цифры,
 * добавляем `+` если строка непустая.
 *
 * Это НЕ полная E.164-валидация — лишь грубая защита от мусора в storage.
 * Реальная валидация (libphonenumber) — задача backend'а в Round 4+.
 */
export function normalizePhoneE164(input: string | null): string | null {
  if (input === null) return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  return `+${digits}`;
}
