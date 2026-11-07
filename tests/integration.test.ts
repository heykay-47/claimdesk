import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as schema from "../src/db/schema";
import { seedId } from "../seed/data";
import { canTransition } from "../src/domain/claim-status";
import { signSession } from "../src/server/session-token";

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
import {
  AuthenticationError,
  AuthorizationError,
  requireRole,
  verifyCredentials,
} from "../src/server/auth";
import { getClaimChecklist } from "../src/server/claim-checklist";

const schemaName = `claimdesk_test_${randomUUID().replaceAll("-", "")}`;
const client = new Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
});
let now: Date;
let connected = false;
describe("real Postgres foundation", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL_UNPOOLED)
      throw new Error(
        "Integration tests require DATABASE_URL_UNPOOLED and pnpm db:seed",
      );
    await client.connect();
    connected = true;
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}"`);
    const migration = (
      await readFile("drizzle/0000_smiling_otto_octavius.sql", "utf8")
    ).replaceAll('"public"', `"${schemaName}"`);
    for (const statement of migration.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
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
      const result = await client.query(`SELECT * FROM public."${table}"`);
      // JSON record population casts each public enum to the isolated schema's enum.
      if (result.rows.length)
        await client.query(
          `INSERT INTO "${schemaName}"."${table}" SELECT * FROM json_populate_recordset(NULL::"${schemaName}"."${table}", $1::json)`,
          [JSON.stringify(result.rows)],
        );
    }
    state.database = drizzle(client, { schema });
    const result = await client.query(
      "SELECT updated_at FROM claims WHERE code = 'CLM-3385'",
    );
    if (!result.rows[0])
      throw new Error("Run pnpm db:seed before integration tests");
    now = new Date(result.rows[0].updated_at);
  });
  beforeEach(async () => {
    state.token = await signSession(seedId("user:desk"));
  });
  afterAll(async () => {
    if (!connected) return;
    try {
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  });
  it("authenticates seeded passwords without returning the password hash", async () => {
    const user = await verifyCredentials(
      "desk@claimdesk.demo",
      "ClaimDesk@2026",
    );
    expect(user).toMatchObject({ role: "EXECUTIVE", name: "Priya Kulkarni" });
    expect(user).not.toHaveProperty("passwordHash");
    expect(await verifyCredentials("head@claimdesk.demo", "wrong")).toBeNull();
  });
  it("prevents duplicate default rules when both scope IDs are null", async () => {
    await client.query("SAVEPOINT duplicate_rule");
    try {
      await expect(
        client.query(
          "INSERT INTO checklist_rules (id, payer_id, procedure_id, document_type_id, stage, requirement, max_age_hours, note, updated_by, updated_at) SELECT $1, payer_id, procedure_id, document_type_id, stage, requirement, max_age_hours, note, updated_by, updated_at FROM checklist_rules WHERE payer_id IS NULL AND procedure_id IS NULL LIMIT 1",
          [randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT duplicate_rule");
    }
  });
  it("keeps open query fixtures on claims in the query lifecycle state", async () => {
    const result = await client.query(
      "SELECT claims.code FROM queries JOIN claims ON claims.id = queries.claim_id WHERE queries.status = 'OPEN' AND claims.status <> 'QUERY'",
    );
    expect(result.rows).toEqual([]);
  });
  it("enforces HEAD on the server with a real session and user row", async () => {
    await expect(requireRole("HEAD")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    state.token = await signSession(seedId("user:head"));
    await expect(requireRole("HEAD")).resolves.toMatchObject({
      role: "HEAD",
      name: "Anil Joshi",
    });
    state.token = undefined;
    await expect(requireRole("HEAD")).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });
  it("CLM-3381 is blocked only by the missing ultrasound document", async () => {
    const result = await getClaimChecklist(seedId("claim:CLM-3381"), now);
    expect(result.blockers).toEqual([
      {
        kind: "DOCUMENT",
        documentTypeId: seedId("type:ULTRASOUND_REPORT"),
        state: "MISSING",
      },
    ]);
    expect(result.ready).toBe(false);
  });
  it("CLM-3382 has a ready pre-auth checklist", async () => {
    const result = await getClaimChecklist(seedId("claim:CLM-3382"), now);
    expect(result.ready).toBe(true);
    expect(result.counts.requiredSatisfied).toBe(result.counts.required);
  });
  it("CLM-3385 is blocked by the stale platelet report", async () => {
    const result = await getClaimChecklist(seedId("claim:CLM-3385"), now);
    expect(result.blockers).toEqual([
      {
        kind: "DOCUMENT",
        documentTypeId: seedId("type:PLATELET_COUNT"),
        state: "STALE",
      },
    ]);
    expect(
      canTransition("ENHANCEMENT", "submit_enhancement", {
        readiness: { ENHANCEMENT: result.ready },
      }),
    ).toBe(false);
  });
  it("refuses pre-auth submission when the DB-loaded checklist has a gap", async () => {
    const result = await getClaimChecklist(seedId("claim:CLM-3381"), now);
    expect(
      canTransition("PREAUTH_DRAFT", "submit_preauth", {
        readiness: { PREAUTH: result.ready },
      }),
    ).toBe(false);
  });
});
