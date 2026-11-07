import { readdir, readFile } from "node:fs/promises";
import type { Client } from "@neondatabase/serverless";

export async function migrateTestSchema(client: Client, schemaName: string) {
  const files = (await readdir("drizzle"))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();
  for (const file of files) {
    const migration = (await readFile(`drizzle/${file}`, "utf8")).replaceAll(
      '"public"',
      `"${schemaName}"`,
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
  }
}
