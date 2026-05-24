// Одноразовый диалог автозапуска для MIUI + One UI (Phase 7 / Plan 07-03 Task 4).
//
// Показывается ОДИН раз per install на TrackerStartScreen, когда detectVendor()
// возвращает 'xiaomi' или 'samsung'. После показа выставляет MMKV-флаг
// `vendorAutostartDialogShown=true` — никогда больше не появляется (даже после
// "Понятно, потом").
//
// Vendor scope (CONTEXT D-17 + ADR-0011 STAB-01 lean):
//   - xiaomi (MIUI + HyperOS) → MIUI auto-start permission editor intent
//   - samsung (One UI)        → One UI battery settings intent
//   - huawei / honor          → deferred (диалог не показывается; v1.0.1 backlog)
//   - generic                 → диалог не показывается (vendor-killers не активны)
//
// Wired into TrackerStartScreen as sibling JSX → on-mount effect inside the
// component triggers the Modal once.

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { detectVendor } from './oem';
import { openOEMAutoStartSettings } from './openOEMSettings';

const FLAG_KEY = 'vendorAutostartDialogShown';
const mmkv = createMMKV();

export function shouldShowDialog(): boolean {
  const vendor = detectVendor();
  // Generic + Huawei → не показывать (vendor-killer mitigations не покрывают
  // их в closed-beta scope).
  if (vendor === 'generic' || vendor === 'huawei') return false;
  // Уже показывали — не показываем повторно.
  const seen = mmkv.getString(FLAG_KEY);
  return seen !== 'true';
}

export function markDialogShown(): void {
  mmkv.set(FLAG_KEY, 'true');
}

/** Сброс флага (для тестов + ручных QA-перезапусков). */
export function resetDialogShown(): void {
  mmkv.remove(FLAG_KEY);
}

export function AutostartDialog(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (shouldShowDialog()) {
      setVisible(true);
    }
  }, []);

  const handleOpenSettings = async (): Promise<void> => {
    try {
      await openOEMAutoStartSettings();
    } finally {
      markDialogShown();
      setVisible(false);
    }
  };

  const handleDismiss = (): void => {
    markDialogShown();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Разрешите фоновую запись</Text>
          <Text style={styles.body}>
            Чтобы запись пробежки не прерывалась, когда телефон в кармане или
            экран выключен — откройте настройки и включите автозапуск +
            отключите оптимизацию батареи для Running Ecosystem.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              void handleOpenSettings();
            }}
            accessibilityRole="button"
            accessibilityLabel="Открыть настройки"
          >
            <Text style={styles.primaryButtonText}>Открыть настройки</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Понятно, потом"
          >
            <Text style={styles.secondaryButtonText}>Понятно, потом</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#0F1419',
    borderRadius: 16,
    padding: 24,
    maxWidth: 360,
    width: '100%',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  body: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#4ade80',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryButtonText: {
    color: '#0F1419',
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#888',
  },
});
