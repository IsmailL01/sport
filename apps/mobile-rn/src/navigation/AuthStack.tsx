// Auth flow: Splash → Intro → Email → Code → Name → Birthday → Permissions.
// Phase 8 / M2.
//
// Stubs sit here; real wiring (request-code API, validation, persist) happens
// in Phase M4. Navigator structure stays the same.

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ScreenSplash } from './screens/auth/ScreenSplash';
import { ScreenOnboardIntro } from './screens/auth/ScreenOnboardIntro';
import { ScreenEmail } from './screens/auth/ScreenEmail';
import { ScreenCode } from './screens/auth/ScreenCode';
import { ScreenName } from './screens/auth/ScreenName';
import { ScreenBirthday } from './screens/auth/ScreenBirthday';
import { ScreenPermissions } from './screens/auth/ScreenPermissions';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0A0A' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Splash">
        {({ navigation }) => (
          <ScreenSplash onContinue={() => navigation.replace('Intro')} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Intro" component={ScreenOnboardIntro} />
      <Stack.Screen name="Email" component={ScreenEmail} />
      <Stack.Screen name="Code" component={ScreenCode} />
      <Stack.Screen name="Name">
        {({ navigation }) => (
          <ScreenName onContinue={() => navigation.navigate('Birthday')} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Birthday">
        {({ navigation }) => (
          <ScreenBirthday
            onBack={() => navigation.goBack()}
            onContinue={() => navigation.navigate('Permissions')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Permissions" component={ScreenPermissions} />
    </Stack.Navigator>
  );
}
