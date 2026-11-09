import "./env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { migrateTestSchema } from "../tests/migrate-schema";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    const name = `storage_migration_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${name}"`);
    await client.query(`SET LOCAL search_path TO "${name}"`);
    await migrateTestSchema(client, name);
    for (const table of [
      "users", "payers", "procedures", "claims", "document_types", "documents",
    ]) {
      const { rows } = await client.query(`SELECT * FROM public."${table}"`);
      if (rows.length) await client.query(
        `INSERT INTO "${name}"."${table}" SELECT * FROM json_populate_recordset(NULL::"${name}"."${table}", $1::json)`,
        [JSON.stringify(rows)],
      );
    }
    const database = drizzle(client, { schema });
    const [document] = await database.select().from(schema.documents).limit(1);
    assert(document, "A seeded document is required");
    const bytes = Buffer.from([0, 1, 127, 128, 255, 10, 13]);
    await database.insert(schema.documentFiles).values({
      documentId: document.id, content: bytes,
    });
    const [stored] = await database.select().from(schema.documentFiles)
      .where(eq(schema.documentFiles.documentId, document.id));
    assert.deepEqual(stored.content, bytes);
    assert(document.blobPathname, "Legacy pathname remains intact");
    await database.delete(schema.documents).where(eq(schema.documents.id, document.id));
    assert.equal((await database.select().from(schema.documentFiles)).length, 0);
    console.log("PASS isolated migrations 0000 through 0003, bytea round trip, legacy pathname preserved, cascading delete");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}
main().catch(() => {
  console.error("Isolated storage migration verification failed");
  process.exitCode = 1;
});
