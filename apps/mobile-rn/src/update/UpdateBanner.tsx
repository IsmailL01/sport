// Phase 8 Plan 08-01 Task 6 — non-blocking update banner.
//
// Renders a thin RU-text banner at the top of TrackerStartScreen + JournalScreen
// whenever useUpdateBannerStore reports an available optional update AND the
// suppression window is in the past. "Обновить" → Linking.openURL(apk_url) →
// Android system installer. "Позже" → 24h MMKV-persisted suppression.
//
// Force-update path is HANDLED ELSEWHERE: when min_supported_version > installed,
// manifestCheck.ts sets useForceUpdateStore.required=true and the REL-02
// ForceUpdateScreen renders a blocking Modal (mounted at App.tsx root). This
// banner ONLY surfaces optional updates.

import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useUpdateBannerStore } from './updateBannerStore';

const SUPPRESS_MS = 24 * 60 * 60 * 1000;

export function UpdateBanner(): React.ReactElement | null {
  const available = useUpdateBannerStore((s) => s.available);
  const manifest = useUpdateBannerStore((s) => s.manifest);
  const suppressedUntil = useUpdateBannerStore((s) => s.suppressedUntil);

  if (!available || !manifest) return null;
  if (suppressedUntil !== null && Date.now() < suppressedUntil) return null;

  const onUpdate = (): void => {
    void Linking.openURL(manifest.apk_url);
    // Don't dismiss banner immediately — let it stay until the user installs
    // and the new app re-reads the manifest (which then sets available=false).
  };

  const onLater = (): void => {
    useUpdateBannerStore.setState({ suppressedUntil: Date.now() + SUPPRESS_MS });
  };

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>Доступна версия {manifest.version}</Text>
      <View style={styles.actions}>
        <Pressable
          style={styles.primaryAction}
          onPress={onUpdate}
          accessibilityRole="button"
          accessibilityLabel="Обновить приложение"
        >
          <Text style={styles.primaryActionText}>Обновить</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryAction}
          onPress={onLater}
          accessibilityRole="button"
          accessibilityLabel="Отложить на 24 часа"
        >
          <Text style={styles.secondaryActionText}>Позже</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1a1f24',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3138',
  },
  text: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryAction: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  primaryActionText: {
    color: '#0F1419',
    fontWeight: '600',
    fontSize: 13,
  },
  secondaryAction: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryActionText: {
    color: '#888',
    fontSize: 13,
  },
});
