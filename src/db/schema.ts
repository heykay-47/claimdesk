import { sql } from "drizzle-orm";
import { DEDUCTION_REASONS } from "../domain/settlement";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const role = pgEnum("role", ["EXECUTIVE", "HEAD"]);
export const payerKind = pgEnum("payer_kind", ["INSURER", "TPA"]);
export const claimStatus = pgEnum("claim_status", [
  "PREAUTH_DRAFT",
  "PREAUTH_SUBMITTED",
  "QUERY",
  "APPROVED",
  "ENHANCEMENT",
  "FINAL_BILL_SUBMITTED",
  "SETTLED",
  "REJECTED",
]);
export const stage = pgEnum("stage", ["PREAUTH", "ENHANCEMENT", "DISCHARGE"]);
export const requirement = pgEnum("requirement", [
  "REQUIRED",
  "OPTIONAL",
  "WAIVED",
]);
export const docStatus = pgEnum("doc_status", [
  "PROCESSING",
  "NEEDS_REVIEW",
  "CONFIRMED",
  "FAILED",
]);
export const fieldStatus = pgEnum("field_status", [
  "PENDING",
  "CONFIRMED",
  "REJECTED",
]);
export const queryStatus = pgEnum("query_status", ["OPEN", "ANSWERED"]);
export const deductionReason = pgEnum("deduction_reason", DEDUCTION_REASONS);
const id = () => uuid("id").defaultRandom().primaryKey();
const time = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: role("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const payers = pgTable(
  "payers",
  {
    id: id(),
    name: text("name").notNull(),
    kind: payerKind("kind").notNull(),
    queryReplyHours: integer("query_reply_hours").notNull().default(24),
    preauthSlaMinutes: integer("preauth_sla_minutes").notNull().default(60),
    dischargeSlaMinutes: integer("discharge_sla_minutes")
      .notNull()
      .default(180),
  },
  (t) => [
    check(
      "positive_payer_windows",
      sql`${t.queryReplyHours} > 0 AND ${t.preauthSlaMinutes} > 0 AND ${t.dischargeSlaMinutes} > 0`,
    ),
  ],
);
export const procedures = pgTable("procedures", {
  id: id(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
});
export const documentTypes = pgTable("document_types", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  aiHint: text("ai_hint").notNull(),
});
export const checklistRules = pgTable(
  "checklist_rules",
  {
    id: id(),
    payerId: uuid("payer_id").references(() => payers.id),
    procedureId: uuid("procedure_id").references(() => procedures.id),
    documentTypeId: uuid("document_type_id")
      .notNull()
      .references(() => documentTypes.id),
    stage: stage("stage").notNull(),
    requirement: requirement("requirement").notNull(),
    maxAgeHours: integer("max_age_hours"),
    note: text("note").notNull().default(""),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("checklist_rules_scope_unique")
      .on(t.payerId, t.procedureId, t.documentTypeId, t.stage)
      .nullsNotDistinct(),
    index("checklist_rules_stage_idx").on(t.stage),
    check(
      "positive_max_age",
      sql`${t.maxAgeHours} IS NULL OR ${t.maxAgeHours} > 0`,
    ),
  ],
);
export const claims = pgTable(
  "claims",
  {
    id: id(),
    code: text("code").notNull().unique(),
    patientName: text("patient_name").notNull(),
    patientAge: integer("patient_age").notNull(),
    patientGender: text("patient_gender").notNull(),
    uhid: text("uhid").notNull(),
    policyNumber: text("policy_number").notNull(),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => payers.id),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id),
    treatingDoctor: text("treating_doctor").notNull(),
    admittedAt: time("admitted_at").notNull(),
    estimatedAmountPaise: bigint("estimated_amount_paise", {
      mode: "bigint",
    }).notNull(),
    approvedAmountPaise: bigint("approved_amount_paise", { mode: "bigint" }),
    settledAmountPaise: bigint("settled_amount_paise", { mode: "bigint" }),
    deductionAmountPaise: bigint("deduction_amount_paise", { mode: "bigint" }),
    deductionReason: deductionReason("deduction_reason"),
    status: claimStatus("status").notNull().default("PREAUTH_DRAFT"),
    assignedTo: uuid("assigned_to")
      .notNull()
      .references(() => users.id),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("claims_worklist_idx").on(t.status, t.updatedAt),
    index("claims_payer_idx").on(t.payerId),
    index("claims_procedure_idx").on(t.procedureId),
    index("claims_assignee_idx").on(t.assignedTo),
    check("valid_patient_age", sql`${t.patientAge} BETWEEN 0 AND 130`),
    check(
      "valid_claim_money",
      sql`${t.estimatedAmountPaise} >= 0 AND (${t.approvedAmountPaise} IS NULL OR ${t.approvedAmountPaise} >= 0)`,
    ),
    check(
      "valid_settled_money",
      sql`${t.settledAmountPaise} IS NULL OR ${t.settledAmountPaise} >= 0`,
    ),
    check(
      "valid_settlement_deduction",
      sql`(${t.deductionAmountPaise} IS NULL AND ${t.deductionReason} IS NULL) OR (${t.deductionAmountPaise} IS NOT NULL AND ${t.deductionAmountPaise} > 0 AND ${t.deductionReason} IS NOT NULL)`,
    ),
  ],
);
export const claimEvents = pgTable(
  "claim_events",
  {
    id: id(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    fromStatus: claimStatus("from_status"),
    toStatus: claimStatus("to_status").notNull(),
    note: text("note").notNull().default(""),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    at: time("at").notNull().defaultNow(),
  },
  (t) => [index("claim_events_timeline_idx").on(t.claimId, t.at)],
);
export const documents = pgTable(
  "documents",
  {
    id: id(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    blobPathname: text("blob_pathname").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    documentTypeId: uuid("document_type_id").references(() => documentTypes.id),
    aiDocumentTypeKey: text("ai_document_type_key"),
    aiConfidence: real("ai_confidence"),
    aiReason: text("ai_reason"),
    classifiedBy: text("classified_by", { enum: ["AI", "USER"] }),
    status: docStatus("status").notNull().default("PROCESSING"),
    documentDate: date("document_date"),
    error: text("error"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    uploadedAt: time("uploaded_at").notNull().defaultNow(),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    confirmedAt: time("confirmed_at"),
  },
  (t) => [
    index("documents_claim_idx").on(t.claimId),
    index("documents_type_idx").on(t.documentTypeId),
    check(
      "document_classified_by",
      sql`${t.classifiedBy} IS NULL OR ${t.classifiedBy} IN ('AI', 'USER')`,
    ),
    check(
      "document_confidence_range",
      sql`${t.aiConfidence} IS NULL OR ${t.aiConfidence} BETWEEN 0 AND 1`,
    ),
  ],
);
export const extractedFields = pgTable(
  "extracted_fields",
  {
    id: id(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    fieldKey: text("field_key").notNull(),
    value: text("value").notNull(),
    sourceSnippet: text("source_snippet").notNull(),
    confidence: real("confidence").notNull(),
    status: fieldStatus("status").notNull().default("PENDING"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: time("reviewed_at"),
  },
  (t) => [
    index("fields_claim_idx").on(t.claimId),
    index("fields_document_idx").on(t.documentId),
    check("field_confidence_range", sql`${t.confidence} BETWEEN 0 AND 1`),
  ],
);
export type QuerySummary = {
  summary: string;
  asks: string[];
  requested_document_keys: string[];
  deadline_text: string | null;
};
export const queries = pgTable(
  "queries",
  {
    id: id(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    fromAddress: text("from_address").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    receivedAt: time("received_at").notNull(),
    dueAt: time("due_at").notNull(),
    status: queryStatus("status").notNull().default("OPEN"),
    aiSummary: jsonb("ai_summary").$type<QuerySummary>(),
    aiError: text("ai_error"),
    replyBody: text("reply_body"),
    answeredAt: time("answered_at"),
    answeredBy: uuid("answered_by").references(() => users.id),
  },
  (t) => [
    index("queries_inbox_idx").on(t.status, t.dueAt),
    index("queries_claim_idx").on(t.claimId),
  ],
);
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ip: text("ip"),
    at: time("at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_at_idx").on(t.at),
    index("audit_logs_actor_idx").on(t.actorId),
  ],
);
