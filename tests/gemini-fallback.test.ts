import { describe, expect, it, vi } from "vitest";
import { GenerateContentResponse } from "@google/genai";
import { GeminiAiClient } from "../src/ai/gemini";

function response(value: unknown) {
  const result = new GenerateContentResponse();
  result.candidates = [
    { content: { parts: [{ text: JSON.stringify(value) }] } },
  ];
  return result;
}
const classification = {
  document_type_key: "OTHER",
  confidence: 0.9,
  reason: "Evidence",
  document_date: null,
  fields: [],
};
describe("Gemini model fallback", () => {
  it.each([503, 429, 504])(
    "falls back after transient %s and records the answering model",
    async (status) => {
      const generate = vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("Provider unavailable"), { status }),
        )
        .mockResolvedValueOnce(response(classification));
      const ai = new GeminiAiClient("primary", 25000, generate, ["fallback"]);
      const result = await ai.classifyAndExtract(
        new Uint8Array([1]),
        "application/pdf",
        [],
      );
      expect(generate.mock.calls.map(([input]) => input.model)).toEqual([
        "primary",
        "fallback",
      ]);
      expect(result.reason).toContain("Model: fallback");
      expect(generate.mock.calls[0][0].config.httpOptions.apiVersion).toBe(
        "v1beta",
      );
      expect(
        generate.mock.calls[0][0].config.httpOptions.timeout,
      ).toBeLessThanOrEqual(22500);
    },
  );
  it("falls back after a timeout", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockResolvedValueOnce(response(classification));
    await expect(
      new GeminiAiClient("a", 25000, generate, ["b"]).classifyAndExtract(
        new Uint8Array([1]),
        "application/pdf",
        [],
      ),
    ).resolves.toMatchObject({ reason: "Evidence [Model: b]" });
  });
  it.each([400, 401])("does not retry non-transient %s", async (status) => {
    const generate = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("Invalid request"), { status }),
      );
    await expect(
      new GeminiAiClient("a", 25000, generate, ["b"]).classifyAndExtract(
        new Uint8Array([1]),
        "application/pdf",
        [],
      ),
    ).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("does not retry invalid structured output", async () => {
    const generate = vi.fn().mockResolvedValue(response({ confidence: 4 }));
    await expect(
      new GeminiAiClient("a", 25000, generate, ["b"]).classifyAndExtract(
        new Uint8Array([1]),
        "application/pdf",
        [],
      ),
    ).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
