import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { randomUUID } from "node:crypto";
import { migrateTestSchema } from "./migrate-schema";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { seedId } from "../seed/data";
import { signSession } from "../src/server/session-token";
import { FakeAiClient } from "../src/ai/fake";
const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  database: undefined as unknown,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.token ? { value: state.token } : undefined),
  }),
}));
vi.mock("@/db", () => ({ db: () => state.database }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { uploadDocument } from "../src/server/upload";
import { POST as postUpload } from "../src/app/api/documents/upload/route";
import { FILE_SIZE_ERROR, MAX_FILE_BYTES } from "../src/domain/document-upload";
import {
  createClaim,
  transitionClaim,
  reviewDocument,
  reviewField,
  logQuery,
  answerQuery,
  saveRule,
  deleteRule,
  InputError,
  processDocument,
} from "../src/server/mutations";
import { getClaimChecklist } from "../src/server/claim-checklist";
import { claimFile } from "../src/server/workspace";
import { GET as documentFile } from "../src/app/api/documents/[id]/file/route";
import { AuthorizationError, AuthenticationError } from "../src/server/auth";
import { runAction } from "../src/app/actions";
import { resetDemoAsHead } from "../src/server/demo-reset";
const client = new Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
});
const schemaName = `claimdesk_mutations_${randomUUID().replaceAll("-", "")}`;
let database: NeonDatabase<typeof schema>;
let connected = false;
const ultrasound = new FakeAiClient({
  document_type_key: "ULTRASOUND_REPORT",
  confidence: 0.96,
  reason: "Ultrasound findings",
  document_date: "2026-11-07",
  fields: [],
});
const claimId = seedId("claim:CLM-3381");
const wrongPatient = new FakeAiClient({
  document_type_key: "DOCTOR_NOTES",
  confidence: 0.98,
  reason: "Handwritten admission note",
  document_date: null,
  fields: [
    {
      key: "patient_name",
      value: "Imran Shaikh",
      source_snippet: "Patient: Imran Shaikh, 34/M",
      confidence: 0.98,
    },
    { key: "age", value: "34", source_snippet: "34/M", confidence: 0.98 },
    { key: "gender", value: "M", source_snippet: "34/M", confidence: 0.98 },
  ],
});
async function upload(ai = ultrasound) {
  return uploadDocument(
    claimId,
    new File([new Uint8Array(20)], "ultrasound.pdf", { type: "application/pdf" }),
    ai,
  );
}
describe("audited workspace mutations against real Postgres", () => {
  beforeAll(async () => {
    await client.connect();
    connected = true;
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}"`);
    await migrateTestSchema(client, schemaName);
    for (const table of [
      "users",
      "payers",
      "procedures",
      "document_types",
      "checklist_rules",
      "claims",
      "claim_events",
      "documents",
      "extracted_fields",
      "queries",
      "audit_logs",
    ]) {
      const { rows } = await client.query(`SELECT * FROM public."${table}"`);
      if (rows.length)
        await client.query(
          `INSERT INTO "${schemaName}"."${table}" SELECT * FROM json_populate_recordset(NULL::"${schemaName}"."${table}", $1::json)`,
          [JSON.stringify(rows)],
        );
    }
    await client.query(
      `INSERT INTO "${schemaName}".document_files SELECT * FROM public.document_files`,
    );
    database = drizzle(client, { schema });
    state.database = new Proxy(database, {
      get(target, property) {
        if (property === "transaction")
          return async (
            callback: (tx: typeof database) => Promise<unknown>,
          ) => {
            const savepoint = `mutation_${randomUUID().replaceAll("-", "")}`;
            await client.query(`SAVEPOINT ${savepoint}`);
            try {
              const result = await callback(target);
              await client.query(`RELEASE SAVEPOINT ${savepoint}`);
              return result;
            } catch (error) {
              await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
              await client.query(`RELEASE SAVEPOINT ${savepoint}`);
              throw error;
            }
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
  beforeEach(async () => {
    await client.query("SAVEPOINT test_case");
    state.token = await signSession(seedId("user:desk"));
  });
  afterEach(async () => {
    await client.query("ROLLBACK TO SAVEPOINT test_case");
  });
  afterAll(async () => {
    if (connected) {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
  it("creates a draft, timeline event and audit row together", async () => {
    const result = await createClaim({
      patientName: "Synthetic Patient",
      patientAge: "39",
      patientGender: "Female",
      uhid: "TEST-123",
      policyNumber: "SYN-TEST",
      payerId: seedId("payer:Company B"),
      procedureId: seedId("procedure:Gall bladder removal"),
      treatingDoctor: "Dr Synthetic",
      admittedAt: "2026-11-01T10:30",
      amount: "85000.25",
    });
    const [claim] = await database
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.code, result.code));
    expect(claim).toMatchObject({
      status: "PREAUTH_DRAFT",
      estimatedAmountPaise: BigInt(8500025),
    });
    expect(
      await database
        .select()
        .from(schema.claimEvents)
        .where(eq(schema.claimEvents.claimId, claim.id)),
    ).toHaveLength(1);
    expect(
      (
        await database
          .select()
          .from(schema.auditLogs)
          .where(eq(schema.auditLogs.entityId, claim.id))
      ).some((a) => a.action === "CLAIM_CREATE"),
    ).toBe(true);
  });
  it("uploads classify into suggested slots, remain unconfirmed, then confirm changes readiness", async () => {
    const result = await upload();
    const [file] = await database
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, result.id));
    expect(file).toMatchObject({
      status: "NEEDS_REVIEW",
      documentTypeId: seedId("type:ULTRASOUND_REPORT"),
    });
    expect((await getClaimChecklist(claimId)).ready).toBe(false);
    expect(
      await runAction("reviewDocument", {
        documentId: result.id,
        action: "CONFIRM",
      }),
    ).toEqual({ ok: true, data: undefined });
    expect((await getClaimChecklist(claimId)).ready).toBe(true);
    const audits = await database
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, result.id));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "DOCUMENT_UPLOAD",
        "DOCUMENT_AI",
        "DOCUMENT_CONFIRM",
      ]),
    );
  });
  it("AI failure saves an unsorted file without satisfying a slot", async () => {
    const result = await upload(new FakeAiClient(new Error("Unavailable")));
    expect(result.status).toBe("FAILED");
    const checklist = await getClaimChecklist(claimId);
    expect(checklist.unsorted.map((d) => d.id)).toContain(result.id);
    expect(checklist.ready).toBe(false);
  });
  it("blocks a wrong-patient note even when all required slots already have confirmed files", async () => {
    const ultrasound = await upload();
    await reviewDocument({ documentId: ultrasound.id, action: "CONFIRM" });
    const result = await upload(wrongPatient);
    const checklist = await getClaimChecklist(claimId);
    expect(checklist.ready).toBe(false);
    expect(checklist.blockers).toContainEqual(
      expect.objectContaining({ kind: "IDENTITY", documentId: result.id }),
    );
    await expect(
      reviewDocument({ documentId: result.id, action: "CONFIRM" }),
    ).rejects.toThrow("Different patient");
    await reviewDocument({
      documentId: result.id,
      action: "MOVE",
      documentTypeId: seedId("type:PHOTO_ID"),
    });
    expect((await getClaimChecklist(claimId)).blockers).toContainEqual(
      expect.objectContaining({ kind: "IDENTITY", documentId: result.id }),
    );
    const fields = await database
      .select()
      .from(schema.extractedFields)
      .where(eq(schema.extractedFields.documentId, result.id));
    expect(fields.find((field) => field.fieldKey === "gender")?.value).toBe(
      "Male",
    );
    const name = fields.find((field) => field.fieldKey === "patient_name")!;
    await expect(
      reviewField({
        claimId,
        fieldId: name.id,
        fieldKey: "patient_name",
        action: "CONFIRM",
        value: "Rajendra Pawar",
      }),
    ).rejects.toThrow("different patient");
    await reviewField({
      claimId,
      fieldId: name.id,
      fieldKey: "patient_name",
      action: "REJECT",
      value: name.value,
    });
    expect((await getClaimChecklist(claimId)).blockers).toContainEqual(
      expect.objectContaining({ kind: "IDENTITY", documentId: result.id }),
    );
    await database
      .update(schema.claims)
      .set({ status: "PREAUTH_DRAFT" })
      .where(eq(schema.claims.id, claimId));
    await expect(
      transitionClaim({ claimId, action: "submit_preauth" }),
    ).rejects.toThrow("Submission blocked");
    await reviewDocument({ documentId: result.id, action: "CONFIRM_IDENTITY" });
    const cleared = await getClaimChecklist(claimId);
    expect(
      cleared.blockers.some((blocker) => blocker.kind === "IDENTITY"),
    ).toBe(false);
    expect(cleared.ready).toBe(true);
    const [file] = await database
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, result.id));
    expect(file).toMatchObject({
      status: "CONFIRMED",
      identityOverrideBy: seedId("user:desk"),
    });
    expect(file.identityOverrideAt).toBeInstanceOf(Date);
    const audits = await database
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, result.id));
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "DOCUMENT_IDENTITY_OVERRIDE",
        actorId: seedId("user:desk"),
        detail: expect.objectContaining({
          differences: [
            expect.objectContaining({
              found: "Imran Shaikh",
              expected: "Rajendra Pawar",
            }),
          ],
        }),
      }),
    );
    await transitionClaim({ claimId, action: "submit_preauth" });
  });
  it("removes a mismatched document and its candidates from every claim view while retaining an audit", async () => {
    const result = await upload(wrongPatient);
    await expect(
      reviewDocument({ documentId: result.id, action: "REMOVE" }),
    ).rejects.toThrow("Confirm removal");
    await reviewDocument({
      documentId: result.id,
      action: "REMOVE",
      confirmedRemoval: true,
    });
    const checklist = await getClaimChecklist(claimId);
    expect(
      checklist.blockers.some((blocker) => blocker.kind === "IDENTITY"),
    ).toBe(false);
    expect(
      checklist.slots
        .flatMap((slot) => slot.documents)
        .some((document) => document.id === result.id),
    ).toBe(false);
    const file = await claimFile("CLM-3381");
    expect(file.files.some((document) => document.id === result.id)).toBe(
      false,
    );
    expect(file.fields.some((field) => field.documentId === result.id)).toBe(
      false,
    );
    expect(
      (
        await documentFile(new Request("https://example.test"), {
          params: Promise.resolve({ id: result.id }),
        })
      ).status,
    ).toBe(404);
    await expect(
      reviewDocument({ documentId: result.id, action: "CONFIRM_IDENTITY" }),
    ).rejects.toThrow();
    const [removed] = await database
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, result.id));
    expect(removed.removedAt).toBeInstanceOf(Date);
    expect(removed.removedBy).toBe(seedId("user:desk"));
    expect(
      await database
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, result.id)),
    ).toContainEqual(
      expect.objectContaining({
        action: "DOCUMENT_REMOVE",
        actorId: seedId("user:desk"),
      }),
    );
  });
  it("retains a late identity extraction without overwriting the desk's chosen slot or confirmation", async () => {
    const ai = new FakeAiClient();
    ai.classifyAndExtract = async () => {
      const [processing] = await database
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.status, "PROCESSING"));
      await reviewDocument({
        documentId: processing.id,
        action: "MOVE",
        documentTypeId: seedId("type:PHOTO_ID"),
      });
      await reviewDocument({ documentId: processing.id, action: "CONFIRM" });
      return wrongPatient.classifyAndExtract();
    };
    const result = await upload(ai);
    const [file] = await database
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, result.id));
    expect(file).toMatchObject({
      status: "CONFIRMED",
      documentTypeId: seedId("type:PHOTO_ID"),
      classifiedBy: "USER",
    });
    expect(file.identityEvidence).toContainEqual(
      expect.objectContaining({
        fieldKey: "patient_name",
        value: "Imran Shaikh",
      }),
    );
    expect((await getClaimChecklist(claimId)).blockers).toContainEqual(
      expect.objectContaining({ kind: "IDENTITY", documentId: result.id }),
    );
    const repeat = new FakeAiClient();
    const classify = vi.spyOn(repeat, "classifyAndExtract");
    await processDocument(result.id, new Uint8Array([1]), repeat);
    expect(classify).not.toHaveBeenCalled();
  });
  it("low confidence stays unsorted and moving a confirmed file requires reconfirmation", async () => {
    const result = await upload(
      new FakeAiClient({
        document_type_key: "ULTRASOUND_REPORT",
        confidence: 0.4,
        reason: "Ambiguous",
        document_date: null,
        fields: [],
      }),
    );
    expect(
      (await getClaimChecklist(claimId)).unsorted.map((d) => d.id),
    ).toContain(result.id);
    await reviewDocument({
      documentId: result.id,
      action: "MOVE",
      documentTypeId: seedId("type:ULTRASOUND_REPORT"),
    });
    await reviewDocument({ documentId: result.id, action: "CONFIRM" });
    expect((await getClaimChecklist(claimId)).ready).toBe(true);
    await reviewDocument({
      documentId: result.id,
      action: "MOVE",
      documentTypeId: seedId("type:XRAY_REPORT"),
    });
    expect((await getClaimChecklist(claimId)).ready).toBe(false);
  });
  it("transition gates are checked from the DB, not client status", async () => {
    await database
      .update(schema.claims)
      .set({ status: "PREAUTH_DRAFT" })
      .where(eq(schema.claims.id, claimId));
    await expect(
      transitionClaim({ claimId, action: "submit_preauth", note: "" }),
    ).rejects.toBeInstanceOf(InputError);
    const doc = await upload();
    await reviewDocument({ documentId: doc.id, action: "CONFIRM" });
    await transitionClaim({
      claimId,
      action: "submit_preauth",
      note: "Packet sent",
    });
    const [claim] = await database
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId));
    expect(claim.status).toBe("PREAUTH_SUBMITTED");
    await expect(
      transitionClaim({ claimId, action: "submit_preauth", note: "Duplicate" }),
    ).rejects.toBeInstanceOf(InputError);
  });
  it("logging a query sets the payer deadline and moves the claim to QUERY", async () => {
    const id = seedId("claim:CLM-3382");
    const received = new Date("2026-11-06T10:00:00+05:30");
    const result = await logQuery(
      {
        claimId: id,
        fromAddress: "payer@example.test",
        subject: "Need report",
        body: "Please share the report",
        receivedAt: received.toISOString(),
      },
      new FakeAiClient(),
    );
    const [query] = await database
      .select()
      .from(schema.queries)
      .where(eq(schema.queries.id, result.id));
    const [claim] = await database
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, id));
    const [payer] = await database
      .select()
      .from(schema.payers)
      .where(eq(schema.payers.id, claim.payerId));
    expect(query.dueAt.getTime()).toBe(
      received.getTime() + payer.queryReplyHours * 3600000,
    );
    expect(claim.status).toBe("QUERY");
    expect(query.body).toBe("Please share the report");
  });
  it("keeps original email on AI failure and accepts an explicit AI deadline", async () => {
    const id = seedId("claim:CLM-3382");
    const input = {
      claimId: id,
      fromAddress: "payer@example.test",
      subject: "Need report",
      body: "Original full email",
      receivedAt: "2026-11-06T10:00",
    };
    const failed = await logQuery(
      input,
      new FakeAiClient(undefined, new Error("Unavailable")),
    );
    const [query] = await database
      .select()
      .from(schema.queries)
      .where(eq(schema.queries.id, failed.id));
    expect(query).toMatchObject({ body: input.body, aiSummary: null });
    expect(query.aiError).toBeTruthy();
    const explicit = await logQuery(
      input,
      new FakeAiClient(undefined, {
        summary: "Report needed",
        asks: ["Report"],
        requested_document_keys: [],
        deadline_iso: "2026-11-08T16:00:00+05:30",
      }),
    );
    const [row] = await database
      .select()
      .from(schema.queries)
      .where(eq(schema.queries.id, explicit.id));
    expect(row.dueAt.toISOString()).toBe("2026-11-08T10:30:00.000Z");
  });
  it("answering only the last open query returns the claim to PREAUTH_SUBMITTED", async () => {
    const open = await database
      .select()
      .from(schema.queries)
      .where(eq(schema.queries.claimId, claimId));
    expect(open.filter((q) => q.status === "OPEN").length).toBeGreaterThan(1);
    const [first, ...rest] = open.filter((q) => q.status === "OPEN");
    await answerQuery({
      queryId: first.id,
      replyBody: "Sent through the payer portal",
    });
    expect(
      (
        await database
          .select()
          .from(schema.claims)
          .where(eq(schema.claims.id, claimId))
      )[0].status,
    ).toBe("QUERY");
    for (const query of rest)
      await answerQuery({
        queryId: query.id,
        replyBody: "Sent requested records",
      });
    expect(
      (
        await database
          .select()
          .from(schema.claims)
          .where(eq(schema.claims.id, claimId))
      )[0].status,
    ).toBe("PREAUTH_SUBMITTED");
    await expect(
      answerQuery({ queryId: first.id, replyBody: "Duplicate" }),
    ).rejects.toBeInstanceOf(InputError);
  });
  it("field confirmation resolves conflicting suggestions and rejection restores the gate", async () => {
    const [source] = await database
      .select()
      .from(schema.extractedFields)
      .where(eq(schema.extractedFields.claimId, claimId));
    await reviewField({
      claimId,
      fieldKey: "patient_name",
      documentId: source.documentId,
      value: "Verified Synthetic Name",
      action: "CONFIRM",
    });
    const fields = await database
      .select()
      .from(schema.extractedFields)
      .where(eq(schema.extractedFields.claimId, claimId));
    const confirmed = fields.filter(
      (f) => f.fieldKey === "patient_name" && f.status === "CONFIRMED",
    );
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].value).toBe("Verified Synthetic Name");
    await reviewField({
      claimId,
      fieldKey: "patient_name",
      fieldId: confirmed[0].id,
      value: confirmed[0].value,
      action: "REJECT",
    });
    expect((await getClaimChecklist(claimId)).blockers).toContainEqual({
      kind: "FIELD",
      fieldKey: "patient_name",
      label: "Patient name",
    });
  });
  it("EXECUTIVE is forbidden from rule writes and HEAD changes affect readiness", async () => {
    const data = {
      payerId: seedId("payer:Company B"),
      procedureId: seedId("procedure:Gall bladder removal"),
      documentTypeId: seedId("type:ULTRASOUND_REPORT"),
      stage: "PREAUTH",
      requirement: "WAIVED",
      maxAgeHours: null,
      note: "Synthetic waiver",
      confirmedWaiver: true,
    };
    await expect(saveRule(data)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(deleteRule({ ruleId: randomUUID() })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    state.token = await signSession(seedId("user:head"));
    await expect(
      saveRule({ ...data, confirmedWaiver: false }),
    ).rejects.toBeInstanceOf(InputError);
    await saveRule(data);
    expect((await getClaimChecklist(claimId)).ready).toBe(true);
  });
  it("rejects unauthenticated and invalid boundary inputs before writes", async () => {
    await expect(
      reviewDocument({ documentId: "invalid", action: "CONFIRM" }),
    ).rejects.toThrow();
    state.token = undefined;
    await expect(
      transitionClaim({
        claimId,
        action: "record_approval",
        amount: "1",
        note: "",
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
  it("server actions return safe authorization and validation errors", async () => {
    await expect(
      resetDemoAsHead({ confirmedReset: true }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await runAction("resetDemo", { confirmedReset: true })).toEqual({
      ok: false,
      error: "This action requires the desk head role",
    });
    expect(await runAction("saveRule", {})).toEqual({
      ok: false,
      error: "This action requires the desk head role",
    });
    const result = await runAction("reviewDocument", {
      documentId: "not-a-uuid",
      action: "CONFIRM",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("documentId");
  });
  it("records settlement and optional deductions with the lifecycle and audit atomically", async () => {
    const id = seedId("claim:CLM-3386");
    await transitionClaim({
      claimId: id,
      action: "record_settlement",
      amount: "35000.50",
      deduction: { amount: "2000.25", reason: "CO_PAY" },
      note: "Recorded from payer advice",
    });
    const [claim] = await database
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, id));
    expect(claim).toMatchObject({
      status: "SETTLED",
      settledAmountPaise: BigInt(3500050),
      deductionAmountPaise: BigInt(200025),
      deductionReason: "CO_PAY",
    });
    const audits = await database
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, id));
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "CLAIM_TRANSITION",
        detail: expect.objectContaining({
          action: "record_settlement",
          deduction: { amountPaise: "200025", reason: "CO_PAY" },
        }),
      }),
    );
  });
  it("leaves unrecorded deductions null and rejects incomplete or invalid captures", async () => {
    const id = seedId("claim:CLM-3386");
    for (const deduction of [
      { amount: "0", reason: "CO_PAY" },
      { amount: "20", reason: "UNKNOWN" },
      { amount: "20" },
    ])
      await expect(
        transitionClaim({
          claimId: id,
          action: "record_settlement",
          amount: "35000",
          deduction,
        }),
      ).rejects.toThrow();
    await transitionClaim({
      claimId: id,
      action: "record_settlement",
      amount: "35000",
    });
    const [claim] = await database
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, id));
    expect(claim).toMatchObject({
      settledAmountPaise: BigInt(3500000),
      deductionAmountPaise: null,
      deductionReason: null,
    });
    await client.query("SAVEPOINT deduction_guard");
    try {
      await expect(
        client.query(
          "UPDATE claims SET deduction_amount_paise = 100, deduction_reason = NULL WHERE code = 'CLM-3386'",
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT deduction_guard");
    }
  });
  it("round trips stored bytes through the authenticated file route and audits the view and download", async () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 10, 13]);
    const result = await uploadDocument(
      claimId,
      new File([bytes], "roundtrip.pdf", { type: "application/pdf" }),
      ultrasound,
    );
    for (const download of [false, true]) {
      const response = await documentFile(
        new Request(`https://example.test/api/documents/${result.id}/file${download ? "?download=1" : ""}`),
        { params: Promise.resolve({ id: result.id }) },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Content-Type")).toBe("application/pdf");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
    const audits = await database
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, result.id));
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining(["DOCUMENT_VIEW", "DOCUMENT_DOWNLOAD"]),
    );
    state.token = undefined;
    const denied = await documentFile(new Request("https://example.test"), {
      params: Promise.resolve({ id: result.id }),
    });
    expect(denied.status).toBe(401);
  });
  it("rejects files over 4 MB and wrong MIME at the multipart boundary with clear messages", async () => {
    for (const [file, message] of [
      [
        new File([new Uint8Array(MAX_FILE_BYTES + 1)], "large.pdf", { type: "application/pdf" }),
        FILE_SIZE_ERROR,
      ],
      [
        new File(["text"], "note.txt", { type: "text/plain" }),
        "Use a PDF, JPG, PNG or WebP file.",
      ],
    ] as const) {
      const body = new FormData();
      body.set("claimId", claimId);
      body.set("file", file);
      const response = await postUpload(
        new Request("https://example.test/api/documents/upload", {
          method: "POST",
          headers: { origin: "https://example.test", host: "example.test" },
          body,
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: message });
    }
  });
  it("rejects cross-origin and unauthenticated uploads before storing files", async () => {
    const request = () => new Request("https://example.test/api/documents/upload", {
      method: "POST",
      headers: { origin: "https://other.test", host: "example.test" },
    });
    expect((await postUpload(request())).status).toBe(403);
    state.token = undefined;
    expect((await postUpload(request())).status).toBe(401);
  });
  it("rolls back document and bytes together if the upload audit cannot be written", async () => {
    const beforeDocs = await database
      .select({ id: schema.documents.id }).from(schema.documents);
    const beforeFiles = await database
      .select({ id: schema.documentFiles.documentId }).from(schema.documentFiles);
    await client.query(`CREATE FUNCTION fail_upload_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'upload audit unavailable'; END $$`);
    await client.query(`CREATE TRIGGER fail_upload_audit BEFORE INSERT ON audit_logs FOR EACH ROW WHEN (NEW.action = 'DOCUMENT_UPLOAD') EXECUTE FUNCTION fail_upload_audit()`);
    await expect(upload()).rejects.toThrow();
    expect(
      await database.select({ id: schema.documents.id }).from(schema.documents),
    ).toHaveLength(beforeDocs.length);
    expect(
      await database.select({ id: schema.documentFiles.documentId }).from(schema.documentFiles),
    ).toHaveLength(beforeFiles.length);
  });
  it("cascades stored bytes when the document is deleted and forbids orphan file rows", async () => {
    const result = await upload();
    const stored = () => database.select().from(schema.documentFiles)
      .where(eq(schema.documentFiles.documentId, result.id));
    expect(await stored()).toHaveLength(1);
    await database.delete(schema.documents).where(eq(schema.documents.id, result.id));
    expect(await stored()).toHaveLength(0);
    await client.query("SAVEPOINT orphan_guard");
    try {
      await expect(client.query(
        "INSERT INTO document_files(document_id, content) VALUES ($1, $2)",
        [randomUUID(), Buffer.from([1])],
      )).rejects.toMatchObject({ code: "23503" });
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT orphan_guard");
    }
  });
});
