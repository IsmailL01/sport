// Post-signup wizard: Name → Birthday → Permissions → AppTabs.
// Phase 8 / M9.5.
//
// Запускается из RootNavigator когда:
//   useAuthStore.state === 'authenticated' && useAuthStore.needsOnboarding === true
//
// На последнем шаге Permissions → finishOnboarding() — RootNavigator
// автоматически переключается на AppTabs.

import { Alert } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Location from 'expo-location';

import { apiClient } from '../auth/apiClient';
import { useAuthStore } from '../state/auth';
import { useSettingsStore } from '../state/settings';

import { ScreenName } from './screens/auth/ScreenName';
import { ScreenBirthday } from './screens/auth/ScreenBirthday';
import { ScreenPermissions } from './screens/auth/ScreenPermissions';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator
      initialRouteName="Name"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0A0A' },
        animation: 'slide_from_right',
        gestureEnabled: false, // нельзя свайпом убежать с onboarding
      }}
    >
      <Stack.Screen name="Name">
        {({ navigation }) => (
          <ScreenName
            onContinue={async (name) => {
              // Best-effort: PATCH /profiles/me + local update auth.user.
              // Если PATCH провалится — продолжаем (имя останется fallback),
              // не блокируем UX onboarding.
              try {
                const resp = await apiClient.api('/profiles/me', {
                  method: 'PATCH',
                  body: JSON.stringify({ displayName: name }),
                });
                if (resp.ok) {
                  useAuthStore.getState().setDisplayName(name);
                } else {
                  console.warn('[onboarding] PATCH /profiles/me →', resp.status);
                  useAuthStore.getState().setDisplayName(name); // optimistic
                }
              } catch (e) {
                console.warn('[onboarding] PATCH /profiles/me failed', e);
                useAuthStore.getState().setDisplayName(name); // optimistic
              }
              navigation.navigate('Birthday');
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="Birthday">
        {({ navigation }) => (
          <ScreenBirthday
            onBack={() => navigation.goBack()}
            onContinue={(iso) => {
              if (iso !== null) {
                useSettingsStore.getState().setAthlete({ birthDate: iso });
              }
              navigation.navigate('Permissions');
            }}
          />
        )}
      </Stack.Screen>

      <Stack.Screen name="Permissions">
        {() => (
          <ScreenPermissions
            onAllow={async () => {
              try {
                await Location.requestForegroundPermissionsAsync();
              } catch (e) {
                console.warn('[onboarding] location permission request failed', e);
              }
              useAuthStore.getState().finishOnboarding();
            }}
            onDeny={() => {
              Alert.alert(
                'Без доступа трекер не сможет писать',
                'Можно разрешить позже в системных настройках.',
                [
                  { text: 'Назад', style: 'cancel' },
                  {
                    text: 'Всё равно продолжить',
                    onPress: () => useAuthStore.getState().finishOnboarding(),
                  },
                ],
              );
            }}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
