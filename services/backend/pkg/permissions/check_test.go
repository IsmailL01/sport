package permissions

import (
	"testing"
	"time"
)

func auth(role GlobalRole) Subject {
	return Subject{UserID: "u1", GlobalRole: role, IsAuthenticated: true}
}

func banned(role GlobalRole, until time.Time) Subject {
	return Subject{UserID: "u1", GlobalRole: role, BannedUntil: &until, IsAuthenticated: true}
}

func TestNotAuthenticatedDenied(t *testing.T) {
	for _, c := range []Capability{CapPostCreate, CapMessageSend, CapStoryCreate} {
		d := Check(Subject{}, c, ResourceContext{Now: time.Now()})
		if d.Allow {
			t.Errorf("%s should deny unauth, got allow", c)
		}
		if d.Reason != "not_authenticated" {
			t.Errorf("%s expected reason not_authenticated, got %s", c, d.Reason)
		}
	}
}

func TestBannedDeniedForWriteCaps(t *testing.T) {
	now := time.Now()
	subj := banned(GlobalUser, now.Add(time.Hour))
	for _, c := range []Capability{CapPostCreate, CapMessageSend, CapCommentCreate, CapFollow} {
		d := Check(subj, c, ResourceContext{Now: now})
		if d.Allow {
			t.Errorf("%s should deny banned user, got allow", c)
		}
	}
}

func TestExpiredBanIgnored(t *testing.T) {
	now := time.Now()
	subj := banned(GlobalUser, now.Add(-time.Hour)) // expired
	d := Check(subj, CapPostCreate, ResourceContext{Now: now})
	if !d.Allow {
		t.Errorf("expired ban should not block, got %s", d.Reason)
	}
}

func TestOwnershipForDeleteOwn(t *testing.T) {
	subj := auth(GlobalUser)
	subj.UserID = "alice"

	// Own → allow.
	d := Check(subj, CapPostDeleteOwn, ResourceContext{OwnerID: "alice", Now: time.Now()})
	if !d.Allow {
		t.Errorf("own delete should allow, got %s", d.Reason)
	}
	// Not own → deny.
	d = Check(subj, CapPostDeleteOwn, ResourceContext{OwnerID: "bob", Now: time.Now()})
	if d.Allow {
		t.Error("delete others should deny via DeleteOwn cap")
	}
}

func TestModeratorOverrideForDeleteOthers(t *testing.T) {
	mod := auth(GlobalModerator)
	mod.UserID = "mod"
	for _, c := range []Capability{
		CapMessageDeleteOthers, CapPostDeleteOthers,
		CapStoryDeleteOthers, CapCommentDeleteOthers,
	} {
		d := Check(mod, c, ResourceContext{OwnerID: "anyone", Now: time.Now()})
		if !d.Allow {
			t.Errorf("moderator should override for %s, got %s", c, d.Reason)
		}
	}
}

func TestRegularUserCannotDeleteOthers(t *testing.T) {
	subj := auth(GlobalUser)
	subj.UserID = "alice"
	d := Check(subj, CapPostDeleteOthers, ResourceContext{OwnerID: "bob", Now: time.Now()})
	if d.Allow {
		t.Error("regular user should not delete others")
	}
}

func TestMessageEditWindow(t *testing.T) {
	now := time.Now()
	subj := auth(GlobalUser)
	subj.UserID = "alice"

	// Within window.
	d := Check(subj, CapMessageEditOwn, ResourceContext{
		OwnerID: "alice", CreatedAt: now.Add(-1 * time.Hour), Now: now,
	})
	if !d.Allow {
		t.Errorf("edit within window should allow, got %s", d.Reason)
	}
	// After window.
	d = Check(subj, CapMessageEditOwn, ResourceContext{
		OwnerID: "alice", CreatedAt: now.Add(-25 * time.Hour), Now: now,
	})
	if d.Allow {
		t.Error("edit after 24h should deny")
	}
	if d.Reason != "edit_window_expired" {
		t.Errorf("expected edit_window_expired, got %s", d.Reason)
	}
}

func TestConvSendRequiresMembership(t *testing.T) {
	subj := auth(GlobalUser)
	// No conv role → deny.
	d := Check(subj, CapMessageSend, ResourceContext{Now: time.Now()})
	if d.Allow {
		t.Error("non-member should not send")
	}
	// Restricted → deny.
	d = Check(subj, CapMessageSend, ResourceContext{MyConvRole: ConvRestricted, Now: time.Now()})
	if d.Allow {
		t.Error("restricted should not send")
	}
	// Member → allow.
	d = Check(subj, CapMessageSend, ResourceContext{MyConvRole: ConvMember, Now: time.Now()})
	if !d.Allow {
		t.Errorf("member should send, got %s", d.Reason)
	}
}

