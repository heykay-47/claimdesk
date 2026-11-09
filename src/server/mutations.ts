import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  claims,
  claimEvents,
  auditLogs,
  documents,
  documentTypes,
  extractedFields,
  queries,
  payers,
  checklistRules,
} from "@/db/schema";
import { canTransition, nextActions, TRANSITIONS } from "@/domain/claim-status";
import { PREAUTH_FIELDS } from "@/domain/preauth-fields";
import { comparePatientIdentity, hasIdentityMismatch } from "@/domain/identity";
import { queryDueAt } from "@/domain/deadline";
import { formatMoney } from "@/domain/format";
import {
  classifyForReview,
  summariseForReview,
  type AiClient,
} from "@/ai/client";
import { createAiClient } from "@/ai/provider";
import { requireRole, requireUser } from "./auth";
import { checklistInTransaction, type Transaction } from "./workspace";
import { readDocument } from "./storage";
import {
  DEDUCTION_REASONS,
  DEDUCTION_LABELS,
  type SettlementDeduction,
} from "@/domain/settlement";

export class InputError extends Error {}
const text = z.string().trim().min(1).max(300);
const id = z.uuid();
const note = z.string().trim().max(5000).default("");
const localTime = z
  .string()
  .transform(
    (value) =>
      new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+05:30`),
  )
  .refine((value) => !isNaN(value.getTime()), "Enter a valid date and time");
const rupees = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Enter an amount in rupees, with at most two decimals",
  )
  .transform((value) => {
    const [whole, decimal = ""] = value.split(".");
    return BigInt(whole) * BigInt(100) + BigInt(decimal.padEnd(2, "0"));
  });
async function lockClaim(tx: Transaction, claimId: string) {
  const [claim] = await tx
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .for("update");
  if (!claim) throw new InputError("Claim not found. Reload the page and try again.");
  return claim;
}
async function record(
  tx: Transaction,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: Record<string, unknown> = {},
) {
  await tx
    .insert(auditLogs)
    .values({ actorId, action, entityType, entityId, detail });
}
async function advance(
  tx: Transaction,
  claim: typeof claims.$inferSelect,
  action: (typeof TRANSITIONS)[number]["action"],
  actorId: string,
  noteText: string,
  amount?: bigint,
  deduction?: SettlementDeduction | null,
) {
  const transition = nextActions(claim.status).find(
    (entry) => entry.action === action,
  );
  if (!transition)
    throw new InputError(
      "This step is no longer available for this claim. Reload the page.",
    );
  let readiness;
  const openQueries = await tx
    .select({ id: queries.id })
    .from(queries)
    .where(and(eq(queries.claimId, claim.id), eq(queries.status, "OPEN")));
  if (transition.gate && transition.gate !== "QUERIES_ANSWERED") {
    const result = await checklistInTransaction(tx, claim, transition.gate);
    readiness = { [transition.gate]: result.ready };
  }
  if (
    !canTransition(claim.status, action, {
      readiness,
      openQueryCount: openQueries.length,
    })
  )
    throw new InputError(
      "Submission blocked. Fix the missing, old or unconfirmed items on the checklist first.",
    );
  await tx
    .update(claims)
    .set({
      status: transition.to,
      updatedAt: new Date(),
      ...(action === "record_approval" && amount !== undefined
        ? { approvedAmountPaise: amount }
        : {}),
      ...(action === "record_settlement"
        ? {
            settledAmountPaise: amount,
            deductionAmountPaise: deduction?.amount ?? null,
            deductionReason: deduction?.reason ?? null,
          }
        : {}),
    })
    .where(eq(claims.id, claim.id));
  await tx.insert(claimEvents).values({
    claimId: claim.id,
    fromStatus: claim.status,
    toStatus: transition.to,
    actorId,
    note:
      action === "record_settlement" && amount !== undefined
        ? `${noteText}${noteText ? "\n" : ""}Settled amount: ${formatMoney(amount)}${deduction ? `\nDeducted: ${formatMoney(deduction.amount)}. Reason: ${DEDUCTION_LABELS[deduction.reason]}` : ""}`
        : noteText,
  });
  await record(tx, actorId, "CLAIM_TRANSITION", "claim", claim.id, {
    from: claim.status,
    to: transition.to,
    action,
    ...(amount !== undefined ? { amountPaise: amount.toString() } : {}),
    ...(action === "record_settlement"
      ? {
          deduction: deduction
            ? {
                amountPaise: deduction.amount.toString(),
                reason: deduction.reason,
              }
            : null,
        }
      : {}),
  });
}
export async function createClaim(input: unknown) {
  const user = await requireUser();
  const data = z
    .object({
      patientName: text,
      patientAge: z.coerce.number().int().min(0).max(130),
      patientGender: z.enum(["Female", "Male", "Other"]),
      uhid: text,
      policyNumber: text,
      payerId: id,
      procedureId: id,
      treatingDoctor: text,
      admittedAt: localTime,
      amount: rupees,
    })
    .parse(input);
  if (data.admittedAt.getTime() > Date.now() + 300_000)
    throw new InputError("Admission cannot be in the future.");
  return db().transaction(async (tx) => {
    const { amount, ...rest } = data;
    const code = `CLM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const [claim] = await tx
      .insert(claims)
      .values({
        ...rest,
        code,
        estimatedAmountPaise: amount,
        assignedTo: user.id,
      })
      .returning();
    await tx.insert(claimEvents).values({
      claimId: claim.id,
      toStatus: "PREAUTH_DRAFT",
      actorId: user.id,
      note: "Claim opened",
    });
    await record(tx, user.id, "CLAIM_CREATE", "claim", claim.id);
    return { code };
  });
}
export async function transitionClaim(input: unknown) {
  const user = await requireUser();
  const data = z
    .object({
      claimId: id,
      action: z.enum(TRANSITIONS.map((t) => t.action)),
      note,
      amount: rupees.optional(),
      deduction: z
        .object({
          amount: rupees.refine(
            (amount) => amount > BigInt(0),
            "Deduction must be greater than zero",
          ),
          reason: z.enum(DEDUCTION_REASONS),
        })
        .nullable()
        .optional(),
    })
    .parse(input);
  if (["record_query", "answer_query"].includes(data.action))
    throw new InputError("Use the query inbox to record or answer a query.");
  if (data.deduction && data.action !== "record_settlement")
    throw new InputError("Deductions can only be recorded with settlement.");
  if (
    ["record_approval", "record_settlement"].includes(data.action) &&
    data.amount === undefined
  )
    throw new InputError("Enter the approved or settled amount.");
  await db().transaction(async (tx) =>
    advance(
      tx,
      await lockClaim(tx, data.claimId),
      data.action,
      user.id,
      data.note,
      data.amount,
      data.deduction,
    ),
  );
}
export async function reviewDocument(input: unknown) {
  const user = await requireUser();
  const data = z
    .object({
      documentId: id,
      action: z.enum(["CONFIRM", "MOVE", "CONFIRM_IDENTITY", "REMOVE"]),
      confirmedRemoval: z.boolean().default(false),
      documentTypeId: id.optional(),
      documentDate: z.iso.date().nullable().optional(),
    })
    .parse(input);
  await db().transaction(async (tx) => {
    const [reference] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, data.documentId));
    if (!reference) throw new InputError("Document not found");
    const claim = await lockClaim(tx, reference.claimId);
    const [file] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, reference.id));
    if (!file || file.removedAt)
      throw new InputError(
        "The demo data was reset. Reload the page before you check this document.",
      );
    if (data.action === "REMOVE") {
      if (!data.confirmedRemoval)
        throw new InputError("Confirm removal from this claim.");
      await tx
        .update(documents)
        .set({ removedAt: new Date(), removedBy: user.id })
        .where(eq(documents.id, file.id));
      await record(tx, user.id, "DOCUMENT_REMOVE", "document", file.id, {
        claimId: claim.id,
      });
      return;
    }
    const fields = await tx
      .select()
      .from(extractedFields)
      .where(eq(extractedFields.documentId, file.id));
    const identity = comparePatientIdentity(
      claim,
      file.identityEvidence ?? fields,
    );
    const mismatched = hasIdentityMismatch({ ...file, identity });
    if (data.action === "CONFIRM" && mismatched)
      throw new InputError(
        "Different patient detected. Check the document, then remove it from the claim or choose Confirm same patient.",
      );
    if (data.action === "CONFIRM_IDENTITY" && !mismatched)
      throw new InputError(
        "This document has no patient mismatch left to confirm. Reload the page.",
      );
    if (
      (data.action === "CONFIRM" || data.action === "CONFIRM_IDENTITY") &&
      (!file.documentTypeId ||
        file.status === "FAILED" ||
        file.status === "PROCESSING")
    )
      throw new InputError("Choose a document type before confirming.");
    if (data.action === "MOVE" && !data.documentTypeId)
      throw new InputError("Choose where to move the document.");
    await tx
      .update(documents)
      .set(
        data.action !== "MOVE"
          ? {
              status: "CONFIRMED",
              confirmedBy: user.id,
              confirmedAt: new Date(),
              ...(data.action === "CONFIRM_IDENTITY"
                ? {
                    identityOverrideBy: user.id,
                    identityOverrideAt: new Date(),
                  }
                : {}),
              ...(data.documentDate !== undefined
                ? { documentDate: data.documentDate }
                : {}),
            }
          : {
              documentTypeId: data.documentTypeId,
              classifiedBy: "USER",
              status: "NEEDS_REVIEW",
              confirmedBy: null,
              confirmedAt: null,
              error: null,
            },
      )
      .where(eq(documents.id, file.id));
    await record(
      tx,
      user.id,
      data.action === "CONFIRM_IDENTITY"
        ? "DOCUMENT_IDENTITY_OVERRIDE"
        : data.action === "CONFIRM"
          ? "DOCUMENT_CONFIRM"
          : "DOCUMENT_MOVE",
      "document",
      file.id,
      {
        documentTypeId: data.documentTypeId ?? file.documentTypeId,
        ...(data.action === "CONFIRM_IDENTITY" && identity.kind === "MISMATCH"
          ? { claimId: claim.id, differences: identity.differences }
          : {}),
      },
    );
  });
}
export async function processDocument(
  documentId: string,
  bytes: Uint8Array,
  client: AiClient = createAiClient(),
) {
  const user = await requireUser();
  id.parse(documentId);
  const [file] = await db()
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!file || file.removedAt) throw new InputError("Document not found");
  if (!["PROCESSING", "FAILED"].includes(file.status))
    return { status: file.status, error: file.error };
  const catalogue = await db().select().from(documentTypes);
  const result = await classifyForReview(
    client,
    bytes,
    file.mimeType,
    catalogue,
  );
  await db().transaction(async (tx) => {
    await lockClaim(tx, file.claimId);
    const [current] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, file.id));
    if (!current || current.removedAt)
      throw new InputError(
        "The demo data was reset while the AI was reading this file. Reload the page and upload it again.",
      );
    const humanReviewed =
      current.classifiedBy === "USER" ||
      !["PROCESSING", "FAILED"].includes(current.status);
    if (
      humanReviewed &&
      (current.identityEvidence !== null || result.status === "FAILED")
    )
      return;
    const { fields, ...classification } = result;
    await tx
      .update(documents)
      .set(
        humanReviewed && result.status === "NEEDS_REVIEW"
          ? { identityEvidence: result.identityEvidence }
          : classification,
      )
      .where(eq(documents.id, file.id));
    if (fields.length)
      await tx.insert(extractedFields).values(
        fields.map((field) => ({
          ...field,
          documentId: file.id,
          claimId: file.claimId,
        })),
      );
    await record(tx, user.id, "DOCUMENT_AI", "document", file.id, {
      status: result.status,
    });
  });
  return { status: result.status, error: result.error };
}
export async function retryDocument(input: unknown, client?: AiClient) {
  await requireUser();
  const { documentId } = z.object({ documentId: id }).parse(input);
  const [file] = await db()
    .select()
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!file || file.removedAt || file.status !== "FAILED")
    throw new InputError("Only documents the AI could not read can be tried again.");
  const blob = await readDocument(file.blobPathname);
  if (!blob || blob.statusCode !== 200)
    throw new InputError("The file is not available. Upload it again.");
  const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
  return processDocument(documentId, bytes, client);
}
export async function reviewField(input: unknown) {
  const user = await requireUser();
  const data = z
    .object({
      claimId: id,
      fieldKey: z.enum(PREAUTH_FIELDS.map((f) => f.key)),
      fieldId: id.optional(),
      documentId: id.optional(),
      value: z.string().trim().max(5000),
      action: z.enum(["CONFIRM", "REJECT"]),
    })
    .parse(input);
  if (data.action === "CONFIRM" && !data.value)
    throw new InputError("Enter a value before confirming.");
  const definition = PREAUTH_FIELDS.find(
    (field) => field.key === data.fieldKey,
  )!;
  if (data.action === "CONFIRM") {
    if (definition.type === "number")
      z.coerce.number().int().min(0).max(130).parse(data.value);
    if (definition.type === "date") z.iso.date().parse(data.value);
    if (definition.type === "money") rupees.parse(data.value);
  }
  await db().transaction(async (tx) => {
    const claim = await lockClaim(tx, data.claimId);
    const [existing] = data.fieldId
      ? await tx
          .select()
          .from(extractedFields)
          .where(
            and(
              eq(extractedFields.id, data.fieldId),
              eq(extractedFields.claimId, data.claimId),
              eq(extractedFields.fieldKey, data.fieldKey),
            ),
          )
      : [];
    if (data.fieldId && !existing) throw new InputError("That detail was not found. Reload the page.");
    const sourceId = existing?.documentId ?? data.documentId;
    const [sourceFile] = sourceId
      ? await tx
          .select()
          .from(documents)
          .where(
            and(eq(documents.id, sourceId), eq(documents.claimId, claim.id)),
          )
      : [];
    if (!sourceFile || sourceFile.removedAt)
      throw new InputError("Source document not found");
    if (data.action === "CONFIRM") {
      const sourceFields = await tx
        .select()
        .from(extractedFields)
        .where(eq(extractedFields.documentId, sourceFile.id));
      const identity = comparePatientIdentity(
        claim,
        sourceFile.identityEvidence ?? sourceFields,
      );
      if (hasIdentityMismatch({ ...sourceFile, identity }))
        throw new InputError(
          "This document may belong to a different patient. Settle the patient check in the claim file before you confirm details from it.",
        );
    }
    if (!existing && data.action === "REJECT")
      throw new InputError("Choose a suggestion to reject.");
    if (data.action === "CONFIRM")
      await tx
        .update(extractedFields)
        .set({
          status: "REJECTED",
          reviewedBy: user.id,
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(extractedFields.claimId, data.claimId),
            eq(extractedFields.fieldKey, data.fieldKey),
            ...(existing ? [ne(extractedFields.id, existing.id)] : []),
          ),
        );
    const review = {
      value: data.value,
      status:
        data.action === "CONFIRM"
          ? ("CONFIRMED" as const)
          : ("REJECTED" as const),
      reviewedBy: user.id,
      reviewedAt: new Date(),
    };
    if (existing)
      await tx
        .update(extractedFields)
        .set(review)
        .where(eq(extractedFields.id, existing.id));
    else
      await tx.insert(extractedFields).values({
        ...review,
        claimId: data.claimId,
        fieldKey: data.fieldKey,
        documentId: data.documentId!,
        sourceSnippet:
          "Entered by the insurance desk from the selected source document.",
        confidence: 1,
      });
    await record(tx, user.id, "FIELD_REVIEW", "claim", data.claimId, {
      fieldKey: data.fieldKey,
      action: data.action,
    });
  });
}
export async function logQuery(
  input: unknown,
  client: AiClient = createAiClient(),
) {
  const user = await requireUser();
  const data = z
    .object({
      claimId: id,
      fromAddress: z.email().max(254),
      subject: text,
      body: z.string().trim().min(1).max(50_000),
      receivedAt: localTime,
    })
    .parse(input);
  if (data.receivedAt.getTime() > Date.now() + 300_000)
    throw new InputError("Received time cannot be in the future.");
  const catalogue = await db().select().from(documentTypes);
  const ai = await summariseForReview(
    client,
    data.subject,
    data.body,
    catalogue,
  );
  return db().transaction(async (tx) => {
    const claim = await lockClaim(tx, data.claimId);
    if (
      claim.status !== "QUERY" &&
      !canTransition(claim.status, "record_query")
    )
      throw new InputError(
        "You can log a query only after pre-auth has been marked as sent.",
      );
    const [payer] = await tx
      .select()
      .from(payers)
      .where(eq(payers.id, claim.payerId));
    const [query] = await tx
      .insert(queries)
      .values({
        ...data,
        dueAt: queryDueAt(
          data.receivedAt,
          payer.queryReplyHours,
          ai.summary?.deadline_iso,
        ),
        aiSummary: ai.summary
          ? { ...ai.summary, deadline_text: ai.summary.deadline_iso }
          : null,
        aiError: ai.error,
      })
      .returning({ id: queries.id });
    if (claim.status !== "QUERY")
      await advance(
        tx,
        claim,
        "record_query",
        user.id,
        "Incoming payer query logged",
      );
    await record(tx, user.id, "QUERY_LOG", "query", query.id);
    return { id: query.id, aiError: ai.error };
  });
}
export async function answerQuery(input: unknown) {
  const user = await requireUser();
  const data = z
    .object({ queryId: id, replyBody: z.string().trim().min(1).max(50_000) })
    .parse(input);
  await db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(queries)
      .where(eq(queries.id, data.queryId));
    if (!row) throw new InputError("Query not found. Reload the page.");
    const claim = await lockClaim(tx, row.claimId);
    const [query] = await tx
      .select()
      .from(queries)
      .where(eq(queries.id, row.id));
    if (!query)
      throw new InputError(
        "The demo data was reset. Reload the page before you record this reply.",
      );
    if (query.status !== "OPEN")
      throw new InputError("This reply has already been recorded.");
    await tx
      .update(queries)
      .set({
        status: "ANSWERED",
        replyBody: data.replyBody,
        answeredAt: new Date(),
        answeredBy: user.id,
      })
      .where(eq(queries.id, row.id));
    const remaining = await tx
      .select({ id: queries.id })
      .from(queries)
      .where(and(eq(queries.claimId, claim.id), eq(queries.status, "OPEN")));
    if (!remaining.length && claim.status === "QUERY")
      await advance(
        tx,
        claim,
        "answer_query",
        user.id,
        "All payer queries answered through the payer channel",
      );
    await record(tx, user.id, "QUERY_ANSWER", "query", row.id);
  });
}
export async function retryQuerySummary(
  input: unknown,
  client: AiClient = createAiClient(),
) {
  const user = await requireUser();
  const { queryId } = z.object({ queryId: id }).parse(input);
  const [row] = await db()
    .select()
    .from(queries)
    .where(eq(queries.id, queryId));
  if (!row) throw new InputError("Query not found. Reload the page.");
  const result = await summariseForReview(
    client,
    row.subject,
    row.body,
    await db().select().from(documentTypes),
  );
  await db().transaction(async (tx) => {
    await lockClaim(tx, row.claimId);
    await tx
      .update(queries)
      .set({
        aiSummary: result.summary
          ? { ...result.summary, deadline_text: result.summary.deadline_iso }
          : null,
        aiError: result.error,
        ...(result.summary?.deadline_iso
          ? { dueAt: new Date(result.summary.deadline_iso) }
          : {}),
      })
      .where(eq(queries.id, row.id));
    await record(tx, user.id, "QUERY_AI", "query", row.id, {
      success: !result.error,
    });
  });
  return { aiError: result.error };
}
const ruleSchema = z.object({
  payerId: id.nullable(),
  procedureId: id.nullable(),
  documentTypeId: id,
  stage: z.enum(["PREAUTH", "ENHANCEMENT", "DISCHARGE"]),
  requirement: z.enum(["REQUIRED", "OPTIONAL", "WAIVED"]),
  maxAgeHours: z.number().int().min(1).max(87600).nullable(),
  note,
  confirmedWaiver: z.boolean().default(false),
});
export async function saveRule(input: unknown) {
  const user = await requireRole("HEAD");
  const { confirmedWaiver, ...data } = ruleSchema.parse(input);
  if (data.requirement === "WAIVED" && !confirmedWaiver)
    throw new InputError("Confirm the waiver before saving.");
  await db().transaction(async (tx) => {
    const [rule] = await tx
      .insert(checklistRules)
      .values({ ...data, updatedBy: user.id })
      .onConflictDoUpdate({
        target: [
          checklistRules.payerId,
          checklistRules.procedureId,
          checklistRules.documentTypeId,
          checklistRules.stage,
        ],
        set: { ...data, updatedBy: user.id, updatedAt: new Date() },
      })
      .returning();
    await record(tx, user.id, "RULE_SAVE", "checklist_rule", rule.id, {
      ...data,
    });
  });
}
export async function deleteRule(input: unknown) {
  const user = await requireRole("HEAD");
  const { ruleId } = z.object({ ruleId: id }).parse(input);
  await db().transaction(async (tx) => {
    const [rule] = await tx
      .delete(checklistRules)
      .where(eq(checklistRules.id, ruleId))
      .returning();
    if (!rule) throw new InputError("This rule was already removed. Reload the page.");
    await record(tx, user.id, "RULE_DELETE", "checklist_rule", rule.id, {
      payerId: rule.payerId,
      procedureId: rule.procedureId,
      documentTypeId: rule.documentTypeId,
      stage: rule.stage,
    });
  });
}
export async function affectedClaimCount(
  payerId: string | null,
  procedureId: string | null,
) {
  await requireRole("HEAD");
  id.nullable().parse(payerId);
  id.nullable().parse(procedureId);
  const rows = await db()
    .select({ id: claims.id })
    .from(claims)
    .where(
      and(
        ne(claims.status, "SETTLED"),
        ne(claims.status, "REJECTED"),
        ...(payerId ? [eq(claims.payerId, payerId)] : []),
        ...(procedureId ? [eq(claims.procedureId, procedureId)] : []),
      ),
    );
  return rows.length;
}
