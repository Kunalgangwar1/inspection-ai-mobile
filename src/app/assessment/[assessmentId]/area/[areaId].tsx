import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAreaById } from '@/constants/areas';

export default function AreaScreen() {
  const router = useRouter();
  const { assessmentId, areaId } = useLocalSearchParams<{
    assessmentId: string;
    areaId: string;
  }>();
  const area = getAreaById(areaId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to areas</Text>
        </Pressable>

        {area ? (
          <View style={styles.card}>
            <View style={styles.accent} />
            <Text style={styles.label}>Assessment:</Text>
            <Text selectable style={styles.value}>
              {assessmentId}
            </Text>

            <Text style={styles.label}>Area:</Text>
            <Text style={styles.areaName}>{area.displayName}</Text>

            <Text style={styles.label}>Backend area ID:</Text>
            <Text selectable style={styles.backendId}>
              {area.id}
            </Text>

            <Text style={styles.placeholder}>
              Media capture and upload will be added in a later phase.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.areaName}>Unknown area</Text>
            <Text style={styles.placeholder}>
              The backend area ID in this route is not supported.
            </Text>
          </View>
        )}
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
    padding: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    marginTop: 28,
    alignSelf: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  accent: {
    width: 48,
    height: 4,
    marginBottom: 24,
    borderRadius: 2,
    backgroundColor: '#2563EB',
  },
  label: {
    marginTop: 18,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: {
    marginTop: 6,
    color: '#374151',
    fontSize: 15,
  },
  areaName: {
    marginTop: 6,
    color: '#111827',
    fontSize: 26,
    fontWeight: '700',
  },
  backendId: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '600',
  },
  placeholder: {
    marginTop: 30,
    color: '#6B7280',
    fontSize: 15,
    lineHeight: 22,
  },
});
