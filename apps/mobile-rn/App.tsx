import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { serializeToGpx } from './src/domain/gpx';
import {
  CorridorLayer,
  LocationPuckLayer,
  MapboxView,
  TrackLayer,
  ZoneLayer,
  downloadHomeRegion,
  setMapboxAccessToken,
} from './src/map';
import { locationAdapter } from './src/location';
import { useActivityStore } from './src/state/activity';
import { useAuthStore } from './src/state/auth';
import { useHistoryStore } from './src/state/history';
import { useSettingsStore } from './src/state/settings';
import { useSyncStore } from './src/state/sync';
import { currentSpeed } from './src/domain/metrics';
import { HistoryTerritoryLayer } from './src/map';
import { AuthScreen } from './src/ui/AuthScreen';
import { HistoryModal } from './src/ui/HistoryModal';
import { MetricsBar } from './src/ui/MetricsBar';
import { ProfileModal } from './src/ui/ProfileModal';
import { SensorsModal } from './src/ui/SensorsModal';
import { StatsModal } from './src/ui/StatsModal';
import { WORKOUT_LIBRARY } from './src/domain/training/workout';
import { TodayCard } from './src/ui/TodayCard';
import { TrainingModal } from './src/ui/TrainingModal';
import { WorkoutPlayer } from './src/ui/WorkoutPlayer';
import {
  attachWorkoutPlayerToActivity,
  useWorkoutPlayerStore,
} from './src/state/workoutPlayer';
import { useSensorsStore } from './src/state/sensors';
import { writeSessionToHealth } from './src/health/sync';
import { setSpeechAdapter } from './src/util/speech';
import { expoSpeechAdapter } from './src/util/expoSpeechAdapter';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { apiClient } from './src/auth/apiClient';
import { ChatsModal } from './src/ui/social/ChatsModal';
import { FeedModal, useFeedStore } from './src/modules/feed';
import { AdminModal, useModerationStore } from './src/modules/moderation';
import { useRealtimeStore } from './src/state/social/useRealtimeStore';
import { useNotificationsStore } from './src/state/social/useNotificationsStore';

// Регистрируем real TTS адаптер на старте — single-shot side effect.
setSpeechAdapter(expoSpeechAdapter);
import { totalDistance } from './src/util/geo';

const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

const initError: string | null = MAPBOX_ACCESS_TOKEN
  ? setMapboxAccessToken(MAPBOX_ACCESS_TOKEN)
  : null;

type PermissionStatus = 'pending' | 'granted' | 'denied';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[App ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          title="Приложение упало"
          message={`${this.state.error.name}: ${this.state.error.message}\n\nСкриншот сюда — починим.`}
        />
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Inner />
    </ErrorBoundary>
  );
}

