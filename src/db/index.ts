import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
neonConfig.poolQueryViaFetch = true;

let connection: NeonDatabase<typeof schema> | undefined;
export function db() {
  if (!connection) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    connection = drizzle(
      new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 }),
      { schema },
    );
  }
  return connection;
}
