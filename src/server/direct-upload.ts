import "server-only";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, claims, documents } from "@/db/schema";
import { requireUser } from "./auth";
import { audit } from "./audit";
import { FILE_MIME_TYPES, MAX_FILE_BYTES, readDocument } from "./storage";
import { InputError, processDocument } from "./mutations";
import type { AiClient } from "@/ai/client";
const metadata = z.object({
  claimId: z.uuid(),
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(FILE_MIME_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
});
function pathname(
  data: z.infer<typeof metadata>,
  userId: string,
  uploadId: string,
) {
  return `claims/${data.claimId}/${userId}/${uploadId}/${data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
export async function prepareDirectUpload(input: unknown) {
  const user = await requireUser();
  const data = metadata.parse(input);
  const [claim] = await db()
    .select({ id: claims.id })
    .from(claims)
    .where(eq(claims.id, data.claimId));
  if (!claim) throw new InputError("Claim not found");
  const uploadId = crypto.randomUUID();
  const path = pathname(data, user.id, uploadId);
  const token = await generateClientTokenFromReadWriteToken({
    pathname: path,
    allowedContentTypes: [data.mimeType],
    maximumSizeInBytes: data.sizeBytes,
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil: Date.now() + 5 * 60_000,
  });
  await audit({
    actorId: user.id,
    action: "DOCUMENT_UPLOAD_TOKEN",
    entityType: "document",
    entityId: uploadId,
    detail: { claimId: data.claimId },
  });
  return { token, pathname: path, uploadId };
}
export async function completeDirectUpload(input: unknown, client?: AiClient) {
  const user = await requireUser();
  const data = metadata.extend({ uploadId: z.uuid() }).parse(input);
  const path = pathname(data, user.id, data.uploadId);
  const [permit] = await db()
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityId, data.uploadId),
        eq(auditLogs.actorId, user.id),
        eq(auditLogs.action, "DOCUMENT_UPLOAD_TOKEN"),
      ),
    );
  if (!permit)
    throw new InputError("Upload permission not found. Choose the file again.");
  const blob = await readDocument(path);
  if (
    !blob ||
    blob.statusCode !== 200 ||
    blob.blob.size !== data.sizeBytes ||
    blob.blob.contentType !== data.mimeType
  )
    throw new InputError(
      "The uploaded file did not match the one you chose. Choose the file again.",
    );
  const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
  if (bytes.byteLength !== data.sizeBytes || bytes.byteLength > MAX_FILE_BYTES)
    throw new InputError("The uploaded file is not the size expected. Choose the file again.");
  await db().transaction(async (tx) => {
    const [claim] = await tx
      .select({ id: claims.id })
      .from(claims)
      .where(eq(claims.id, data.claimId))
      .for("update");
    if (!claim) throw new InputError("Claim not found");
    const [existing] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, data.uploadId));
    if (existing) return;
    await tx
      .insert(documents)
      .values({
        id: data.uploadId,
        claimId: data.claimId,
        blobPathname: path,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: bytes.byteLength,
        uploadedBy: user.id,
      });
    await tx
      .insert(auditLogs)
      .values({
        actorId: user.id,
        action: "DOCUMENT_UPLOAD",
        entityType: "document",
        entityId: data.uploadId,
      });
  });
  return {
    id: data.uploadId,
    ...(await processDocument(data.uploadId, bytes, client)),
  };
}
