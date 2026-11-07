import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL_UNPOOLED)
  throw new Error("DATABASE_URL_UNPOOLED is required");
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED },
});
