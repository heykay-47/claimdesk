import { defineConfig } from "vitest/config";
import { loadEnvConfig } from "@next/env";
import path from "node:path";
loadEnvConfig(process.cwd());
export default defineConfig({
  resolve: { alias: { "@": path.resolve("src"), "server-only": path.resolve("tests/server-only.ts") } },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000 },
});
