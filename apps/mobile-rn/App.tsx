import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Running Ecosystem</Text>
      <Text style={styles.subtitle}>Phase 0 — RN prototype (P0-B-01)</Text>
      <Text style={styles.hint}>
        Следующий шаг: P0-B-02 — карта Mapbox с user location.{'\n'}
        См. /docs/DEVELOPMENT_PLAN.md
      </Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#94A3B8', fontSize: 14, marginBottom: 24 },
  hint: { color: '#64748B', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
