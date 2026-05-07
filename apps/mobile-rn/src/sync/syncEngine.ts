// Sync engine: outbox-pattern для исходящих сессий и точек.
// Phase 2 / P2-B-04.
//
// Алгоритм:
//   1. SELECT все sessions из локальной SQLite где synced_at IS NULL OR updated_after_sync.
//   2. Для каждой: POST /sessions (upsert по clientSessionId) → получаем server-id.
//      Сохраняем server_id + synced_at в локальной БД.
//   3. POST /sessions/{server_id}/points с batches по 1000 точек.
//   4. Готово.
//
// Pull (двусторонний sync) — отдельная задача P2-B-06, отложена.
// Conflict resolution — P2-B-07. Сейчас простая стратегия: upsert (server wins
// по метаданным; точки append-only).

import { apiClient } from '../auth/apiClient';
import type { Session } from '../domain/types';
import { getDatabase } from '../storage/database';
import { loadPointsForSession } from '../storage/pointRepository';

const POINT_BATCH_SIZE = 1000;

export type SyncProgress = {
  /** Сколько сессий ещё не загружено. */
  pendingSessions: number;
  /** Текущая сессия в работе (если есть). */
  currentSessionId: number | null;
  /** Всего сессий обработано в текущий запуск. */
  doneSessions: number;
  /** Всего точек загружено в текущий запуск. */
  doneSessions_pointsUploaded: number;
};

export type SyncResult = {
  ok: boolean;
  sessionsUploaded: number;
  pointsUploaded: number;
  error?: string;
};

/**
 * Запустить outbox-sync. Идемпотентно — если что-то уже было загружено,
 * сервер вернёт upsert для тех же session/clientSessionId.
 */
export async function runOutboxSync(opts?: {
  onProgress?: (p: SyncProgress) => void;
}): Promise<SyncResult> {
  if (!apiClient.isAuthenticated()) {
    return { ok: false, sessionsUploaded: 0, pointsUploaded: 0, error: 'unauthenticated' };
  }

  const pending = listPendingSessions();
  let sessionsUploaded = 0;
  let pointsUploaded = 0;

  for (let i = 0; i < pending.length; i += 1) {
    const session = pending[i];
    opts?.onProgress?.({
      pendingSessions: pending.length - i,
      currentSessionId: session.id,
      doneSessions: sessionsUploaded,
      doneSessions_pointsUploaded: pointsUploaded,
    });

    try {
      const serverID = await uploadSession(session);
      const points = loadPointsForSession(session.id);
      let uploadedThis = 0;
      for (let off = 0; off < points.length; off += POINT_BATCH_SIZE) {
        const batch = points.slice(off, off + POINT_BATCH_SIZE);
        const inserted = await uploadPointsBatch(serverID, batch);
        uploadedThis += inserted;
      }
      markSessionSynced(session.id, serverID);
      sessionsUploaded += 1;
      pointsUploaded += uploadedThis;
    } catch (e) {
      console.warn('[sync] session upload failed', session.id, e);
      // Не прерываем sync целиком — продолжаем остальные.
    }
  }

  opts?.onProgress?.({
    pendingSessions: 0,
    currentSessionId: null,
    doneSessions: sessionsUploaded,
    doneSessions_pointsUploaded: pointsUploaded,
  });

  return { ok: true, sessionsUploaded, pointsUploaded };
}

export type PullDownResult = {
  ok: boolean;
  sessionsDownloaded: number;
  pointsDownloaded: number;
  error?: string;
};

/**
 * Pull-down: загрузить с сервера сессии которых нет локально.
 * Сценарий: новое устройство после login → видим всю историю.
 *
 * Принцип: server-as-source для отсутствующих локально сессий
 * (по client_session_id). Локально существующие — НЕ трогаем
 * (защита от затирания несинхронизированных правок).
 */
