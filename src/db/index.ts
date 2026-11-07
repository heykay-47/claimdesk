import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let connection: NeonHttpDatabase<typeof schema> | undefined;
export function db() {
  if (!connection) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    connection = drizzle(neon(url), { schema });
  }
  return connection;
}
