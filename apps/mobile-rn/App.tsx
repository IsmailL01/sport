import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import {
  LocationPuckLayer,
  MapboxView,
  TrackLayer,
  ZoneLayer,
  setMapboxAccessToken,
} from './src/map';
import { locationAdapter } from './src/location';
import { useActivityStore } from './src/state/activity';
import {
  computeArea,
  isClosed as detectIsClosed,
  totalDistance,
} from './src/util/geo';

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
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>('pending');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setPermissionStatus(status === 'granted' ? 'granted' : 'denied');
      } catch (e) {
        setPermissionError((e as Error)?.message ?? String(e));
        setPermissionStatus('denied');
      }
    })();
  }, []);

  // Cleanup на unmount: гарантируем что подписка location снимается
  useEffect(() => {
    return () => {
      locationAdapter.stop();
    };
  }, []);

  // На старте приложения — попробовать восстановить последнюю сессию из SQLite
  const recoverLast = useActivityStore((s) => s.recoverLast);
  useEffect(() => {
    recoverLast();
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

  return <MapScreen />;
}

function MapScreen() {
  const state = useActivityStore((s) => s.state);
  const points = useActivityStore((s) => s.points);
  const startedAt = useActivityStore((s) => s.startedAt);
  const start = useActivityStore((s) => s.start);
  const stop = useActivityStore((s) => s.stop);
  const reset = useActivityStore((s) => s.reset);

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
  };

  const handleStop = async () => {
    await locationAdapter.stop();
    stop();
  };

  const handleReset = async () => {
    await locationAdapter.stop();
    reset();
  };

  const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const lastPoint = points[points.length - 1];
  const distance = useMemo(() => totalDistance(points), [points]);
  const closed = useMemo(
    () => detectIsClosed(points, distance),
    [points, distance],
  );
  const area = useMemo(
    () => (closed ? computeArea(points) : null),
    [closed, points],
  );

  return (
    <View style={styles.container}>
      <MapboxView followUserLocation followZoomLevel={16}>
        <LocationPuckLayer />
        <TrackLayer points={points} />
        {closed && <ZoneLayer points={points} />}
      </MapboxView>

      <View style={styles.topOverlay} pointerEvents="none">
        <Text style={styles.statTitle}>
          {state === 'idle' && 'Готов к записи'}
          {state === 'recording' && `🔴 Запись · ${formatTime(elapsedSec)}`}
          {state === 'stopped' && '⏸ Остановлено'}
        </Text>
        <Text style={styles.statSubtitle}>
          {formatDistance(distance)}  ·  {points.length} точек
          {lastPoint && (
            <Text>
              {'  ·  '}±{lastPoint.accuracy?.toFixed(1) ?? '?'}m
            </Text>
          )}
        </Text>
        {closed && area != null && (
          <Text style={styles.areaText}>
            🏆 Зона: {formatArea(area)}
          </Text>
        )}
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
          <Pressable style={[styles.fab, styles.fabReset]} onPress={handleReset}>
            <Text style={styles.fabText}>RESET</Text>
          </Pressable>
        )}
      </View>

      <StatusBar style="light" />
    </View>
  );
}

function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDistance(m: number): string {
  if (m < 1000) return `${m.toFixed(0)} м`;
  return `${(m / 1000).toFixed(2)} км`;
}

function formatArea(m2: number): string {
  if (m2 < 10_000) return `${m2.toFixed(0)} м²`;
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(2)} га`;
  return `${(m2 / 1_000_000).toFixed(3)} км²`;
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
    backgroundColor: 'rgba(15, 20, 25, 0.85)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  statSubtitle: { color: '#94A3B8', fontSize: 13, marginTop: 4 },
  statText: { color: '#94A3B8', fontSize: 14 },
  areaText: { color: '#10B981', fontSize: 14, fontWeight: '600', marginTop: 8 },
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
  fabText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
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
