package permissions

import (
	"testing"

	"github.com/runningecosystem/backend/messaging/internal/domain"
)

func TestCanSend(t *testing.T) {
	cases := []struct {
		role domain.MemberRole
		want bool
	}{
		{domain.RoleOwner, true},
		{domain.RoleAdmin, true},
		{domain.RoleModerator, true},
		{domain.RoleMember, true},
		{domain.RoleRestricted, false},
	}
	for _, c := range cases {
		if got := CanSend(c.role); got != c.want {
			t.Errorf("CanSend(%v) = %v; want %v", c.role, got, c.want)
		}
	}
}

func TestCanDeleteOthersMessage(t *testing.T) {
	if !CanDeleteOthersMessage(domain.RoleOwner) {
		t.Error("owner must be able to delete others")
	}
	if !CanDeleteOthersMessage(domain.RoleAdmin) {
		t.Error("admin must be able to delete others")
	}
	if !CanDeleteOthersMessage(domain.RoleModerator) {
		t.Error("moderator must be able to delete others")
	}
	if CanDeleteOthersMessage(domain.RoleMember) {
		t.Error("member must NOT be able to delete others")
	}
}

func TestCanRemoveMember(t *testing.T) {
	cases := []struct {
		actor, target domain.MemberRole
		want          bool
		desc          string
	}{
		{domain.RoleOwner, domain.RoleAdmin, true, "owner kicks admin"},
		{domain.RoleOwner, domain.RoleMember, true, "owner kicks member"},
		{domain.RoleOwner, domain.RoleOwner, false, "owner cannot kick co-owner"},
		{domain.RoleAdmin, domain.RoleMember, true, "admin kicks member"},
		{domain.RoleAdmin, domain.RoleAdmin, false, "admin cannot kick another admin"},
		{domain.RoleAdmin, domain.RoleOwner, false, "admin cannot kick owner"},
		{domain.RoleAdmin, domain.RoleModerator, true, "admin kicks moderator"},
		{domain.RoleMember, domain.RoleMember, false, "member cannot kick anyone"},
		{domain.RoleModerator, domain.RoleMember, false, "moderator cannot kick"},
	}
	for _, c := range cases {
		if got := CanRemoveMember(c.actor, c.target); got != c.want {
			t.Errorf("%s: CanRemoveMember(%v, %v) = %v; want %v", c.desc, c.actor, c.target, got, c.want)
		}
	}
}

func TestCanSelfLeave(t *testing.T) {
	if !CanSelfLeave(domain.RoleMember, 1) {
		t.Error("member can self-leave anytime")
	}
	if !CanSelfLeave(domain.RoleAdmin, 1) {
		t.Error("admin can self-leave even if sole admin")
	}
	if CanSelfLeave(domain.RoleOwner, 1) {
		t.Error("owner cannot leave if sole owner")
	}
	if !CanSelfLeave(domain.RoleOwner, 2) {
		t.Error("owner can leave if there are co-owners")
	}
}

func TestCanChangeRole(t *testing.T) {
	cases := []struct {
		actor, targetCurrent, newRole domain.MemberRole
		actorIsTarget                 bool
		want                          bool
		desc                          string
	}{
		{domain.RoleOwner, domain.RoleMember, domain.RoleAdmin, false, true, "owner promotes member→admin"},
		{domain.RoleOwner, domain.RoleAdmin, domain.RoleOwner, false, true, "owner transfers ownership"},
		{domain.RoleOwner, domain.RoleMember, domain.RoleOwner, false, true, "owner can promote anyone to owner"},
		{domain.RoleAdmin, domain.RoleMember, domain.RoleModerator, false, true, "admin promotes member→moderator"},
		{domain.RoleAdmin, domain.RoleMember, domain.RoleAdmin, false, false, "admin cannot promote to admin"},
		{domain.RoleAdmin, domain.RoleMember, domain.RoleOwner, false, false, "admin cannot promote to owner"},
		{domain.RoleAdmin, domain.RoleAdmin, domain.RoleMember, false, false, "admin cannot demote another admin"},
		{domain.RoleAdmin, domain.RoleOwner, domain.RoleMember, false, false, "admin cannot touch owner"},
		{domain.RoleMember, domain.RoleMember, domain.RoleAdmin, false, false, "member cannot promote"},
		{domain.RoleAdmin, domain.RoleMember, domain.RoleAdmin, true, false, "self-promotion forbidden"},
	}
	for _, c := range cases {
		got := CanChangeRole(c.actor, c.targetCurrent, c.newRole, c.actorIsTarget)
		if got != c.want {
			t.Errorf("%s: CanChangeRole(actor=%v, target=%v, new=%v, self=%v) = %v; want %v",
				c.desc, c.actor, c.targetCurrent, c.newRole, c.actorIsTarget, got, c.want)
		}
	}
}
