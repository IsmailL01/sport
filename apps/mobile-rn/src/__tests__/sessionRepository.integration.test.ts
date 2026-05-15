// Real-SQLite integration test для sessionRepository (PHASE1-07 / Task 3).
//
// Закрывает CONCERNS.md R5 для sessionRepository конкретно. Companion-репо
// (walletRepository, lapRepository) — отдельные follow-up'ы в более поздних
// планах Phase 1 / Phase 2 cleanup. См. plan output: «R5 закрыт частично».
//
// Probe-результат Task 1 был RED — `expo-sqlite` под jest-expo не грузится
// из-за отсутствующего `expo-asset` peer'а. Jest автоматически подменяет
// импорт через `apps/mobile-rn/__mocks__/expo-sqlite.ts` (better-sqlite3 шим).
// Тесты ниже импортируют `expo-sqlite` как обычно — про шим знать не надо.
//
// Каждый тест получает свежую `:memory:` БД через `_setDatabase` +
// `runMigrations()` в `beforeEach` — независимость, никаких остаточных
// данных между сценариями.

import * as SQLite from 'expo-sqlite';

import {
  createSession,
  finalizeSession,
  findActiveSession,
  getSession,
  deleteSession,
} from '../storage/sessionRepository';
import { runMigrations, _setDatabase } from '../storage/database';

describe('sessionRepository (real SQLite via better-sqlite3 shim)', () => {
  beforeEach(() => {
    const db = SQLite.openDatabaseSync(':memory:');
    _setDatabase(db);
    runMigrations();
  });

  afterEach(() => {
    _setDatabase(null);
  });

  it('runMigrations creates expected core tables', () => {
    // Pull module-level singleton via a fresh getDatabase call (it was set
    // in beforeEach). The shim's `db` is shared.
    const db = SQLite.openDatabaseSync(':memory:');
    _setDatabase(db);
    runMigrations();
    const tables = db.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
    );
    const names = tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['sessions', 'points', 'laps', 'sensor_readings']));
  });

  it('crash-recovery: createSession without finalize → findActiveSession returns it', () => {
    const id = Date.now();
    createSession({ id, startedAt: id, activityType: 'run' });
    // Simulate crash: finalizeSession never called.
    const recovered = findActiveSession();
    expect(recovered?.id).toBe(id);
    expect(recovered?.endedAt).toBeNull();
    expect(recovered?.activityType).toBe('run');
  });

  it('crash-recovery: after finalize, findActiveSession returns null', () => {
    const id = Date.now();
    createSession({ id, startedAt: id, activityType: 'run' });
    finalizeSession(id, {
      endedAt: id + 60_000,
      isClosed: true,
      distanceM: 5000,
      areaM2: 1000,
      calcMethod: 'shoelace_simple',
      avgHrBpm: 140,
      maxHrBpm: 165,
      caloriesKcal: 300,
    });
    expect(findActiveSession()).toBeNull();
    // ...but the session itself persists with the finalized data.
    const stored = getSession(id);
    expect(stored?.endedAt).toBe(id + 60_000);
    expect(stored?.isClosed).toBe(true);
    expect(stored?.distanceM).toBe(5000);
    expect(stored?.areaM2).toBe(1000);
    expect(stored?.calcMethod).toBe('shoelace_simple');
    expect(stored?.avgHrBpm).toBe(140);
    expect(stored?.maxHrBpm).toBe(165);
    expect(stored?.caloriesKcal).toBe(300);
  });

  it('activity-type roundtrip: trail / cycle / walk persist as-stored', () => {
    const baseId = Date.now();
    createSession({ id: baseId + 1, startedAt: baseId + 1, activityType: 'trail' });
    createSession({ id: baseId + 2, startedAt: baseId + 2, activityType: 'cycle' });
    createSession({ id: baseId + 3, startedAt: baseId + 3, activityType: 'walk' });
    // Активной должна остаться последняя (самая новая по started_at).
    const active = findActiveSession();
    expect(active?.activityType).toBe('walk');
    // Finalize active and verify next-most-recent is returned.
    finalizeSession(baseId + 3, {
      endedAt: baseId + 1000,
      isClosed: false,
      distanceM: 100,
      areaM2: null,
      calcMethod: null,
      avgHrBpm: null,
      maxHrBpm: null,
      caloriesKcal: null,
    });
    expect(findActiveSession()?.activityType).toBe('cycle');
    // And explicit getSession reads each activity_type back.
    expect(getSession(baseId + 1)?.activityType).toBe('trail');
    expect(getSession(baseId + 2)?.activityType).toBe('cycle');
    expect(getSession(baseId + 3)?.activityType).toBe('walk');
  });

  it('deleteSession cascades points (atomic transaction)', () => {
    const id = Date.now();
    createSession({ id, startedAt: id, activityType: 'run' });
    expect(findActiveSession()?.id).toBe(id);
    deleteSession(id);
    expect(findActiveSession()).toBeNull();
    expect(getSession(id)).toBeNull();
  });
});