function Inner() {
  const authState = useAuthStore((s) => s.state);
  const hydrate = useAuthStore((s) => s.hydrate);

  // На старте — попытаться авто-логин по сохранённым токенам.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>('pending');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setPermissionStatus(status === 'granted' ? 'granted' : 'denied');
      } catch (e) {
        setPermissionError((e as Error)?.message ?? String(e));
        setPermissionStatus('denied');
      }
    })();
    // После успешной аутентификации — pull сессий с сервера. Если новое
    // устройство, увидим всю историю; на старом — операция почти бесплатная
    // (нечего скачивать).
    useSyncStore.getState().pullDown().catch((e) => {
      console.warn('[App] pullDown after auth failed', e);
    });

    // Phase 8 / A5: Connect WebSocket для real-time чатов + register push token.
    const user = useAuthStore.getState().user;
    if (user !== null) {
      const accessToken = apiClient.getAccessToken();
      if (accessToken !== null) {
        let deviceID = useSettingsStore.getState().deviceId;
        if (deviceID === null) {
          deviceID = uuid();
          useSettingsStore.getState().setDeviceId(deviceID);
        }
        useRealtimeStore.getState().connect(user.id, accessToken, deviceID).catch((e) => {
          console.warn('[App] realtime connect failed', e);
        });
        // Push token registration (best effort, требует permission).
        useNotificationsStore.getState().requestAndRegister().catch((e) => {
          console.warn('[App] push register failed', e);
        });
      }
    }
  }, [authState]);

  // Phase 8 / A5: Disconnect realtime при logout.
  useEffect(() => {
    if (authState === 'unauthenticated') {
      useRealtimeStore.getState().disconnect();
    }
  }, [authState]);

  // Cleanup на unmount: гарантируем что подписка location снимается
  useEffect(() => {
    return () => {
      locationAdapter.stop();
    };
  }, []);

  // На старте приложения — попробовать восстановить последнюю сессию из SQLite,
  // и если что-то восстановилось — показать диалог с выбором (Phase 1 / P1-J).
  const recoverLast = useActivityStore((s) => s.recoverLast);
  useEffect(() => {
    recoverLast();
    // setTimeout: даём React-у dispatch и re-render до alert.
    const id = setTimeout(() => {
      const s = useActivityStore.getState();
      if (s.state === 'stopped' && s.points.length > 0) {
        Alert.alert(
          'Найдена прошлая запись',
          `${s.points.length} точек. Что сделать?`,
          [
            {
              text: 'Удалить',
              style: 'destructive',
              onPress: () => useActivityStore.getState().reset(),
            },
            { text: 'Оставить', style: 'cancel' },
          ],
        );
      }
    }, 300);
    return () => clearTimeout(id);
  }, [recoverLast]);

  const tokenPreview = MAPBOX_ACCESS_TOKEN
    ? `${MAPBOX_ACCESS_TOKEN.slice(0, 12)}…${MAPBOX_ACCESS_TOKEN.slice(-6)} (length=${MAPBOX_ACCESS_TOKEN.length})`
    : '<empty>';

  if (initError) {
    return <ErrorScreen title="Mapbox init упал" message={`${initError}\n\nToken: ${tokenPreview}`} />;
  }
  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <ErrorScreen
        title="Конфигурация неполна"
        message={`EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN не задан в bundle. token=${tokenPreview}`}
      />
    );
  }
  // Auth gate — пока auth state не resolved, показываем сплеш / AuthScreen.
  if (authState === 'idle' || authState === 'hydrating') {
    return (
      <View style={styles.center}>
        <Text style={styles.statText}>Загружаем сессию…</Text>
        <StatusBar style="light" />
      </View>
    );
  }
  if (authState === 'unauthenticated' || authState === 'authenticating') {
    return <AuthScreen />;
  }
  if (permissionStatus === 'pending') {
    return (
      <View style={styles.center}>
        <Text style={styles.statText}>Запрашиваем разрешение на геолокацию…</Text>
        <StatusBar style="light" />
      </View>
    );
  }
  if (permissionStatus === 'denied') {
    return (
      <ErrorScreen
        title="Нет доступа к геолокации"
        message={
          permissionError ?? 'Откройте настройки приложения и разрешите доступ к местоположению.'
        }
      />
    );
  }

  return (
    <>
      <HomeRegionAutoDownload permissionGranted={permissionStatus === 'granted'} />
      <MapScreen />
    </>
  );
}

/**
 * После того как permission на геолокацию дано, проверяем — есть ли уже
 * homeLocation в settings. Если нет — берём текущую позицию, запоминаем и
 * запускаем фоновую загрузку tile-пака 10×10км вокруг (P1-K-03).
 */
