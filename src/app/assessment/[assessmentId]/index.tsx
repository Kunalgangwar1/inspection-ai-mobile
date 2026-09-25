import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAssessmentRealtime } from '@/hooks/useAssessmentRealtime';
import { deriveAssessmentSummary } from '@/services/assessmentSummary';

export default function AssessmentScreen() {
  const router = useRouter();
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const assessmentRealtime = useAssessmentRealtime(
    assessmentId,
    'assessment-overview',
  );
  const hasAssessmentData = assessmentRealtime.result !== null;
  const isLoading = !hasAssessmentData && !assessmentRealtime.error;
  const assessmentSummary = useMemo(
    () =>
      deriveAssessmentSummary({
        results: assessmentRealtime.result?.results,
        userOverrides: assessmentRealtime.result?.userOverrides,
        completedAreas: assessmentRealtime.result?.completedAreas,
      }),
    [assessmentRealtime.result],
  );

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
        {assessmentRealtime.error ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {assessmentRealtime.error}
          </Text>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#2563EB" size="large" />
            <Text style={styles.loadingText}>Loading assessment...</Text>
          </View>
        ) : hasAssessmentData ? (
          <>
            <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Assessment summary</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {assessmentSummary.areasComplete} / {assessmentSummary.totalAreas}
              </Text>
              <Text style={styles.summaryLabel}>Areas complete</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {assessmentSummary.evidenceReviewed}
              </Text>
              <Text style={styles.summaryLabel}>Evidence reviewed</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {assessmentSummary.compliantCount}
              </Text>
              <Text style={styles.summaryLabel}>Compliant</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {assessmentSummary.nonCompliantCount}
              </Text>
              <Text style={styles.summaryLabel}>Non-compliant</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {assessmentSummary.overrideCount}
              </Text>
              <Text style={styles.summaryLabel}>Inspector overrides</Text>
            </View>
          </View>
        </View>

        <Text style={styles.title}>Select an area</Text>

        <View style={styles.areaList}>
          {assessmentSummary.areas.map((area) => (
            <Pressable
              accessibilityRole="button"
              key={area.areaId}
              onPress={() =>
                router.push({
                  pathname:
                    '/assessment/[assessmentId]/area/[areaId]',
                  params: {
                    assessmentId,
                    areaId: area.areaId,
                  },
                })
              }
              style={({ pressed }) => [
                styles.areaCard,
                pressed && styles.areaCardPressed,
              ]}>
              <View style={styles.areaText}>
                <Text style={styles.areaName}>{area.displayName}</Text>
                <Text
                  style={[
                    styles.areaStatus,
                    area.isComplete
                      ? styles.completeStatus
                      : styles.notStartedStatus,
                  ]}>
                  {area.isComplete ? 'Analysis complete' : 'Not started'}
                </Text>

                {area.isComplete ? (
                  area.aiEvidenceCount === 0 ? (
                    <Text style={styles.noEvidenceText}>
                      No clear evidence identified
                    </Text>
                  ) : (
                    <View style={styles.areaCounts}>
                      <Text style={styles.compliantCount}>
                        {area.compliantCount} Compliant
                      </Text>
                      <Text style={styles.nonCompliantCount}>
                        {area.nonCompliantCount} Non-compliant
                      </Text>
                    </View>
                  )
                ) : null}

                {area.isComplete && area.overrideCount > 0 ? (
                  <Text style={styles.overrideCount}>
                    {area.overrideCount} Inspector override
                    {area.overrideCount === 1 ? '' : 's'}
                  </Text>
                ) : null}

                <Text style={styles.areaId}>
                  Backend ID: {area.areaId}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
          </>
        ) : null}
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
  loadingState: {
    marginTop: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#4B5563',
    fontSize: 15,
  },
  errorText: {
    marginTop: 14,
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryCard: {
    marginTop: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '700',
  },
  summaryGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryItem: {
    width: '47%',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  summaryValue: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },
  summaryLabel: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 17,
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
  areaStatus: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  completeStatus: {
    color: '#047857',
    backgroundColor: '#D1FAE5',
  },
  notStartedStatus: {
    color: '#4B5563',
    backgroundColor: '#E5E7EB',
  },
  areaCounts: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  compliantCount: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
  },
  nonCompliantCount: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
  },
  overrideCount: {
    marginTop: 8,
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
  noEvidenceText: {
    marginTop: 10,
    color: '#4B5563',
    fontSize: 13,
    lineHeight: 19,
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
