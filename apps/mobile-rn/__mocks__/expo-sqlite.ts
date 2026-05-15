// Jest-only шим expo-sqlite поверх better-sqlite3.
// PHASE1-07 / Task 1 fallback path: probe-тест expo-sqlite под jest-expo вернул RED
// (см. RESEARCH.md §Pitfall 8 — `Cannot find module 'expo-asset'` из expo-sqlite/build/hooks.js).
// Этот шим повторяет sync-API expo-sqlite, который реально используют сторадж-модули
// проекта (см. apps/mobile-rn/src/storage/*.ts):
//   openDatabaseSync, execSync, runSync, getFirstSync, getAllSync,
//   prepareSync().executeSync()/finalizeSync(), withTransactionSync.
//
// НЕ пытается воспроизводить async API expo-sqlite (его в коде нет).
// НЕ грузится в продакшен-бандле — только под Jest (через src/__mocks__/ автоматически).

import Database from 'better-sqlite3';

type RunResult = { lastInsertRowid: number | bigint; changes: number };

/**
 * Нормализуем параметры expo-sqlite -> better-sqlite3.
 * expo-sqlite принимает: массив [pos1, pos2] ИЛИ объект { $name: value, ... }.
 * better-sqlite3 хочет: spread позиционных ИЛИ объект { name: value } (без $ префикса).
 */
function normalizeParams(params: unknown): unknown[] {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return [params];
  if (typeof params === 'object') {
    const stripped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      const cleanKey = key.startsWith('$') ? key.slice(1) : key;
      stripped[cleanKey] = value;
    }
    return [stripped];
  }
  return [params];
}

class PreparedStatementShim {
  constructor(private readonly stmt: Database.Statement) {}

  executeSync(params?: unknown): RunResult {
    return this.stmt.run(...normalizeParams(params)) as RunResult;
  }

  finalizeSync(): void {
    // better-sqlite3 не требует явного finalize — statement живёт пока есть ссылка.
    // No-op чтобы соответствовать API.
  }
}

class SQLiteDatabaseShim {
  constructor(private readonly db: Database.Database) {}

  execSync(sql: string): void {
    this.db.exec(sql);
  }

  runSync(sql: string, params?: unknown): RunResult {
    return this.db.prepare(sql).run(...normalizeParams(params)) as RunResult;
  }

  getFirstSync<T = unknown>(sql: string, params?: unknown): T | null {
    const row = this.db.prepare(sql).get(...normalizeParams(params));
    return (row ?? null) as T | null;
  }

  getAllSync<T = unknown>(sql: string, params?: unknown): T[] {
    return this.db.prepare(sql).all(...normalizeParams(params)) as T[];
  }

  prepareSync(sql: string): PreparedStatementShim {
    return new PreparedStatementShim(this.db.prepare(sql));
  }

  withTransactionSync<R = void>(fn: () => R): R {
    return this.db.transaction(fn)();
  }

  closeSync(): void {
    this.db.close();
  }
}

export type SQLiteDatabase = SQLiteDatabaseShim;

export function openDatabaseSync(name: string): SQLiteDatabaseShim {
  // ':memory:' уже валиден для better-sqlite3. Файловые имена под Jest
  // мы не используем — все тесты идут на in-memory.
  return new SQLiteDatabaseShim(new Database(name));
}

// Async API, которого код проекта НЕ использует — bag of no-ops чтобы не падать
// на случай, если кто-то импортирует тип/имя.
export async function openDatabaseAsync(name: string): Promise<SQLiteDatabaseShim> {
  return openDatabaseSync(name);
}
