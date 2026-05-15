// ForceUpdateScreen — полноэкранная блокирующая Modal. Phase 1 / REL-02.
//
// Срабатывает когда useForceUpdateStore.required = true (выставляется
// apiClient.doFetch при получении HTTP 426 Upgrade Required).
//
// UI:
//   - title:  "Требуется обновление" (русский per CLAUDE.md)
//   - body:   "Версия приложения устарела. Минимальная поддерживаемая: X.Y.Z."
//   - button: "Обновить сейчас" → Linking.openURL(forceUpdateUrl)
//
// Modal с onRequestClose={() => {}}: Android back button НЕ закрывает —
// единственный выход через кнопку "Обновить".
//
// Палитра inline (dark theme; per PATTERNS.md):
//   bg #0A0A0A, text #FFFFFF, accent #FF4D2E.

import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useForceUpdateStore } from '../../state/forceUpdate';

export function ForceUpdateScreen(): React.JSX.Element | null {
  const required = useForceUpdateStore((s) => s.required);
  const minVersion = useForceUpdateStore((s) => s.minVersion);
  const forceUpdateUrl = useForceUpdateStore((s) => s.forceUpdateUrl);

  if (!required) {
    return null;
  }

  const onUpdate = () => {
    if (!forceUpdateUrl) {
      // Пустой URL — клиент не отдал ссылку. Это сигнал ошибки конфига
      // на стороне сервера; ничего не делаем (кнопка не реагирует).
      console.warn('[forceUpdate] empty forceUpdateUrl — cannot open');
      return;
    }
    void Linking.openURL(forceUpdateUrl);
  };

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        /* Android back: no-op — modal неотменяемая */
      }}
    >
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Требуется обновление</Text>
          <Text style={styles.body}>
            Версия приложения устарела. Минимальная поддерживаемая:{' '}
            {minVersion || 'N/A'}.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={onUpdate}
            accessibilityRole="button"
            accessibilityLabel="Обновить сейчас"
          >
            <Text style={styles.buttonText}>Обновить сейчас</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    backgroundColor: '#141414',
    borderRadius: 16,
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#C7C7C7',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#FF4D2E',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
