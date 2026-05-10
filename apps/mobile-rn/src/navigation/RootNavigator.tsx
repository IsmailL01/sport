// RootNavigator — auth gate + push deep-link routing.
// Phase 8 / M2 (skeleton); deep-link richer payloads — M5-M10.

import { useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '../state/auth';
import { useTheme } from '../design';
import { getNotificationsAdapter } from '../notifications';

import { AppTabs } from './AppTabs';
import { AuthStack } from './AuthStack';
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
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useRef(false);

  // Bootstrap: rehydrate tokens from secure storage once on mount.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    void hydrate();
  }, [hydrate]);

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
        case 'feed.post.liked':
        case 'feed.post.commented':
          navRef.navigate('App', { screen: 'Feed', params: { screen: 'FeedHome' } });
          break;
        case 'feed.story.published':
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
            <Stack.Screen name="App" component={AppTabs} />
          ) : (
            <Stack.Screen name="Auth" component={AuthStack} />
          )}
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