func TestConvDeleteOthersRequiresModerator(t *testing.T) {
	subj := auth(GlobalUser)
	for _, role := range []ConvRole{ConvMember, ConvRestricted} {
		d := Check(subj, CapMessageDeleteOthers, ResourceContext{MyConvRole: role, Now: time.Now()})
		if d.Allow {
			t.Errorf("%s should not delete others", role)
		}
	}
	for _, role := range []ConvRole{ConvModerator, ConvAdmin, ConvOwner} {
		d := Check(subj, CapMessageDeleteOthers, ResourceContext{MyConvRole: role, Now: time.Now()})
		if !d.Allow {
			t.Errorf("%s should delete others, got %s", role, d.Reason)
		}
	}
}

func TestConvChangeRoleRules(t *testing.T) {
	subj := auth(GlobalUser)
	// Self-promote denied.
	d := Check(subj, CapConvChangeRole, ResourceContext{
		MyConvRole: ConvOwner, ActorIsTarget: true, NewConvRole: ConvAdmin, Now: time.Now(),
	})
	if d.Allow {
		t.Error("self-promote should deny")
	}
	// Member cannot change roles.
	d = Check(subj, CapConvChangeRole, ResourceContext{
		MyConvRole: ConvMember, NewConvRole: ConvModerator, Now: time.Now(),
	})
	if d.Allow {
		t.Error("member should not change roles")
	}
	// Admin cannot promote to admin.
	d = Check(subj, CapConvChangeRole, ResourceContext{
		MyConvRole: ConvAdmin, TargetConvRole: ConvMember, NewConvRole: ConvAdmin, Now: time.Now(),
	})
	if d.Allow {
		t.Error("admin should not promote to admin")
	}
	// Admin can promote member to moderator.
	d = Check(subj, CapConvChangeRole, ResourceContext{
		MyConvRole: ConvAdmin, TargetConvRole: ConvMember, NewConvRole: ConvModerator, Now: time.Now(),
	})
	if !d.Allow {
		t.Errorf("admin → moderator should allow, got %s", d.Reason)
	}
	// Only owner can transfer.
	d = Check(subj, CapConvChangeRole, ResourceContext{
		MyConvRole: ConvOwner, TargetConvRole: ConvAdmin, NewConvRole: ConvOwner, Now: time.Now(),
	})
	if !d.Allow {
		t.Errorf("owner transfer should allow, got %s", d.Reason)
	}
}

func TestConvLeaveLastOwner(t *testing.T) {
	subj := auth(GlobalUser)
	d := Check(subj, CapConvLeave, ResourceContext{
		MyConvRole: ConvOwner, OwnerCount: 1, Now: time.Now(),
	})
	if d.Allow {
		t.Error("last owner should not leave without transfer")
	}
	d = Check(subj, CapConvLeave, ResourceContext{
		MyConvRole: ConvOwner, OwnerCount: 2, Now: time.Now(),
	})
	if !d.Allow {
		t.Error("owner with co-owner should leave")
	}
	d = Check(subj, CapConvLeave, ResourceContext{
		MyConvRole: ConvMember, Now: time.Now(),
	})
	if !d.Allow {
		t.Error("member should leave freely")
	}
}

func TestAdminListReportsRequiresModerator(t *testing.T) {
	d := Check(auth(GlobalUser), CapAdminListReports, ResourceContext{Now: time.Now()})
	if d.Allow {
		t.Error("user should not list reports")
	}
	d = Check(auth(GlobalModerator), CapAdminListReports, ResourceContext{Now: time.Now()})
	if !d.Allow {
		t.Errorf("moderator should list reports, got %s", d.Reason)
	}
	d = Check(auth(GlobalAdmin), CapAdminListReports, ResourceContext{Now: time.Now()})
	if !d.Allow {
		t.Error("admin should list reports")
	}
}

func TestStoryViewersListOwnerOnly(t *testing.T) {
	subj := auth(GlobalUser)
	subj.UserID = "alice"
	d := Check(subj, CapStoryViewersList, ResourceContext{OwnerID: "alice", Now: time.Now()})
	if !d.Allow {
		t.Errorf("owner viewers list should allow, got %s", d.Reason)
	}
	d = Check(subj, CapStoryViewersList, ResourceContext{OwnerID: "bob", Now: time.Now()})
	if d.Allow {
		t.Error("non-owner should not see viewers")
	}
}

func TestRoleHierarchy(t *testing.T) {
	if !IsModerator(GlobalAdmin) {
		t.Error("admin should be moderator+")
	}
	if !IsModerator(GlobalModerator) {
		t.Error("moderator should be moderator+")
	}
	if IsModerator(GlobalUser) {
		t.Error("user should not be moderator+")
	}
	if IsAdmin(GlobalModerator) {
		t.Error("moderator should not be admin")
	}
	if !ConvRoleAtLeast(ConvOwner, ConvAdmin) {
		t.Error("owner ≥ admin")
	}
	if ConvRoleAtLeast(ConvMember, ConvAdmin) {
		t.Error("member should not be ≥ admin")
	}
}
