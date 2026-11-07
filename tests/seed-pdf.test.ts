import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { SEED_CLAIMS } from "../seed/data";
import { seedReportDate, syntheticPdf } from "../seed/pdf";

describe("fictional hospital document generator", () => {
  it("keeps every seeded document compact and on one page", async () => {
    const now = new Date("2026-11-09T18:00:00Z");
    for (const claim of SEED_CLAIMS)
      for (const key of claim.docs) {
        const bytes = await syntheticPdf(key, claim, now);
        const pdf = await PDFDocument.load(bytes);
        expect(pdf.getPageCount()).toBe(1);
        expect(pdf.getTitle()).toContain("Synthetic");
        expect(bytes.byteLength).toBeLessThan(10_000);
      }
  });
  it("dates the platelet report conservatively stale relative to the reset", () => {
    const now = new Date("2026-11-09T18:00:00Z");
    expect(seedReportDate(SEED_CLAIMS[2], "PLATELET_COUNT", now)).toBe(
      "2026-11-07",
    );
    expect(seedReportDate(SEED_CLAIMS[0], "PREAUTH_FORM", now)).toBe(
      "2026-11-09",
    );
  });
});
