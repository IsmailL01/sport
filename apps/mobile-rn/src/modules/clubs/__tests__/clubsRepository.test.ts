// Real-SQLite integration test для clubsRepository (quick-task profile-clubs-polish).
// Pattern mirrors sessionRepository.integration.test.ts: fresh :memory: db per test
// через `_setDatabase` + `runMigrations()` в beforeEach.

import * as SQLite from 'expo-sqlite';

import {
  addMember,
  clearAllClubs,
  createClub,
  deleteClub,
  getClubDetail,
  listClubsForUser,
  removeMember,
  updateClub,
} from '../../../storage/clubsRepository';
import { runMigrations, _setDatabase } from '../../../storage/database';
import { ClubError } from '../domain/errors';

const OWNER = 'user-owner-uuid';
const FRIEND_A = 'user-friend-a';
const FRIEND_B = 'user-friend-b';
const STRANGER = 'user-stranger';

describe('clubsRepository', () => {
  beforeEach(() => {
    const db = SQLite.openDatabaseSync(':memory:');
    _setDatabase(db);
    runMigrations();
  });

  afterEach(() => {
    _setDatabase(null);
  });

  describe('createClub', () => {
    it('inserts club row + owner-membership row', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Test Club',
        description: 'desc',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      expect(club.id).toMatch(/[0-9a-f-]{36}/i);
      expect(club.ownerId).toBe(OWNER);
      expect(club.name).toBe('Test Club');

      const list = listClubsForUser(OWNER);
      expect(list).toHaveLength(1);
      expect(list[0].membersCount).toBe(1);
      expect(list[0].viewerRole).toBe('owner');
    });

    it('inserts extra members + dedupes against owner', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A, FRIEND_B, OWNER, FRIEND_A, ''],
      });
      const detail = getClubDetail(OWNER, club.id);
      expect(detail).not.toBeNull();
      expect(detail!.members.map((m) => m.userId).sort()).toEqual(
        [OWNER, FRIEND_A, FRIEND_B].sort(),
      );
      expect(detail!.members.find((m) => m.userId === OWNER)?.role).toBe('owner');
      expect(detail!.members.find((m) => m.userId === FRIEND_A)?.role).toBe('member');
    });

    it('trims whitespace on name and description', () => {
      const club = createClub({
        ownerId: OWNER,
        name: '  Trimmed  ',
        description: '   keep this   ',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      expect(club.name).toBe('Trimmed');
      expect(club.description).toBe('keep this');
    });
  });

  describe('listClubsForUser', () => {
    it('returns only clubs where the user is a member', () => {
      createClub({
        ownerId: OWNER,
        name: 'Owned',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      createClub({
        ownerId: STRANGER,
        name: 'Other',
        description: '',
        avatarColor: '#FF4D2E',
        memberIds: [],
      });
      expect(listClubsForUser(OWNER).map((c) => c.name)).toEqual(['Owned']);
      expect(listClubsForUser(FRIEND_A).map((c) => c.name)).toEqual(['Owned']);
      expect(listClubsForUser(STRANGER).map((c) => c.name)).toEqual(['Other']);
    });
  });

  describe('updateClub', () => {
    it('owner can update name/description/avatar', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Old',
        description: 'old desc',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      const updated = updateClub(OWNER, {
        id: club.id,
        name: 'New',
        description: 'new desc',
        avatarColor: '#FF4D2E',
      });
      expect(updated.name).toBe('New');
      expect(updated.description).toBe('new desc');
      expect(updated.avatarColor).toBe('#FF4D2E');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(club.updatedAt);
    });

    it('non-owner cannot update — throws forbidden', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'X',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      expect(() =>
        updateClub(FRIEND_A, {
          id: club.id,
          name: 'X2',
          description: '',
          avatarColor: '#C6F560',
        }),
      ).toThrow(ClubError);
    });
  });

  describe('addMember', () => {
    it('owner can add member; insert is idempotent', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      addMember(OWNER, club.id, FRIEND_A);
      addMember(OWNER, club.id, FRIEND_A); // idempotent
      const detail = getClubDetail(OWNER, club.id)!;
      expect(detail.members.filter((m) => m.userId === FRIEND_A)).toHaveLength(1);
    });

    it('non-owner cannot add — throws forbidden', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      expect(() => addMember(FRIEND_A, club.id, FRIEND_B)).toThrow(ClubError);
    });
  });

  describe('removeMember', () => {
    it('owner can kick member', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      removeMember(OWNER, club.id, FRIEND_A);
      const detail = getClubDetail(OWNER, club.id)!;
      expect(detail.members.map((m) => m.userId)).not.toContain(FRIEND_A);
    });

    it('member can leave (self-remove)', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      removeMember(FRIEND_A, club.id, FRIEND_A);
      expect(getClubDetail(FRIEND_A, club.id)).toBeNull();
    });

    it('owner cannot leave — throws forbidden', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      expect(() => removeMember(OWNER, club.id, OWNER)).toThrow(ClubError);
    });

    it('non-owner cannot kick someone else', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A, FRIEND_B],
      });
      expect(() => removeMember(FRIEND_A, club.id, FRIEND_B)).toThrow(ClubError);
    });
  });

  describe('deleteClub', () => {
    it('owner can delete; club + all memberships are gone', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      deleteClub(OWNER, club.id);
      expect(listClubsForUser(OWNER)).toEqual([]);
      expect(listClubsForUser(FRIEND_A)).toEqual([]);
    });

    it('non-owner cannot delete', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      expect(() => deleteClub(FRIEND_A, club.id)).toThrow(ClubError);
    });
  });

  describe('getClubDetail', () => {
    it('returns null when viewer is not a member', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      expect(getClubDetail(STRANGER, club.id)).toBeNull();
    });

    it('returns null for nonexistent clubId', () => {
      expect(getClubDetail(OWNER, 'nonexistent-id')).toBeNull();
    });

    it('viewerRole reflects membership', () => {
      const club = createClub({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      expect(getClubDetail(OWNER, club.id)!.viewerRole).toBe('owner');
      expect(getClubDetail(FRIEND_A, club.id)!.viewerRole).toBe('member');
    });
  });

  describe('clearAllClubs', () => {
    it('wipes both clubs and club_members tables', () => {
      createClub({
        ownerId: OWNER,
        name: 'A',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND_A],
      });
      createClub({
        ownerId: STRANGER,
        name: 'B',
        description: '',
        avatarColor: '#FF4D2E',
        memberIds: [],
      });
      clearAllClubs();
      expect(listClubsForUser(OWNER)).toEqual([]);
      expect(listClubsForUser(STRANGER)).toEqual([]);
    });
  });
});
