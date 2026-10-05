import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getLocalMediaErrorMessage,
  persistLocalVideo,
} from '@/services/localMedia';

export default function CameraScreen() {
  const router = useRouter();
  const { assessmentId, areaId } = useLocalSearchParams<{
    assessmentId: string;
    areaId: string;
  }>();
  const cameraRef = useRef<CameraView>(null);
  const mountedRef = useRef(true);
  const discardRecordingRef = useRef(false);
  const requestedOnOpenRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] =
    useMicrophonePermissions();
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const areaRoute = useMemo(
    () => ({
      pathname: '/assessment/[assessmentId]/area/[areaId]' as const,
      params: { assessmentId, areaId },
    }),
    [areaId, assessmentId],
  );

  const leaveCamera = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(areaRoute);
  }, [areaRoute, router]);

  const requestRequiredPermissions = useCallback(async () => {
    if (!cameraPermission || !microphonePermission) {
      return;
    }

    setIsRequestingPermissions(true);
    setPermissionError(null);

    try {
      let nextCameraPermission = cameraPermission;

      if (
        !nextCameraPermission.granted &&
        nextCameraPermission.canAskAgain
      ) {
        nextCameraPermission = await requestCameraPermission();
      }

      if (!nextCameraPermission.granted) {
        setPermissionError(
          nextCameraPermission.canAskAgain
            ? 'Camera permission is required to record a video.'
            : 'Camera permission is denied. Enable camera access in Android Settings to continue.',
        );
        return;
      }

      let nextMicrophonePermission = microphonePermission;

      if (
        !nextMicrophonePermission.granted &&
        nextMicrophonePermission.canAskAgain
      ) {
        nextMicrophonePermission = await requestMicrophonePermission();
      }

      if (!nextMicrophonePermission.granted) {
        setPermissionError(
          nextMicrophonePermission.canAskAgain
            ? 'Microphone permission is required to record video with sound.'
            : 'Microphone permission is denied. Enable microphone access in Android Settings to continue.',
        );
      }
    } catch {
      setPermissionError(
        'Unable to request camera and microphone permissions. Please try again.',
      );
    } finally {
      if (mountedRef.current) {
        setIsRequestingPermissions(false);
      }
    }
  }, [
    cameraPermission,
    microphonePermission,
    requestCameraPermission,
    requestMicrophonePermission,
  ]);

  useEffect(() => {
    if (
      !cameraPermission ||
      !microphonePermission ||
      requestedOnOpenRef.current ||
      (cameraPermission.granted && microphonePermission.granted)
    ) {
      return;
    }

    requestedOnOpenRef.current = true;
    void requestRequiredPermissions();
  }, [
    cameraPermission,
    microphonePermission,
    requestRequiredPermissions,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      discardRecordingRef.current = true;
    };
  }, []);

  async function startRecording() {
    if (!cameraRef.current || !isCameraReady || isRecording) {
      setRecordingError('The camera is not ready yet. Please try again.');
      return;
    }

    discardRecordingRef.current = false;
    setRecordingError(null);
    setIsRecording(true);

    try {
      const result = await cameraRef.current.recordAsync();

      if (discardRecordingRef.current) {
        if (mountedRef.current) {
          leaveCamera();
        }
        return;
      }

      if (!result?.uri) {
        setRecordingError('The camera did not return a video. Please try again.');
        return;
      }

      const stableVideo = await persistLocalVideo(result.uri);

      if (discardRecordingRef.current) {
        if (mountedRef.current) {
          leaveCamera();
        }
        return;
      }

      router.dismissTo({
        ...areaRoute,
        params: {
          ...areaRoute.params,
          recordedFileName: stableVideo.fileName,
        },
      });
    } catch (error) {
      if (discardRecordingRef.current) {
        if (mountedRef.current) {
          leaveCamera();
        }
        return;
      }

      setRecordingError(
        getLocalMediaErrorMessage(
          error,
          'Video recording failed. Please try again.',
        ),
      );
    } finally {
      if (mountedRef.current) {
        setIsRecording(false);
        setIsStopping(false);
        setIsCancelling(false);
      }
    }
  }

  function stopRecording() {
    if (!cameraRef.current || !isRecording || isStopping) {
      return;
    }

    setIsStopping(true);

    try {
      cameraRef.current.stopRecording();
    } catch {
      setIsStopping(false);
      setRecordingError('Unable to stop the recording. Please try again.');
    }
  }

  function cancel() {
    if (!isRecording) {
      leaveCamera();
      return;
    }

    discardRecordingRef.current = true;
    setIsCancelling(true);

    try {
      cameraRef.current?.stopRecording();
    } catch {
      leaveCamera();
    }
  }

  const permissionsLoaded = cameraPermission && microphonePermission;
  const permissionsGranted =
    cameraPermission?.granted && microphonePermission?.granted;
  const blockingPermission = !cameraPermission?.granted
    ? cameraPermission
    : !microphonePermission?.granted
      ? microphonePermission
      : null;

  if (!permissionsLoaded || isRequestingPermissions) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#2563EB" size="large" />
        <Text style={styles.permissionText}>
          Requesting camera and microphone access...
        </Text>
      </SafeAreaView>
    );
  }

  if (!permissionsGranted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <StatusBar style="dark" />
        <Text style={styles.permissionTitle}>Camera access required</Text>
        <Text accessibilityRole="alert" style={styles.permissionText}>
          {permissionError ??
            'Camera and microphone permissions are required to record a video.'}
        </Text>

        {blockingPermission?.canAskAgain ? (
          <Pressable
            accessibilityRole="button"
            onPress={requestRequiredPermissions}
            style={({ pressed }) => [
              styles.permissionButton,
              pressed && styles.buttonPressed,
            ]}>
            <Text style={styles.permissionButtonText}>Try Again</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={leaveCamera}
          style={styles.permissionBackButton}>
          <Text style={styles.permissionBackText}>Back to area</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <CameraView
        facing="back"
        mode="video"
        mute={false}
        onCameraReady={() => setIsCameraReady(true)}
        onMountError={() =>
          setRecordingError(
            'The camera preview could not start. Please go back and try again.',
          )
        }
        ref={cameraRef}
        style={styles.camera}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          disabled={isCancelling}
          onPress={cancel}
          style={({ pressed }) => [
            styles.cancelButton,
            pressed && styles.buttonPressed,
          ]}>
          <Text style={styles.cancelText}>
            {isCancelling ? 'Cancelling...' : 'Cancel'}
          </Text>
        </Pressable>

        <View style={styles.controls}>
          {recordingError ? (
            <Text accessibilityRole="alert" style={styles.recordingError}>
              {recordingError}
            </Text>
          ) : null}

          {isRecording ? (
            <>
              <Text style={styles.recordingStatus}>Recording...</Text>
              <Pressable
                accessibilityRole="button"
                disabled={isStopping || isCancelling}
                onPress={stopRecording}
                style={({ pressed }) => [
                  styles.stopButton,
                  pressed && styles.buttonPressed,
                  (isStopping || isCancelling) && styles.buttonDisabled,
                ]}>
                <Text style={styles.stopButtonText}>
                  {isStopping ? 'Finishing...' : 'Stop Recording'}
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={!isCameraReady}
              onPress={startRecording}
              style={({ pressed }) => [
                styles.recordButton,
                pressed && styles.buttonPressed,
                !isCameraReady && styles.buttonDisabled,
              ]}>
              <Text style={styles.recordButtonText}>
                {isCameraReady ? 'Start Recording' : 'Starting camera...'}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'space-between',
    padding: 20,
  },
  cancelButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.78)',
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  controls: {
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(17, 24, 39, 0.78)',
  },
  recordButton: {
    width: '100%',
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#DC2626',
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  stopButton: {
    width: '100%',
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  stopButtonText: {
    color: '#B91C1C',
    fontSize: 17,
    fontWeight: '700',
  },
  recordingStatus: {
    color: '#FCA5A5',
    fontSize: 16,
    fontWeight: '700',
  },
  recordingError: {
    color: '#FECACA',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: '#F5F7FA',
  },
  permissionTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionText: {
    maxWidth: 420,
    color: '#4B5563',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  permissionButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionBackButton: {
    padding: 12,
  },
  permissionBackText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
