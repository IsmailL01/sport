package gamification

import "testing"

func TestXPForSession_BaseDistance(t *testing.T) {
	// 5 km, < 10 km, no hr → 5 XP base.
	xp := XPForSession(SessionInput{DistanceM: 5000, DurationS: 1500})
	if xp != 5 {
		t.Errorf("expected 5 xp, got %d", xp)
	}
}

func TestXPForSession_LongRunBonus(t *testing.T) {
	// 10 km exactly → 10 km + 5 bonus = 15.
	xp := XPForSession(SessionInput{DistanceM: 10000, DurationS: 3000})
	if xp != 15 {
		t.Errorf("expected 15 xp (10 + bonus), got %d", xp)
	}
	// 16 km → 16 + 5 = 21.
	xp = XPForSession(SessionInput{DistanceM: 16000, DurationS: 4500})
	if xp != 21 {
		t.Errorf("expected 21 xp, got %d", xp)
	}
	// 9.999 km → 9 (no bonus).
	xp = XPForSession(SessionInput{DistanceM: 9999, DurationS: 3000})
	if xp != 9 {
		t.Errorf("expected 9 xp (no long bonus), got %d", xp)
	}
}

func TestXPForSession_HRBonus(t *testing.T) {
	// 5 km + avgHr 155 → 5 + 3 = 8.
	xp := XPForSession(SessionInput{DistanceM: 5000, DurationS: 1500, AvgHrBpm: 155})
	if xp != 8 {
		t.Errorf("expected 8 xp (5 + hr bonus), got %d", xp)
	}
	// avg 149 — без бонуса.
	xp = XPForSession(SessionInput{DistanceM: 5000, DurationS: 1500, AvgHrBpm: 149})
	if xp != 5 {
		t.Errorf("expected 5 xp (below hr threshold), got %d", xp)
	}
}

func TestXPForSession_AllBonuses(t *testing.T) {
	// 16 km + avgHr 160 → 16 + 5 (long) + 3 (hr) = 24.
	xp := XPForSession(SessionInput{DistanceM: 16000, DurationS: 4500, AvgHrBpm: 160})
	if xp != 24 {
		t.Errorf("expected 24 xp, got %d", xp)
	}
}

func TestXPForSession_ZeroInputs(t *testing.T) {
	if XPForSession(SessionInput{}) != 0 {
		t.Error("zero input should give 0 xp")
	}
	if XPForSession(SessionInput{DistanceM: 1000}) != 0 {
		t.Error("zero duration should give 0 xp")
	}
	if XPForSession(SessionInput{DurationS: 100}) != 0 {
		t.Error("zero distance should give 0 xp")
	}
}

func TestGradeForXP(t *testing.T) {
	cases := []struct {
		xp    int
		grade string
	}{
		{0, "D"}, {50, "D"}, {99, "D"},
		{100, "D+"}, {249, "D+"},
		{250, "C"}, {499, "C"},
		{500, "C+"}, {999, "C+"},
		{1000, "B"}, {1999, "B"},
		{2000, "B+"}, {3499, "B+"},
		{3500, "A"}, {5499, "A"},
		{5500, "A+"}, {9999, "A+"},
		{10000, "S"}, {100000, "S"},
	}
	for _, c := range cases {
		got := GradeForXP(c.xp)
		if got != c.grade {
			t.Errorf("xp=%d: expected %s, got %s", c.xp, c.grade, got)
		}
	}
}

func TestGradeForXP_Negative(t *testing.T) {
	if GradeForXP(-100) != "D" {
		t.Error("negative xp should fall back to D")
	}
}

func TestNextGrade(t *testing.T) {
	// 0 XP → next D+ at 100 (100 remaining).
	g, r := NextGrade(0)
	if g != "D+" || r != 100 {
		t.Errorf("expected D+ / 100, got %s / %d", g, r)
	}
	// 750 → next B at 1000 (250 remaining).
	g, r = NextGrade(750)
	if g != "B" || r != 250 {
		t.Errorf("expected B / 250, got %s / %d", g, r)
	}
	// 10000 → at S, no next.
	g, r = NextGrade(10000)
	if g != "" || r != 0 {
		t.Errorf("expected ''/0 at max, got %s / %d", g, r)
	}
}

func TestFormulaVersion(t *testing.T) {
	if FormulaVersion != 1 {
		t.Errorf("formula version drift: %d", FormulaVersion)
	}
}
