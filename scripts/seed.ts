import "./env";
import { hash } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import { db } from "../src/db";
import {
  users,
  payers,
  procedures,
  documentTypes,
  checklistRules,
  claims,
  documents,
  extractedFields,
  queries,
  claimEvents,
  auditLogs,
} from "../src/db/schema";
import type { ClaimStatus } from "../src/domain/claim-status";
import {
  DOCUMENT_CATALOGUE,
  PAYERS,
  PROCEDURES,
  SEED_CLAIMS,
  seedAdmission,
  seedId,
  seedFields,
} from "../seed/data";

async function main() {
  const database = db();
  const now = new Date();
  const hoursAgo = (hours: number) =>
    new Date(now.getTime() - hours * 3_600_000);
  const desk = seedId("user:desk");
  const headId = seedId("user:head");
  const passwordHash = await hash("ClaimDesk@2026", 12);
  for (const user of [
    {
      id: desk,
      email: "desk@claimdesk.demo",
      name: "Priya Kulkarni",
      role: "EXECUTIVE" as const,
    },
    {
      id: headId,
      email: "head@claimdesk.demo",
      name: "Anil Joshi",
      role: "HEAD" as const,
    },
  ]) {
    await database
      .insert(users)
      .values({ ...user, passwordHash })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: user.name, role: user.role, passwordHash },
      });
  }
  for (const payer of PAYERS) {
    const values = { id: seedId(`payer:${payer.name}`), ...payer };
    await database
      .insert(payers)
      .values(values)
      .onConflictDoUpdate({ target: payers.id, set: payer });
  }
  for (const procedure of PROCEDURES) {
    const values = {
      id: seedId(`procedure:${procedure.name}`),
      name: procedure.name,
      specialty: procedure.specialty,
    };
    await database
      .insert(procedures)
      .values(values)
      .onConflictDoUpdate({
        target: procedures.id,
        set: { name: procedure.name, specialty: procedure.specialty },
      });
  }
  for (const [key, label, description] of DOCUMENT_CATALOGUE) {
    const values = {
      id: seedId(`type:${key}`),
      key,
      label,
      description,
      aiHint: description,
    };
    await database
      .insert(documentTypes)
      .values(values)
      .onConflictDoUpdate({
        target: documentTypes.key,
        set: { label, description, aiHint: description },
      });
  }
  type RuleInput = {
    key: string;
    stage: "PREAUTH" | "ENHANCEMENT" | "DISCHARGE";
    payer?: number;
    procedure?: number;
    requirement?: "REQUIRED" | "OPTIONAL" | "WAIVED";
    maxAgeHours?: number;
    note: string;
  };
  const rules: RuleInput[] = [
    ...[
      "PREAUTH_FORM",
      "PHOTO_ID",
      "POLICY_CARD",
      "DOCTOR_NOTES",
      "COST_ESTIMATE",
    ].map((key) => ({
      key,
      stage: "PREAUTH" as const,
      note: "Hospital pre-authorisation baseline",
    })),
    {
      key: "ULTRASOUND_REPORT",
      stage: "PREAUTH",
      procedure: 0,
      note: "Confirm gall bladder imaging before surgery",
    },
    {
      key: "XRAY_REPORT",
      stage: "PREAUTH",
      procedure: 1,
      note: "Knee radiograph supports surgical indication",
    },
    {
      key: "CBC_REPORT",
      stage: "PREAUTH",
      procedure: 2,
      note: "Admission blood counts for dengue",
    },
    {
      key: "PHOTO_ID",
      stage: "PREAUTH",
      payer: 4,
      requirement: "WAIVED",
      note: "Company F accepts the identity on its verified policy card",
    },
    {
      key: "COST_ESTIMATE",
      stage: "PREAUTH",
      payer: 0,
      note: "Company B requires an itemised signed estimate",
    },
    {
      key: "ULTRASOUND_REPORT",
      stage: "PREAUTH",
      payer: 0,
      procedure: 0,
      note: "Company B gall bladder pre-auth requires an ultrasound report",
    },
    {
      key: "DOCTOR_NOTES",
      stage: "ENHANCEMENT",
      note: "Updated clinical justification for additional treatment",
    },
    {
      key: "COST_ESTIMATE",
      stage: "ENHANCEMENT",
      note: "Revised estimate for additional treatment",
    },
    {
      key: "PLATELET_COUNT",
      stage: "ENHANCEMENT",
      procedure: 2,
      maxAgeHours: 24,
      note: "Dengue requires a platelet report no older than 24 hours",
    },
    {
      key: "PLATELET_COUNT",
      stage: "ENHANCEMENT",
      payer: 2,
      procedure: 2,
      maxAgeHours: 24,
      note: "Company D dengue enhancement requires latest 24-hour platelet count",
    },
    ...["DISCHARGE_SUMMARY", "FINAL_BILL", "INVESTIGATION_BILLS"].map(
      (key) => ({
        key,
        stage: "DISCHARGE" as const,
        note: "Hospital discharge packet baseline",
      }),
    ),
    {
      key: "IMPLANT_INVOICE",
      stage: "DISCHARGE",
      procedure: 1,
      requirement: "OPTIONAL",
      note: "Implant invoice if separately billed",
    },
  ];
  for (const rule of rules) {
    const values = {
      id: seedId(
        `rule:${rule.stage}:${rule.key}:${rule.payer ?? "any"}:${rule.procedure ?? "any"}`,
      ),
      payerId:
        rule.payer === undefined
          ? null
          : seedId(`payer:${PAYERS[rule.payer].name}`),
      procedureId:
        rule.procedure === undefined
          ? null
          : seedId(`procedure:${PROCEDURES[rule.procedure].name}`),
      documentTypeId: seedId(`type:${rule.key}`),
      stage: rule.stage,
      requirement: rule.requirement ?? ("REQUIRED" as const),
      maxAgeHours: rule.maxAgeHours ?? null,
      note: rule.note,
      updatedBy: headId,
      updatedAt: now,
    };
    await database
      .insert(checklistRules)
      .values(values)
      .onConflictDoUpdate({ target: checklistRules.id, set: values });
  }
  for (const claim of SEED_CLAIMS) {
    const claimId = seedId(`claim:${claim.code}`);
    const admittedAt = seedAdmission(claim);
    const values = {
      id: claimId,
      code: claim.code,
      patientName: claim.name,
      patientAge: claim.age,
      patientGender: claim.gender,
      uhid: `SYN-${claim.code.slice(4)}`,
      policyNumber: `SYN-${claim.code.slice(4)}-2026`,
      payerId: seedId(`payer:${PAYERS[claim.payer].name}`),
      procedureId: seedId(`procedure:${PROCEDURES[claim.procedure].name}`),
      treatingDoctor: "Dr. Kavita Bendre",
      admittedAt,
      estimatedAmountPaise: BigInt(claim.amount) * BigInt(100),
      approvedAmountPaise: [
        "APPROVED",
        "ENHANCEMENT",
        "FINAL_BILL_SUBMITTED",
        "SETTLED",
      ].includes(claim.status)
        ? BigInt(claim.amount - 5000) * BigInt(100)
        : null,
      status: claim.status,
      assignedTo: desk,
      createdAt: admittedAt,
      updatedAt: now,
    };
    await database
      .insert(claims)
      .values(values)
      .onConflictDoUpdate({ target: claims.code, set: values });
    for (const key of claim.docs) {
      const fileName = `${claim.code}-${key}.pdf`;
      const bytes = await readFile(`seed/files/${fileName}`);
      const pathname = `seed/v1/${claim.code}/${key}.pdf`;
      await put(pathname, bytes, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/pdf",
      });
      const id = seedId(`document:${claim.code}:${key}`);
      const stale = claim.code === "CLM-3385" && key === "PLATELET_COUNT";
      const documentDate = stale ? "2026-11-04" : "2026-11-07";
      const doc = {
        id,
        claimId,
        blobPathname: pathname,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        documentTypeId: seedId(`type:${key}`),
        aiDocumentTypeKey: key,
        aiConfidence: 0.96,
        aiReason: `Synthetic ${DOCUMENT_CATALOGUE.find(([type]) => type === key)?.[1]}. Reviewed by the insurance desk.`,
        classifiedBy: "USER" as const,
        status: "CONFIRMED" as const,
        documentDate,
        uploadedBy: desk,
        uploadedAt: stale
          ? hoursAgo(70)
          : new Date(admittedAt.getTime() + 10 * 60_000),
        confirmedBy: desk,
        confirmedAt: new Date(admittedAt.getTime() + 20 * 60_000),
      };
      await database
        .insert(documents)
        .values(doc)
        .onConflictDoUpdate({ target: documents.id, set: doc });
      if (
        key === "PREAUTH_FORM" ||
        (claim.code === "CLM-3383" && key === "DOCTOR_NOTES")
      ) {
        for (const [fieldKey, value] of Object.entries(
          seedFields(claim, admittedAt),
        )) {
          const confirmed = claim.status !== "PREAUTH_DRAFT";
          const field = {
            id: seedId(`field:${claim.code}:${fieldKey}`),
            claimId,
            documentId: id,
            fieldKey,
            value,
            sourceSnippet: `${fieldKey.replaceAll("_", " ")}: ${value}`,
            confidence: 0.95,
            status: confirmed ? ("CONFIRMED" as const) : ("PENDING" as const),
            reviewedBy: confirmed ? desk : null,
            reviewedAt: confirmed ? now : null,
          };
          await database
            .insert(extractedFields)
            .values(field)
            .onConflictDoUpdate({ target: extractedFields.id, set: field });
        }
      }
    }
    const paths: Partial<Record<ClaimStatus, ClaimStatus[]>> = {
      PREAUTH_DRAFT: ["PREAUTH_DRAFT"],
      PREAUTH_SUBMITTED: ["PREAUTH_DRAFT", "PREAUTH_SUBMITTED"],
      QUERY: ["PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "QUERY"],
      APPROVED: [
        "PREAUTH_DRAFT",
        "PREAUTH_SUBMITTED",
        "QUERY",
        "PREAUTH_SUBMITTED",
        "APPROVED",
      ],
      ENHANCEMENT: [
        "PREAUTH_DRAFT",
        "PREAUTH_SUBMITTED",
        "APPROVED",
        "ENHANCEMENT",
      ],
      FINAL_BILL_SUBMITTED: [
        "PREAUTH_DRAFT",
        "PREAUTH_SUBMITTED",
        "APPROVED",
        "FINAL_BILL_SUBMITTED",
      ],
      SETTLED: [
        "PREAUTH_DRAFT",
        "PREAUTH_SUBMITTED",
        "APPROVED",
        "FINAL_BILL_SUBMITTED",
        "SETTLED",
      ],
      REJECTED: ["PREAUTH_DRAFT", "PREAUTH_SUBMITTED", "REJECTED"],
    };
    const path = paths[claim.status]!;
    for (const [step, status] of path.entries()) {
      const event = {
        id: seedId(`event:${claim.code}:${step}`),
        claimId,
        fromStatus: step === 0 ? null : path[step - 1],
        toStatus: status,
        note:
          status === "REJECTED"
            ? "Coverage exclusion recorded manually. No insurer integration."
            : "Recorded by desk through the insurer's own channel. Synthetic event.",
        actorId: desk,
        at: new Date(
          admittedAt.getTime() + [0, 45, 120, 360, 420][step] * 60_000,
        ),
      };
      await database
        .insert(claimEvents)
        .values(event)
        .onConflictDoUpdate({ target: claimEvents.id, set: event });
      await database
        .insert(auditLogs)
        .values({
          id: seedId(`audit:event:${claim.code}:${step}`),
          actorId: desk,
          action: step === 0 ? "CLAIM_CREATE" : "CLAIM_TRANSITION",
          entityType: "claim",
          entityId: claimId,
          detail: {
            synthetic: true,
            fromStatus: event.fromStatus,
            toStatus: status,
          },
          at: event.at,
        })
        .onConflictDoNothing();
    }
  }
  const queryFixtures = [
    {
      id: seedId("query:CLM-3381:ultrasound"),
      claimCode: "CLM-3381",
      subject: "Pre-auth query: ultrasound report required",
      body: "Dear Insurance Desk, please provide the ultrasound abdomen report supporting the proposed gall bladder removal for this claim. Kindly respond within 24 hours. The request remains pending until the report is received.",
      receivedAt: hoursAgo(27),
      dueAt: hoursAgo(3),
      answered: false,
      type: "ULTRASOUND_REPORT",
      ask: "Upload the ultrasound abdomen report.",
    },
    {
      id: seedId("query:CLM-3385:platelets"),
      claimCode: "CLM-3381",
      subject: "Pre-auth follow-up: itemised estimate clarification",
      body: "In addition to the outstanding ultrasound report, please clarify the itemised procedure estimate and confirm that it includes surgeon and anaesthetist fees. Please respond within 24 hours.",
      receivedAt: hoursAgo(22),
      dueAt: new Date(now.getTime() + 2 * 3_600_000),
      answered: false,
      type: "COST_ESTIMATE",
      ask: "Clarify surgeon and anaesthetist fees in the itemised estimate.",
    },
    {
      id: seedId("query:CLM-3384:estimate"),
      claimCode: "CLM-3384",
      subject: "Please clarify the revised treatment estimate",
      body: "Please confirm the procedure estimate and treating doctor's plan. The reply window is 48 hours.",
      receivedAt: hoursAgo(24),
      dueAt: new Date(now.getTime() + 24 * 3_600_000),
      answered: true,
      type: "COST_ESTIMATE",
      ask: "Confirm the treatment estimate.",
    },
  ];
  for (const query of queryFixtures) {
    const values = {
      id: query.id,
      claimId: seedId(`claim:${query.claimCode}`),
      fromAddress: "claims@example.invalid",
      subject: query.subject,
      body: query.body,
      receivedAt: query.receivedAt,
      dueAt: query.dueAt,
      status: query.answered ? ("ANSWERED" as const) : ("OPEN" as const),
      aiSummary: {
        summary: query.ask,
        asks: [query.ask],
        requested_document_keys: [query.type],
        deadline_text: null,
      },
      aiError: null,
      replyBody: query.answered
        ? "The signed estimate and treating doctor's plan were sent through the TPA portal. Recorded manually by the desk."
        : null,
      answeredAt: query.answered ? hoursAgo(22) : null,
      answeredBy: query.answered ? desk : null,
    };
    await database
      .insert(queries)
      .values(values)
      .onConflictDoUpdate({ target: queries.id, set: values });
  }
  await database
    .insert(auditLogs)
    .values({
      id: seedId("audit:seed"),
      actorId: headId,
      action: "DEMO_SEEDED",
      entityType: "system",
      detail: { synthetic: true, version: 1 },
    })
    .onConflictDoNothing();
  const tables = {
    users,
    payers,
    procedures,
    documentTypes,
    checklistRules,
    claims,
    documents,
    extractedFields,
    queries,
    claimEvents,
    auditLogs,
  };
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(table);
    console.log(`${name}: ${row.count}`);
  }
  const [sample] = await database
    .select({ status: claims.status })
    .from(claims)
    .where(eq(claims.code, "CLM-3381"));
  if (sample?.status !== "QUERY")
    throw new Error("Sample claim verification failed");
}
main().catch(() => {
  console.error(
    "Seed failed. Check DB connectivity, private Blob access and generated seed files.",
  );
  process.exitCode = 1;
});
