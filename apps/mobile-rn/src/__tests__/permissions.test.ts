// modules/permissions matrix tests — mirror Go pkg/permissions/check_test.go
//
// Эти тесты должны падать одновременно с серверными если матрица расходится.
// Поэтому набор кейсов идентичен.

import {
  allow,
  check,
  convRoleAtLeast,
  globalRoleRank,
  isAdmin,
  isBanned,
  isModerator,
  type Subject,
} from '../modules/permissions';

const NOW = 1_700_000_000_000;

function user(role: 'user' | 'moderator' | 'admin' = 'user'): Subject {
  return { userId: 'u1', globalRole: role, bannedUntil: null, isAuthenticated: true };
}

function bannedUser(untilMs: number): Subject {
  return { userId: 'u1', globalRole: 'user', bannedUntil: untilMs, isAuthenticated: true };
}

describe('permissions: not authenticated', () => {
  it('all writes denied', () => {
    const anon: Subject = { userId: '', globalRole: 'user', bannedUntil: null, isAuthenticated: false };
    expect(check(anon, 'post.create', { now: NOW })).toEqual({ allow: false, reason: 'not_authenticated' });
    expect(check(anon, 'message.send', { myConvRole: 'member', now: NOW })).toMatchObject({ allow: false });
  });
});

describe('permissions: ban gate', () => {
  it('banned user denied for write caps', () => {
    const subj = bannedUser(NOW + 60_000);
    expect(allow(subj, 'post.create', { now: NOW })).toBe(false);
    expect(allow(subj, 'comment.create', { now: NOW })).toBe(false);
    expect(allow(subj, 'social.follow', { now: NOW })).toBe(false);
  });
  it('expired ban ignored', () => {
    const subj = bannedUser(NOW - 60_000);
    expect(allow(subj, 'post.create', { now: NOW })).toBe(true);
  });
  it('isBanned helper', () => {
    expect(isBanned(bannedUser(NOW + 1), NOW)).toBe(true);
    expect(isBanned(bannedUser(NOW - 1), NOW)).toBe(false);
  });
});

describe('permissions: ownership for delete_own', () => {
  it('own → allow', () => {
    expect(allow(user(), 'post.delete_own', { ownerId: 'u1', now: NOW })).toBe(true);
  });
  it('not own → deny', () => {
    expect(allow(user(), 'post.delete_own', { ownerId: 'other', now: NOW })).toBe(false);
  });
});

describe('permissions: moderator override for delete_others', () => {
  it.each(['message.delete_others', 'post.delete_others', 'story.delete_others', 'comment.delete_others'] as const)(
    '%s — moderator allowed',
    (cap) => {
      expect(allow(user('moderator'), cap, { ownerId: 'anyone', now: NOW })).toBe(true);
    },
  );
  it('regular user denied', () => {
    expect(allow(user(), 'post.delete_others', { ownerId: 'other', now: NOW })).toBe(false);
  });
});

describe('permissions: message edit window', () => {
  it('within 24h → allow', () => {
    expect(allow(user(), 'message.edit_own', {
      ownerId: 'u1', createdAt: NOW - 1 * 60 * 60 * 1000, now: NOW,
    })).toBe(true);
  });
  it('after 24h → deny', () => {
    const d = check(user(), 'message.edit_own', {
      ownerId: 'u1', createdAt: NOW - 25 * 60 * 60 * 1000, now: NOW,
    });
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('edit_window_expired');
  });
});

describe('permissions: conv send membership', () => {
  it('non-member denied', () => {
    expect(allow(user(), 'message.send', { now: NOW })).toBe(false);
  });
  it('restricted denied', () => {
    expect(allow(user(), 'message.send', { myConvRole: 'restricted', now: NOW })).toBe(false);
  });
  it('member allowed', () => {
    expect(allow(user(), 'message.send', { myConvRole: 'member', now: NOW })).toBe(true);
  });
});

describe('permissions: conv change_role rules', () => {
  it('self-promote denied', () => {
    expect(allow(user(), 'conv.change_role', {
      myConvRole: 'owner', actorIsTarget: true, newConvRole: 'admin', now: NOW,
    })).toBe(false);
  });
  it('member cannot change roles', () => {
    expect(allow(user(), 'conv.change_role', {
      myConvRole: 'member', newConvRole: 'moderator', now: NOW,
    })).toBe(false);
  });
  it('admin cannot promote to admin', () => {
    expect(allow(user(), 'conv.change_role', {
      myConvRole: 'admin', targetConvRole: 'member', newConvRole: 'admin', now: NOW,
    })).toBe(false);
  });
  it('admin can promote member to moderator', () => {
    expect(allow(user(), 'conv.change_role', {
      myConvRole: 'admin', targetConvRole: 'member', newConvRole: 'moderator', now: NOW,
    })).toBe(true);
  });
  it('only owner can transfer', () => {
    expect(allow(user(), 'conv.change_role', {
      myConvRole: 'owner', targetConvRole: 'admin', newConvRole: 'owner', now: NOW,
    })).toBe(true);
  });
});

describe('permissions: conv leave last owner', () => {
  it('last owner cannot leave', () => {
    expect(allow(user(), 'conv.leave', { myConvRole: 'owner', ownerCount: 1, now: NOW })).toBe(false);
  });
  it('co-owner can leave', () => {
    expect(allow(user(), 'conv.leave', { myConvRole: 'owner', ownerCount: 2, now: NOW })).toBe(true);
  });
});

describe('permissions: admin caps require moderator+', () => {
  it('user denied', () => {
    expect(allow(user(), 'admin.list_reports', { now: NOW })).toBe(false);
    expect(allow(user(), 'report.resolve', { now: NOW })).toBe(false);
  });
  it('moderator allowed', () => {
    expect(allow(user('moderator'), 'admin.list_reports', { now: NOW })).toBe(true);
  });
});

describe('permissions: hierarchy helpers', () => {
  it('isModerator', () => {
    expect(isModerator('admin')).toBe(true);
    expect(isModerator('moderator')).toBe(true);
    expect(isModerator('user')).toBe(false);
    expect(isModerator(null)).toBe(false);
  });
  it('isAdmin', () => {
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('moderator')).toBe(false);
  });
  it('convRoleAtLeast', () => {
    expect(convRoleAtLeast('owner', 'admin')).toBe(true);
    expect(convRoleAtLeast('member', 'admin')).toBe(false);
    expect(convRoleAtLeast('moderator', 'moderator')).toBe(true);
  });
  it('globalRoleRank monotonic', () => {
    expect(globalRoleRank('admin')).toBeGreaterThan(globalRoleRank('moderator'));
    expect(globalRoleRank('moderator')).toBeGreaterThan(globalRoleRank('user'));
  });
});
