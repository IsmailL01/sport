// modules/permissions — mirror Go pkg/permissions для mobile.
//
// Должен быть в strict 1-1 соответствии с backend, иначе UI будет показывать
// действия которые сервер откажет (плохой UX).
//
// Принципы:
//   1. Capability strings совпадают с Go (pkg/permissions/capability.go).
//   2. Role hierarchy идентична (rank-функции).
//   3. Check() возвращает Decision { allow, reason }.
//   4. UI gate: `if (allow(subject, cap, ctx)) { показать кнопку }`.
//   5. Server финально решает — клиент это только UX hint.

// === Capabilities ===

export type Capability =
  | 'message.send'
  | 'message.delete_own'
  | 'message.delete_others'
  | 'message.edit_own'
  | 'message.react'
  | 'conv.rename'
  | 'conv.add_member'
  | 'conv.remove_member'
  | 'conv.change_role'
  | 'conv.leave'
  | 'conv.transfer_ownership'
  | 'post.create'
  | 'post.delete_own'
  | 'post.delete_others'
  | 'post.like'
  | 'story.create'
  | 'story.delete_own'
  | 'story.delete_others'
  | 'story.viewers_list'
  | 'comment.create'
  | 'comment.delete_own'
  | 'comment.delete_others'
  | 'social.follow'
  | 'social.block'
  | 'report.submit'
  | 'report.resolve'
  | 'admin.list_reports';

// === Roles ===

export type GlobalRole = 'user' | 'premium' | 'moderator' | 'admin';

export function globalRoleRank(r: string | undefined | null): number {
  switch (r) {
    case 'admin': return 100;
    case 'moderator': return 50;
    case 'premium': return 5;
    case 'user':
    case undefined:
    case null:
    case '':
      return 1;
  }
  return 0;
}

export function isModerator(r: string | undefined | null): boolean {
  return globalRoleRank(r) >= globalRoleRank('moderator');
}

export function isAdmin(r: string | undefined | null): boolean {
  return r === 'admin';
}

export type ConvRole = 'owner' | 'admin' | 'moderator' | 'member' | 'restricted';

export function convRoleRank(r: ConvRole | '' | undefined): number {
  switch (r) {
    case 'owner': return 50;
    case 'admin': return 40;
    case 'moderator': return 30;
    case 'member': return 20;
    case 'restricted': return 10;
  }
  return 0;
}

export function convRoleAtLeast(actor: ConvRole | '' | undefined, min: ConvRole): boolean {
  return convRoleRank(actor) >= convRoleRank(min);
}

// === Attributes (ABAC) ===

export type Attributes = Record<string, unknown>;

export function attrBool(a: Attributes | undefined, key: string): boolean {
  if (!a) return false;
  const v = a[key];
  return typeof v === 'boolean' && v;
}

export function attrString(a: Attributes | undefined, key: string): string {
  if (!a) return '';
  const v = a[key];
  return typeof v === 'string' ? v : '';
}

// === Subject ===

export type Subject = {
  userId: string;
  globalRole: GlobalRole;
  /** ms epoch UTC; null если не забанен. */
  bannedUntil: number | null;
  isAuthenticated: boolean;
  /** ABAC subject attributes (is_premium, country, etc). */
  attributes?: Attributes;
};

export function isBanned(s: Subject, nowMs: number = Date.now()): boolean {
  return s.bannedUntil !== null && s.bannedUntil > nowMs;
}

// === ResourceContext ===

export type ResourceContext = {
  ownerId?: string;
  myConvRole?: ConvRole;
  targetConvRole?: ConvRole;
  newConvRole?: ConvRole;
  ownerCount?: number;
  actorIsTarget?: boolean;
  /** ms epoch UTC; null если не замьючен в conv. Phase L. */
  mutedUntil?: number | null;
  /** ms epoch UTC */
  createdAt?: number;
  /** ms epoch UTC; default Date.now() */
  now?: number;
  /** ABAC resource attributes (kind, visibility, overlay_length). */
  attributes?: Attributes;
};

// === Decision ===

export type Decision = { allow: boolean; reason?: string };

const ALLOW: Decision = { allow: true };
function deny(reason: string): Decision { return { allow: false, reason }; }

export const MESSAGE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const WRITE_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  'message.send', 'message.delete_own', 'message.delete_others',
  'message.edit_own', 'message.react',
  'conv.rename', 'conv.add_member', 'conv.remove_member',
  'conv.change_role', 'conv.transfer_ownership',
  'post.create', 'post.delete_own', 'post.delete_others', 'post.like',
  'story.create', 'story.delete_own', 'story.delete_others',
  'comment.create', 'comment.delete_own', 'comment.delete_others',
  'social.follow', 'social.block', 'report.submit',
]);

// === Check ===

/**
 * Главная точка принятия решения. Mirror Go pkg/permissions::Check.
 *
 * UI gate: `check(subject, 'post.delete_others', { ownerId }).allow`.
 * Финальное слово за сервером — клиент только prettifies UX.
 */
