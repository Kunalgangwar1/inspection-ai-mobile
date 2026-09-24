import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AREAS } from '@/constants/areas';

export default function AssessmentScreen() {
  const router = useRouter();
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>Assessment</Text>
        <Text selectable style={styles.assessmentId}>
          {assessmentId}
        </Text>
        <Text style={styles.title}>Select an area</Text>

        <View style={styles.areaList}>
          {AREAS.map((area) => (
            <Pressable
              accessibilityRole="button"
              key={area.id}
              onPress={() =>
                router.push({
                  pathname:
                    '/assessment/[assessmentId]/area/[areaId]',
                  params: {
                    assessmentId,
                    areaId: area.id,
                  },
                })
              }
              style={({ pressed }) => [
                styles.areaCard,
                pressed && styles.areaCardPressed,
              ]}>
              <View style={styles.areaText}>
                <Text style={styles.areaName}>{area.displayName}</Text>
                <Text style={styles.areaId}>Backend ID: {area.id}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    flexGrow: 1,
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
  eyebrow: {
    marginTop: 18,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  assessmentId: {
    marginTop: 6,
    color: '#374151',
    fontSize: 14,
  },
  title: {
    marginTop: 24,
    color: '#111827',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  areaList: {
    marginTop: 22,
    gap: 12,
  },
  areaCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  areaCardPressed: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  areaText: {
    flex: 1,
  },
  areaName: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '600',
  },
  areaId: {
    marginTop: 5,
    color: '#6B7280',
    fontSize: 13,
  },
  chevron: {
    marginLeft: 12,
    color: '#2563EB',
    fontSize: 30,
    lineHeight: 32,
  },
});
