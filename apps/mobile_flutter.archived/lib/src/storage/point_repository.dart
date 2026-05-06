import '../domain/types.dart';
import 'database.dart';

Future<void> appendPoints(int sessionId, List<RawPoint> points) async {
  if (points.isEmpty) return;
  final db = await openRunningDatabase();
  await db.transaction((txn) async {
    for (final point in points) {
      await txn.insert('points', {
        'session_id': sessionId,
        'ts': point.timestamp,
        'lat': point.latitude,
        'lon': point.longitude,
        'alt': point.altitude,
        'accuracy': point.accuracy,
        'speed': point.speed,
      });
    }
  });
}

Future<List<RawPoint>> loadPointsForSession(int sessionId) async {
  final db = await openRunningDatabase();
  final rows = await db.query(
    'points',
    columns: const ['ts', 'lat', 'lon', 'alt', 'accuracy', 'speed'],
    where: 'session_id = ?',
    whereArgs: [sessionId],
    orderBy: 'ts ASC',
  );
  return rows
      .map(
        (row) => RawPoint(
          timestamp: row['ts'] as int,
          latitude: row['lat'] as double,
          longitude: row['lon'] as double,
          altitude: row['alt'] as double?,
          accuracy: row['accuracy'] as double?,
          speed: row['speed'] as double?,
        ),
      )
      .toList();
}

Future<int?> getLastSessionId() async {
  final db = await openRunningDatabase();
  final rows = await db.rawQuery(
    'SELECT MAX(session_id) AS sid FROM points;',
  );
  if (rows.isEmpty) return null;
  return rows.first['sid'] as int?;
}

Future<void> deleteSession(int sessionId) async {
  final db = await openRunningDatabase();
  await db.delete(
    'points',
    where: 'session_id = ?',
    whereArgs: [sessionId],
  );
}
