// Внутренняя валюта приложения: калории → монеты.
//
// Полная документация — docs/CURRENCY.md.
//
// Pure functions: никакой БД, никаких сайд-эффектов. Тестируется отдельно.

import type { ActivityType } from './types';

export type { ActivityType };

export type CurrencyInput = {
  /** kcal сожжённых за сессию. */
  kcalBurned: number;
  /** длительность сессии в секундах. */
  durationS: number;
  /** дистанция в метрах (0 для статичных тренажёров). */
  distanceM: number;
  /** тип активности. */
  activity: ActivityType;
  /** средний HR за сессию (для антифрода), null если нет. */
  avgHrBpm: number | null;
  /** монет уже начислено пользователю за календарный день до этой сессии. */
  coinsEarnedToday: number;
};

export type CurrencyDecision = {
  /** Сколько монет начислить. 0 если сессия не прошла валидацию. */
  coins: number;
  /** Причина если 0 — для UI/audit. */
  reason: string | null;
  /** Поля, попавшие в meta-json транзакции. */
  meta: {
    activity: ActivityType;
    kcal: number;
    paceMinKm: number | null;
    multiplier: number;
    capped: boolean;
  };
};

/** Дневной максимум монет с одного аккаунта (антифрод). */
export const DAILY_COIN_CAP = 500;

/** Минимальная длительность сессии для начисления (антифрод). */
export const MIN_SESSION_DURATION_S = 5 * 60;

/** Минимум kcal — иначе считаем что сессия слишком короткая/пустая. */
export const MIN_SESSION_KCAL = 10;

/** Невозможный темп для running (быстрее мирового рекорда). */
export const MIN_RUN_PACE_MIN_KM = 2.5;

/** Курс: 1 монета за N kcal базово (см. docs/CURRENCY.md, формула B). */
const KCAL_PER_COIN = 10;

/** Множитель интенсивности по активности. */
const ACTIVITY_MULTIPLIER: Record<ActivityType, number> = {
  run: 1.0,
  trail: 1.1,
  walk: 0.8,
  cycle: 0.9,
  treadmill: 0.85,
  generic_cardio: 0.9,
};

/**
 * Главное решение: сколько монет начислить за сессию.
 *
 * Стратегия (формула B — «с коэффициентом интенсивности», см. CURRENCY.md):
 *   coins = floor(kcal × activityMult / KCAL_PER_COIN)
 * с антифрод-проверками и дневным капом.
 */
export function decideCoinsForSession(input: CurrencyInput): CurrencyDecision {
  const paceMinKm =
    input.distanceM > 0 && input.durationS > 0
      ? input.durationS / 60 / (input.distanceM / 1000)
      : null;

  const meta = {
    activity: input.activity,
    kcal: Math.round(input.kcalBurned),
    paceMinKm,
    multiplier: ACTIVITY_MULTIPLIER[input.activity],
    capped: false,
  };

  // Антифрод: слишком короткая/пустая сессия.
  if (input.durationS < MIN_SESSION_DURATION_S) {
    return { coins: 0, reason: 'session_too_short', meta };
  }
  if (!Number.isFinite(input.kcalBurned) || input.kcalBurned < MIN_SESSION_KCAL) {
    return { coins: 0, reason: 'kcal_too_low', meta };
  }

  // Антифрод: невозможный темп для бега (быстрее мирового рекорда).
  if (
    (input.activity === 'run' || input.activity === 'trail') &&
    paceMinKm !== null &&
    paceMinKm < MIN_RUN_PACE_MIN_KM
  ) {
    return { coins: 0, reason: 'pace_too_fast', meta };
  }

  // Антифрод: невозможный HR.
  if (input.avgHrBpm !== null && (input.avgHrBpm < 30 || input.avgHrBpm > 230)) {
    return { coins: 0, reason: 'hr_out_of_range', meta };
  }

  const mult = ACTIVITY_MULTIPLIER[input.activity];
  const raw = Math.floor((input.kcalBurned * mult) / KCAL_PER_COIN);
  if (raw <= 0) {
    return { coins: 0, reason: 'computed_zero', meta };
  }

  // Дневной кап.
  const remaining = Math.max(0, DAILY_COIN_CAP - input.coinsEarnedToday);
  if (remaining === 0) {
    return { coins: 0, reason: 'daily_cap_reached', meta: { ...meta, capped: true } };
  }

  if (raw > remaining) {
    return {
      coins: remaining,
      reason: null,
      meta: { ...meta, capped: true },
    };
  }

  return { coins: raw, reason: null, meta };
}
