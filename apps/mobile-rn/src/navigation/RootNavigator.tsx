// RootNavigator — auth gate + push deep-link routing + auth-side-effects.
// Phase 8 / M2 (skeleton); M5-M10 wires modules; M9.6 restores realtime/push/sync
// lifecycle that lived in App.legacy.tsx Inner() useEffect and got dropped on M2.

import 'react-native-get-random-values';
import { useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { v4 as uuid } from 'uuid';

import { apiClient } from '../auth/apiClient';
import { useAuthStore } from '../state/auth';
import { useSettingsStore } from '../state/settings';
import { useSyncStore } from '../state/sync';
import { useNotificationsStore } from '../state/social/useNotificationsStore';
import { useRealtimeStore } from '../state/social/useRealtimeStore';
import { useModerationStore } from '../modules/moderation';
import { useWalletStore } from '../state/wallet';
import { useTheme } from '../design';
import { getNotificationsAdapter } from '../notifications';

import { AppTabs } from './AppTabs';
import { AuthStack } from './AuthStack';
import { OnboardingStack } from './OnboardingStack';
import { ForeignProfileScreen } from './screens/ForeignProfileScreen';
import { StoryCreatorScreen, StoryViewerScreen } from '../modules/stories';
import type { RootStackParamList } from './types';

/** Global navigation ref — used for push deep-link routing from outside React. */
export const navRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();

function LoadingGate() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={t.text2} />
    </View>
  );
}

export function RootNavigator() {
  const authState = useAuthStore((s) => s.state);
  const needsOnboarding = useAuthStore((s) => s.needsOnboarding);
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useRef(false);

  // Bootstrap: rehydrate tokens from secure storage once on mount.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    void hydrate();
  }, [hydrate]);

  // M9.6: connect realtime + register push + pull sessions + fetch role
  // on authentication; disconnect realtime on logout. Без этого вся
  // realtime-доставка (chat messages + xp updates) не работает.
  useEffect(() => {
    if (authState === 'unauthenticated') {
      useRealtimeStore.getState().disconnect();
      return;
    }
    if (authState !== 'authenticated') return;

    const user = useAuthStore.getState().user;
    if (user === null) return;

    // Best-effort sessions pull.
    useSyncStore.getState().pullDown().catch((e) => {
      console.warn('[RootNavigator] pullDown failed', e);
    });

    // Admin role fetch (gate Admin UI).
    void useModerationStore.getState().fetchMyRole(user.id);

    // Wallet (currency) hydrate from local SQLite.
    useWalletStore.getState().hydrate(user.id);

    // Realtime WebSocket + push token registration.
    const accessToken = apiClient.getAccessToken();
    if (accessToken !== null) {
      let deviceID = useSettingsStore.getState().deviceId;
      if (deviceID === null) {
        deviceID = uuid();
        useSettingsStore.getState().setDeviceId(deviceID);
      }
      useRealtimeStore
        .getState()
        .connect(user.id, accessToken, deviceID)
        .catch((e) => console.warn('[RootNavigator] realtime connect failed', e));
      useNotificationsStore
        .getState()
        .requestAndRegister()
        .catch((e) => console.warn('[RootNavigator] push register failed', e));
    }
  }, [authState]);

  // Phase J: push deep-link → route to relevant tab.
  // navRef доступен после mount NavigationContainer.
  useEffect(() => {
    const adapter = getNotificationsAdapter();
    const unsub = adapter.onResponse((data) => {
      const event = (data?.event ?? '') as string;
      if (!navRef.isReady()) return;
      switch (event) {
        case 'message.new':
          navRef.navigate('App', { screen: 'Chats', params: { screen: 'ChatsList' } });
          break;
        default:
          break;
      }
    });
    return () => unsub();
  }, []);

  return (
    <NavigationContainer
      ref={navRef}
      theme={{
        dark: true,
        colors: {
          background: '#0A0A0A',
          card: '#0A0A0A',
          text: '#FFFFFF',
          primary: '#C6F560',
          border: 'rgba(255,255,255,0.07)',
          notification: '#FF4D2E',
        },
        fonts: {
          regular:  { fontFamily: 'System', fontWeight: '400' },
          medium:   { fontFamily: 'System', fontWeight: '500' },
          bold:     { fontFamily: 'System', fontWeight: '700' },
          heavy:    { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      {authState === 'idle' || authState === 'hydrating' ? (
        <LoadingGate />
      ) : (
        <Stack.Navigator
          screenOptions={{ headerShown: false, animation: 'fade' }}
        >
          {authState === 'authenticated' ? (
            needsOnboarding ? (
              <Stack.Screen name="Onboarding" component={OnboardingStack} />
            ) : (
              <>
                <Stack.Screen name="App" component={AppTabs} />
                <Stack.Screen
                  name="ForeignProfile"
                  component={ForeignProfileScreen}
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
                {/* Phase 11 / STORIES-REVIVAL — modal viewer + creator. */}
                <Stack.Screen
                  name="StoryViewer"
                  component={StoryViewerScreen}
                  options={{
                    presentation: 'fullScreenModal',
                    animation: 'fade',
                    gestureEnabled: false,
                  }}
                />
                <Stack.Screen
                  name="StoryCreator"
                  component={StoryCreatorScreen}
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
              </>
            )
          ) : (
            <Stack.Screen name="Auth" component={AuthStack} />
          )}
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
