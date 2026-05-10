// ThemeProvider — корневой Provider для Cursona-tokens.
// Phase 8 / M1.
//
// Использование:
//   <ThemeProvider>
//     <App/>
//   </ThemeProvider>
//
//   function MyScreen() {
//     const t = useTheme();
//     return <View style={{ background: t.bg }} />;
//   }
//
// Tweaks (accent/lime/radius/density/fontSize/theme) живут в useThemeStore
// (MMKV-persist). Tweaks panel — dev-only screen (Phase M11).

import { createContext, useContext, useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

import { DEFAULT_TWEAKS, type Theme, type Tokens, type TweakInputs, makeTheme } from './tokens';

// react-native-mmkv v4 API: createMMKV() instead of new MMKV(). Same get/set.
const mmkv = createMMKV({ id: 'theme-tweaks' });

const mmkvStorage = {
  getItem: (key: string): string | null => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string): void => { mmkv.set(key, value); },
  removeItem: (key: string): void => { mmkv.remove(key); },
};

type ThemeStore = TweakInputs & {
  set: <K extends keyof TweakInputs>(key: K, value: TweakInputs[K]) => void;
  reset: () => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      ...DEFAULT_TWEAKS,
      set: (key, value) => set({ [key]: value } as Pick<TweakInputs, typeof key>),
      reset: () => set(DEFAULT_TWEAKS),
    }),
    {
      name: 'cursona-theme-tweaks-v1',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);

const ThemeContext = createContext<Tokens>(makeTheme(DEFAULT_TWEAKS));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const tweaks = useThemeStore();
  const tokens = useMemo<Tokens>(
    () => makeTheme({
      theme: tweaks.theme,
      accent: tweaks.accent,
      lime: tweaks.lime,
      radiusScale: tweaks.radiusScale,
      density: tweaks.density,
      fontSize: tweaks.fontSize,
    }),
    [
      tweaks.theme, tweaks.accent, tweaks.lime,
      tweaks.radiusScale, tweaks.density, tweaks.fontSize,
    ],
  );
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>;
}

/** Read tokens from the nearest ThemeProvider. */
export function useTheme(): Tokens {
  return useContext(ThemeContext);
}

/** Convenience: get + set tweaks from screens / dev panel. */
export function useTweak<K extends keyof TweakInputs>(key: K): [TweakInputs[K], (v: TweakInputs[K]) => void] {
  const value = useThemeStore((s) => s[key]) as TweakInputs[K];
  const setter = useThemeStore((s) => s.set);
  return [value, (v) => setter(key, v)];
}

/** Programmatic helpers — useful outside React (e.g. SQLite migration log). */
export function getCurrentTokens(): Tokens {
  const s = useThemeStore.getState();
  return makeTheme({
    theme: s.theme,
    accent: s.accent,
    lime: s.lime,
    radiusScale: s.radiusScale,
    density: s.density,
    fontSize: s.fontSize,
  });
}

export function setTheme(theme: Theme): void {
  useThemeStore.getState().set('theme', theme);
}
