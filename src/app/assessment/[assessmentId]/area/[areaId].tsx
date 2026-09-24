import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAreaById } from '@/constants/areas';
import { useAssessmentRealtime } from '@/hooks/useAssessmentRealtime';
import {
  getMediaUploadErrorMessage,
  isMediaUploadCanceled,
  startMediaUpload,
  type MediaUploadOperation,
} from '@/services/mediaUpload';
import {
  getLocalMediaErrorMessage,
  persistLocalVideo,
  type StableLocalVideo,
} from '@/services/localMedia';
import { mapEvidenceResultsForArea } from '@/services/taxonomy';
import type { MediaFile } from '@/types/media';

type UploadStatus =
  | 'idle'
  | 'uploading'
  | 'canceling'
  | 'complete'
  | 'canceled'
  | 'error';

type UploadViewState = Readonly<{
  mediaUri: string | null;
  status: UploadStatus;
  objectPath: string | null;
  error: string | null;
}>;

const EMPTY_UPLOAD_STATE: UploadViewState = {
  mediaUri: null,
  status: 'idle',
  objectPath: null,
  error: null,
};

function normalizeVideo(
  asset: ImagePicker.ImagePickerAsset,
  stableVideo: StableLocalVideo,
): MediaFile {
  return {
    uri: stableVideo.uri,
    fileName: stableVideo.fileName,
    mimeType: asset.mimeType ?? stableVideo.mimeType,
    fileSize: stableVideo.fileSize,
    ...(typeof asset.duration === 'number'
      ? { duration: asset.duration / 1000 }
      : {}),
  };
}

