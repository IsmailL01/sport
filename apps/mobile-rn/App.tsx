import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Mapbox, { MapView, Camera, LocationPuck } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';

const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
const MAPBOX_STYLE = 'mapbox://styles/mapbox/outdoors-v12';

let initError: string | null = null;
try {
  if (MAPBOX_ACCESS_TOKEN) {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
  }
} catch (e) {
  initError = `Mapbox.setAccessToken упал: ${(e as Error)?.message ?? String(e)}`;
}

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
    // Лог в Metro / logcat — поможет диагностике
    console.error('[App ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          title="Приложение упало"
          message={`${this.state.error.name}: ${this.state.error.message}\n\nМожно прислать скриншот этого экрана для диагностики.`}
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

  const tokenPreview = MAPBOX_ACCESS_TOKEN
    ? `${MAPBOX_ACCESS_TOKEN.slice(0, 12)}…${MAPBOX_ACCESS_TOKEN.slice(-6)} (length=${MAPBOX_ACCESS_TOKEN.length})`
    : '<empty>';

  if (initError) {
    return (
      <ErrorScreen
        title="Mapbox init упал"
        message={`${initError}\n\nToken: ${tokenPreview}`}
      />
    );
  }

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <ErrorScreen
        title="Конфигурация неполна"
        message={`EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN не задан в bundle. token=${tokenPreview}\n\nПри сборке APK env-переменная не была встроена. См. /docs/SECRETS.md`}
      />
    );
  }

  if (permissionStatus === 'pending') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingTitle}>Запрашиваем разрешение на геолокацию…</Text>
        <Text style={styles.loadingHint}>Token: {tokenPreview}</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (permissionStatus === 'denied') {
    return (
      <ErrorScreen
        title="Нет доступа к геолокации"
        message={
          permissionError
            ? `Ошибка запроса permission: ${permissionError}`
            : 'Откройте настройки приложения и разрешите доступ к местоположению.'
        }
      />
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        styleURL={MAPBOX_STYLE}
        compassEnabled
        scaleBarEnabled={false}
        attributionEnabled
        logoEnabled
      >
        <Camera followUserLocation followZoomLevel={16} />
        <LocationPuck
          puckBearingEnabled
          pulsing={{ isEnabled: true }}
        />
      </MapView>
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
  map: { flex: 1 },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingTitle: { color: '#94A3B8', fontSize: 14, marginBottom: 8 },
  loadingHint: { color: '#64748B', fontSize: 11, fontFamily: 'Courier' },
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
