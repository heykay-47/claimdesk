import { and, eq, inArray } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "../src/db";
import {
  claims,
  claimEvents,
  documents,
  extractedFields,
  queries,
} from "../src/db/schema";
import { resetDemo } from "../seed/run";
import { seedId } from "../seed/data";

export default async function teardown() {
  const runId = process.env.E2E_RUN_ID;
  if (!runId)
    throw new Error("Missing E2E run identifier. Refusing broad cleanup.");
  const fileName = `E2E-${runId}-ultrasound.pdf`;
  const ownedFiles = await db()
    .select({ pathname: documents.blobPathname })
    .from(documents)
    .where(
      and(
        eq(documents.fileName, fileName),
        eq(documents.claimId, seedId("claim:CLM-3381")),
      ),
    );
  const ownedClaims = await db()
    .select({ id: claims.id })
    .from(claims)
    .where(eq(claims.uhid, `E2E-${runId}`));
  if (ownedClaims.length)
    await db().transaction(async (tx) => {
      const ids = ownedClaims.map((claim) => claim.id);
      await tx
        .delete(extractedFields)
        .where(inArray(extractedFields.claimId, ids));
      await tx.delete(documents).where(inArray(documents.claimId, ids));
      await tx.delete(queries).where(inArray(queries.claimId, ids));
      await tx.delete(claimEvents).where(inArray(claimEvents.claimId, ids));
      await tx.delete(claims).where(inArray(claims.id, ids));
    });
  await resetDemo();
  if (ownedFiles.length) await del(ownedFiles.map((file) => file.pathname));
}