export async function runPullDown(opts?: {
  /** Лимит сессий за один pull (для пагинации в будущем). Default: 200. */
  limit?: number;
  onProgress?: (downloaded: number, total: number) => void;
}): Promise<PullDownResult> {
  if (!apiClient.isAuthenticated()) {
    return { ok: false, sessionsDownloaded: 0, pointsDownloaded: 0, error: 'unauthenticated' };
  }
  const limit = opts?.limit ?? 200;
  let sessionsDownloaded = 0;
  let pointsDownloaded = 0;

  try {
    const resp = await apiClient.sync(`/sessions?limit=${limit}`);
    if (!resp.ok) {
      return {
        ok: false,
        sessionsDownloaded: 0,
        pointsDownloaded: 0,
        error: `list sessions: HTTP ${resp.status}`,
      };
    }
    const remoteSessions = (await resp.json()) as RemoteSessionDTO[];
    const localClientIds = listLocalClientSessionIds();
    const missing = remoteSessions.filter((s) => !localClientIds.has(s.clientSessionId));

    for (let i = 0; i < missing.length; i++) {
      const s = missing[i];
      opts?.onProgress?.(i, missing.length);
      try {
        insertSessionFromRemote(s);
        const points = await fetchPointsForSession(s.id);
        if (points.length > 0) {
          insertPointsForSession(s.clientSessionId, points);
          pointsDownloaded += points.length;
        }
        sessionsDownloaded += 1;
      } catch (e) {
        console.warn('[sync] pull session failed', s.clientSessionId, e);
      }
    }
    opts?.onProgress?.(missing.length, missing.length);
    return { ok: true, sessionsDownloaded, pointsDownloaded };
  } catch (e) {
    return {
      ok: false,
      sessionsDownloaded,
      pointsDownloaded,
      error: (e as Error)?.message ?? String(e),
    };
  }
}

type RemoteSessionDTO = {
  id: string;
  clientSessionId: number;
  startedAt: string;
  endedAt?: string | null;
  isClosed?: boolean | null;
  distanceM?: number | null;
  areaM2?: number | null;
  calcMethod?: string | null;
  note?: string | null;
  avgHrBpm?: number | null;
  maxHrBpm?: number | null;
  source?: string;
};

type RemotePointDTO = {
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  speed?: number | null;
  source?: string;
};

function listLocalClientSessionIds(): Set<number> {
  const db = getDatabase();
  const rows = db.getAllSync<{ id: number }>(`SELECT id FROM sessions`);
  return new Set(rows.map((r) => r.id));
}

function insertSessionFromRemote(s: RemoteSessionDTO): void {
  const db = getDatabase();
  const startedAtMs = new Date(s.startedAt).getTime();
  const endedAtMs = s.endedAt ? new Date(s.endedAt).getTime() : null;
  // synced_at = now() — данные пришли с сервера, считаем sync актуальным.
  db.runSync(
    `INSERT OR IGNORE INTO sessions
     (id, started_at, ended_at, is_closed, distance_m, area_m2, calc_method,
      note, avg_hr_bpm, max_hr_bpm, server_id, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.clientSessionId,
      startedAtMs,
      endedAtMs,
      s.isClosed === null || s.isClosed === undefined ? null : s.isClosed ? 1 : 0,
      s.distanceM ?? null,
      s.areaM2 ?? null,
      s.calcMethod ?? null,
      s.note ?? null,
      s.avgHrBpm ?? null,
      s.maxHrBpm ?? null,
      s.id,
      Date.now(),
    ],
  );
}

async function fetchPointsForSession(serverSessionID: string): Promise<RemotePointDTO[]> {
  const resp = await apiClient.sync(`/sessions/${serverSessionID}/points`);
  if (!resp.ok) {
    throw new Error(`fetch points: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as RemotePointDTO[];
  return data;
}

function insertPointsForSession(localSessionId: number, points: RemotePointDTO[]): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    const stmt = db.prepareSync(
      `INSERT OR IGNORE INTO points (session_id, ts, lat, lon, alt, accuracy, speed, source)
       VALUES ($sid, $ts, $lat, $lon, $alt, $accuracy, $speed, $source);`,
    );
    try {
      for (const p of points) {
        stmt.executeSync({
          $sid: localSessionId,
          $ts: new Date(p.timestamp).getTime(),
          $lat: p.latitude,
          $lon: p.longitude,
          $alt: p.altitude ?? null,
          $accuracy: p.accuracy ?? null,
          $speed: p.speed ?? null,
          $source: p.source ?? 'raw',
        });
      }
    } finally {
      stmt.finalizeSync();
    }
  });
}

