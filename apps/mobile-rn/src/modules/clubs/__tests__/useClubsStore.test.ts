// Integration test для useClubsStore с реальной in-memory SQLite (better-sqlite3
// shim под jest-expo). Проверяет validation, optimistic updates, detail caching.

import * as SQLite from 'expo-sqlite';

import { runMigrations, _setDatabase } from '../../../storage/database';
import { useClubsStore } from '../state/useClubsStore';
import { ClubError } from '../domain/errors';

const OWNER = 'owner-uuid';
const FRIEND = 'friend-uuid';

function resetStore() {
  useClubsStore.setState({
    clubs: [],
    detailsById: {},
    loading: false,
    mutating: false,
    lastError: null,
  });
}

describe('useClubsStore', () => {
  beforeEach(() => {
    const db = SQLite.openDatabaseSync(':memory:');
    _setDatabase(db);
    runMigrations();
    resetStore();
  });

  afterEach(() => {
    _setDatabase(null);
  });

  describe('create', () => {
    it('persists club + refreshes list', async () => {
      const id = await useClubsStore.getState().create({
        ownerId: OWNER,
        name: 'New Club',
        description: 'desc',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      expect(id).toMatch(/[0-9a-f-]{36}/i);
      expect(useClubsStore.getState().clubs).toHaveLength(1);
      expect(useClubsStore.getState().clubs[0].name).toBe('New Club');
    });

    it('rejects short name (< 2 chars)', async () => {
      await expect(
        useClubsStore.getState().create({
          ownerId: OWNER,
          name: 'X',
          description: '',
          avatarColor: '#C6F560',
          memberIds: [],
        }),
      ).rejects.toThrow(ClubError);
      expect(useClubsStore.getState().lastError).toMatch(/Название/);
      expect(useClubsStore.getState().clubs).toHaveLength(0);
    });

    it('rejects description longer than 280 chars', async () => {
      await expect(
        useClubsStore.getState().create({
          ownerId: OWNER,
          name: 'Valid',
          description: 'x'.repeat(281),
          avatarColor: '#C6F560',
          memberIds: [],
        }),
      ).rejects.toThrow(ClubError);
      expect(useClubsStore.getState().clubs).toHaveLength(0);
    });
  });

  describe('selectClub', () => {
    it('caches detail in detailsById', async () => {
      const id = await useClubsStore.getState().create({
        ownerId: OWNER,
        name: 'Cached',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      const detail = await useClubsStore.getState().selectClub(OWNER, id);
      expect(detail).not.toBeNull();
      expect(detail!.name).toBe('Cached');
      expect(useClubsStore.getState().detailsById[id]).toEqual(detail);
    });

    it('returns null for non-member viewer', async () => {
      const id = await useClubsStore.getState().create({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      const detail = await useClubsStore.getState().selectClub('stranger', id);
      expect(detail).toBeNull();
    });
  });

  describe('update', () => {
    it('refreshes list + cached detail', async () => {
      const id = await useClubsStore.getState().create({
        ownerId: OWNER,
        name: 'Old',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      await useClubsStore.getState().selectClub(OWNER, id);
      await useClubsStore.getState().update(OWNER, {
        id,
        name: 'New',
        description: 'updated',
        avatarColor: '#FF4D2E',
      });
      expect(useClubsStore.getState().clubs[0].name).toBe('New');
      expect(useClubsStore.getState().detailsById[id]!.name).toBe('New');
      expect(useClubsStore.getState().detailsById[id]!.avatarColor).toBe('#FF4D2E');
    });
  });

  describe('remove', () => {
    it('deletes club + drops detail from cache + refreshes list', async () => {
      const id = await useClubsStore.getState().create({
        ownerId: OWNER,
        name: 'Doomed',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      await useClubsStore.getState().selectClub(OWNER, id);
      await useClubsStore.getState().remove(OWNER, id);
      expect(useClubsStore.getState().clubs).toEqual([]);
      expect(useClubsStore.getState().detailsById[id]).toBeUndefined();
    });
  });

  describe('addMember + removeMember', () => {
    it('owner can add then kick member', async () => {
      const id = await useClubsStore.getState().create({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      await useClubsStore.getState().addMember(OWNER, id, FRIEND);
      let detail = await useClubsStore.getState().selectClub(OWNER, id);
      expect(detail!.members.map((m) => m.userId)).toContain(FRIEND);

      await useClubsStore.getState().removeMember(OWNER, id, FRIEND);
      detail = await useClubsStore.getState().selectClub(OWNER, id);
      expect(detail!.members.map((m) => m.userId)).not.toContain(FRIEND);
    });

    it('member leaving via removeMember(self) drops detail from cache', async () => {
      const id = await useClubsStore.getState().create({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [FRIEND],
      });
      await useClubsStore.getState().selectClub(FRIEND, id);
      expect(useClubsStore.getState().detailsById[id]).not.toBeUndefined();
      await useClubsStore.getState().removeMember(FRIEND, id, FRIEND);
      expect(useClubsStore.getState().detailsById[id]).toBeUndefined();
    });
  });

  describe('pickDefaultAvatarColor', () => {
    it('cycles through palette deterministically', () => {
      const a = useClubsStore.getState().pickDefaultAvatarColor(0);
      const b = useClubsStore.getState().pickDefaultAvatarColor(1);
      const wrap = useClubsStore.getState().pickDefaultAvatarColor(6); // back to start
      expect(a).not.toBe(b);
      expect(wrap).toBe(a);
    });
  });

  describe('clearAll', () => {
    it('wipes store state + db tables', async () => {
      await useClubsStore.getState().create({
        ownerId: OWNER,
        name: 'Club',
        description: '',
        avatarColor: '#C6F560',
        memberIds: [],
      });
      useClubsStore.getState().clearAll();
      expect(useClubsStore.getState().clubs).toEqual([]);
      expect(useClubsStore.getState().detailsById).toEqual({});
      await useClubsStore.getState().refresh(OWNER);
      expect(useClubsStore.getState().clubs).toEqual([]);
    });
  });
});
