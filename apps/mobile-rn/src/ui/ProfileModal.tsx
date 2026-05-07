// Профиль атлета: вес/рост/возраст + HR/Pace зоны (computed view) + цели.
// Phase 4 / P4-A-01..03 + P4-A-06.

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  defaultHRZones,
  resolveMaxHR,
  type HRZone,
  type Sex,
} from '../domain/athlete';
import { useSettingsStore } from '../state/settings';

export type ProfileModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileModal({ visible, onClose }: ProfileModalProps) {
  const athlete = useSettingsStore((s) => s.athlete);
  const setAthlete = useSettingsStore((s) => s.setAthlete);
  const goals = useSettingsStore((s) => s.goals);
  const setGoals = useSettingsStore((s) => s.setGoals);

  const maxHR = resolveMaxHR(athlete);
  const zones = maxHR !== null ? defaultHRZones(maxHR) : [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Профиль</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Section title="Атлет">
            <NumberRow
              label="Вес, кг"
              value={athlete.weightKg}
              placeholder="70"
              onChange={(v) => setAthlete({ weightKg: v })}
            />
            <NumberRow
              label="Рост, см"
              value={athlete.heightCm}
              placeholder="180"
              onChange={(v) => setAthlete({ heightCm: v })}
            />
            <DateRow
              label="Дата рождения"
              value={athlete.birthDate}
              onChange={(v) => setAthlete({ birthDate: v })}
            />
            <SexRow
              value={athlete.sex}
              onChange={(v) => setAthlete({ sex: v })}
            />
            <NumberRow
              label="Resting HR"
              value={athlete.restingHR}
              placeholder="60"
              onChange={(v) => setAthlete({ restingHR: v })}
            />
            <NumberRow
              label="Max HR (опц.)"
              value={athlete.maxHR}
              placeholder={`автомат: 220 - возраст`}
              onChange={(v) => setAthlete({ maxHR: v })}
            />
          </Section>

          {zones.length > 0 && (
            <Section title={`HR зоны (maxHR ≈ ${maxHR} уд/мин)`}>
              {zones.map((z) => (
                <ZoneRow key={z.index} zone={z} />
              ))}
            </Section>
          )}

          <Section title="Цели">
            <NumberRow
              label="Дистанция в неделю, км"
              value={goals.weeklyDistanceKm}
              placeholder="20"
              onChange={(v) => setGoals({ weeklyDistanceKm: v })}
            />
            <NumberRow
              label="Пробежек в месяц"
              value={goals.monthlySessionCount}
              placeholder="12"
              onChange={(v) => setGoals({ monthlySessionCount: v })}
            />
          </Section>

          <Text style={styles.hint}>
            HR зоны рассчитываются по %HRmax (упрощённо). Полная Karvonen-формула
            и LTHR estimation из истории — Phase 6.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function NumberRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(value !== null ? String(value) : '');
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          if (t.trim() === '') {
            onChange(null);
            return;
          }
          const n = parseFloat(t.replace(',', '.'));
          if (!Number.isNaN(n)) onChange(n);
        }}
        keyboardType="decimal-pad"
        style={styles.rowInput}
        placeholder={placeholder}
        placeholderTextColor="#475569"
      />
    </View>
  );
}

function DateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [text, setText] = useState(value ?? '');
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          if (t.trim() === '') {
            onChange(null);
            return;
          }
          // Принимаем YYYY-MM-DD строго
          if (/^\d{4}-\d{2}-\d{2}$/.test(t)) onChange(t);
        }}
        style={styles.rowInput}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#475569"
        autoCapitalize="none"
      />
    </View>
  );
}

function SexRow({
  value,
  onChange,
}: {
  value: Sex | null;
  onChange: (v: Sex | null) => void;
}) {
  const opts: { id: Sex; label: string }[] = [
    { id: 'male', label: 'М' },
    { id: 'female', label: 'Ж' },
    { id: 'other', label: '—' },
  ];
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>Пол</Text>
      <View style={styles.sexBtns}>
        {opts.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => onChange(value === o.id ? null : o.id)}
            style={[styles.sexBtn, value === o.id && styles.sexBtnActive]}
          >
            <Text style={[styles.sexText, value === o.id && styles.sexTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ZoneRow({ zone }: { zone: HRZone }) {
  return (
    <View style={styles.zoneRow}>
      <View style={[styles.zoneDot, { backgroundColor: zone.color }]} />
      <Text style={styles.zoneIdx}>Z{zone.index}</Text>
      <Text style={styles.zoneName}>{zone.name}</Text>
      <Text style={styles.zoneRange}>
        {zone.lowerBpm}–{zone.upperBpm}
      </Text>
    </View>
  );
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
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', flex: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#94A3B8', fontSize: 18 },

  scroll: { padding: 16, gap: 16 },
  section: {},
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionBody: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#0F1419',
  },
  rowLabel: { color: '#94A3B8', fontSize: 14, flex: 1 },
  rowInput: {
    color: '#FFFFFF',
    fontSize: 16,
    minWidth: 100,
    textAlign: 'right',
  },
  sexBtns: { flexDirection: 'row', gap: 6 },
  sexBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0F1419',
  },
  sexBtnActive: { backgroundColor: '#10B981' },
  sexText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  sexTextActive: { color: '#FFFFFF' },

  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  zoneDot: { width: 10, height: 10, borderRadius: 5 },
  zoneIdx: { color: '#94A3B8', fontSize: 12, width: 24 },
  zoneName: { color: '#FFFFFF', fontSize: 14, flex: 1 },
  zoneRange: { color: '#94A3B8', fontSize: 13, fontFamily: 'Courier' },

  hint: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
