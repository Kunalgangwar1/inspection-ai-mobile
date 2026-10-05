import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

const LOCAL_MEDIA_DIRECTORY_NAME = 'inspection-media';
const VIDEO_CONTENT_TYPE = 'video/mp4';
const STABLE_VIDEO_FILE_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/i;

export type StableLocalVideo = Readonly<{
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}>;

class LocalMediaPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalMediaPersistenceError';
  }
}

export function isStableLocalVideoFileName(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    STABLE_VIDEO_FILE_NAME_PATTERN.test(value)
  );
}

export async function persistLocalVideo(
  originalUri: string,
): Promise<StableLocalVideo> {
  if (!originalUri) {
    throw new LocalMediaPersistenceError(
      'The video does not have a local URI and could not be saved.',
    );
  }

  try {
    const source = new File(originalUri);

    if (!source.exists) {
      throw new LocalMediaPersistenceError(
        'The temporary video file is no longer available. Please try again.',
      );
    }

    if (!Number.isFinite(source.size) || source.size <= 0) {
      throw new LocalMediaPersistenceError(
        'The temporary video file is empty or cannot be read.',
      );
    }

    const sourceSize = source.size;
    const mediaDirectory = new Directory(
      Paths.document,
      LOCAL_MEDIA_DIRECTORY_NAME,
    );
    mediaDirectory.create({ idempotent: true, intermediates: true });

    if (!mediaDirectory.exists) {
      throw new LocalMediaPersistenceError(
        'The app could not prepare local storage for this video.',
      );
    }

    const fileName = `${Crypto.randomUUID()}.mp4`;
    const destination = new File(mediaDirectory, fileName);

    await source.copy(destination);

    if (!destination.exists) {
      throw new LocalMediaPersistenceError(
        'The video copy could not be found after it was saved.',
      );
    }

    if (!Number.isFinite(destination.size) || destination.size <= 0) {
      throw new LocalMediaPersistenceError(
        'The saved video copy is empty or cannot be read.',
      );
    }

    if (destination.size !== sourceSize) {
      throw new LocalMediaPersistenceError(
        'The saved video copy is incomplete. Please try again.',
      );
    }

    return {
      uri: destination.uri,
      fileName,
      mimeType: source.type || destination.type || VIDEO_CONTENT_TYPE,
      fileSize: destination.size,
    };
  } catch (error) {
    if (error instanceof LocalMediaPersistenceError) {
      throw error;
    }

    throw new LocalMediaPersistenceError(
      'The video could not be copied into app storage. Please try again.',
    );
  }
}

export function getLocalMediaErrorMessage(
  error: unknown,
  fallbackMessage = 'The video could not be saved on this device. Please try again.',
) {
  return error instanceof LocalMediaPersistenceError
    ? error.message
    : fallbackMessage;
}
