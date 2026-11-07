import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.SESSION_SECRET ??= "claimdesk-test-only-secret-not-for-production";
