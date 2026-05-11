// SQLite cache для social_relations (viewer→target).
// Phase 8 / M9.8.
//
// Используется ForeignProfileScreen и PeopleSearchScreen чтобы рендерить
// known relation state мгновенно из cache, а fresh данные подтягивать в
// фоне. TTL = 5 минут — relations меняются редко, дольше держать stale
// рискованно для UX (Подписан/Не подписан кнопка должна быть точной).

import { getDatabase } from './database';

export type CachedRelation = {
  viewerId: string;
  targetId: string;
  isFollowing: boolean;
  isFollower: boolean;
  isBlocked: boolean;
  isBlockedBy: boolean;
  canDm: boolean;
  cachedAt: number;
};

/** TTL для cached relation row, ms. */
export const RELATION_CACHE_TTL_MS = 5 * 60 * 1000;

type Row = {
  viewer_id: string;
  target_id: string;
  is_following: number;
  is_follower: number;
  is_blocked: number;
  is_blocked_by: number;
  can_dm: number;
  cached_at: number;
};

function rowToRel(r: Row): CachedRelation {
  return {
    viewerId: r.viewer_id,
    targetId: r.target_id,
    isFollowing: r.is_following === 1,
    isFollower: r.is_follower === 1,
    isBlocked: r.is_blocked === 1,
    isBlockedBy: r.is_blocked_by === 1,
    canDm: r.can_dm === 1,
    cachedAt: r.cached_at,
  };
}

/** SELECT cached relation. Возвращает null если row нет. */
export function getRelation(viewerId: string, targetId: string): CachedRelation | null {
  const db = getDatabase();
  const row = db.getFirstSync<Row>(
    `SELECT viewer_id, target_id, is_following, is_follower,
            is_blocked, is_blocked_by, can_dm, cached_at
     FROM social_relations WHERE viewer_id = ? AND target_id = ?`,
    [viewerId, targetId],
  );
  return row ? rowToRel(row) : null;
}

/** UPSERT cached relation. cachedAt задаётся автоматически = now. */
export function upsertRelation(
  viewerId: string,
  targetId: string,
  rel: {
    isFollowing: boolean;
    isFollower: boolean;
    isBlocked: boolean;
    isBlockedBy: boolean;
    canDm: boolean;
  },
): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO social_relations
       (viewer_id, target_id, is_following, is_follower, is_blocked, is_blocked_by, can_dm, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(viewer_id, target_id) DO UPDATE SET
       is_following = excluded.is_following,
       is_follower = excluded.is_follower,
       is_blocked = excluded.is_blocked,
       is_blocked_by = excluded.is_blocked_by,
       can_dm = excluded.can_dm,
       cached_at = excluded.cached_at`,
    [
      viewerId,
      targetId,
      rel.isFollowing ? 1 : 0,
      rel.isFollower ? 1 : 0,
      rel.isBlocked ? 1 : 0,
      rel.isBlockedBy ? 1 : 0,
      rel.canDm ? 1 : 0,
      Date.now(),
    ],
  );
}

/** Patch только isFollowing (для local optimistic follow toggle). */
export function patchIsFollowing(viewerId: string, targetId: string, isFollowing: boolean): void {
  const db = getDatabase();
  db.runSync(
    `UPDATE social_relations
     SET is_following = ?, cached_at = ?
     WHERE viewer_id = ? AND target_id = ?`,
    [isFollowing ? 1 : 0, Date.now(), viewerId, targetId],
  );
}

/** Удалить весь cache (logout). */
export function clearAllRelations(): void {
  const db = getDatabase();
  db.runSync(`DELETE FROM social_relations`);
}

/** Возвращает true если row актуальный (моложе TTL). */
export function isFresh(rel: CachedRelation, now: number = Date.now()): boolean {
  return now - rel.cachedAt < RELATION_CACHE_TTL_MS;
}
