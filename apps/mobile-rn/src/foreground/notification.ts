// Фоновая нотификация для активной сессии записи трека (Phase 7 / Plan 07-03 Task 2).
//
// Динамическое обновление контента каждые ~5 секунд из useActivityStore.
// RU-формат тела: "Запись пробежки активна — %duration% • %distance%"
//
// Дизайн:
//   - Канал "recording" (Android), importance LOW (без звука, без вибрации).
//   - Один identifier "recording-status" → каждый presentRecordingNotification
//     заменяет предыдущую (sticky, autoDismiss: false).
//   - subscribeToRecordingTick() запускается из App.tsx onMount; внутри
//     слушает state.state ('recording' / 'stopped'/'idle') и держит interval
//     5000ms пока state === 'recording'. Считает duration из (now - startedAt)
//     и distance из totalDistance(points) (см. util/geo).
//   - iOS — no-op (foreground service notification — это Android-only паттерн;
//         iOS использует SLC + UIBackgroundModes; Plan 07-03 Amendment 3 deferred).
//
// Plan-vs-reality drift (зафиксирован 2026-05-24): plan-template assumed
// `useSessionStore` with `state.duration / state.distance`; реальный store
// — `useActivityStore` с `state`, `points`, `startedAt`. Duration/distance
// derive-аются здесь из points + startedAt + totalDistance().

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { totalDistance } from '../util/geo';
import { formatDistance, formatDuration } from '../ui/format';
import { useActivityStore } from '../state/activity';

const NOTIFICATION_ID = 'recording-status';
const CHANNEL_ID = 'recording';
const TICK_INTERVAL_MS = 5000;

let tickIntervalHandle: ReturnType<typeof setInterval> | null = null;

export async function setupForegroundChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Запись пробежки',
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    vibrationPattern: null,
    lightColor: '#0F1419',
    showBadge: false,
  });
}

export async function presentRecordingNotification(
  duration: string,
  distance: string,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: 'Running Ecosystem',
      body: `Запись пробежки активна — ${duration} • ${distance}`,
      categoryIdentifier: CHANNEL_ID,
      sticky: true,
      autoDismiss: false,
      color: '#0F1419',
    },
    trigger: null,
  });
}

export async function dismissRecordingNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
}

/** Derive (durationS, distanceM) from a snapshot of useActivityStore. */
function deriveMetrics(
  startedAt: number | null,
  points: Parameters<typeof totalDistance>[0],
): { durationS: number; distanceM: number } {
  const now = Date.now();
  const durationS =
    startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  const distanceM = totalDistance(points);
  return { durationS, distanceM };
}

async function refreshFromStore(): Promise<void> {
  const { state, startedAt, points } = useActivityStore.getState();
  if (state !== 'recording') return;
  const { durationS, distanceM } = deriveMetrics(startedAt, points);
  try {
    await presentRecordingNotification(
      formatDuration(durationS),
      formatDistance(distanceM),
    );
  } catch {
    // expo-notifications може фейлить если канал ещё не создан или permission
    // не выдан. Non-fatal — следующий tick попробует снова.
  }
}

function startTicking(): void {
  if (tickIntervalHandle !== null) return;
  // Immediate first present, then tick every 5s.
  void refreshFromStore();
  tickIntervalHandle = setInterval(() => {
    void refreshFromStore();
  }, TICK_INTERVAL_MS);
}

function stopTicking(): void {
  if (tickIntervalHandle !== null) {
    clearInterval(tickIntervalHandle);
    tickIntervalHandle = null;
  }
  void dismissRecordingNotification();
}

/**
 * Subscribe to useActivityStore.state transitions; manage notification lifecycle.
 * Idempotent — повторный вызов возвращает новый unsubscribe но не дублирует
 * интервалы (tickIntervalHandle — module-level singleton).
 *
 * Вызывается из App.tsx onMount. Cleanup — на unmount (опционально; app-process
 * обычно живёт пока live recording идёт).
 */
export function subscribeToRecordingTick(): () => void {
  void setupForegroundChannel();

  // Sync с текущим состоянием на момент подписки (cold start с активной
  // сессией после `recoverLast()`).
  const initial = useActivityStore.getState();
  if (initial.state === 'recording') {
    startTicking();
  }

  const unsubscribe = useActivityStore.subscribe((next, prev) => {
    if (next.state === prev.state) return;
    if (next.state === 'recording') {
      startTicking();
    } else {
      stopTicking();
    }
  });

  return () => {
    unsubscribe();
    stopTicking();
  };
}
