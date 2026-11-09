import "./env";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { auditLogs, documents, extractedFields } from "../src/db/schema";
import { seedId } from "../seed/data";
import { login } from "../e2e/helpers";
import { classifyForReview } from "../src/ai/client";
import { FakeAiClient } from "../src/ai/fake";

async function main() {
  const baseURL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3012";
  const ids: string[] = [];
  const [source] = await db()
    .select()
    .from(documents)
    .where(eq(documents.id, seedId("document:CLM-3385:DOCTOR_NOTES")));
  if (!source)
    throw new Error("Run the demo seed before identity verification.");
  const browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  async function fixture() {
    const documentId = randomUUID();
    ids.push(documentId);
    const { fields, ...classification } = await classifyForReview(
      new FakeAiClient({
        document_type_key: "DOCTOR_NOTES",
        confidence: 0.98,
        reason: "Admission and clinical notes.",
        document_date: null,
        fields: [
          {
            key: "patient_name",
            value: "Imran Shaikh",
            source_snippet: "Imran Shaikh",
            confidence: 0.98,
          },
          {
            key: "age",
            value: "34",
            source_snippet: "34 years / Male",
            confidence: 0.98,
          },
          {
            key: "gender",
            value: "M",
            source_snippet: "34 years / Male",
            confidence: 0.98,
          },
        ],
      }),
      new Uint8Array([1]),
      "application/pdf",
      [
        {
          id: seedId("type:DOCTOR_NOTES"),
          key: "DOCTOR_NOTES",
          label: "Doctor's notes",
          aiHint: "Clinical notes",
        },
      ],
    );
    await db().transaction(async (tx) => {
      await tx.insert(documents).values({
        ...source,
        ...classification,
        id: documentId,
        claimId: seedId("claim:CLM-3381"),
        fileName: "Imran-Shaikh-admission-note.pdf",
        uploadedAt: new Date(),
        confirmedBy: null,
        confirmedAt: null,
        identityOverrideBy: null,
        identityOverrideAt: null,
      });
      await tx
        .insert(extractedFields)
        .values(
          fields.map((field) => ({
            ...field,
            documentId,
            claimId: seedId("claim:CLM-3381"),
          })),
        );
    });
    return documentId;
  }
  try {
    const documentId = await fixture();
    await login(page);
    await page.goto("/claims/CLM-3381");
    const card = page
      .locator(".document-card")
      .filter({ hasText: "Imran-Shaikh-admission-note.pdf" });
    await expect(card.getByRole("alert")).toContainText(
      "This may be a different patient. The document says 'Imran Shaikh'. The claim says 'Rajendra Pawar'.",
    );
    await expect(page.locator(".readiness")).toContainText(
      "This may be a different patient.",
    );
    await expect(
      card.getByRole("button", { name: "Confirm", exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await mkdir("docs/screenshots", { recursive: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(1440);
    await page.screenshot({
      path: "docs/screenshots/patient-mismatch-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(390);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/opencode/patient-mismatch-mobile.png",
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/claims/CLM-3381/preauth");
    await expect(
      page.getByRole("heading", { name: "Patient identity must be resolved" }),
    ).toBeVisible();
    await page.getByText("11 confirmed", { exact: true }).click();
    await expect(
      page
        .locator(".confirmed-field")
        .filter({
          has: page.getByRole("heading", { name: "Patient name", exact: true }),
        }),
    ).toContainText("Rajendra Pawar");
    await expect(
      page.locator(".field-review").filter({ hasText: "Imran Shaikh" }),
    ).toHaveCount(0);
    await page.goto("/claims/CLM-3381");
    page.once("dialog", (dialog) => dialog.accept());
    await card
      .getByRole("button", { name: "Remove from claim", exact: true })
      .click();
    await expect(card).toHaveCount(0);
    await expect(page.locator(".readiness")).toHaveText(
      "Cannot submit yet: Ultrasound report is missing",
    );
    expect(
      (await page.request.get(`/api/documents/${documentId}/file`)).status(),
    ).toBe(404);
    const secondId = await fixture();
    await page.reload();
    page.once("dialog", (dialog) => dialog.accept());
    await card
      .getByRole("button", { name: "Confirm same patient", exact: true })
      .click();
    await expect(page.locator(".readiness")).toHaveText(
      "Cannot submit yet: Ultrasound report is missing",
    );
    await page.getByText("5 documents in order", { exact: true }).click();
    await expect(card).toContainText("The desk confirmed this is the same patient");
    const audits = await db()
      .select()
      .from(auditLogs)
      .where(inArray(auditLogs.entityId, ids));
    expect(audits).toContainEqual(
      expect.objectContaining({
        entityId: documentId,
        action: "DOCUMENT_REMOVE",
        actorId: seedId("user:desk"),
      }),
    );
    expect(audits).toContainEqual(
      expect.objectContaining({
        entityId: secondId,
        action: "DOCUMENT_IDENTITY_OVERRIDE",
        actorId: seedId("user:desk"),
      }),
    );
    console.log(
      "PASS: desktop/mobile warning, excluded pre-auth values, audited removal with private-file 404, and audited same-patient override.",
    );
  } finally {
    await browser.close();
    if (ids.length)
      await db().transaction(async (tx) => {
        await tx
          .delete(extractedFields)
          .where(inArray(extractedFields.documentId, ids));
        await tx.delete(documents).where(inArray(documents.id, ids));
      });
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Patient identity verification failed.",
  );
  process.exitCode = 1;
});