async function uploadSession(s: Session): Promise<string> {
  const body = {
    clientSessionId: s.id,
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
    isClosed: s.isClosed,
    distanceM: s.distanceM,
    areaM2: s.areaM2,
    calcMethod: s.calcMethod,
    note: s.note,
    avgHrBpm: s.avgHrBpm,
    maxHrBpm: s.maxHrBpm,
    source: 'phone',
  };
  const resp = await apiClient.sync('/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`upload session ${s.id}: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { id: string };
  if (!data.id) throw new Error('server did not return session id');
  return data.id;
}

async function uploadPointsBatch(
  serverSessionID: string,
  batch: { timestamp: number; latitude: number; longitude: number; altitude: number | null; accuracy: number | null; speed: number | null; source: string }[],
): Promise<number> {
  const body = {
    points: batch.map((p) => ({
      timestamp: new Date(p.timestamp).toISOString(),
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.altitude,
      accuracy: p.accuracy,
      speed: p.speed,
      source: p.source,
    })),
  };
  const resp = await apiClient.sync(`/sessions/${serverSessionID}/points`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`upload points: HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { inserted: number };
  return data.inserted ?? 0;
}

// === SQLite helpers (читаем/пишем sync-метаданные локально) ===
//
// Используем колонку sessions.synced_at (TIMESTAMP) — null значит не загружено.
// server_id (TEXT) — UUID на сервере, проставляется после первого upload.
// Колонки добавятся в SQLite миграции v4 (см. database.ts).

type LocalSessionRow = {
  id: number;
  startedAt: number;
  endedAt: number | null;
  isClosed: number | null;
  distanceM: number | null;
  areaM2: number | null;
  calcMethod: string | null;
  note: string | null;
  syncedAt: number | null;
  serverId: string | null;
  updatedAt: number | null;
  avgHrBpm: number | null;
  maxHrBpm: number | null;
};

function listPendingSessions(): Session[] {
  const db = getDatabase();
  const rows = db.getAllSync<LocalSessionRow>(
    `SELECT id, started_at AS startedAt, ended_at AS endedAt, is_closed AS isClosed,
            distance_m AS distanceM, area_m2 AS areaM2, calc_method AS calcMethod,
            note, synced_at AS syncedAt, server_id AS serverId,
            COALESCE(updated_at, started_at) AS updatedAt,
            avg_hr_bpm AS avgHrBpm, max_hr_bpm AS maxHrBpm
     FROM sessions
     WHERE synced_at IS NULL OR (updated_at IS NOT NULL AND updated_at > synced_at)
     ORDER BY started_at ASC`,
  );
  return rows.map(rowToSession);
}

function markSessionSynced(sessionId: number, serverID: string): void {
  const db = getDatabase();
  const now = Date.now();
  db.runSync(
    `UPDATE sessions SET synced_at = ?, server_id = ? WHERE id = ?;`,
    [now, serverID, sessionId],
  );
}

function rowToSession(row: LocalSessionRow): Session {
  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    isClosed: row.isClosed === null ? null : row.isClosed === 1,
    distanceM: row.distanceM,
    areaM2: row.areaM2,
    calcMethod: (row.calcMethod ?? null) as Session['calcMethod'],
    note: row.note,
    avgHrBpm: row.avgHrBpm,
    maxHrBpm: row.maxHrBpm,
  };
}
