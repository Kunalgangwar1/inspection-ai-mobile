import * as Crypto from 'expo-crypto';
import { FirebaseError } from 'firebase/app';
import {
  ref,
  uploadBytesResumable,
  type UploadTask,
} from 'firebase/storage';

import { getAreaById } from '@/constants/areas';
import { rawMediaStorage } from '@/services/firebase';
import type { MediaFile } from '@/types/media';

const SAFE_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const VIDEO_CONTENT_TYPE = 'video/mp4';

type UploadErrorCode =
  | 'media-upload/canceled'
  | 'media-upload/invalid-assessment-id'
  | 'media-upload/invalid-area-id'
  | 'media-upload/invalid-file-id'
  | 'media-upload/not-mp4'
  | 'media-upload/read-failed';

class MediaUploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message: string) {
    super(message);
    this.name = 'MediaUploadError';
    this.code = code;
  }
}

export type UploadProgress = Readonly<{
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}>;

export type MediaUploadOperation = Readonly<{
  fileId: string;
  objectPath: string;
  completion: Promise<void>;
  cancel: () => boolean;
}>;

type StartMediaUploadOptions = Readonly<{
  assessmentId: string;
  areaId: string;
  media: MediaFile;
  onProgress?: (progress: UploadProgress) => void;
}>;

function validateSafeId(value: string, label: 'assessmentId' | 'fileId') {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new MediaUploadError(
      label === 'assessmentId'
        ? 'media-upload/invalid-assessment-id'
        : 'media-upload/invalid-file-id',
      `${label} must contain only letters, digits, and hyphens.`,
    );
  }
}

function isMp4Media(media: MediaFile) {
  if (media.mimeType) {
    return media.mimeType.toLowerCase() === VIDEO_CONTENT_TYPE;
  }

  return [media.fileName, media.uri].some((value) =>
    value ? /\.mp4(?:[?#]|$)/i.test(value) : false,
  );
}

export function buildVideoObjectPath(
  assessmentId: string,
  fileId: string,
  areaId: string,
) {
  validateSafeId(assessmentId, 'assessmentId');
  validateSafeId(fileId, 'fileId');

  if (!getAreaById(areaId)) {
    throw new MediaUploadError(
      'media-upload/invalid-area-id',
      'The area ID is not supported by the backend.',
    );
  }

  return `${assessmentId}_${fileId}_video/${areaId}/video_${areaId}.mp4`;
}

async function readLocalVideo(media: MediaFile) {
  if (!media.uri) {
    throw new MediaUploadError(
      'media-upload/read-failed',
      'The selected video does not have a local URI.',
    );
  }

  if (!isMp4Media(media)) {
    throw new MediaUploadError(
      'media-upload/not-mp4',
      'Only MP4 videos can be uploaded for processing.',
    );
  }

  try {
    const response = await fetch(media.uri);
    const blob = await response.blob();

    if (blob.size === 0) {
      throw new Error('The local video is empty.');
    }

    return blob;
  } catch {
    throw new MediaUploadError(
      'media-upload/read-failed',
      'The selected video could not be read from this device.',
    );
  }
}

function observeUpload(
  uploadTask: UploadTask,
  onProgress?: (progress: UploadProgress) => void,
) {
  return new Promise<void>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const percentage =
          snapshot.totalBytes > 0
            ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            : 0;

        onProgress?.({
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
          percentage,
        });
      },
      reject,
      resolve,
    );
  });
}

export function startMediaUpload({
  assessmentId,
  areaId,
  media,
  onProgress,
}: StartMediaUploadOptions): MediaUploadOperation {
  const fileId = Crypto.randomUUID();
  const objectPath = buildVideoObjectPath(assessmentId, fileId, areaId);
  let uploadTask: UploadTask | null = null;
  let cancelRequested = false;

  const completion = (async () => {
    const blob = await readLocalVideo(media);

    if (cancelRequested) {
      throw new MediaUploadError(
        'media-upload/canceled',
        'The upload was canceled.',
      );
    }

    uploadTask = uploadBytesResumable(
      ref(rawMediaStorage, objectPath),
      blob,
      { contentType: VIDEO_CONTENT_TYPE },
    );

    await observeUpload(uploadTask, onProgress);
  })();

  return {
    fileId,
    objectPath,
    completion,
    cancel: () => {
      cancelRequested = true;
      return uploadTask?.cancel() ?? true;
    },
  };
}

export function isMediaUploadCanceled(error: unknown) {
  return (
    (error instanceof MediaUploadError &&
      error.code === 'media-upload/canceled') ||
    (error instanceof FirebaseError && error.code === 'storage/canceled')
  );
}

export function getMediaUploadErrorMessage(error: unknown) {
  if (error instanceof MediaUploadError) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'storage/unauthenticated':
        return 'Your session is no longer authenticated. Sign in and try again.';
      case 'storage/unauthorized':
        return 'Upload permission was denied by Firebase Storage.';
      case 'storage/retry-limit-exceeded':
        return 'The upload timed out. Check your network connection and try again.';
      case 'storage/canceled':
        return 'Upload canceled.';
      default:
        return 'The video could not be uploaded. Please try again.';
    }
  }

  return 'The video could not be uploaded. Check your network connection and try again.';
}
