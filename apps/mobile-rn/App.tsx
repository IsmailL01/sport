// Cursona redesign — slim root component. Phase 8 / M2.
//
// Bootstrap (in order):
//   1. Polyfills (random-bytes for uuid)
//   2. Global side effects (Mapbox token, TTS adapter)
//   3. ErrorBoundary
//   4. SafeAreaProvider
//   5. ThemeProvider (Cursona tokens)
//   6. RootNavigator (auth gate, push deep-link, app shell)
//
// Бизнес-логика (sync, location, sensors, realtime, push register) активируется
// внутри auth-aware screens (Phase M4-M9). Legacy app сохранён как
// `App.legacy.tsx` пока стабилизируем новый flow.

import 'react-native-get-random-values';

import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

import { setMapboxAccessToken } from './src/map';
import { setSpeechAdapter } from './src/util/speech';
import { expoSpeechAdapter } from './src/util/expoSpeechAdapter';
import { ThemeProvider } from './src/design';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ToastProvider } from './src/ui/Toast';
import { ForceUpdateScreen } from './src/ui/screens/ForceUpdateScreen';
import { useFeatureFlagsStore } from './src/state/featureflags';
import { subscribeToRecordingTick } from './src/foreground/notification';
import { useUpdateCheckOnForeground } from './src/update/useUpdateCheckOnForeground';

// === Module-level side effects ===

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
const mapboxInitError: string | null = MAPBOX_TOKEN
  ? setMapboxAccessToken(MAPBOX_TOKEN)
  : 'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN не задан';

// Real TTS — must run before any speech call.
setSpeechAdapter(expoSpeechAdapter);

// Phase 1 / REL-03: kick a feature-flag refresh on app launch.
// Module-level fire-and-forget — store internally handles TTL guard +
// network error fallback (offline-first). Doesn't block UI startup.
void useFeatureFlagsStore.getState().refresh();

// === Error boundary ===

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
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
        <View style={{ flex: 1, backgroundColor: '#0A0A0A', padding: 24, justifyContent: 'center' }}>
          <Text style={{ color: '#FF4D2E', fontSize: 22, fontWeight: '800', marginBottom: 8 }}>
            Приложение упало
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20 }}>
            {this.state.error.name}: {this.state.error.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// === Root ===

export default function App() {
  // Phase 7 / Plan 07-03 Task 2: foreground notification updater. Subscribes to
  // useActivityStore.state transitions; while 'recording', maintains a sticky
  // Android notification with live duration + distance (no-op on iOS).
  useEffect(() => {
    const unsubscribe = subscribeToRecordingTick();
    return () => unsubscribe();
  }, []);

  // Phase 8 / Plan 08-01 Task 5: manifest-driven update flow. Subscribes to
  // AppState 'active' transitions; on each one (subject to a 6h throttle),
  // fetches manifest.json from MinIO + verifies Ed25519 signature + dispatches
  // to: silent (no update) / non-blocking UpdateBanner (optional) / REL-02
  // ForceUpdateScreen (force). See src/update/manifestCheck.ts.
  useUpdateCheckOnForeground();

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* PHASE1-08: ToastProvider внутри ThemeProvider (для useTheme()),
              снаружи RootNavigator (чтобы любой screen мог вызывать
              useToast().show(...)). */}
          <ToastProvider>
            <StatusBar style="light" />
            {mapboxInitError ? (
              <Text style={{ position: 'absolute', top: 50, left: 16, color: '#FFB020', fontSize: 11 }}>
                ⚠ Mapbox: {mapboxInitError}
              </Text>
            ) : null}
            <RootNavigator />
            {/* REL-02: блокирующий полноэкранный Modal активируется когда
                useForceUpdateStore.required = true (выставляется apiClient
                на HTTP 426). При required=false компонент возвращает null. */}
            <ForceUpdateScreen />
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
