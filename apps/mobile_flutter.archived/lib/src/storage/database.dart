// SQLite доступ. Singleton, открывается лениво, схема инициализируется один раз.
// Phase 0: только таблица points (минимум для P0-C-07 acceptance).
// Phase 1 (P1-A-07): добавится таблица sessions с метаданными.

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

const String _dbName = 'running_ecosystem.db';
const int _dbVersion = 1;

Database? _db;

Future<Database> openRunningDatabase() async {
  final existing = _db;
  if (existing != null) return existing;
  final dir = await getApplicationDocumentsDirectory();
  final path = p.join(dir.path, _dbName);
  final database = await openDatabase(
    path,
    version: _dbVersion,
    onCreate: (db, version) async {
      await db.execute('''
        CREATE TABLE points (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          ts INTEGER NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          alt REAL,
          accuracy REAL,
          speed REAL
        );
      ''');
      await db.execute(
        'CREATE INDEX idx_points_session_ts ON points (session_id, ts);',
      );
    },
  );
  _db = database;
  return database;
}
