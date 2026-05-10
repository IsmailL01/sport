// Grade tiers — D → S. Pure function from total XP → letter+suffix.
// Phase 8 / M3.
package gamification

// GradeTiers — strictly ascending по min_xp. Сравнение через linear scan.
// 9 ступеней (D, D+, C, C+, B, B+, A, A+, S) — соответствует UI design.
type gradeTier struct {
	minXP int
	label string
}

var tiers = []gradeTier{
	{0, "D"},
	{100, "D+"},
	{250, "C"},
	{500, "C+"},
	{1000, "B"},
	{2000, "B+"},
	{3500, "A"},
	{5500, "A+"},
	{10000, "S"},
}

// GradeForXP — возвращает label для текущего total XP.
func GradeForXP(totalXP int) string {
	if totalXP < 0 {
		return "D"
	}
	out := "D"
	for _, t := range tiers {
		if totalXP >= t.minXP {
			out = t.label
		} else {
			break
		}
	}
	return out
}

// NextGrade — следующая ступень + сколько XP до неё. Возвращает ("", 0)
// если уже на максимуме (S).
func NextGrade(totalXP int) (label string, xpRemaining int) {
	for _, t := range tiers {
		if totalXP < t.minXP {
			return t.label, t.minXP - totalXP
		}
	}
	return "", 0
}
