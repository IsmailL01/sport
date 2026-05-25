// SQLite репозиторий для клубов (см. database.ts v20).
//
// Pure I/O без бизнес-логики: валидация и UI-шаги живут в
// modules/clubs/domain + state. Backend синхронизация — будущая работа
// (CLUBS-BACKEND-SYNC backlog v1.0.1).

import type {
  Club,
  ClubDetail,
  ClubMember,
  ClubRole,
  ClubSummary,
  CreateClubInput,
  UpdateClubInput,
} from '../modules/clubs/domain/types';
import { ClubError } from '../modules/clubs/domain/errors';
import { getDatabase } from './database';

/**
 * Local UUID v4 helper. We avoid the `uuid` npm package because v14 is ESM-only
 * and jest-expo's transformIgnorePatterns doesn't unwrap it (see Plan 08-01
 * pattern). Math.random is fine for client-side row IDs — no security context.
 */
function clubId(): string {
  // RFC 4122 v4 layout: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where y is one of [8,9,a,b].
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    let byte = Math.floor(Math.random() * 256);
    if (i === 6) byte = (byte & 0x0f) | 0x40;
    if (i === 8) byte = (byte & 0x3f) | 0x80;
    hex.push(byte.toString(16).padStart(2, '0'));
  }
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

type ClubRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  avatar_color: string;
  created_at: number;
  updated_at: number;
};

type ClubMemberRow = {
  club_id: string;
  user_id: string;
  role: string;
  joined_at: number;
};

function rowToClub(row: ClubRow): Club {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    avatarColor: row.avatar_color as Club['avatarColor'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMember(row: ClubMemberRow): ClubMember {
  return {
    clubId: row.club_id,
    userId: row.user_id,
    role: row.role as ClubRole,
    joinedAt: row.joined_at,
  };
}

/**
 * Create a club + insert owner as first member + insert any additional
 * member rows. Atomic transaction.
 */
export function createClub(input: CreateClubInput): Club {
  const db = getDatabase();
  const now = Date.now();
  const id = clubId();

  const club: Club = {
    id,
    ownerId: input.ownerId,
    name: input.name.trim(),
    description: input.description.trim(),
    avatarColor: input.avatarColor,
    createdAt: now,
    updatedAt: now,
  };

  // Dedupe member list: drop owner if accidentally included; drop blanks.
  const extraMembers = Array.from(
    new Set(
      input.memberIds
        .map((m) => m.trim())
        .filter((m) => m.length > 0 && m !== input.ownerId),
    ),
  );

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO clubs (id, owner_id, name, description, avatar_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        club.id,
        club.ownerId,
        club.name,
        club.description,
        club.avatarColor,
        club.createdAt,
        club.updatedAt,
      ],
    );
    db.runSync(
      `INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, ?, ?);`,
      [club.id, club.ownerId, 'owner', now],
    );
    for (const memberId of extraMembers) {
      db.runSync(
        `INSERT OR IGNORE INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, ?, ?);`,
        [club.id, memberId, 'member', now],
      );
    }
  });

  return club;
}

/** Update a club's name / description / avatar. Only the owner may call this. */
export function updateClub(viewerUserId: string, input: UpdateClubInput): Club {
  const db = getDatabase();
  const club = getClubOrThrow(input.id);
  if (club.ownerId !== viewerUserId) {
    throw new ClubError('forbidden', 'Только владелец может редактировать клуб');
  }
  const now = Date.now();
  const trimmedName = input.name.trim();
  const trimmedDescription = input.description.trim();
  db.runSync(
    `UPDATE clubs SET name = ?, description = ?, avatar_color = ?, updated_at = ? WHERE id = ?;`,
    [trimmedName, trimmedDescription, input.avatarColor, now, input.id],
  );
  return {
    ...club,
    name: trimmedName,
    description: trimmedDescription,
    avatarColor: input.avatarColor,
    updatedAt: now,
  };
}

