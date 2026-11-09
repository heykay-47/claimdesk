export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const FILE_SIZE_ERROR =
  "This file is larger than 4 MB. Compress it or upload a smaller scan.";
export const FILE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
