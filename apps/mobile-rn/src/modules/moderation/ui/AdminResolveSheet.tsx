// Bottom-sheet с picker'ом действия для resolve report (admin only).

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Report, ResolutionAction } from '../domain/types';

type Props = {
  visible: boolean;
  report: Report | null;
  onResolve: (action: ResolutionAction) => Promise<void>;
  onClose: () => void;
};

const ACTIONS: ReadonlyArray<{
  value: ResolutionAction;
  label: string;
  hint: string;
  destructive?: boolean;
}> = [
  { value: 'delete', label: 'Удалить контент', hint: 'Контент явно нарушает правила', destructive: true },
  { value: 'warn', label: 'Предупредить автора', hint: 'Граничный случай — вынести предупреждение' },
  { value: 'mute', label: 'Замьютить', hint: 'Закрыть автору send в чате/комментариях временно' },
  { value: 'ban', label: 'Забанить', hint: 'Глобальная блокировка аккаунта', destructive: true },
  { value: 'no_action', label: 'Отклонить (no action)', hint: 'Жалоба не обоснована' },
];

export function AdminResolveSheet({ visible, report, onResolve, onClose }: Props) {
  const [busy, setBusy] = useState<ResolutionAction | null>(null);

  if (!visible || !report) return null;

  const handlePick = async (action: ResolutionAction) => {
    setBusy(action);
    try {
      await onResolve(action);
    } catch (e) {
      Alert.alert('Не удалось', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Действие по жалобе</Text>
          <Text style={styles.subtitle}>
            {report.targetKind.toUpperCase()} · {report.reason}
          </Text>
          <View style={styles.list}>
            {ACTIONS.map((a) => (
              <Pressable
                key={a.value}
                onPress={() => handlePick(a.value)}
                disabled={busy !== null}
                style={[
                  styles.option,
                  a.destructive && styles.optionDestructive,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.optionLabel,
                    a.destructive && styles.optionLabelDestructive,
                  ]}>
                    {a.label}
                  </Text>
                  <Text style={styles.optionHint}>{a.hint}</Text>
                </View>
                {busy === a.value ? (
                  <ActivityIndicator color="#111827" />
                ) : (
                  <Text style={styles.chev}>›</Text>
                )}
              </Pressable>
            ))}
          </View>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Отмена</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, paddingBottom: 24, maxHeight: '80%',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  subtitle: { color: '#6B7280', fontSize: 12, marginTop: 4, marginBottom: 12 },
  list: { gap: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8,
  },
  optionDestructive: { borderColor: '#FCA5A5' },
  optionLabel: { color: '#111827', fontSize: 15, fontWeight: '600' },
  optionLabelDestructive: { color: '#B91C1C' },
  optionHint: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  chev: { color: '#9CA3AF', fontSize: 22, marginLeft: 8 },
  cancelBtn: {
    marginTop: 16, paddingVertical: 12,
    backgroundColor: '#F3F4F6', borderRadius: 8, alignItems: 'center',
  },
  cancelText: { color: '#374151', fontWeight: '600' },
});
