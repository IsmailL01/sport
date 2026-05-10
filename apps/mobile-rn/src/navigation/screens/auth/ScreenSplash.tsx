// Auth: Splash screen — stub. Реальная имплементация — Phase M4.
//
// На текущем этапе показываем Logo + текст; через 800ms навигация на
// следующий экран (Intro либо app, в зависимости от auth state) делается
// в RootNavigator/AuthGate.

import { useEffect } from 'react';
import { View, Text } from 'react-native';

import { Logo, useTheme } from '../../../design';

type Props = {
  /** Callback на окончание splash (для AuthGate). */
  onContinue?: () => void;
};

export function ScreenSplash({ onContinue }: Props) {
  const t = useTheme();
  useEffect(() => {
    const id = setTimeout(() => onContinue?.(), 800);
    return () => clearTimeout(id);
  }, [onContinue]);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Logo size={88} />
      <Text
        style={{
          fontSize: 44 * t.fontScale,
          fontWeight: '900',
          letterSpacing: -2,
          marginTop: 18,
          color: t.text,
          fontFamily: t.fontDisplay,
        }}
      >
        cursona
      </Text>
      <Text
        style={{
          fontSize: 13 * t.fontScale,
          color: t.text2,
          marginTop: 8,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontWeight: '600',
          fontFamily: t.font,
        }}
      >
        беги · делись · общайся
      </Text>
    </View>
  );
}
