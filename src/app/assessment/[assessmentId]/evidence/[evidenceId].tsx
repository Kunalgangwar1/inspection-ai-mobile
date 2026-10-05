import { useEventListener } from 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  clearEvidenceOverride,
  getAssessmentOverrideErrorMessage,
  setEvidenceOverride,
} from '@/services/assessmentOverrides';
import {
  getEvidenceSegments,
  EvidenceSegmentsError,
  type EvidenceSegment,
} from '@/services/evidenceSegments';
import {
  getEffectiveEvidenceState,
  type EvidenceState,
} from '@/services/taxonomy';

type ClipLoadStatus = 'loading' | 'ready' | 'empty' | 'error';

type EvidenceClipPlayerProps = Readonly<{
  segment: EvidenceSegment;
  onPlaybackError: () => void;
}>;

function EvidenceClipPlayer({
  segment,
  onPlaybackError,
}: EvidenceClipPlayerProps) {
  const player = useVideoPlayer({
    uri: segment.signedUrl,
    useCaching: false,
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') {
      onPlaybackError();
    }
  });

  return (
    <VideoView
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      nativeControls
      player={player}
      style={styles.video}
    />
  );
}

type EvidenceStateBadgeProps = Readonly<{
  state: EvidenceState;
}>;

function EvidenceStateBadge({ state }: EvidenceStateBadgeProps) {
  return (
    <Text
      style={[
        styles.evidenceResult,
        state === 'COMPLIANT'
          ? styles.compliantResult
          : styles.nonCompliantResult,
      ]}>
      {state}
    </Text>
  );
}

