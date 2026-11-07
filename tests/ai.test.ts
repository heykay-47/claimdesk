import { describe, expect, it } from "vitest";
import { classifyForReview, summariseForReview } from "../src/ai/client";
import { FakeAiClient } from "../src/ai/fake";
const catalogue = [
  {
    id: "preauth",
    key: "PREAUTH_FORM",
    label: "Pre-auth form",
    aiHint: "form",
  },
];
const result = {
  document_type_key: "PREAUTH_FORM",
  confidence: 0.99,
  reason: "A pre-auth form",
  document_date: "2026-11-07",
  fields: [
    {
      key: "patient_name" as const,
      value: "Fictional Patient",
      source_snippet: "Name: Fictional Patient",
      confidence: 0.99,
    },
  ],
};
describe("AI review boundary", () => {
  it("validates query deadlines and removes unknown requested document keys", async () => {
    const reviewed = await summariseForReview(
      new FakeAiClient(result, {
        summary: "A pre-auth form is requested.",
        asks: ["Send the signed form."],
        requested_document_keys: ["PREAUTH_FORM", "UNKNOWN"],
        deadline_iso: "2026-11-08T17:00:00+05:30",
      }),
      "Signed form required",
      "Send the form by 8 November 2026 at 5pm IST.",
      catalogue,
    );
    expect(reviewed).toMatchObject({
      error: null,
      summary: {
        requested_document_keys: ["PREAUTH_FORM"],
        deadline_iso: "2026-11-08T17:00:00+05:30",
      },
    });
  });
  it("never confirms a high-confidence classification or field", async () => {
    const reviewed = await classifyForReview(
      new FakeAiClient(result),
      new Uint8Array([1]),
      "application/pdf",
      catalogue,
    );
    expect(reviewed).toMatchObject({
      status: "NEEDS_REVIEW",
      documentTypeId: "preauth",
      fields: [{ status: "PENDING", sourceSnippet: "Name: Fictional Patient" }],
    });
  });
  it.each([
    { ...result, confidence: 0.74 },
    { ...result, document_type_key: "UNKNOWN" },
  ])("marks uncertain outputs for manual sorting", async (classification) => {
    expect(
      await classifyForReview(
        new FakeAiClient(classification),
        new Uint8Array([1]),
        "application/pdf",
        catalogue,
      ),
    ).toMatchObject({
      status: "NEEDS_REVIEW",
      aiReason: expect.stringContaining("AI unsure"),
    });
  });
  it("AI failures become FAILED and cannot add fields or fill a checklist slot", async () => {
    expect(
      await classifyForReview(
        new FakeAiClient(new Error("provider failed")),
        new Uint8Array([1]),
        "application/pdf",
        catalogue,
      ),
    ).toMatchObject({
      status: "FAILED",
      documentTypeId: null,
      fields: [],
      error: expect.any(String),
    });
  });
  it("invalid output is rejected and clinical reports cannot propose form fields", async () => {
    expect(
      (
        await classifyForReview(
          new FakeAiClient({ ...result, confidence: 9 }),
          new Uint8Array([1]),
          "application/pdf",
          catalogue,
        )
      ).status,
    ).toBe("FAILED");
    expect(
      (
        await classifyForReview(
          new FakeAiClient({ ...result, document_type_key: "CBC_REPORT" }),
          new Uint8Array([1]),
          "application/pdf",
          catalogue,
        )
      ).fields,
    ).toEqual([]);
    expect(
      await classifyForReview(
        new FakeAiClient({ ...result, document_type_key: "CBC_REPORT" }),
        new Uint8Array([1]),
        "application/pdf",
        catalogue,
      ),
    ).toMatchObject({
      identityEvidence: [
        {
          fieldKey: "patient_name",
          value: "Fictional Patient",
          sourceSnippet: "Name: Fictional Patient",
        },
      ],
    });
  });
  it("query failures retain an explicit error rather than fabricating a summary", async () => {
    expect(
      await summariseForReview(
        new FakeAiClient(result, new Error("timeout")),
        "Subject",
        "Original email",
        catalogue,
      ),
    ).toMatchObject({
      summary: null,
      error: expect.stringContaining("timed out"),
    });
  });
});
