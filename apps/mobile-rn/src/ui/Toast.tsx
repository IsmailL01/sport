// Toast: in-house overlay для лёгких уведомлений (closure haptic+toast и т.д.).
// Phase 1 / PHASE1-08. См. ТЗ §3 / DEVELOPMENT_PLAN.md §3 P1-G-09.
// No new dependency — Animated.View + Context. Тема: dark accent #10B981 (или
// t.lime если ThemeProvider предоставил), z-index выше карты, ниже Alert.

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { useTheme } from '../design';

type Ctx = { show: (text: string, durationMs?: number) => void };

const ToastCtx = createContext<Ctx>({ show: () => {} });

export const useToast = (): Ctx => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const t = useTheme();
  const [msg, setMsg] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const show = useCallback(
    (text: string, durationMs = 2500) => {
      setMsg(text);
      // Pre-set opacity to 0 so повторный show() стартует с invisible state.
      opacity.setValue(0);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(durationMs),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) {
          setMsg(null);
        }
      });
    },
    [opacity],
  );

  // Background: prefer theme lime (Cursona accent) — fallback на жёсткий #10B981
  // если по какой-то причине токен отсутствует (нет ThemeProvider в дереве).
  const bg = t?.lime ?? '#10B981';
  const text = t?.text ?? '#FFFFFF';

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {msg ? (
        <Animated.View
          style={[styles.toast, { opacity, backgroundColor: bg }]}
          pointerEvents="none"
          testID="toast-overlay"
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.text, { color: text }]} testID="toast-text">
            {msg}
          </Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    // z-index выше карты, ниже модалок.
    zIndex: 1000,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
});
