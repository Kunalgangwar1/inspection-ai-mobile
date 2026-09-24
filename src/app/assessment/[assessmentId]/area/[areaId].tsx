import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
import type { MediaFile } from '@/types/media';
import { mediaFileFromRecordedUri } from '@/utils/media';

function normalizeVideo(asset: ImagePicker.ImagePickerAsset): MediaFile {
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
    ...(typeof asset.fileSize === 'number' ? { fileSize: asset.fileSize } : {}),
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
  const { assessmentId, areaId, recordedUri } = useLocalSearchParams<{
    assessmentId: string;
    areaId: string;
    recordedUri?: string;
  }>();
  const area = getAreaById(areaId);
  const [localVideo, setLocalVideo] = useState<MediaFile | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const selectedVideo = recordedUri
    ? mediaFileFromRecordedUri(recordedUri)
    : localVideo;

  async function selectVideo() {
    setIsPicking(true);
    setPickerError(null);

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

      setLocalVideo(normalizeVideo(asset));
      router.setParams({ recordedUri: undefined });
    } catch {
      setPickerError('Unable to open the video picker. Please try again.');
    } finally {
      setIsPicking(false);
    }
  }

  function removeVideo() {
    setLocalVideo(null);
    setPickerError(null);
    router.setParams({ recordedUri: undefined });
  }

  function recordVideo() {
    setPickerError(null);
    router.push({
      pathname: '/assessment/[assessmentId]/area/camera',
      params: { assessmentId, areaId },
    });
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

                  <Text style={styles.readyText}>Ready for upload</Text>
                </View>
              ) : (
                <Text style={styles.mediaHelp}>
                  Select one existing video or record a new video. Nothing will
                  be uploaded in this phase.
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
                  disabled={isPicking}
                  onPress={selectVideo}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    isPicking && styles.buttonDisabled,
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
                  disabled={isPicking}
                  onPress={recordVideo}
                  style={({ pressed }) => [
                    styles.outlineButton,
                    pressed && styles.buttonPressed,
                    isPicking && styles.buttonDisabled,
                  ]}>
                  <Text style={styles.outlineButtonText}>Record Video</Text>
                </Pressable>

                {selectedVideo ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPicking}
                    onPress={removeVideo}
                    style={({ pressed }) => [
                      styles.removeButton,
                      pressed && styles.buttonPressed,
                      isPicking && styles.buttonDisabled,
                    ]}>
                    <Text style={styles.removeButtonText}>Remove Video</Text>
                  </Pressable>
                ) : null}
              </View>
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
