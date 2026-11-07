import "server-only";
import type { AiClient } from "./client";
import { FakeAiClient } from "./fake";
import { GeminiAiClient } from "./gemini";

export function createAiClient(): AiClient {
  if (process.env.AI_PROVIDER === "fake")
    return new FakeAiClient({
      document_type_key: "ULTRASOUND_REPORT",
      confidence: 0.99,
      reason:
        "Deterministic end-to-end ultrasound fixture. No AI provider was called.",
      document_date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(new Date()),
      fields: [],
    });
  return new GeminiAiClient();
}