function HomeRegionAutoDownload({
  permissionGranted,
}: {
  permissionGranted: boolean;
}) {
  const homeLocation = useSettingsStore((s) => s.homeLocation);
  const setHomeLocation = useSettingsStore((s) => s.setHomeLocation);

  useEffect(() => {
    if (!permissionGranted) return;
    if (homeLocation !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const loc = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setHomeLocation(loc);
        // Не блокируем UI — fire-and-forget.
        downloadHomeRegion({
          ...loc,
          onProgress: (pct) => {
            if (__DEV__) console.log(`[offline] home region: ${pct.toFixed(0)}%`);
          },
        }).catch((e) => {
          console.warn('[offline] downloadHomeRegion failed', e);
        });
      } catch (e) {
        if (__DEV__) console.warn('[App] getCurrentPositionAsync failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permissionGranted, homeLocation, setHomeLocation]);
  return null;
}

function MapScreen() {
  const state = useActivityStore((s) => s.state);
  const points = useActivityStore((s) => s.points);
  const startedAt = useActivityStore((s) => s.startedAt);
  const droppedCount = useActivityStore((s) => s.droppedCount);
  const rawCount = useActivityStore((s) => s.rawCount);
  const lastDropFilter = useActivityStore((s) => s.lastDropFilter);
  const lastRawAccuracy = useActivityStore((s) => s.lastRawAccuracy);
  const isPaused = useActivityStore((s) => s.isPaused);
  const closureFired = useActivityStore((s) => s.closureFired);
  const areaM2 = useActivityStore((s) => s.areaM2);
  const areaWarnings = useActivityStore((s) => s.areaWarnings);
  const start = useActivityStore((s) => s.start);
  const stop = useActivityStore((s) => s.stop);
  const reset = useActivityStore((s) => s.reset);
  const closedSessionsPoints = useHistoryStore((s) => s.closedSessionsPoints);
  const refreshHistory = useHistoryStore((s) => s.refresh);
  const loadAllPoints = useHistoryStore((s) => s.loadAllPoints);
  const syncStatus = useSyncStore((s) => s.status);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const triggerSync = useSyncStore((s) => s.trigger);
  const logout = useAuthStore((s) => s.logout);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [sensorsVisible, setSensorsVisible] = useState(false);
  const [trainingVisible, setTrainingVisible] = useState(false);
  const [workoutPlayerVisible, setWorkoutPlayerVisible] = useState(false);
  const [chatsVisible, setChatsVisible] = useState(false);
  const [feedVisible, setFeedVisible] = useState(false);
  const [adminVisible, setAdminVisible] = useState(false);
  const isAdmin = useModerationStore((s) => s.isAdmin);
  const fetchMyRole = useModerationStore((s) => s.fetchMyRole);
  const myUser = useAuthStore((s) => s.user);
  const realtimeStatus = useRealtimeStore((s) => s.status);
  const activeWorkout = useWorkoutPlayerStore((s) => s.workout);
  // Подцепить worker, который слушает activityStore и тикает workout session.
  useEffect(() => {
    if (activeWorkout === null) return;
    const unsub = attachWorkoutPlayerToActivity();
    return () => unsub();
  }, [activeWorkout]);
  const liveHrBpm = useSensorsStore((s) => s.liveHrBpm);
  const sensorStatus = useSensorsStore((s) => s.status);
  const hydrateSensors = useSensorsStore((s) => s.hydrate);
  useEffect(() => {
    hydrateSensors();
  }, [hydrateSensors]);

  // Phase E: подгрузить свою global_role при auth для admin-gating UI.
  useEffect(() => {
    if (myUser !== null) {
      void fetchMyRole(myUser.id);
    }
  }, [myUser, fetchMyRole]);

  // На старте экрана — загрузить список + точки всех закрытых сессий
  // (для отрисовки all-time territory layer на карте).
  useEffect(() => {
    refreshHistory();
    loadAllPoints();
  }, [refreshHistory, loadAllPoints]);

  const handleStart = async () => {
    start();
    // Best effort — продолжаем даже если background permission не дали (foreground only).
    await locationAdapter.requestBackgroundPermission().catch((e) => {
      console.warn('[App] background permission request failed', e);
      return false;
    });
    try {
      await locationAdapter.start();
    } catch (e) {
      console.error('[App] locationAdapter.start failed', e);
      stop();
    }
    // Battery-optimization hint для Android — один раз при первом старте.
    if (Platform.OS === 'android') {
      const settingsState = useSettingsStore.getState();
      if (!settingsState.batteryHintShown) {
        settingsState.markBatteryHintShown();
        Alert.alert(
          'Запись в фоне',
          'Если на твоём Android (особенно Xiaomi/Huawei/Oppo) запись прерывается '
            + 'после нескольких минут в фоне — открой Настройки → Apps → Running Ecosystem '
            + '→ Battery → Unrestricted (или "No restrictions"). Это нужно сделать один раз.',
          [{ text: 'Понятно' }],
        );
      }
    }
  };

  // Phase D: предложить поделиться завершённой пробежкой в ленте.
  // Дёргается после Save → trigger в handleStop.
  const maybeOfferAutoShare = (
    sessionId: number, startedAt: number, endedAt: number, distanceM: number,
  ) => {
    if (myUser === null) return;
    const km = distanceM / 1000;
    const minutes = Math.round((endedAt - startedAt) / 60000);
    const caption = `🏃 Пробежка: ${km.toFixed(2)} км · ${minutes} мин`;
    Alert.alert(
      'Поделиться в ленте?',
      caption,
      [
        { text: 'Не делиться', style: 'cancel' },
        {
          text: 'Опубликовать',
          isPreferred: true,
          onPress: () => {
            useFeedStore.getState()
              .composeSession(myUser.id, String(sessionId), caption)
              .catch((e) => console.warn('[App] composeSession failed', e));
          },
        },
      ],
    );
  };

  const handleStop = async () => {
    Alert.alert(
      'Завершить запись?',
      'Сохранить пробежку или удалить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await locationAdapter.stop();
            stop();
            // Сразу удаляем — finalize прошёл, теперь reset чистит.
            reset();
          },
        },
        {
          text: 'Сохранить',
          isPreferred: true,
          onPress: async () => {
            await locationAdapter.stop();
            stop();
            // После stop состояние finalize'ится — берём id и метрики из store.
            const s = useActivityStore.getState();
            // Авто-sync новой сессии после Save (fire-and-forget).
            triggerSync().catch((e) => console.warn('[App] sync after stop failed', e));
            // Авто-write в Apple Health / Health Connect (через MockHealthAdapter
            // если real platform-adapter не подключён; всё равно безопасно).
            if (s.sessionId !== null && s.startedAt !== null && s.endedAt !== null) {
              // Pull persisted avgHr (агрегированный на finalize в activity.stop).
              const sess = useHistoryStore.getState().sessions.find((x) => x.id === s.sessionId);
              writeSessionToHealth({
                id: s.sessionId,
                startedAt: s.startedAt,
                endedAt: s.endedAt,
                distanceM: totalDistance(s.points),
                avgHrBpm: sess?.avgHrBpm ?? null,
                calories: sess?.caloriesKcal ?? null,
              }).catch((e) => console.warn('[App] writeSessionToHealth failed', e));

              // Phase D: предложить поделиться пробежкой в ленте.
              maybeOfferAutoShare(s.sessionId, s.startedAt, s.endedAt, totalDistance(s.points));
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => {
          logout().catch((e) => console.warn('[App] logout failed', e));
        },
      },
    ]);
  };

  const syncBadge = (() => {
    if (syncStatus === 'syncing') return '⏳ синхронизация…';
    if (syncStatus === 'error') return '⚠ sync error';
    if (lastSyncAt === null) return '⤴ ещё не синхронизировано';
    const dt = Date.now() - lastSyncAt;
    if (dt < 60_000) return '✓ только что';
    if (dt < 3_600_000) return `✓ ${Math.floor(dt / 60_000)} мин назад`;
    return `✓ ${Math.floor(dt / 3_600_000)} ч назад`;
  })();

  const handleReset = async () => {
    await locationAdapter.stop();
    reset();
  };

  const handleExportGpx = async () => {
    if (points.length === 0) {
      Alert.alert('Нет данных', 'Сначала запишите пробежку.');
      return;
    }
    if (startedAt === null) {
      Alert.alert('Нет данных', 'Trackedanных недостаточно для экспорта.');
      return;
    }
    try {
      const gpx = serializeToGpx(
        { startedAt, endedAt: useActivityStore.getState().endedAt },
        points,
      );
      await Share.share({
        message: gpx,
        title: `Running Ecosystem — пробежка ${new Date(startedAt).toLocaleString('ru-RU')}`,
      });
    } catch (e) {
      console.error('[App] GPX export failed', e);
      Alert.alert('Не получилось экспортировать', String(e));
    }
  };

  const lastPoint = points[points.length - 1];
  const distance = useMemo(() => totalDistance(points), [points]);
  const speedMs = useMemo(() => currentSpeed(points), [points]);

  return (
    <View style={styles.container}>
      <MapboxView followUserLocation followZoomLevel={16}>
        <LocationPuckLayer />
        {/* All-time territory из закрытых сессий (P1-L-02). Внизу стека — поверх
            идут активный трек и зона текущей сессии. */}
        <HistoryTerritoryLayer closedSessionsPoints={closedSessionsPoints} />
        {/* Коридор для незамкнутых треков (ТЗ §6.6 Подход B). */}
        {!closureFired && state !== 'idle' && <CorridorLayer points={points} />}
        <TrackLayer points={points} />
        {closureFired && <ZoneLayer points={points} />}
      </MapboxView>

      <View style={styles.topRightCol}>
        <TodayCard
          onStartWorkout={(workoutId) => {
            const w = WORKOUT_LIBRARY.find((x) => x.id === workoutId);
            if (!w) return;
            useWorkoutPlayerStore.getState().start(w);
            setWorkoutPlayerVisible(true);
          }}
        />
        <Pressable style={styles.historyBtn} onPress={() => setStatsVisible(true)}>
          <Text style={styles.historyBtnText}>📊 Статистика</Text>
        </Pressable>
        <Pressable style={styles.historyBtn} onPress={() => setTrainingVisible(true)}>
          <Text style={styles.historyBtnText}>🏋 Тренировки</Text>
        </Pressable>
        <Pressable style={styles.historyBtn} onPress={() => setChatsVisible(true)}>
          <Text style={styles.historyBtnText}>
            💬 Чаты {realtimeStatus === 'connected' ? '●' : realtimeStatus === 'connecting' || realtimeStatus === 'reconnecting' ? '○' : ''}
          </Text>
        </Pressable>
        <Pressable style={styles.historyBtn} onPress={() => setFeedVisible(true)}>
          <Text style={styles.historyBtnText}>📰 Лента</Text>
        </Pressable>
        {isAdmin && (
          <Pressable style={styles.historyBtn} onPress={() => setAdminVisible(true)}>
            <Text style={styles.historyBtnText}>🛡 Модерация</Text>
          </Pressable>
        )}
        {activeWorkout !== null && (
          <Pressable
            style={[styles.historyBtn, styles.historyBtnAccent]}
            onPress={() => setWorkoutPlayerVisible(true)}
          >
            <Text style={styles.historyBtnText}>▶ {activeWorkout.name}</Text>
          </Pressable>
        )}
        <Pressable style={styles.historyBtn} onPress={() => setHistoryVisible(true)}>
          <Text style={styles.historyBtnText}>История</Text>
        </Pressable>
        <Pressable style={styles.historyBtn} onPress={() => setProfileVisible(true)}>
          <Text style={styles.historyBtnText}>Профиль</Text>
        </Pressable>
        <Pressable style={styles.historyBtn} onPress={() => setSensorsVisible(true)}>
          <Text style={styles.historyBtnText}>
            {sensorStatus === 'connected' ? `♥ ${liveHrBpm ?? '…'}` : '♥ HR'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.historyBtn}
          onPress={() => triggerSync().catch(() => {})}
          disabled={syncStatus === 'syncing'}
        >
          <Text style={styles.historyBtnText}>{syncBadge}</Text>
        </Pressable>
        <Pressable style={styles.historyBtn} onPress={handleLogout}>
          <Text style={styles.historyBtnText}>Выйти</Text>
        </Pressable>
      </View>

      <HistoryModal visible={historyVisible} onClose={() => setHistoryVisible(false)} />
      <StatsModal visible={statsVisible} onClose={() => setStatsVisible(false)} />
      <ProfileModal visible={profileVisible} onClose={() => setProfileVisible(false)} />
      <SensorsModal visible={sensorsVisible} onClose={() => setSensorsVisible(false)} />
      <TrainingModal
        visible={trainingVisible}
        onClose={() => setTrainingVisible(false)}
        onStartWorkout={() => setWorkoutPlayerVisible(true)}
      />
      <WorkoutPlayer
        visible={workoutPlayerVisible}
        onClose={() => setWorkoutPlayerVisible(false)}
      />
      {myUser !== null && (
        <ChatsModal
          visible={chatsVisible}
          myUserId={myUser.id}
          onClose={() => setChatsVisible(false)}
        />
      )}
      {myUser !== null && (
        <FeedModal
          visible={feedVisible}
          myUserId={myUser.id}
          onClose={() => setFeedVisible(false)}
        />
      )}
      {isAdmin && (
        <AdminModal
          visible={adminVisible}
          onClose={() => setAdminVisible(false)}
        />
      )}

      <View style={styles.topOverlay} pointerEvents="none">
        <MetricsBar
          state={state}
          isPaused={isPaused}
          startedAt={startedAt}
          distanceM={distance}
          currentSpeedMs={speedMs}
          pointCount={points.length}
          lastAccuracyM={lastPoint?.accuracy ?? null}
          lastRawAccuracyM={lastRawAccuracy}
          rawCount={rawCount}
          droppedCount={droppedCount}
          lastDropFilter={lastDropFilter}
          areaM2={closureFired ? areaM2 : null}
          warnings={areaWarnings}
          liveHrBpm={liveHrBpm}
        />
      </View>

      <View style={styles.bottomOverlay}>
        {state === 'idle' && (
          <Pressable style={[styles.fab, styles.fabStart]} onPress={handleStart}>
            <Text style={styles.fabText}>START</Text>
          </Pressable>
        )}
        {state === 'recording' && (
          <Pressable style={[styles.fab, styles.fabStop]} onPress={handleStop}>
            <Text style={styles.fabText}>STOP</Text>
          </Pressable>
        )}
        {state === 'stopped' && (
          <View style={styles.bottomRow}>
            <Pressable
              style={[styles.fab, styles.fabReset, styles.fabSmall]}
              onPress={handleReset}
            >
              <Text style={styles.fabText}>RESET</Text>
            </Pressable>
            <Pressable
              style={[styles.fab, styles.fabExport, styles.fabSmall]}
              onPress={handleExportGpx}
            >
              <Text style={styles.fabText}>EXPORT GPX</Text>
            </Pressable>
          </View>
        )}
      </View>

      <StatusBar style="light" />
    </View>
  );
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <ScrollView contentContainerStyle={styles.errorContainer}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{message}</Text>
      <StatusBar style="light" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419' },
  center: {
    flex: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  topOverlay: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
  },
  statText: { color: '#94A3B8', fontSize: 14 },
  bottomOverlay: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 32,
    minWidth: 160,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabStart: { backgroundColor: '#10B981' },
  fabStop: { backgroundColor: '#EF4444' },
  fabReset: { backgroundColor: '#3B82F6' },
  fabExport: { backgroundColor: '#8B5CF6' },
  fabSmall: { paddingHorizontal: 20, paddingVertical: 14, minWidth: 120 },
  fabText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  bottomRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  topRightCol: {
    position: 'absolute',
    top: 56,
    right: 16,
    gap: 8,
    alignItems: 'flex-end',
  },
  historyBtn: {
    backgroundColor: 'rgba(15, 20, 25, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  historyBtnAccent: {
    backgroundColor: 'rgba(16, 185, 129, 0.92)',
  },
  historyBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  errorContainer: {
    flexGrow: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: 'Courier',
  },
});
