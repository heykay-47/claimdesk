import "server-only";
import { get, put } from "@vercel/blob";
import { z } from "zod";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
const uploadSchema = z.object({
  claimId: z.uuid(),
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(FILE_MIME_TYPES),
});
export async function putDocument(input: {
  claimId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const parsed = uploadSchema.parse(input);
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_FILE_BYTES)
    throw new Error("File must be between 1 byte and 10 MB");
  const safeName = parsed.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(
    `claims/${parsed.claimId}/${safeName}`,
    Buffer.from(input.bytes),
    { access: "private", addRandomSuffix: true, contentType: parsed.mimeType },
  );
  return { pathname: blob.pathname, size: input.bytes.byteLength };
}
export async function readDocument(pathname: string) {
  return get(pathname, { access: "private", useCache: false });
}
