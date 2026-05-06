import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/types.dart';
import '../storage/point_repository.dart';

const int _flushThreshold = 10;

class ActivityRecording {
  final ActivityState state;
  final List<RawPoint> points;
  final DateTime? startedAt;
  final DateTime? endedAt;
  final int? sessionId;
  final int bufferedCount;

  const ActivityRecording({
    required this.state,
    required this.points,
    required this.startedAt,
    required this.endedAt,
    required this.sessionId,
    required this.bufferedCount,
  });

  const ActivityRecording.idle()
    : state = ActivityState.idle,
      points = const [],
      startedAt = null,
      endedAt = null,
      sessionId = null,
      bufferedCount = 0;

  ActivityRecording copyWith({
    ActivityState? state,
    List<RawPoint>? points,
    DateTime? startedAt,
    DateTime? endedAt,
    int? sessionId,
    int? bufferedCount,
  }) => ActivityRecording(
    state: state ?? this.state,
    points: points ?? this.points,
    startedAt: startedAt ?? this.startedAt,
    endedAt: endedAt ?? this.endedAt,
    sessionId: sessionId ?? this.sessionId,
    bufferedCount: bufferedCount ?? this.bufferedCount,
  );
}

class ActivityNotifier extends Notifier<ActivityRecording> {
  // Buffer не в state — UI не должен ребилдиться на каждый push.
  final List<RawPoint> _buffer = [];

  @override
  ActivityRecording build() => const ActivityRecording.idle();

  void start() {
    final sessionId = DateTime.now().millisecondsSinceEpoch;
    _buffer.clear();
    state = ActivityRecording(
      state: ActivityState.recording,
      points: const [],
      startedAt: DateTime.fromMillisecondsSinceEpoch(sessionId),
      endedAt: null,
      sessionId: sessionId,
      bufferedCount: 0,
    );
  }

  Future<void> stop() async {
    if (state.state != ActivityState.recording) return;
    await _flush(force: true);
    state = state.copyWith(
      state: ActivityState.stopped,
      endedAt: DateTime.now(),
      bufferedCount: _buffer.length,
    );
  }

  void addPoint(RawPoint point) {
    if (state.state != ActivityState.recording) return;
    _buffer.add(point);
    state = state.copyWith(
      points: [...state.points, point],
      bufferedCount: _buffer.length,
    );
    if (_buffer.length >= _flushThreshold) {
      // Не блокируем UI — flush в фоне.
      // ignore: discarded_futures
      _flush(force: false);
    }
  }

  Future<void> _flush({required bool force}) async {
    final sid = state.sessionId;
    if (sid == null) return;
    if (!force && _buffer.length < _flushThreshold) return;
    if (_buffer.isEmpty) return;
    final batch = List<RawPoint>.from(_buffer);
    _buffer.clear();
    state = state.copyWith(bufferedCount: _buffer.length);
    try {
      await appendPoints(sid, batch);
    } catch (e, st) {
      debugPrint('[activity] flush failed: $e\n$st');
      // На всякий случай возвращаем в буфер чтобы попытаться снова при stop()
      _buffer.insertAll(0, batch);
      state = state.copyWith(bufferedCount: _buffer.length);
    }
  }

  Future<void> reset() async {
    final sid = state.sessionId;
    if (sid != null) {
      try {
        await deleteSession(sid);
      } catch (e) {
        debugPrint('[activity] deleteSession failed: $e');
      }
    }
    _buffer.clear();
    state = const ActivityRecording.idle();
  }

  /// Восстановить последнюю незавершённую сессию из БД (вызывается при старте app).
  Future<void> recoverLast() async {
    if (state.state != ActivityState.idle) return;
    int? sid;
    List<RawPoint> points = const [];
    try {
      sid = await getLastSessionId();
      if (sid != null) {
        points = await loadPointsForSession(sid);
      }
    } catch (e, st) {
      debugPrint('[activity] recover failed: $e\n$st');
      return;
    }
    if (sid == null || points.isEmpty) return;
    _buffer.clear();
    state = ActivityRecording(
      state: ActivityState.stopped,
      points: points,
      startedAt: DateTime.fromMillisecondsSinceEpoch(points.first.timestamp),
      endedAt: DateTime.fromMillisecondsSinceEpoch(points.last.timestamp),
      sessionId: sid,
      bufferedCount: 0,
    );
  }
}

final activityProvider =
    NotifierProvider<ActivityNotifier, ActivityRecording>(
      ActivityNotifier.new,
    );