function formatFileSize(bytes: number) {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  const fractionDigits = unitIndex === 0 || value >= 10 ? 0 : 1;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

export default function AreaScreen() {
  const router = useRouter();
  const { assessmentId, areaId, recordedFileName } = useLocalSearchParams<{
    assessmentId: string;
    areaId: string;
    recordedFileName?: string;
  }>();
  const area = getAreaById(areaId);
  const [localVideo, setLocalVideo] = useState<MediaFile | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [uploadState, setUploadState] =
    useState<UploadViewState>(EMPTY_UPLOAD_STATE);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadOperationRef = useRef<MediaUploadOperation | null>(null);
  const uploadProgressRef = useRef(0);
  const mountedRef = useRef(true);
  const recordedVideo = useMemo<MediaFile | null>(() => {
    if (!recordedFileName) {
      return null;
    }

    const mediaDirectory = new Directory(
      Paths.document,
      'inspection-media',
    );
    const recordedFile = new File(mediaDirectory, recordedFileName);
    const fileExists = recordedFile.exists;
    const fileSize = recordedFile.size;
    const fileType = recordedFile.type;

    if (__DEV__) {
      console.log('[area] RECONSTRUCTED RECORDING', {
        fileName: recordedFileName,
        uri: recordedFile.uri,
        exists: fileExists,
        size: fileSize,
        type: fileType,
      });
    }

    return {
      uri: recordedFile.uri,
      fileName: recordedFileName,
      mimeType: fileType || 'video/mp4',
      ...(fileExists && fileSize > 0 ? { fileSize } : {}),
    };
  }, [recordedFileName]);
  const selectedVideo = recordedVideo ?? localVideo;
  const currentUploadState =
    uploadState.mediaUri === (selectedVideo?.uri ?? null)
      ? uploadState
      : EMPTY_UPLOAD_STATE;
  const isUploading =
    uploadState.status === 'uploading' ||
    uploadState.status === 'canceling';
  const displayedProgress = Math.min(
    100,
    Math.max(0, uploadProgress),
  );
  const progressWidth =
    `${Math.round(displayedProgress)}%` as `${number}%`;
  const resultListenerKey =
    currentUploadState.status === 'complete'
      ? currentUploadState.objectPath
      : null;
  const assessmentRealtime = useAssessmentRealtime(
    assessmentId,
    resultListenerKey,
  );
  const analysisComplete =
    typeof assessmentRealtime.result?.evaluation_id === 'string' &&
    assessmentRealtime.result.evaluation_id.length > 0 &&
    assessmentRealtime.result.results !== undefined;
  const analysisResults = assessmentRealtime.result?.results;
  const mappedAreaResults = useMemo(
    () =>
      analysisComplete && analysisResults && area
        ? mapEvidenceResultsForArea(analysisResults, area.displayName)
        : null,
    [analysisComplete, analysisResults, area],
  );
  const hasAnyResults = analysisResults
    ? Object.keys(analysisResults).length > 0
    : false;

  useEffect(() => {
    const operationRef = uploadOperationRef;
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      operationRef.current?.cancel();
    };
  }, []);

  function resetUploadState() {
    setUploadState(EMPTY_UPLOAD_STATE);
  }

  async function selectVideo() {
    setIsPicking(true);
    setPickerError(null);
    resetUploadState();

    try {
      let permission = await ImagePicker.getMediaLibraryPermissionsAsync();

      if (!permission.granted && permission.canAskAgain) {
        permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (!permission.granted) {
        setPickerError(
          permission.canAskAgain
            ? 'Media library permission is required to select a video.'
            : 'Media library permission is denied. Enable photos and videos access in Android Settings to continue.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        allowsMultipleSelection: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        setPickerError('The picker did not return a video. Please try again.');
        return;
      }

      if (asset.type && asset.type !== 'video') {
        setPickerError(
          'The selected file is not a video. Please choose a video file.',
        );
        return;
      }

      const stableVideo = await persistLocalVideo(asset.uri, 'picker');

      setLocalVideo(normalizeVideo(asset, stableVideo));
      router.setParams({ recordedFileName: undefined });
    } catch (error) {
      setPickerError(
        getLocalMediaErrorMessage(
          error,
          'Unable to open the video picker. Please try again.',
        ),
      );
    } finally {
      setIsPicking(false);
    }
  }

  function removeVideo() {
    setLocalVideo(null);
    setPickerError(null);
    resetUploadState();
    router.setParams({ recordedFileName: undefined });
  }

  function recordVideo() {
    setPickerError(null);
    resetUploadState();
    router.push({
      pathname: '/assessment/[assessmentId]/area/camera',
      params: { assessmentId, areaId },
    });
  }

  async function uploadVideo() {
    if (uploadOperationRef.current || isUploading) {
      return;
    }

    if (!selectedVideo) {
      setUploadState({
        ...EMPTY_UPLOAD_STATE,
        status: 'error',
        error: 'Select or record a video before uploading.',
      });
      return;
    }

    if (!area) {
      setUploadState({
        ...EMPTY_UPLOAD_STATE,
        mediaUri: selectedVideo.uri,
        status: 'error',
        error: 'The area ID is not supported by the backend.',
      });
      return;
    }

    const mediaUri = selectedVideo.uri;
    let operation: MediaUploadOperation | null = null;
    let previousBytesTransferred: number | null = null;

    try {
      operation = startMediaUpload({
        assessmentId,
        areaId: area.id,
        media: selectedVideo,
        onProgress: ({ bytesTransferred, totalBytes, percentage }) => {
          if (
            !mountedRef.current ||
            !operation ||
            uploadOperationRef.current !== operation
          ) {
            return;
          }

          const activeOperation = operation;
          const bytesTransferredDecreased =
            previousBytesTransferred !== null &&
            bytesTransferred < previousBytesTransferred;
          previousBytesTransferred = bytesTransferred;
          const previousDisplayedProgress = uploadProgressRef.current;
          uploadProgressRef.current = Math.max(
            previousDisplayedProgress,
            percentage,
          );

          if (__DEV__) {
            console.log('[media-upload] progress', {
              operationId: activeOperation.fileId,
              objectPath: activeOperation.objectPath,
              bytesTransferred,
              totalBytes,
              calculatedProgress: percentage,
              previousDisplayedProgress,
              bytesTransferredDecreased,
            });
          }

          setUploadProgress((previous) => {
            if (uploadOperationRef.current !== activeOperation) {
              return previous;
            }

            return Math.max(previous, percentage);
          });
        },
      });

      uploadOperationRef.current = operation;
      uploadProgressRef.current = 0;
      setUploadProgress(0);
      setUploadState({
        mediaUri,
        status: 'uploading',
        objectPath: operation.objectPath,
        error: null,
      });

      await operation.completion;

      if (
        !mountedRef.current ||
        uploadOperationRef.current !== operation
      ) {
        return;
      }

      uploadProgressRef.current = 100;
      setUploadProgress(100);
      setUploadState({
        mediaUri,
        status: 'complete',
        objectPath: operation.objectPath,
        error: null,
      });
    } catch (error: unknown) {
      if (
        !mountedRef.current ||
        (operation && uploadOperationRef.current !== operation)
      ) {
        return;
      }

      setUploadState((current) => ({
        ...current,
        mediaUri,
        status: isMediaUploadCanceled(error) ? 'canceled' : 'error',
        error: getMediaUploadErrorMessage(error),
      }));
    } finally {
      if (uploadOperationRef.current === operation) {
        uploadOperationRef.current = null;
      }
    }
  }

  function cancelUpload() {
    if (!uploadOperationRef.current?.cancel()) {
      return;
    }

    setUploadState((current) => ({
      ...current,
      status: 'canceling',
      error: null,
    }));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
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

            <View style={styles.mediaSection}>
              <Text style={styles.mediaHeading}>Video</Text>

              {selectedVideo ? (
                <View style={styles.mediaDetails}>
                  <Text style={styles.detailLabel}>Filename</Text>
                  <Text selectable style={styles.detailValue}>
                    {selectedVideo.fileName ?? 'Unavailable'}
                  </Text>

                  <Text style={styles.detailLabel}>MIME type</Text>
                  <Text selectable style={styles.detailValue}>
                    {selectedVideo.mimeType ?? 'Unavailable'}
                  </Text>

                  {selectedVideo.fileSize !== undefined ? (
                    <>
                      <Text style={styles.detailLabel}>File size</Text>
                      <Text style={styles.detailValue}>
                        {formatFileSize(selectedVideo.fileSize)}
                      </Text>
                    </>
                  ) : null}

                  {selectedVideo.duration !== undefined ? (
                    <>
                      <Text style={styles.detailLabel}>Duration</Text>
                      <Text style={styles.detailValue}>
                        {selectedVideo.duration.toFixed(1)} seconds
                      </Text>
                    </>
                  ) : null}

                  {currentUploadState.status !== 'complete' ? (
                    <Text style={styles.readyText}>Ready for upload</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.mediaHelp}>
                  Select one existing video or record a new video to upload.
                </Text>
              )}

              {pickerError ? (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {pickerError}
                </Text>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isPicking || isUploading}
                  onPress={selectVideo}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    (isPicking || isUploading) && styles.buttonDisabled,
                  ]}>
                  {isPicking ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {isPicking
                      ? 'Opening library...'
                      : selectedVideo
                        ? 'Change Video'
                        : 'Select Video'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={isPicking || isUploading}
                  onPress={recordVideo}
                  style={({ pressed }) => [
                    styles.outlineButton,
                    pressed && styles.buttonPressed,
                    (isPicking || isUploading) && styles.buttonDisabled,
                  ]}>
                  <Text style={styles.outlineButtonText}>Record Video</Text>
                </Pressable>

                {selectedVideo ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPicking || isUploading}
                    onPress={removeVideo}
                    style={({ pressed }) => [
                      styles.removeButton,
                      pressed && styles.buttonPressed,
                      (isPicking || isUploading) && styles.buttonDisabled,
                    ]}>
                    <Text style={styles.removeButtonText}>Remove Video</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={
                    isPicking ||
                    isUploading ||
                    currentUploadState.status === 'complete'
                  }
                  onPress={uploadVideo}
                  style={({ pressed }) => [
                    styles.uploadButton,
                    pressed && styles.buttonPressed,
                    (isPicking ||
                      isUploading ||
                      currentUploadState.status === 'complete') &&
                      styles.buttonDisabled,
                  ]}>
                  {isUploading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : null}
                  <Text style={styles.uploadButtonText}>
                    {currentUploadState.status === 'complete'
                      ? 'Uploaded'
                      : isUploading
                        ? 'Uploading...'
                        : 'Upload Video'}
                  </Text>
                </Pressable>

                {isUploading ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={uploadState.status === 'canceling'}
                    onPress={cancelUpload}
                    style={({ pressed }) => [
                      styles.cancelUploadButton,
                      pressed && styles.buttonPressed,
                      uploadState.status === 'canceling' &&
                        styles.buttonDisabled,
                    ]}>
                    <Text style={styles.cancelUploadButtonText}>
                      {uploadState.status === 'canceling'
                        ? 'Canceling...'
                        : 'Cancel Upload'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {currentUploadState.status === 'uploading' ||
              currentUploadState.status === 'canceling' ? (
                <View style={styles.progressSection}>
                  <View
                    accessibilityRole="progressbar"
                    accessibilityValue={{
                      min: 0,
                      max: 100,
                      now: Math.round(displayedProgress),
                    }}
                    style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: progressWidth },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {Math.round(displayedProgress)}%
                  </Text>
                </View>
              ) : null}

              {currentUploadState.error ? (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {currentUploadState.error}
                </Text>
              ) : null}

              {currentUploadState.status === 'complete' ? (
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisHeading}>
                    {analysisComplete
                      ? 'Analysis complete'
                      : 'Processing...'}
                  </Text>

                  {assessmentRealtime.error ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {assessmentRealtime.error}
                    </Text>
                  ) : null}

                  {analysisComplete && !hasAnyResults ? (
                    <Text style={styles.analysisMessage}>
                      No clear evidence was identified in this video.
                    </Text>
                  ) : null}

                  {analysisComplete &&
                  hasAnyResults &&
                  mappedAreaResults?.groups.length === 0 &&
                  mappedAreaResults.unknownEvidence.length === 0 ? (
                    <Text style={styles.analysisMessage}>
                      No clear evidence was identified for this area.
                    </Text>
                  ) : null}

                  {mappedAreaResults?.groups.map((group) => (
                    <View key={group.itemId} style={styles.itemGroup}>
                      <Text style={styles.itemName}>{group.itemName}</Text>

                      <View style={styles.observationList}>
                        {group.evidence.map((evidence) => (
                          <View
                            key={evidence.evidenceId}
                            style={styles.observationCard}>
                            <Text
                              style={[
                                styles.evidenceResult,
                                evidence.state === 'COMPLIANT'
                                  ? styles.compliantResult
                                  : styles.nonCompliantResult,
                              ]}>
                              {evidence.state}
                            </Text>
                            <Text style={styles.observationDescription}>
                              {evidence.description}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}

                  {mappedAreaResults &&
                  mappedAreaResults.unknownEvidence.length > 0 ? (
                    <View style={styles.itemGroup}>
                      <Text style={styles.itemName}>Unmapped evidence</Text>

                      <View style={styles.observationList}>
                        {mappedAreaResults.unknownEvidence.map((evidence) => (
                          <View
                            key={evidence.evidenceId}
                            style={styles.observationCard}>
                            <Text
                              style={[
                                styles.evidenceResult,
                                evidence.state === 'COMPLIANT'
                                  ? styles.compliantResult
                                  : styles.nonCompliantResult,
                              ]}>
                              {evidence.state}
                            </Text>
                            <Text style={styles.observationDescription}>
                              Unknown evidence
                            </Text>
                            {__DEV__ ? (
                              <Text selectable style={styles.debugEvidenceId}>
                                {evidence.evidenceId}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {currentUploadState.objectPath ? (
                <View style={styles.debugSection}>
                  <Text style={styles.debugLabel}>Storage object path</Text>
                  <Text selectable style={styles.debugPath}>
                    {currentUploadState.objectPath}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.areaName}>Unknown area</Text>
            <Text style={styles.placeholder}>
              The backend area ID in this route is not supported.
            </Text>
          </View>
        )}
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
  mediaSection: {
    marginTop: 30,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  mediaHeading: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },
  mediaHelp: {
    marginTop: 8,
    color: '#6B7280',
    fontSize: 15,
    lineHeight: 22,
  },
  mediaDetails: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  detailLabel: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  detailValue: {
    marginTop: 4,
    color: '#1F2937',
    fontSize: 15,
  },
  readyText: {
    marginTop: 18,
    color: '#047857',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 14,
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    marginTop: 18,
    gap: 12,
  },
  primaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  outlineButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  outlineButtonText: {
    color: '#1D4ED8',
    fontSize: 16,
    fontWeight: '700',
  },
  removeButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  removeButtonText: {
    color: '#B91C1C',
    fontSize: 16,
    fontWeight: '700',
  },
  uploadButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#047857',
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelUploadButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  cancelUploadButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
  progressSection: {
    marginTop: 18,
    gap: 8,
  },
  progressTrack: {
    height: 10,
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: '#D1D5DB',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#059669',
  },
  progressText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  analysisSection: {
    marginTop: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  analysisHeading: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
  },
  analysisMessage: {
    marginTop: 10,
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
  },
  itemGroup: {
    marginTop: 18,
  },
  itemName: {
    color: '#1F2937',
    fontSize: 17,
    fontWeight: '700',
  },
  observationList: {
    marginTop: 10,
    gap: 10,
  },
  observationCard: {
    gap: 9,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  observationDescription: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 21,
  },
  debugEvidenceId: {
    color: '#6B7280',
    fontSize: 11,
    lineHeight: 16,
  },
  evidenceResult: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  debugSection: {
    marginTop: 18,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
  },
  debugLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  debugPath: {
    marginTop: 5,
    color: '#4B5563',
    fontSize: 11,
    lineHeight: 16,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  placeholder: {
    marginTop: 18,
    color: '#6B7280',
    fontSize: 15,
    lineHeight: 22,
  },
});
