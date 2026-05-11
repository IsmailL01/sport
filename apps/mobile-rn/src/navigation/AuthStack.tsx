// Pre-auth flow: Splash → Intro → Email → Code.
// Phase 8 / M2 (Splash/Intro), M4 (Email/Code), M9.5 (Name/Birthday/Permissions
// перенесены в OnboardingStack — открываются после первого login-with-code).

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ScreenSplash } from './screens/auth/ScreenSplash';
import { ScreenOnboardIntro } from './screens/auth/ScreenOnboardIntro';
import { ScreenEmail } from './screens/auth/ScreenEmail';
import { ScreenCode } from './screens/auth/ScreenCode';
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
    </Stack.Navigator>
  );
}
