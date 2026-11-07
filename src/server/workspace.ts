import "server-only";
import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  claims,
  users,
  payers,
  procedures,
  checklistRules,
  documents,
  documentTypes,
  extractedFields,
  queries,
  claimEvents,
} from "@/db/schema";
import {
  evaluateChecklist,
  resolveRules,
  type Stage,
} from "@/domain/checklist";
import { STAGE_FOR_STATUS } from "@/domain/claim-status";
import { requireUser } from "./auth";

export type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
export async function references() {
  await requireUser();
  const [payerList, procedureList, types] = await Promise.all([
    db().select().from(payers).orderBy(asc(payers.name)),
    db().select().from(procedures).orderBy(asc(procedures.name)),
    db().select().from(documentTypes).orderBy(asc(documentTypes.label)),
  ]);
  return { payers: payerList, procedures: procedureList, types };
}
const fileColumns = {
  id: documents.id,
  claimId: documents.claimId,
  fileName: documents.fileName,
  mimeType: documents.mimeType,
  sizeBytes: documents.sizeBytes,
  documentTypeId: documents.documentTypeId,
  documentTypeKey: documentTypes.key,
  aiConfidence: documents.aiConfidence,
  aiReason: documents.aiReason,
  classifiedBy: documents.classifiedBy,
  status: documents.status,
  documentDate: documents.documentDate,
  error: documents.error,
  uploadedAt: documents.uploadedAt,
};
export async function checklistInTransaction(
  tx: Transaction,
  claim: typeof claims.$inferSelect,
  stage: Stage,
) {
  const [rules, files, fields] = await Promise.all([
    tx.select().from(checklistRules).where(eq(checklistRules.stage, stage)),
    tx
      .select(fileColumns)
      .from(documents)
      .leftJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
      .where(eq(documents.claimId, claim.id)),
    tx
      .select()
      .from(extractedFields)
      .where(eq(extractedFields.claimId, claim.id)),
  ]);
  return evaluateChecklist(
    resolveRules(rules, {
      payerId: claim.payerId,
      procedureId: claim.procedureId,
      stage,
    }),
    files,
    new Date(),
    { stage, fields },
  );
}
export async function worklist() {
  await requireUser();
  const [rows, rules, files, fields, inbox] = await Promise.all([
    db()
      .select({
        claim: claims,
        payer: payers,
        procedure: procedures,
        assignee: users.name,
      })
      .from(claims)
      .innerJoin(payers, eq(claims.payerId, payers.id))
      .innerJoin(procedures, eq(claims.procedureId, procedures.id))
      .innerJoin(users, eq(claims.assignedTo, users.id))
      .orderBy(desc(claims.updatedAt)),
    db().select().from(checklistRules),
    db()
      .select(fileColumns)
      .from(documents)
      .leftJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id)),
    db().select().from(extractedFields),
    db().select().from(queries).orderBy(asc(queries.dueAt)),
  ]);
  const now = new Date();
  return rows.map((row) => {
    const stage = STAGE_FOR_STATUS[row.claim.status];
    const checklist = evaluateChecklist(
      resolveRules(rules, {
        payerId: row.payer.id,
        procedureId: row.procedure.id,
        stage,
      }),
      files.filter((f) => f.claimId === row.claim.id),
      now,
      { stage, fields: fields.filter((f) => f.claimId === row.claim.id) },
    );
    return {
      ...row,
      checklist,
      queries: inbox.filter((q) => q.claimId === row.claim.id),
      deadline:
        inbox.find((q) => q.claimId === row.claim.id && q.status === "OPEN")
          ?.dueAt ?? null,
    };
  });
}
export async function claimFile(rawCode: string, stageOverride?: Stage) {
  await requireUser();
  const parsed = z
    .string()
    .regex(/^CLM-[A-Z0-9-]{1,40}$/)
    .safeParse(rawCode);
  if (!parsed.success) notFound();
  const [row] = await db()
    .select({
      claim: claims,
      payer: payers,
      procedure: procedures,
      assignee: users.name,
    })
    .from(claims)
    .innerJoin(payers, eq(claims.payerId, payers.id))
    .innerJoin(procedures, eq(claims.procedureId, procedures.id))
    .innerJoin(users, eq(claims.assignedTo, users.id))
    .where(eq(claims.code, parsed.data));
  if (!row) notFound();
  const [rules, files, fields, inbox, events, ref] = await Promise.all([
    db().select().from(checklistRules),
    db()
      .select(fileColumns)
      .from(documents)
      .leftJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
      .where(eq(documents.claimId, row.claim.id))
      .orderBy(desc(documents.uploadedAt)),
    db()
      .select({ ...getTableColumns(extractedFields), reviewer: users.name })
      .from(extractedFields)
      .leftJoin(users, eq(extractedFields.reviewedBy, users.id))
      .where(eq(extractedFields.claimId, row.claim.id))
      .orderBy(desc(extractedFields.reviewedAt)),
    db()
      .select()
      .from(queries)
      .where(eq(queries.claimId, row.claim.id))
      .orderBy(asc(queries.dueAt)),
    db()
      .select({
        id: claimEvents.id,
        toStatus: claimEvents.toStatus,
        fromStatus: claimEvents.fromStatus,
        note: claimEvents.note,
        at: claimEvents.at,
        actor: users.name,
      })
      .from(claimEvents)
      .innerJoin(users, eq(claimEvents.actorId, users.id))
      .where(eq(claimEvents.claimId, row.claim.id))
      .orderBy(asc(claimEvents.at)),
    references(),
  ]);
  const stage = stageOverride ?? STAGE_FOR_STATUS[row.claim.status];
  const resolved = resolveRules(rules, {
    payerId: row.payer.id,
    procedureId: row.procedure.id,
    stage,
  });
  const checklist = evaluateChecklist(resolved, files, new Date(), {
    stage,
    fields,
  });
  const currentStage = STAGE_FOR_STATUS[row.claim.status];
  const currentChecklist =
    currentStage === stage
      ? checklist
      : evaluateChecklist(
          resolveRules(rules, {
            payerId: row.payer.id,
            procedureId: row.procedure.id,
            stage: currentStage,
          }),
          files,
          new Date(),
          { stage: currentStage, fields },
        );
  return {
    ...row,
    stage,
    files,
    fields,
    queries: inbox,
    events,
    ref,
    checklist,
    currentChecklist,
    resolved,
  };
}
export type ClaimFile = Awaited<ReturnType<typeof claimFile>>;
export type WorkspaceDocument = ClaimFile["files"][number];
export async function queryFile(rawId: string) {
  await requireUser();
  const id = z.uuid().safeParse(rawId);
  if (!id.success) notFound();
  const [row] = await db()
    .select({ query: queries, code: claims.code })
    .from(queries)
    .innerJoin(claims, eq(queries.claimId, claims.id))
    .where(eq(queries.id, id.data));
  if (!row) notFound();
  return { query: row.query, file: await claimFile(row.code, "PREAUTH") };
}
export async function queryInbox(status: "OPEN" | "ANSWERED") {
  await requireUser();
  return db()
    .select({
      query: queries,
      code: claims.code,
      patient: claims.patientName,
      payer: payers.name,
    })
    .from(queries)
    .innerJoin(claims, eq(queries.claimId, claims.id))
    .innerJoin(payers, eq(claims.payerId, payers.id))
    .where(and(eq(queries.status, status)))
    .orderBy(asc(queries.dueAt));
}
