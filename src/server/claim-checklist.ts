import "server-only";
import { and, eq, isNull, getTableColumns } from "drizzle-orm";
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
import { withIdentityChecks } from "@/domain/identity";
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
        identityEvidence: documents.identityEvidence,
        identityOverrideBy: documents.identityOverrideBy,
      })
      .from(documents)
      .leftJoin(documentTypes, eq(documentTypes.id, documents.documentTypeId))
      .where(and(eq(documents.claimId, claimId), isNull(documents.removedAt))),
    db()
      .select(getTableColumns(extractedFields))
      .from(extractedFields)
      .innerJoin(documents, eq(documents.id, extractedFields.documentId))
      .where(
        and(eq(extractedFields.claimId, claimId), isNull(documents.removedAt)),
      ),
  ]);
  const resolved = resolveRules(rules, {
    payerId: claim.payerId,
    procedureId: claim.procedureId,
    stage,
  });
  return evaluateChecklist(
    resolved,
    withIdentityChecks(claim, files, fields),
    now,
    { stage, fields },
  );
}
