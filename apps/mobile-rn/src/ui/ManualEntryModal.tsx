// Manual workout entry — записать пробежку без GPS.
// Phase 6.5 / extra.
//
// Сценарий: пользователь вышел гулять/бежал на дорожке/забыл включить, но
// хочет добавить пробежку чтобы пошла в стат и PMC.
//
// Минимальный набор: дата+время старта, длительность, дистанция,
// (опционально) средний HR, note. Без точек GPS — стат показывается, area null,
// "не замкнут".

import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useHistoryStore } from '../state/history';
import { useTrainingStore } from '../state/training';
import { createManualSession } from '../storage/sessionRepository';

export type ManualEntryProps = {
  visible: boolean;
  onClose: () => void;
};

export function ManualEntryModal({ visible, onClose }: ManualEntryProps) {
  const refreshHistory = useHistoryStore((s) => s.refresh);
  const recompute = useTrainingStore((s) => s.recompute);

  const now = new Date();
  const today = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const [dateStr, setDateStr] = useState(today);
  const [timeStr, setTimeStr] = useState(nowTime);
  const [durationMin, setDurationMin] = useState('30');
  const [distanceKm, setDistanceKm] = useState('5.0');
  const [avgHrStr, setAvgHrStr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      // Reset form каждый раз когда открывают.
      setDateStr(today);
      setTimeStr(nowTime);
      setDurationMin('30');
      setDistanceKm('5.0');
      setAvgHrStr('');
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSave = () => {
    const startedAt = parseDateTime(dateStr, timeStr);
    if (startedAt === null) {
      Alert.alert('Неверная дата', 'Формат: дд.мм.гггг + чч:мм');
      return;
    }
    const minutes = parseFloat(durationMin.replace(',', '.'));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
      Alert.alert('Неверная длительность', '5–1440 минут');
      return;
    }
    const km = parseFloat(distanceKm.replace(',', '.'));
    if (!Number.isFinite(km) || km <= 0 || km > 500) {
      Alert.alert('Неверная дистанция', '0.1–500 км');
      return;
    }
    let avgHr: number | null = null;
    if (avgHrStr.trim() !== '') {
      const h = parseInt(avgHrStr, 10);
      if (!Number.isFinite(h) || h < 30 || h > 230) {
        Alert.alert('Неверный HR', '30–230 bpm');
        return;
      }
      avgHr = h;
    }
    try {
      createManualSession({
        startedAt,
        endedAt: startedAt + Math.round(minutes * 60_000),
        distanceM: Math.round(km * 1000),
        avgHrBpm: avgHr,
        note: note.trim() || null,
      });
      refreshHistory();
      recompute();
      onClose();
    } catch (e) {
      Alert.alert('Не удалось сохранить', String(e));
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Добавить вручную</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.hint}>
            Запиши пробежку, которую сделал без приложения (на дорожке или
            забыл включить трекинг).
          </Text>

          <Field label="Дата (дд.мм.гггг)">
            <TextInput
              style={styles.input}
              value={dateStr}
              onChangeText={setDateStr}
              keyboardType="numbers-and-punctuation"
              placeholder="07.05.2026"
              placeholderTextColor="#64748B"
            />
          </Field>

          <Field label="Время старта (чч:мм)">
            <TextInput
              style={styles.input}
              value={timeStr}
              onChangeText={setTimeStr}
              keyboardType="numbers-and-punctuation"
              placeholder="07:30"
              placeholderTextColor="#64748B"
            />
          </Field>

          <Field label="Длительность (мин)">
            <TextInput
              style={styles.input}
              value={durationMin}
              onChangeText={setDurationMin}
              keyboardType="numeric"
            />
          </Field>

          <Field label="Дистанция (км)">
            <TextInput
              style={styles.input}
              value={distanceKm}
              onChangeText={setDistanceKm}
              keyboardType="numeric"
            />
          </Field>

          <Field label="Средний HR (bpm) — опционально">
            <TextInput
              style={styles.input}
              value={avgHrStr}
              onChangeText={setAvgHrStr}
              keyboardType="numeric"
              placeholder="140"
              placeholderTextColor="#64748B"
            />
          </Field>

          <Field label="Заметка">
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Что-то про эту пробежку…"
              placeholderTextColor="#64748B"
            />
          </Field>

          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveText}>Сохранить</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            Без GPS. Площадь территории не считается, на карте сессия не
            показывается. В PMC и стат идёт.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseDateTime(d: string, t: string): number | null {
  const dm = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const tm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const day = parseInt(dm[1], 10);
  const month = parseInt(dm[2], 10);
  const year = parseInt(dm[3], 10);
  const hour = parseInt(tm[1], 10);
  const minute = parseInt(tm[2], 10);
  if (
    !Number.isFinite(day) || day < 1 || day > 31
    || !Number.isFinite(month) || month < 1 || month > 12
    || !Number.isFinite(year) || year < 2000 || year > 2100
    || !Number.isFinite(hour) || hour < 0 || hour > 23
    || !Number.isFinite(minute) || minute < 0 || minute > 59
  ) return null;
  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Validate fallback: e.g. 31.02.2026 → JS rolls over.
  if (dt.getDate() !== day || dt.getMonth() !== month - 1) return null;
  return dt.getTime();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1419' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E293B',
  },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', flex: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E293B',
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#94A3B8', fontSize: 18 },
  scroll: { padding: 20, paddingBottom: 64 },
  hint: { color: '#94A3B8', fontSize: 13, marginBottom: 18, lineHeight: 18 },
  fieldLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: {
    marginTop: 14,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disclaimer: { color: '#64748B', fontSize: 11, marginTop: 14, lineHeight: 15, textAlign: 'center' },
});
