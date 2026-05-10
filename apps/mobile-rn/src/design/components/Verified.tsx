// Verified — small green checkmark badge.
// Phase 8 / M1.

import { View } from 'react-native';

import { useTheme } from '../ThemeProvider';
import { Icon } from '../icons';

export function Verified({ size = 18 }: { size?: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.success,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="check" size={Math.round(size * 0.65)} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}