export function check(
  subject: Subject,
  cap: Capability,
  ctx: ResourceContext = {},
): Decision {
  if (!subject.isAuthenticated) return deny('not_authenticated');

  const now = ctx.now ?? Date.now();
  if (isBanned(subject, now) && WRITE_CAPS.has(cap)) {
    return deny('user_banned');
  }

  // Global moderator override.
  if (isModerator(subject.globalRole)) {
    switch (cap) {
      case 'message.delete_others':
      case 'post.delete_others':
      case 'story.delete_others':
      case 'comment.delete_others':
      case 'admin.list_reports':
      case 'report.resolve':
        return ALLOW;
    }
  }

  // === Phase L: ABAC examples ===
  if (cap === 'post.create') {
    if (attrString(ctx.attributes, 'kind') === 'video' && !attrBool(subject.attributes, 'is_premium')) {
      return deny('premium_required');
    }
  }
  if (cap === 'story.create') {
    const len = ctx.attributes?.['overlay_length'];
    if (typeof len === 'number' && len > 100 && !attrBool(subject.attributes, 'is_premium')) {
      return deny('premium_required');
    }
  }

  switch (cap) {
    // Ownership-required.
    case 'message.delete_own':
    case 'post.delete_own':
    case 'story.delete_own':
    case 'comment.delete_own':
      if (subject.userId !== ctx.ownerId) return deny('not_owner');
      return ALLOW;

    case 'message.edit_own':
      if (subject.userId !== ctx.ownerId) return deny('not_owner');
      if (ctx.createdAt !== undefined && now - ctx.createdAt > MESSAGE_EDIT_WINDOW_MS) {
        return deny('edit_window_expired');
      }
      return ALLOW;

    case 'story.viewers_list':
      if (subject.userId !== ctx.ownerId) return deny('not_owner');
      return ALLOW;

    // Conv member.
    case 'message.send':
      if (!ctx.myConvRole) return deny('not_member');
      if (ctx.myConvRole === 'restricted') return deny('restricted');
      if (ctx.mutedUntil != null && ctx.mutedUntil > now) return deny('muted');
      return ALLOW;

    case 'message.react':
      if (!ctx.myConvRole || ctx.myConvRole === 'restricted') {
        return deny('restricted_or_not_member');
      }
      if (ctx.mutedUntil != null && ctx.mutedUntil > now) return deny('muted');
      return ALLOW;

    case 'message.delete_others':
      if (!convRoleAtLeast(ctx.myConvRole, 'moderator')) {
        return deny('insufficient_conv_role');
      }
      return ALLOW;

    case 'conv.rename':
    case 'conv.add_member':
      if (!convRoleAtLeast(ctx.myConvRole, 'admin')) {
        return deny('insufficient_conv_role');
      }
      return ALLOW;

    case 'conv.remove_member':
      if (!convRoleAtLeast(ctx.myConvRole, 'admin')) {
        return deny('insufficient_conv_role');
      }
      if (ctx.myConvRole === 'owner') {
        if (ctx.targetConvRole === 'owner') return deny('cannot_kick_owner');
        return ALLOW;
      }
      if (convRoleRank(ctx.targetConvRole) >= convRoleRank('admin')) {
        return deny('cannot_kick_peer_or_higher');
      }
      return ALLOW;

    case 'conv.change_role':
      if (ctx.actorIsTarget) return deny('cannot_self_promote');
      if (!convRoleAtLeast(ctx.myConvRole, 'admin')) {
        return deny('insufficient_conv_role');
      }
      if (ctx.newConvRole === 'owner' && ctx.myConvRole !== 'owner') {
        return deny('only_owner_can_transfer');
      }
      if (ctx.myConvRole === 'admin') {
        if (ctx.targetConvRole === 'admin' || ctx.targetConvRole === 'owner') {
          return deny('admin_cannot_modify_peer');
        }
        if (ctx.newConvRole === 'admin' || ctx.newConvRole === 'owner') {
          return deny('admin_cannot_promote_to_admin');
        }
      }
      return ALLOW;

    case 'conv.leave':
      if (ctx.myConvRole === 'owner' && (ctx.ownerCount ?? 1) <= 1) {
        return deny('last_owner_must_transfer');
      }
      return ALLOW;

    case 'conv.transfer_ownership':
      if (ctx.myConvRole !== 'owner') return deny('not_owner');
      return ALLOW;

    case 'post.create':
    case 'story.create':
    case 'comment.create':
    case 'post.like':
    case 'social.follow':
    case 'social.block':
    case 'report.submit':
      return ALLOW;

    case 'admin.list_reports':
    case 'report.resolve':
      if (!isModerator(subject.globalRole)) return deny('admin_required');
      return ALLOW;
  }

  return deny('unknown_capability');
}

/** Convenience boolean wrapper. */
export function allow(
  subject: Subject,
  cap: Capability,
  ctx: ResourceContext = {},
): boolean {
  return check(subject, cap, ctx).allow;
}
