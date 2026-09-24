export type MediaFile = Readonly<{
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize?: number;
  duration?: number;
}>;
