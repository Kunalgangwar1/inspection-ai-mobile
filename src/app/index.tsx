import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <View style={styles.accent} />
        <Text style={styles.title}>AI Inspection</Text>
        <Text style={styles.subtitle}>Mobile Frontend</Text>
        <Text style={styles.status}>Phase 1 - Environment Ready</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  accent: {
    width: 48,
    height: 4,
    marginBottom: 24,
    borderRadius: 2,
    backgroundColor: '#2563EB',
  },
  title: {
    color: '#111827',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    color: '#4B5563',
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  status: {
    marginTop: 32,
    paddingHorizontal: 18,
    paddingVertical: 10,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
