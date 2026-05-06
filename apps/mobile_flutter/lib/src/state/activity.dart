import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/types.dart';

class ActivityRecording {
  final ActivityState state;
  final List<RawPoint> points;
  final DateTime? startedAt;
  final DateTime? endedAt;

  const ActivityRecording({
    required this.state,
    required this.points,
    required this.startedAt,
    required this.endedAt,
  });

  const ActivityRecording.idle()
    : state = ActivityState.idle,
      points = const [],
      startedAt = null,
      endedAt = null;

  ActivityRecording copyWith({
    ActivityState? state,
    List<RawPoint>? points,
    DateTime? startedAt,
    DateTime? endedAt,
  }) => ActivityRecording(
    state: state ?? this.state,
    points: points ?? this.points,
    startedAt: startedAt ?? this.startedAt,
    endedAt: endedAt ?? this.endedAt,
  );
}

class ActivityNotifier extends Notifier<ActivityRecording> {
  @override
  ActivityRecording build() => const ActivityRecording.idle();

  void start() {
    state = ActivityRecording(
      state: ActivityState.recording,
      points: const [],
      startedAt: DateTime.now(),
      endedAt: null,
    );
  }

  void stop() {
    if (state.state != ActivityState.recording) return;
    state = state.copyWith(
      state: ActivityState.stopped,
      endedAt: DateTime.now(),
    );
  }

  void addPoint(RawPoint point) {
    if (state.state != ActivityState.recording) return;
    state = state.copyWith(points: [...state.points, point]);
  }

  void reset() {
    state = const ActivityRecording.idle();
  }
}

final activityProvider =
    NotifierProvider<ActivityNotifier, ActivityRecording>(
      ActivityNotifier.new,
    );
