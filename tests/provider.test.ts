import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiClient } from "../src/ai/provider";
import { GeminiAiClient } from "../src/ai/gemini";
import { FakeAiClient } from "../src/ai/fake";

afterEach(() => vi.unstubAllEnvs());
describe("server AI provider selection", () => {
  it("defaults to Gemini without calling a provider at construction", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("GEMINI_API_KEY", "test-only-never-sent");
    expect(createAiClient()).toBeInstanceOf(GeminiAiClient);
  });
  it("requires an explicit fake flag and returns the deterministic upload fixture", async () => {
    vi.stubEnv("AI_PROVIDER", "fake");
    const client = createAiClient();
    expect(client).toBeInstanceOf(FakeAiClient);
    expect(
      await client.classifyAndExtract(
        new Uint8Array([1]),
        "application/pdf",
        [],
      ),
    ).toMatchObject({
      document_type_key: "ULTRASOUND_REPORT",
      confidence: 0.99,
      fields: [],
    });
  });
});
