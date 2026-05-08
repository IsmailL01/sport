// ReportSheet — модальный bottom-sheet для отправки жалобы.
// Phase E. Вызывается из long-press menu PostCard / MessageBubble.
//
// UX:
//   - radio-выбор reason (REPORT_REASONS)
//   - опциональный textarea (body) — обязателен только для reason=other
//   - submit → store.submit() → success-toast + close, error-banner

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  REPORT_BODY_MAX_LENGTH,
  REPORT_REASONS,
  type ReportReason,
  type ReportTargetKind,
} from '../domain/types';
import { useModerationStore } from '../state/useModerationStore';

type Props = {
  visible: boolean;
  targetKind: ReportTargetKind;
  targetId: string;
  /** Краткая подпись «Что репортится» — для ясности юзеру. */
  targetLabel?: string;
  onClose: () => void;
};

export function ReportSheet({
  visible, targetKind, targetId, targetLabel, onClose,
}: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [body, setBody] = useState('');
  const submitting = useModerationStore((s) => s.submitting);
  const submit = useModerationStore((s) => s.submit);

  const reset = () => {
    setReason(null);
    setBody('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (reason === null) return;
    if (reason === 'other' && body.trim() === '') {
      Alert.alert('Опишите причину', 'Для «Другое» нужно текстовое описание.');
      return;
    }
    try {
      await submit({
        targetKind,
        targetId,
        reason,
        body: body.trim() || null,
      });
      Alert.alert('Жалоба отправлена', 'Модераторы рассмотрят её в ближайшее время.');
      reset();
      onClose();
    } catch (e) {
      Alert.alert('Ошибка отправки', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Пожаловаться</Text>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          {targetLabel ? (
            <Text style={styles.targetLabel} numberOfLines={2}>
              На «{targetLabel}»
            </Text>
          ) : null}

          <ScrollView style={{ maxHeight: 460 }}>
            <Text style={styles.section}>Причина</Text>
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r.value}
                style={[
                  styles.option,
                  reason === r.value && styles.optionActive,
                ]}
                onPress={() => setReason(r.value)}
              >
                <View style={[
                  styles.radio,
                  reason === r.value && styles.radioActive,
                ]}>
                  {reason === r.value ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{r.label}</Text>
                  <Text style={styles.optionHint}>{r.hint}</Text>
                </View>
              </Pressable>
            ))}

            <Text style={styles.section}>Дополнительно (необязательно)</Text>
            <TextInput
              style={styles.input}
              value={body}
              onChangeText={(t) => setBody(t.slice(0, REPORT_BODY_MAX_LENGTH))}
              placeholder="Опишите подробнее…"
              placeholderTextColor="#9CA3AF"
              multiline
            />
            <Text style={styles.counter}>{body.length}/{REPORT_BODY_MAX_LENGTH}</Text>
          </ScrollView>

          <Pressable
            style={[
              styles.submit,
              (reason === null || submitting) && styles.submitDisabled,
            ]}
            onPress={handleSubmit}
            disabled={reason === null || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Отправить жалобу</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, paddingBottom: 32,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  closeText: { fontSize: 26, color: '#6B7280', marginTop: -6 },
  targetLabel: {
    color: '#6B7280', fontSize: 13, marginBottom: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6,
  },
  section: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 8, marginBottom: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6,
    marginBottom: 8,
  },
  optionActive: { borderColor: '#111827' },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: '#111827' },
  radioDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#111827',
  },
  optionLabel: { color: '#111827', fontSize: 14, fontWeight: '500' },
  optionHint: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  input: {
    color: '#111827', fontSize: 14,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6,
    padding: 10, minHeight: 80, maxHeight: 160,
    textAlignVertical: 'top',
  },
  counter: { color: '#9CA3AF', fontSize: 11, textAlign: 'right', marginTop: 4 },
  submit: {
    marginTop: 12,
    backgroundColor: '#111827',
    paddingVertical: 14, borderRadius: 8,
    alignItems: 'center',
  },
  submitDisabled: { backgroundColor: '#9CA3AF' },
  submitText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
