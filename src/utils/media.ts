import type { MediaFile } from '@/types/media';

const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
  webm: 'video/webm',
};

function fileNameFromUri(uri: string) {
  const candidate = uri.split(/[?#]/, 1)[0].split('/').pop();

  if (!candidate) {
    return null;
  }

  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
}

export function mediaFileFromRecordedUri(uri: string): MediaFile {
  const fileName = fileNameFromUri(uri);
  const extension = fileName?.split('.').pop()?.toLowerCase();

  return {
    uri,
    fileName,
    mimeType: extension ? (MIME_TYPES_BY_EXTENSION[extension] ?? null) : null,
  };
}
