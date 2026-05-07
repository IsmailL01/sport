// Экран для подключения HR-сенсора (BLE). Phase 5 / P5-A-05.

import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSensorsStore } from '../state/sensors';

export type SensorsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function SensorsModal({ visible, onClose }: SensorsModalProps) {
  const status = useSensorsStore((s) => s.status);
  const discovered = useSensorsStore((s) => s.discovered);
  const connectedSensorId = useSensorsStore((s) => s.connectedSensorId);
  const connectedSensorName = useSensorsStore((s) => s.connectedSensorName);
  const liveHrBpm = useSensorsStore((s) => s.liveHrBpm);

  const startScan = useSensorsStore((s) => s.startScan);
  const stopScan = useSensorsStore((s) => s.stopScan);
  const connect = useSensorsStore((s) => s.connect);
  const disconnect = useSensorsStore((s) => s.disconnect);

  useEffect(() => {
    if (visible && status === 'disconnected') {
      startScan().catch((e) => console.warn('[sensors] scan failed', e));
    }
    return () => {
      if (status === 'scanning') stopScan().catch(() => {});
    };
  }, [visible, status, startScan, stopScan]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Сенсоры</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        {/* Connected card */}
        {status === 'connected' && (
          <View style={styles.connectedCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.connectedLabel}>Подключено</Text>
              <Text style={styles.connectedName}>{connectedSensorName}</Text>
              {liveHrBpm !== null && (
                <Text style={styles.connectedHr}>♥ {liveHrBpm} уд/мин</Text>
              )}
            </View>
            <Pressable style={styles.btnDanger} onPress={() => disconnect().catch(() => {})}>
              <Text style={styles.btnText}>Отключить</Text>
            </Pressable>
          </View>
        )}

        {status !== 'connected' && (
          <View style={styles.scanCard}>
            <Text style={styles.scanLabel}>
              {status === 'scanning' && 'Поиск устройств…'}
              {status === 'connecting' && 'Подключаемся…'}
              {status === 'disconnected' && 'Поиск HR-датчиков'}
              {status === 'error' && 'Ошибка'}
            </Text>
            {status === 'scanning' && <ActivityIndicator color="#10B981" />}
            <View style={styles.scanBtns}>
              {status === 'scanning' ? (
                <Pressable
                  style={styles.btnSecondary}
                  onPress={() => stopScan().catch(() => {})}
                >
                  <Text style={styles.btnText}>Остановить</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.btnPrimary}
                  onPress={() => startScan().catch(() => {})}
                  disabled={status === 'connecting'}
                >
                  <Text style={styles.btnText}>Сканировать</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Найденные устройства</Text>
        <FlatList
          data={discovered}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {status === 'scanning' ? 'Ищем…' : 'Нажмите «Сканировать»'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.services.join(', ')}
                  {item.rssi !== null && `  ·  ${item.rssi} dBm`}
                </Text>
              </View>
              {connectedSensorId === item.id ? (
                <View style={styles.badgeOn}>
                  <Text style={styles.badgeText}>ON</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.btnPrimary}
                  onPress={() => connect(item.id, item.name).catch(() => {})}
                  disabled={status === 'connecting'}
                >
                  <Text style={styles.btnText}>Подключить</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      </View>
    </Modal>
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

  connectedCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectedLabel: { color: '#10B981', fontSize: 11, textTransform: 'uppercase' },
  connectedName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 2 },
  connectedHr: { color: '#10B981', fontSize: 14, fontWeight: '600', marginTop: 4 },

  scanCard: {
    backgroundColor: '#1E293B',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },
  scanLabel: { color: '#94A3B8', fontSize: 14 },
  scanBtns: { flexDirection: 'row', gap: 8 },

  sectionTitle: {
    color: '#94A3B8',
    fontSize: 11,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  list: { padding: 16, gap: 8 },
  empty: { color: '#64748B', fontSize: 13, textAlign: 'center', padding: 24 },
  row: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  rowMeta: { color: '#64748B', fontSize: 12, marginTop: 2 },

  btnPrimary: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnSecondary: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnDanger: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  badgeOn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});
