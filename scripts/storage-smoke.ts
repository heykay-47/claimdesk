import "./env";
import { putDocument, readDocument } from "../src/server/storage";
import { db } from "../src/db";
import { documentFiles, documents } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { seedId } from "../seed/data";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

async function main() {
  const bytes = await readFile("seed/files/preauth-form.pdf");
  const documentId = randomUUID();
  const rollback = new Error("Smoke rollback");
  try {
    await db().transaction(async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        claimId: seedId("claim:CLM-3381"),
        blobPathname: `postgres/${documentId}`,
        fileName: "synthetic-smoke.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
        uploadedBy: seedId("user:desk"),
      });
      await putDocument(tx, documentId, bytes);
      const [stored] = await tx
        .select()
        .from(documentFiles)
        .where(eq(documentFiles.documentId, documentId));
      const sha = (value: Uint8Array) =>
        createHash("sha256").update(value).digest("hex");
      if (sha(bytes) !== sha(stored.content))
        throw new Error("Postgres file round trip differs");
      console.log(JSON.stringify({
        privateRoundTrip: "PASS",
        bytes: bytes.length,
        sha256: sha(stored.content),
      }));
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if (await readDocument(documentId))
    throw new Error("Smoke file survived rollback");
}
main().catch(() => {
  console.error("Private storage smoke failed");
  process.exitCode = 1;
});
