import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documentFiles, documents } from "@/db/schema";

type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

export async function putDocument(
  tx: Transaction,
  documentId: string,
  bytes: Uint8Array,
) {
  await tx.insert(documentFiles).values({
    documentId,
    content: Buffer.from(bytes),
  });
}

export async function readDocument(documentId: string) {
  const [file] = await db()
    .select({ bytes: documentFiles.content, mimeType: documents.mimeType })
    .from(documentFiles)
    .innerJoin(documents, eq(documentFiles.documentId, documents.id))
    .where(eq(documentFiles.documentId, documentId));
  return file ?? null;
}