export default function EvidenceReviewScreen() {
  const router = useRouter();
  const {
    assessmentId,
    evidenceId,
    itemName,
    description,
    aiState: routedAiStateParam,
    state: legacyAiStateParam,
  } = useLocalSearchParams<{
    assessmentId: string;
    evidenceId: string;
    itemName?: string;
    description?: string;
    aiState?: string;
    state?: string;
  }>();
  const [loadStatus, setLoadStatus] = useState<ClipLoadStatus>('loading');
  const [segments, setSegments] = useState<readonly EvidenceSegment[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const assessmentRealtime = useAssessmentRealtime(
    assessmentId,
    'evidence:' + evidenceId,
  );
  const routedAiState: EvidenceState | null =
    routedAiStateParam === 'COMPLIANT' ||
    routedAiStateParam === 'NON_COMPLIANT'
      ? routedAiStateParam
      : legacyAiStateParam === 'COMPLIANT' ||
          legacyAiStateParam === 'NON_COMPLIANT'
        ? legacyAiStateParam
        : null;
  const confirmedAiState =
    assessmentRealtime.result?.results?.[evidenceId];
  const aiState = confirmedAiState ?? routedAiState;
  const overrideState =
    confirmedAiState !== undefined
      ? assessmentRealtime.result?.userOverrides[evidenceId]
      : undefined;
  const effectiveState = aiState
    ? getEffectiveEvidenceState(aiState, overrideState)
    : null;
  const oppositeState: EvidenceState | null =
    confirmedAiState === 'COMPLIANT'
      ? 'NON_COMPLIANT'
      : confirmedAiState === 'NON_COMPLIANT'
        ? 'COMPLIANT'
        : null;

  const loadSegments = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadStatus('loading');
    setSegments([]);
    setSelectedClipIndex(0);
    setPlaybackFailed(false);
    setClipError(null);

    try {
      const response = await getEvidenceSegments(assessmentId, evidenceId);

      if (requestIdRef.current !== requestId) {
        return;
      }

      setSegments(response.segments);
      setLoadStatus(response.segments.length > 0 ? 'ready' : 'empty');
    } catch (error: unknown) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setLoadStatus('error');
      setClipError(
        error instanceof EvidenceSegmentsError
          ? error.message
          : 'Unable to load evidence clip.',
      );
    }
  }, [assessmentId, evidenceId]);

  useEffect(() => {
    const loadTimeout = setTimeout(() => {
      void loadSegments();
    }, 0);

    return () => {
      clearTimeout(loadTimeout);
      requestIdRef.current += 1;
    };
  }, [loadSegments]);

  const selectedSegment = segments[selectedClipIndex];

  function selectClip(index: number) {
    setPlaybackFailed(false);
    setSelectedClipIndex(index);
  }

  async function saveOppositeOverride() {
    if (!oppositeState || isSavingOverride) {
      return;
    }

    setIsSavingOverride(true);
    setOverrideError(null);

    try {
      await setEvidenceOverride(assessmentId, evidenceId, oppositeState);
    } catch (error: unknown) {
      setOverrideError(getAssessmentOverrideErrorMessage(error));
    } finally {
      setIsSavingOverride(false);
    }
  }

  async function restoreAiResult() {
    if (overrideState === undefined || isSavingOverride) {
      return;
    }

    setIsSavingOverride(true);
    setOverrideError(null);

    try {
      await clearEvidenceOverride(assessmentId, evidenceId);
    } catch (error: unknown) {
      setOverrideError(getAssessmentOverrideErrorMessage(error));
    } finally {
      setIsSavingOverride(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to results</Text>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.accent} />
          <Text style={styles.eyebrow}>Evidence review</Text>
          <Text style={styles.itemName}>{itemName ?? 'Inspection item'}</Text>

          <Text style={styles.description}>
            {description ?? 'Evidence details are unavailable.'}
          </Text>

          <View style={styles.decisionSection}>
            <Text style={styles.decisionTitle}>Inspector decision</Text>

            {aiState ? (
              <>
                <Text style={styles.decisionLabel}>AI result</Text>
                <EvidenceStateBadge state={aiState} />
              </>
            ) : (
              <Text style={styles.decisionMessage}>
                AI result is unavailable.
              </Text>
            )}

            {confirmedAiState !== undefined && effectiveState ? (
              <>
                {overrideState !== undefined ? (
                  <>
                    <Text style={styles.decisionLabel}>
                      Inspector override
                    </Text>
                    <EvidenceStateBadge state={overrideState} />
                  </>
                ) : (
                  <>
                    <Text style={styles.decisionLabel}>
                      Inspector decision
                    </Text>
                    <Text style={styles.decisionMessage}>
                      Using AI result
                    </Text>
                  </>
                )}

                <Text style={styles.decisionLabel}>Effective result</Text>
                <EvidenceStateBadge state={effectiveState} />

                {overrideError ? (
                  <Text accessibilityRole="alert" style={styles.overrideError}>
                    {overrideError}
                  </Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={isSavingOverride}
                  onPress={() =>
                    void (overrideState !== undefined
                      ? restoreAiResult()
                      : saveOppositeOverride())
                  }
                  style={({ pressed }) => [
                    styles.decisionButton,
                    pressed && styles.buttonPressed,
                    isSavingOverride && styles.buttonDisabled,
                  ]}>
                  {isSavingOverride ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : null}
                  <Text style={styles.decisionButtonText}>
                    {isSavingOverride
                      ? 'Saving...'
                      : overrideState !== undefined
                        ? 'Restore AI result'
                        : 'Override to ' + oppositeState}
                  </Text>
                </Pressable>
              </>
            ) : assessmentRealtime.error ? (
              <Text accessibilityRole="alert" style={styles.overrideError}>
                {assessmentRealtime.error}
              </Text>
            ) : (
              <Text style={styles.decisionMessage}>
                Loading inspector decision...
              </Text>
            )}
          </View>

          <View style={styles.clipSection}>
            {loadStatus === 'loading' ? (
              <View style={styles.centeredState}>
                <ActivityIndicator color="#2563EB" size="large" />
                <Text style={styles.stateText}>Loading evidence clip...</Text>
              </View>
            ) : null}

            {loadStatus === 'empty' ? (
              <Text style={styles.stateText}>
                No evidence clip is available for this result.
              </Text>
            ) : null}

            {loadStatus === 'error' || playbackFailed ? (
              <View style={styles.centeredState}>
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {playbackFailed
                    ? 'Evidence clip playback failed. Retry to request a fresh clip.'
                    : clipError ?? 'Unable to load evidence clip.'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadSegments()}
                  style={({ pressed }) => [
                    styles.retryButton,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {loadStatus === 'ready' &&
            selectedSegment &&
            !playbackFailed ? (
              <>
                {segments.length > 1 ? (
                  <Text style={styles.clipCount}>
                    Clip {selectedClipIndex + 1} of {segments.length}
                  </Text>
                ) : null}

                <EvidenceClipPlayer
                  key={selectedSegment.signedUrl}
                  onPlaybackError={() => setPlaybackFailed(true)}
                  segment={selectedSegment}
                />

                {segments.length > 1 ? (
                  <View style={styles.clipActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={selectedClipIndex === 0}
                      onPress={() => selectClip(selectedClipIndex - 1)}
                      style={({ pressed }) => [
                        styles.clipButton,
                        pressed && styles.buttonPressed,
                        selectedClipIndex === 0 && styles.buttonDisabled,
                      ]}>
                      <Text style={styles.clipButtonText}>Previous</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      disabled={selectedClipIndex === segments.length - 1}
                      onPress={() => selectClip(selectedClipIndex + 1)}
                      style={({ pressed }) => [
                        styles.clipButton,
                        pressed && styles.buttonPressed,
                        selectedClipIndex === segments.length - 1 &&
                          styles.buttonDisabled,
                      ]}>
                      <Text style={styles.clipButtonText}>Next</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
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
    paddingBottom: 40,
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
    marginBottom: 20,
    borderRadius: 2,
    backgroundColor: '#2563EB',
  },
  eyebrow: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  itemName: {
    marginTop: 8,
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 31,
  },
  decisionSection: {
    marginTop: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  decisionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
  },
  decisionLabel: {
    marginTop: 16,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  decisionMessage: {
    marginTop: 7,
    color: '#374151',
    fontSize: 15,
    lineHeight: 22,
  },
  overrideError: {
    marginTop: 14,
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  decisionButton: {
    minHeight: 48,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#2563EB',
  },
  decisionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  evidenceResult: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: 'hidden',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '800',
  },
  compliantResult: {
    color: '#047857',
    backgroundColor: '#D1FAE5',
  },
  nonCompliantResult: {
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
  },
  description: {
    marginTop: 14,
    color: '#374151',
    fontSize: 16,
    lineHeight: 24,
  },
  clipSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  centeredState: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 24,
  },
  stateText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    minWidth: 120,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#2563EB',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  clipCount: {
    marginBottom: 10,
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: '#000000',
  },
  clipActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 12,
  },
  clipButton: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  clipButtonText: {
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
