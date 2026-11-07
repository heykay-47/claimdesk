import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  claims,
  checklistRules,
  documents,
  documentTypes,
  extractedFields,
} from "@/db/schema";
import {
  evaluateChecklist,
  resolveRules,
  type Stage,
} from "@/domain/checklist";
import { STAGE_FOR_STATUS } from "@/domain/claim-status";
import { requireUser } from "./auth";
export async function getClaimChecklist(
  claimId: string,
  now = new Date(),
  stageOverride?: Stage,
) {
  await requireUser();
  const [claim] = await db()
    .select()
    .from(claims)
    .where(eq(claims.id, claimId));
  if (!claim) throw new Error("Claim not found");
  const stage = stageOverride ?? STAGE_FOR_STATUS[claim.status];
  const [rules, files, fields] = await Promise.all([
    db().select().from(checklistRules).where(eq(checklistRules.stage, stage)),
    db()
      .select({
        id: documents.id,
        documentTypeId: documents.documentTypeId,
        documentTypeKey: documentTypes.key,
        status: documents.status,
        documentDate: documents.documentDate,
        uploadedAt: documents.uploadedAt,
      })
      .from(documents)
      .leftJoin(documentTypes, eq(documentTypes.id, documents.documentTypeId))
      .where(eq(documents.claimId, claimId)),
    db()
      .select()
      .from(extractedFields)
      .where(eq(extractedFields.claimId, claimId)),
  ]);
  const resolved = resolveRules(rules, {
    payerId: claim.payerId,
    procedureId: claim.procedureId,
    stage,
  });
  return evaluateChecklist(resolved, files, now, { stage, fields });
}
