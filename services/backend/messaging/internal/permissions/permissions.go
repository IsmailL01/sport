// Package permissions — capability matrix для conversations.
// Phase 8 / B1.
//
// Single source of truth для "может ли actor сделать X с target?".
// Все service-level операции вызывают эти функции вместо ручных if'ов
// чтобы capability matrix менялся в одном месте.
//
// Capability matrix:
//
//                | owner | admin | moderator | member | restricted
// ----------------|-------|-------|-----------|--------|-----------
// Send message    |   ✓   |   ✓   |     ✓     |   ✓    |     ✗
// Delete own      |   ✓   |   ✓   |     ✓     |   ✓    |     ✗
// Delete others   |   ✓   |   ✓   |     ✓     |   ✗    |     ✗
// Edit conv       |   ✓   |   ✓   |     ✗     |   ✗    |     ✗
// Add members     |   ✓   |   ✓   |     ✗     |   ✗    |     ✗
// Kick member     |   ✓¹  |   ✓²  |     ✗     |   ✗    |     ✗
// Change role     |   ✓¹  |   ✓²  |     ✗     |   ✗    |     ✗
// Transfer owner  |   ✓   |   ✗   |     ✗     |   ✗    |     ✗
// Mute member     |   ✓   |   ✓   |     ✓     |   ✗    |     ✗
// Self-leave      |   ✓³  |   ✓   |     ✓     |   ✓    |     ✓
//
// ¹ owner can act on anyone except other owners (only one owner at a time)
// ² admin can act on members below admin (not on other admins or owner)
// ³ owner cannot leave если он единственный owner (нужно сначала transfer)

package permissions

import "github.com/runningecosystem/backend/messaging/internal/domain"

type Role = domain.MemberRole

// roleRank — иерархия для сравнений; higher = more privileged.
func roleRank(r Role) int {
	switch r {
	case domain.RoleOwner:
		return 5
	case domain.RoleAdmin:
		return 4
	case domain.RoleModerator:
		return 3
	case domain.RoleMember:
		return 2
	case domain.RoleRestricted:
		return 1
	}
	return 0
}

// CanSend — может ли отправить сообщение в конверсацию.
func CanSend(role Role) bool {
	return role != domain.RoleRestricted && role != ""
}

// CanDeleteOthersMessage — может ли удалить чужое сообщение.
func CanDeleteOthersMessage(role Role) bool {
	return role == domain.RoleOwner || role == domain.RoleAdmin || role == domain.RoleModerator
}

// CanRenameConversation — title / avatar.
func CanRenameConversation(role Role) bool {
	return role == domain.RoleOwner || role == domain.RoleAdmin
}

// CanAddMember.
func CanAddMember(role Role) bool {
	return role == domain.RoleOwner || role == domain.RoleAdmin
}

// CanRemoveMember — actor хочет kick target. Self-leave проверяется отдельно
// через CanSelfLeave.
func CanRemoveMember(actor, target Role) bool {
	if actor != domain.RoleOwner && actor != domain.RoleAdmin {
		return false
	}
	// Owner can remove anyone except other owners (no co-owners).
	if actor == domain.RoleOwner {
		return target != domain.RoleOwner
	}
	// Admin can remove members below admin (not other admins or owner).
	return roleRank(target) < roleRank(domain.RoleAdmin)
}

// CanSelfLeave — пользователь сам уходит. Owner — только если есть другие owners
// (передача ownership делается отдельным endpoint в Phase E).
func CanSelfLeave(role Role, ownerCount int) bool {
	if role == domain.RoleOwner {
		return ownerCount > 1
	}
	return true
}

// CanChangeRole — actor хочет назначить targetCurrent → newRole.
// Запреты:
//   - Только owner может назначить owner (transfer ownership)
//   - Admin не может изменить роль другого admin или owner
//   - Нельзя демоутить owner если он единственный (нужен transfer)
//   - Нельзя promote себя
func CanChangeRole(actor, targetCurrent, newRole Role, actorIsTarget bool) bool {
	if actorIsTarget {
		return false // self-promotion запрещён всегда
	}
	if actor != domain.RoleOwner && actor != domain.RoleAdmin {
		return false
	}
	if newRole == domain.RoleOwner && actor != domain.RoleOwner {
		return false
	}
	if actor == domain.RoleAdmin {
		// admin не может управлять админом или owner
		if targetCurrent == domain.RoleAdmin || targetCurrent == domain.RoleOwner {
			return false
		}
		// admin не может назначить admin/owner (только moderator/member/restricted)
		if newRole == domain.RoleAdmin || newRole == domain.RoleOwner {
			return false
		}
	}
	return true
}
