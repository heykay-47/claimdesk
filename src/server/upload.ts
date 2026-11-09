import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, claims, documents } from "@/db/schema";
import {
  FILE_MIME_TYPES,
  FILE_SIZE_ERROR,
  MAX_FILE_BYTES,
} from "@/domain/document-upload";
import { requireUser } from "./auth";
import { putDocument } from "./storage";
import { InputError, processDocument } from "./mutations";
import type { AiClient } from "@/ai/client";

export async function uploadDocument(
  claimId: unknown,
  file: File,
  client?: AiClient,
) {
  const user = await requireUser();
  const id = z.uuid().parse(claimId);
  if (file.size > MAX_FILE_BYTES) throw new InputError(FILE_SIZE_ERROR);
  if (!file.size) throw new InputError("This file is empty. Choose another file.");
  const mimeType = z.enum(FILE_MIME_TYPES).safeParse(file.type);
  if (!mimeType.success)
    throw new InputError("Use a PDF, JPG, PNG or WebP file.");
  const fileName = z.string().min(1).max(200).parse(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentId = crypto.randomUUID();
  await db().transaction(async (tx) => {
    const [claim] = await tx
      .select({ id: claims.id })
      .from(claims)
      .where(eq(claims.id, id))
      .for("update");
    if (!claim) throw new InputError("Claim not found");
    await tx.insert(documents).values({
      id: documentId,
      claimId: id,
      blobPathname: `postgres/${documentId}`,
      fileName,
      mimeType: mimeType.data,
      sizeBytes: bytes.byteLength,
      uploadedBy: user.id,
    });
    await putDocument(tx, documentId, bytes);
    await tx.insert(auditLogs).values({
      actorId: user.id,
      action: "DOCUMENT_UPLOAD",
      entityType: "document",
      entityId: documentId,
    });
  });
  return { id: documentId, ...(await processDocument(documentId, bytes, client)) };
}
