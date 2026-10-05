import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
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

type ClosableBlob = Blob & Readonly<{
  close?: () => void;
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

function getValidatedLocalVideoFile(media: MediaFile) {
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
    const file = new File(media.uri);
    const fileExists = file.exists;
    const fileSize = file.size;

    if (!fileExists) {
      throw new MediaUploadError(
        'media-upload/read-failed',
        'The selected video no longer exists or cannot be read from this device.',
      );
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new MediaUploadError(
        'media-upload/read-failed',
        'The selected video is empty or its size cannot be read.',
      );
    }

    return file;
  } catch (error) {
    if (error instanceof MediaUploadError) {
      throw error;
    }

    throw new MediaUploadError(
      'media-upload/read-failed',
      'The selected video could not be read from this device.',
    );
  }
}

function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.onload = () => {
      const blob = xhr.response as Blob | null;

      if (!blob || typeof blob.size !== 'number' || blob.size <= 0) {
        reject(
          new MediaUploadError(
            'media-upload/read-failed',
            'Video could not be converted to upload data.',
          ),
        );
        return;
      }

      resolve(blob);
    };

    xhr.onerror = () => {
      reject(
        new MediaUploadError(
          'media-upload/read-failed',
          'Could not read the selected video.',
        ),
      );
    };

    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

function releaseBlob(blob: Blob) {
  const closableBlob = blob as ClosableBlob;

  if (typeof closableBlob.close !== 'function') {
    return;
  }

  try {
    closableBlob.close();
  } catch {}
}

function observeUpload(
  uploadTask: UploadTask,
  onProgress?: (progress: UploadProgress) => void,
) {
  return new Promise<void>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;

    function detachListener() {
      unsubscribe?.();
      unsubscribe = undefined;
    }

    unsubscribe = uploadTask.on(
      'state_changed',
      (snapshot) => {
        const rawProgress =
          snapshot.totalBytes > 0
            ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            : 0;
        const calculatedProgress = Math.min(
          100,
          Math.max(0, rawProgress),
        );

        onProgress?.({
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
          percentage: calculatedProgress,
        });
      },
      (error) => {
        detachListener();
        reject(error);
      },
      () => {
        detachListener();
        resolve();
      },
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
    const file = getValidatedLocalVideoFile(media);
    let blob: Blob | null = null;

    try {
      if (cancelRequested) {
        throw new MediaUploadError(
          'media-upload/canceled',
          'The upload was canceled.',
        );
      }

      blob = await uriToBlob(file.uri);

      if (blob.size !== file.size) {
        throw new MediaUploadError(
          'media-upload/read-failed',
          'The converted video size does not match the local file.',
        );
      }

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
    } finally {
      if (blob) {
        releaseBlob(blob);
      }
    }
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
