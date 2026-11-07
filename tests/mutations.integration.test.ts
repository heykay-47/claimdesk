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
vi.mock("@/server/storage", async (original) => {
  const actual = await original<typeof import("../src/server/storage")>();
  return {
    ...actual,
    readDocument: async () => ({
      statusCode: 200,
      blob: { contentType: "application/pdf", size: 20 },
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(20));
          controller.close();
        },
      }),
    }),
  };
});
vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: vi.fn(
    async () => "test-scoped-upload-token",
  ),
}));
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import {
  prepareDirectUpload,
  completeDirectUpload,
} from "../src/server/direct-upload";
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
} from "../src/server/mutations";
import { getClaimChecklist } from "../src/server/claim-checklist";
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
async function upload(ai = ultrasound) {
  const metadata = {
    claimId,
    fileName: "ultrasound.pdf",
    mimeType: "application/pdf",
    sizeBytes: 20,
  };
  const permit = await prepareDirectUpload(metadata);
  return completeDirectUpload({ ...metadata, uploadId: permit.uploadId }, ai);
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
  it("scopes private upload tokens to the exact file, type, size and a five-minute lifetime", async () => {
    const metadata = {
      claimId,
      fileName: "ultrasound.pdf",
      mimeType: "application/pdf",
      sizeBytes: 20,
    };
    const permit = await prepareDirectUpload(metadata);
    expect(generateClientTokenFromReadWriteToken).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: permit.pathname,
        allowedContentTypes: ["application/pdf"],
        maximumSizeInBytes: 20,
        addRandomSuffix: false,
        allowOverwrite: false,
      }),
    );
    expect(permit.pathname).toContain(seedId("user:desk"));
    await expect(
      prepareDirectUpload({ ...metadata, sizeBytes: 10 * 1024 * 1024 + 1 }),
    ).rejects.toThrow();
    state.token = await signSession(seedId("user:head"));
    await expect(
      completeDirectUpload(
        { ...metadata, uploadId: permit.uploadId },
        ultrasound,
      ),
    ).rejects.toBeInstanceOf(InputError);
  });
  it("finalising the same private upload twice does not duplicate documents or AI fields", async () => {
    const metadata = {
      claimId,
      fileName: "ultrasound.pdf",
      mimeType: "application/pdf",
      sizeBytes: 20,
    };
    const permit = await prepareDirectUpload(metadata);
    await completeDirectUpload(
      { ...metadata, uploadId: permit.uploadId },
      ultrasound,
    );
    await completeDirectUpload(
      { ...metadata, uploadId: permit.uploadId },
      ultrasound,
    );
    expect(
      await database
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, permit.uploadId)),
    ).toHaveLength(1);
    const audits = await database
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, permit.uploadId));
    expect(audits.filter((a) => a.action === "DOCUMENT_UPLOAD")).toHaveLength(
      1,
    );
    expect(audits.filter((a) => a.action === "DOCUMENT_AI")).toHaveLength(1);
  });
});
