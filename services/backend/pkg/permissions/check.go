package permissions

import "time"

// Attributes — generic ABAC bag. Поля специфичны для домена.
//
// Examples:
//   subject.Attributes["is_premium"] = true
//   resource.Attributes["kind"] = "video"
//   resource.Attributes["visibility"] = "followers"
type Attributes map[string]any

// GetBool — typed accessor. Default = false.
func (a Attributes) GetBool(key string) bool {
	if a == nil {
		return false
	}
	v, ok := a[key].(bool)
	return ok && v
}

// GetString — typed accessor. Default = "".
func (a Attributes) GetString(key string) string {
	if a == nil {
		return ""
	}
	v, _ := a[key].(string)
	return v
}

// Subject — actor performing the action. Loaded once per request.
type Subject struct {
	UserID      string
	GlobalRole  GlobalRole
	BannedUntil *time.Time
	// IsAuthenticated — false для anon-checks (gating публичных ручек).
	IsAuthenticated bool
	// Attributes — ABAC subject-side. Premium, country, accountAge, etc.
	Attributes Attributes
}

// IsBanned — check ban status against given clock.
func (s Subject) IsBanned(now time.Time) bool {
	return s.BannedUntil != nil && s.BannedUntil.After(now)
}

// ResourceContext — что нужно знать о target ресурсе для check-а.
// Поля опциональны и используются только релевантными capabilities.
type ResourceContext struct {
	// OwnerID — автор ресурса (post, message, story, comment). "" если не applicable.
	OwnerID string

	// === Conversation context ===

	// MyConvRole — роль actor-а в данной conv. "" если actor не member.
	MyConvRole ConvRole
	// TargetConvRole — для actions над другим member (kick, change_role).
	TargetConvRole ConvRole
	// NewConvRole — для change_role: какая роль будет назначена.
	NewConvRole ConvRole
	// OwnerCount — для leave: чтобы запретить уход последнему owner.
	OwnerCount int
	// ActorIsTarget — для self-actions (нельзя promote себя).
	ActorIsTarget bool
	// MutedUntil — Phase L: если actor замьючен в этой conv. Блокирует
	// CapMessageSend / CapMessageReact пока now < MutedUntil.
	MutedUntil *time.Time

	// === Time-window policy ===

	// CreatedAt — для CapMessageEditOwn: проверяем что в окне.
	CreatedAt time.Time

	// === ABAC ===

	// Attributes — resource-side (kind, visibility, isExclusive, etc).
	Attributes Attributes

	// === Clock ===

	// Now — used for time-based checks. Caller выставляет; для тестов мокается.
	Now time.Time
}

// Decision — результат check-а. Reason для logging / UI / audit_log.
type Decision struct {
	Allow  bool
	Reason string
}

func allow() Decision               { return Decision{Allow: true, Reason: ""} }
func deny(reason string) Decision   { return Decision{Allow: false, Reason: reason} }

// Time window для message edit (server-side enforcement).
const MessageEditWindow = 24 * time.Hour

