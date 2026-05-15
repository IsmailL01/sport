// PHASE1-07 / Task 1: 5-минутный spike, проверяющий работу expo-sqlite@16.0.10
// `openDatabaseSync(':memory:')` под jest-expo@~54.0.0.
// См. RESEARCH.md §Pitfall 8 и Assumptions Log A1.
//
// Outcome (записано во время Plan 01-01 execution): probe_outcome=red.
// Прямой импорт `expo-sqlite` под jest-expo падает с
//   `Cannot find module 'expo-asset' from 'node_modules/expo-sqlite/build/hooks.js'`
// (expo-sqlite@16.0.10 пытается тянуть AssetSource из expo-asset, который не входит
// в текущий devDeps этого проекта и тащить его смысла нет — он нужен только при
// загрузке файла-БД из бандла).
//
// Решение fallback-пути (Pitfall 8): установлен `better-sqlite3@12.10.0` как
// --save-exact devDep, написан шим в `apps/mobile-rn/__mocks__/expo-sqlite.ts`,
// который Jest подхватывает автоматически (manual mock у node_modules-модуля).
// Этот тест теперь должен идти через шим — проверяет, что шим корректно открывает
// `:memory:` и выполняет `execSync`/`getFirstSync` (минимальная поверхность, нужная
// для sessionRepository integration test'а — Task 3 этого плана).

import * as SQLite from 'expo-sqlite';

describe('expo-sqlite probe (under better-sqlite3 shim fallback)', () => {
  it('openDatabaseSync(":memory:") + execSync works under jest-expo', () => {
    const db = SQLite.openDatabaseSync(':memory:');
    db.execSync('SELECT 1');
    // Дополнительная проверка: getFirstSync + параметризованный runSync — это API,
    // от которых зависит sessionRepository integration test (Task 3).
    db.execSync(
      'CREATE TABLE __probe (id INTEGER PRIMARY KEY, label TEXT NOT NULL);',
    );
    db.runSync('INSERT INTO __probe (id, label) VALUES (?, ?);', [1, 'ok']);
    const row = db.getFirstSync<{ id: number; label: string }>(
      'SELECT id, label FROM __probe WHERE id = ?;',
      [1],
    );
    expect(row?.label).toBe('ok');
    // Outcome line per PLAN: appears in test run output to record probe result.
    // (Downstream plans 07 and 10 should read this verbatim.)
    console.log('[probe] expo-sqlite under jest-expo: red — fell back to better-sqlite3');
  });
});
