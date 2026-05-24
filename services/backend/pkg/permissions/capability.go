// Package permissions — централизованная RBAC система.
//
// Принципы:
//  1. Capability strings — стабильные ID действий (для audit_log + UI gating).
//  2. Role hierarchy — иерархическое сравнение через rank-функции.
//  3. Defense in depth: ban check всегда первый.
//  4. Global admin/moderator override — может действовать по любому ресурсу
//     (пользовательский content) для модерации.
//  5. Ownership-by-default — owner ресурса всегда может его модифицировать
//     (если не banned).
//  6. Time-window policy — edit-окно (24h) проверяется на сервере, не только
//     хардкодится в клиенте.
//  7. Single source of truth — каждый сервис импортирует pkg вместо своих
//     ad-hoc проверок.
//
// API: `Check(subject, capability, ctx) Decision` — единственная точка
// принятия решения. Decision несёт Reason для логирования и UI.
package permissions

// Capability — стабильный строковый идентификатор действия.
// Используется в:
//   - audit_log (для аналитики)
//   - mobile permissions module (mirror)
//   - тестах (matrix sweep)
type Capability string

const (
	// === Messaging (per-conversation) ===
	CapMessageSend         Capability = "message.send"
	CapMessageDeleteOwn    Capability = "message.delete_own"
	CapMessageDeleteOthers Capability = "message.delete_others"
	CapMessageEditOwn      Capability = "message.edit_own"
	CapMessageReact        Capability = "message.react"

	// === Conversation management ===
	CapConvRename            Capability = "conv.rename"
	CapConvAddMember         Capability = "conv.add_member"
	CapConvRemoveMember      Capability = "conv.remove_member"
	CapConvChangeRole        Capability = "conv.change_role"
	CapConvLeave             Capability = "conv.leave"
	CapConvTransferOwnership Capability = "conv.transfer_ownership"

	// === Feed: posts ===
	CapPostCreate       Capability = "post.create"
	CapPostDeleteOwn    Capability = "post.delete_own"
	CapPostDeleteOthers Capability = "post.delete_others"
	CapPostLike         Capability = "post.like"

	// === Feed: stories ===
	CapStoryCreate       Capability = "story.create"
	CapStoryDeleteOwn    Capability = "story.delete_own"
	CapStoryDeleteOthers Capability = "story.delete_others"
	CapStoryViewersList  Capability = "story.viewers_list"

	// === Feed: comments ===
	CapCommentCreate       Capability = "comment.create"
	CapCommentDeleteOwn    Capability = "comment.delete_own"
	CapCommentDeleteOthers Capability = "comment.delete_others"

	// === Social ===
	CapFollow Capability = "social.follow"
	CapBlock  Capability = "social.block"

	// === Moderation ===
	CapReportSubmit     Capability = "report.submit"
	CapReportResolve    Capability = "report.resolve"
	CapAdminListReports Capability = "admin.list_reports"

	// === Feature flags (Phase 1 / REL-03) ===
	// Toggle / set rollout percent для записи в таблице featureflags.
	// Gated на global admin / moderator role через IsModerator() в check.go.
	CapFeatureFlagToggle Capability = "featureflag.toggle"
)