// Check — главная точка принятия решения. Идёт через слои:
//
//  1. Auth — должен быть authenticated (кроме явных публичных caps).
//  2. Ban — banned юзер ничего не может (write actions).
//  3. Self-actions — owner всегда может на own resource.
//  4. Global override — admin/moderator могут override на модерационные actions.
//  5. Capability-specific policy.
//
// Возвращает Decision с Reason для дебага / логов.
func Check(subject Subject, cap Capability, ctx ResourceContext) Decision {
	if !subject.IsAuthenticated {
		return deny("not_authenticated")
	}

	now := ctx.Now
	if now.IsZero() {
		now = time.Now()
	}

	// === Ban gate: banned юзер не может ничего write-action ===
	if subject.IsBanned(now) && isWriteCap(cap) {
		return deny("user_banned")
	}

	// === Global moderation override ===
	// Admin / moderator может удалять чужой контент и работать с reports.
	if IsModerator(subject.GlobalRole) {
		switch cap {
		case CapMessageDeleteOthers,
			CapPostDeleteOthers,
			CapStoryDeleteOthers,
			CapCommentDeleteOthers,
			CapAdminListReports,
			CapReportResolve,
			// Phase 1 / REL-03: feature flag toggle gated на same global role.
			CapFeatureFlagToggle:
			return allow()
		}
	}

	// === Phase L: ABAC examples (rules over attributes) ===
	// Premium-only: видеопосты требуют premium account.
	if cap == CapPostCreate {
		if ctx.Attributes.GetString("kind") == "video" && !subject.Attributes.GetBool("is_premium") {
			return deny("premium_required")
		}
	}
	// Stories с overlay > 100 chars — premium feature.
	if cap == CapStoryCreate {
		if l, ok := ctx.Attributes["overlay_length"].(int); ok && l > 100 {
			if !subject.Attributes.GetBool("is_premium") {
				return deny("premium_required")
			}
		}
	}

	// === Per-capability policy ===
	switch cap {

	// --- Ownership-required (own actions) ---
	case CapMessageDeleteOwn,
		CapPostDeleteOwn,
		CapStoryDeleteOwn,
		CapCommentDeleteOwn:
		if subject.UserID != ctx.OwnerID {
			return deny("not_owner")
		}
		return allow()

	case CapMessageEditOwn:
		if subject.UserID != ctx.OwnerID {
			return deny("not_owner")
		}
		if now.Sub(ctx.CreatedAt) > MessageEditWindow {
			return deny("edit_window_expired")
		}
		return allow()

	case CapStoryViewersList:
		// Owner-only (приватная информация о viewers).
		if subject.UserID != ctx.OwnerID {
			return deny("not_owner")
		}
		return allow()

	// --- Conversation member actions ---
	case CapMessageSend:
		if ctx.MyConvRole == "" {
			return deny("not_member")
		}
		if ctx.MyConvRole == ConvRestricted {
			return deny("restricted")
		}
		// Phase L: muted_until check — owner/admin сами могут muted, проверяем
		// независимо от роли.
		if ctx.MutedUntil != nil && ctx.MutedUntil.After(now) {
			return deny("muted")
		}
		return allow()

	case CapMessageReact:
		if ctx.MyConvRole == "" || ctx.MyConvRole == ConvRestricted {
			return deny("restricted_or_not_member")
		}
		if ctx.MutedUntil != nil && ctx.MutedUntil.After(now) {
			return deny("muted")
		}
		return allow()

	case CapMessageDeleteOthers:
		// Минимум moderator в conv.
		if !ConvRoleAtLeast(ctx.MyConvRole, ConvModerator) {
			return deny("insufficient_conv_role")
		}
		return allow()

	case CapConvRename, CapConvAddMember:
		if !ConvRoleAtLeast(ctx.MyConvRole, ConvAdmin) {
			return deny("insufficient_conv_role")
		}
		return allow()

	case CapConvRemoveMember:
		if !ConvRoleAtLeast(ctx.MyConvRole, ConvAdmin) {
			return deny("insufficient_conv_role")
		}
		// Owner может kick кого угодно кроме других owner.
		if ctx.MyConvRole == ConvOwner {
			if ctx.TargetConvRole == ConvOwner {
				return deny("cannot_kick_owner")
			}
			return allow()
		}
		// Admin может kick только тех кто ниже admin.
		if ConvRoleRank(ctx.TargetConvRole) >= ConvRoleRank(ConvAdmin) {
			return deny("cannot_kick_peer_or_higher")
		}
		return allow()

	case CapConvChangeRole:
		if ctx.ActorIsTarget {
			return deny("cannot_self_promote")
		}
		if !ConvRoleAtLeast(ctx.MyConvRole, ConvAdmin) {
			return deny("insufficient_conv_role")
		}
		// Только owner может назначить owner (transfer ownership).
		if ctx.NewConvRole == ConvOwner && ctx.MyConvRole != ConvOwner {
			return deny("only_owner_can_transfer")
		}
		// Admin не может управлять админом или owner; не может назначить admin/owner.
		if ctx.MyConvRole == ConvAdmin {
			if ctx.TargetConvRole == ConvAdmin || ctx.TargetConvRole == ConvOwner {
				return deny("admin_cannot_modify_peer")
			}
			if ctx.NewConvRole == ConvAdmin || ctx.NewConvRole == ConvOwner {
				return deny("admin_cannot_promote_to_admin")
			}
		}
		return allow()

	case CapConvLeave:
		// Owner может leave только если есть другие owners (transfer first).
		if ctx.MyConvRole == ConvOwner && ctx.OwnerCount <= 1 {
			return deny("last_owner_must_transfer")
		}
		return allow()

	case CapConvTransferOwnership:
		if ctx.MyConvRole != ConvOwner {
			return deny("not_owner")
		}
		return allow()

	// --- Feed write-actions ---
	case CapPostCreate, CapStoryCreate, CapCommentCreate, CapPostLike, CapFollow, CapBlock, CapReportSubmit:
		// Authenticated && not banned (already checked); allow.
		return allow()

	// --- Admin-only ---
	case CapAdminListReports, CapReportResolve, CapFeatureFlagToggle:
		if !IsModerator(subject.GlobalRole) {
			return deny("admin_required")
		}
		return allow()
	}

	return deny("unknown_capability")
}

// Allow — convenience wrapper, возвращает только bool.
func Allow(subject Subject, cap Capability, ctx ResourceContext) bool {
	return Check(subject, cap, ctx).Allow
}

// isWriteCap — capability которая создаёт / модифицирует данные.
// Использует ban-gate; read-only caps не тронуты бана (можно читать феед если забанен).
func isWriteCap(c Capability) bool {
	switch c {
	case CapMessageSend, CapMessageDeleteOwn, CapMessageDeleteOthers,
		CapMessageEditOwn, CapMessageReact,
		CapConvRename, CapConvAddMember, CapConvRemoveMember,
		CapConvChangeRole, CapConvTransferOwnership,
		CapPostCreate, CapPostDeleteOwn, CapPostDeleteOthers, CapPostLike,
		CapStoryCreate, CapStoryDeleteOwn, CapStoryDeleteOthers,
		CapCommentCreate, CapCommentDeleteOwn, CapCommentDeleteOthers,
		CapFollow, CapBlock, CapReportSubmit:
		return true
	}
	return false
}
