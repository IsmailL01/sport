import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { MapView, Camera, LocationPuck } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';

const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
const MAPBOX_STYLE = 'mapbox://styles/mapbox/outdoors-v12';

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

type PermissionStatus = 'pending' | 'granted' | 'denied';

export default function App() {
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>('pending');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status === 'granted' ? 'granted' : 'denied');
    })();
  }, []);

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <ErrorScreen
        title="Конфигурация неполна"
        message="EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN не задан. Скопируйте .env.example в .env и подставьте значение dev-public токена. См. /docs/SECRETS.md"
      />
    );
  }

  if (permissionStatus === 'pending') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Запрашиваем разрешение на геолокацию…</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (permissionStatus === 'denied') {
    return (
      <ErrorScreen
        title="Нет доступа к геолокации"
        message="Откройте настройки приложения и разрешите доступ к местоположению — без него карта не сможет показывать вашу позицию и записывать пробежку."
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
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{message}</Text>
      <StatusBar style="light" />
    </View>
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
  loadingText: { color: '#94A3B8', fontSize: 14 },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