/** Delete a club (and all memberships). Only the owner may call this. */
export function deleteClub(viewerUserId: string, clubId: string): void {
  const db = getDatabase();
  const club = getClubOrThrow(clubId);
  if (club.ownerId !== viewerUserId) {
    throw new ClubError('forbidden', 'Только владелец может удалить клуб');
  }
  db.withTransactionSync(() => {
    db.runSync(`DELETE FROM club_members WHERE club_id = ?;`, [clubId]);
    db.runSync(`DELETE FROM clubs WHERE id = ?;`, [clubId]);
  });
}

/** Add a member (idempotent — INSERT OR IGNORE). Owner-only. */
export function addMember(
  viewerUserId: string,
  clubId: string,
  newMemberId: string,
): void {
  const club = getClubOrThrow(clubId);
  if (club.ownerId !== viewerUserId) {
    throw new ClubError('forbidden', 'Только владелец может добавлять участников');
  }
  if (newMemberId.trim().length === 0) {
    return;
  }
  const db = getDatabase();
  db.runSync(
    `INSERT OR IGNORE INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, ?, ?);`,
    [clubId, newMemberId, 'member', Date.now()],
  );
}

/**
 * Remove a member from a club. Owner cannot be removed (must deleteClub).
 * Allowed actors: the owner (kicking a member) OR the member themselves
 * (leaving the club).
 */
export function removeMember(
  viewerUserId: string,
  clubId: string,
  targetUserId: string,
): void {
  const club = getClubOrThrow(clubId);
  if (targetUserId === club.ownerId) {
    throw new ClubError(
      'forbidden',
      'Владелец не может покинуть клуб — удалите клуб целиком',
    );
  }
  const allowed = viewerUserId === club.ownerId || viewerUserId === targetUserId;
  if (!allowed) {
    throw new ClubError(
      'forbidden',
      'Только владелец или сам участник могут покинуть клуб',
    );
  }
  const db = getDatabase();
  const result = db.runSync(
    `DELETE FROM club_members WHERE club_id = ? AND user_id = ?;`,
    [clubId, targetUserId],
  );
  if (result.changes === 0) {
    throw new ClubError('not_a_member', 'Пользователь не состоит в клубе');
  }
}

/** Fetch one club row by id (throws if not found). */
function getClubOrThrow(clubId: string): Club {
  const db = getDatabase();
  const row = db.getFirstSync<ClubRow>(`SELECT * FROM clubs WHERE id = ?;`, [
    clubId,
  ]);
  if (row === null || row === undefined) {
    throw new ClubError('club_not_found', 'Клуб не найден');
  }
  return rowToClub(row);
}

/** List all clubs the user is a member of (owner or member), with counts. */
export function listClubsForUser(userId: string): ClubSummary[] {
  const db = getDatabase();
  const rows = db.getAllSync<ClubRow & { members_count: number; viewer_role: string }>(
    `SELECT c.*, m.role AS viewer_role,
            (SELECT COUNT(*) FROM club_members m2 WHERE m2.club_id = c.id) AS members_count
     FROM clubs c
     INNER JOIN club_members m ON m.club_id = c.id AND m.user_id = ?
     ORDER BY c.updated_at DESC;`,
    [userId],
  );
  return rows.map((row) => ({
    ...rowToClub(row),
    membersCount: row.members_count,
    viewerRole: row.viewer_role as ClubRole,
  }));
}

/** Fetch a single club detail (with members) from the viewer's perspective. */
export function getClubDetail(
  viewerUserId: string,
  clubId: string,
): ClubDetail | null {
  const db = getDatabase();
  const row = db.getFirstSync<ClubRow>(`SELECT * FROM clubs WHERE id = ?;`, [
    clubId,
  ]);
  if (row === null || row === undefined) {
    return null;
  }
  const club = rowToClub(row);
  const memberRows = db.getAllSync<ClubMemberRow>(
    `SELECT * FROM club_members WHERE club_id = ? ORDER BY joined_at ASC;`,
    [clubId],
  );
  const members = memberRows.map(rowToMember);
  const viewerMembership = members.find((m) => m.userId === viewerUserId);
  if (viewerMembership === undefined) {
    return null;
  }
  return {
    ...club,
    members,
    viewerRole: viewerMembership.role,
  };
}

/** Wipe all clubs data (called on logout / account delete). */
export function clearAllClubs(): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.execSync(`DELETE FROM club_members;`);
    db.execSync(`DELETE FROM clubs;`);
  });
}
