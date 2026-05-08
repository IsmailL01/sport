package permissions

// GlobalRole — global account role (storage: profiles.global_role).
type GlobalRole string

const (
	GlobalUser      GlobalRole = "user"
	GlobalPremium   GlobalRole = "premium"
	GlobalModerator GlobalRole = "moderator"
	GlobalAdmin     GlobalRole = "admin"
)

// GlobalRoleRank — для сравнения ролей. Higher = more privileged.
// Спред rank-значений нумерован с шагом, чтобы будущие роли (vip, partner)
// можно было вставлять не ломая ordering.
func GlobalRoleRank(r GlobalRole) int {
	switch r {
	case GlobalAdmin:
		return 100
	case GlobalModerator:
		return 50
	case GlobalPremium:
		return 5
	case GlobalUser, "":
		return 1
	}
	return 0
}

// IsModerator — moderator или admin.
func IsModerator(r GlobalRole) bool { return GlobalRoleRank(r) >= GlobalRoleRank(GlobalModerator) }

// IsAdmin — только admin.
func IsAdmin(r GlobalRole) bool { return r == GlobalAdmin }

// === Conversation roles ===

// ConvRole — per-conversation member role (storage: conversation_members.role).
type ConvRole string

const (
	ConvOwner      ConvRole = "owner"
	ConvAdmin      ConvRole = "admin"
	ConvModerator  ConvRole = "moderator"
	ConvMember     ConvRole = "member"
	ConvRestricted ConvRole = "restricted"
)

// ConvRoleRank — для иерархических сравнений.
func ConvRoleRank(r ConvRole) int {
	switch r {
	case ConvOwner:
		return 50
	case ConvAdmin:
		return 40
	case ConvModerator:
		return 30
	case ConvMember:
		return 20
	case ConvRestricted:
		return 10
	}
	return 0
}

// ConvRoleAtLeast — actor.role >= minRequired.
func ConvRoleAtLeast(actor, minRequired ConvRole) bool {
	return ConvRoleRank(actor) >= ConvRoleRank(minRequired)
}
