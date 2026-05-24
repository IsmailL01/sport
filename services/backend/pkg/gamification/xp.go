// Package gamification — XP + Grade formulas (shared between activity-sync,
// social-graph и mobile clients). Phase 8 / M3.
//
// Принципы:
//  1. Pure-function design — нет side effects, нет DB/NATS внутри.
//  2. Mirror на mobile (TS) — identical inputs дают identical outputs.
//  3. Версионируем формулу через `FormulaVersion` const — если меняем
//     коэффициенты, бамп версии + record старого пользователя пересчёт.
//  4. Цифры консервативны на MVP — итерация с реальными данными в M9+.
package gamification

import "math"

// FormulaVersion — bump на смену any formula. Audit log + migration plan.
const FormulaVersion = 1

// SessionInput — input для xpForSession.
type SessionInput struct {
	// DistanceM — общая дистанция в метрах.
	DistanceM float64
	// DurationS — длительность в секундах (для проверки movement; не bonus).
	DurationS float64
	// AvgHrBpm — средний пульс. 0 если нет данных (без бонуса).
	AvgHrBpm float64
	// MaxHrBpm — pulse max (опц., reserved для будущего эффорт-бонуса).
	MaxHrBpm float64
}

// XPForSession — основная формула: 1 XP за километр + бонусы.
//
// Бонусы (MVP):
//   - +5 XP за long run (>= 10 km) — поощряет длинные пробежки.
//   - +3 XP за training intensity (avgHr >= 150) — поощряет работу зон.
//
// Не отрицательное число; round down (floor).
func XPForSession(in SessionInput) int {
	if in.DistanceM <= 0 || in.DurationS <= 0 {
		return 0
	}
	km := in.DistanceM / 1000.0
	xp := math.Floor(km)
	if km >= 10.0 {
		xp += 5
	}
	if in.AvgHrBpm >= 150 {
		xp += 3
	}
	if xp < 0 {
		return 0
	}
	return int(xp)
}
