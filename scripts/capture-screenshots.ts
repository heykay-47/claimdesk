import { chromium, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { login } from "../e2e/helpers";
import { seedId } from "../seed/data";

async function main() {
  const baseURL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3011";
  const browser = await chromium.launch({ channel: "chromium" });
  const sizes: { file: string; width: number; documentWidth: number }[] = [];
  await mkdir("docs/screenshots", { recursive: true });
  async function capture(page: Page, file: string) {
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
      timeout: 10_000,
    });
    if (await page.locator(".document-preview iframe").count()) {
      await expect
        .poll(
          () =>
            page
              .frames()
              .some((frame) => frame.url().startsWith("chrome-extension://")),
          { timeout: 30_000 },
        )
        .toBe(true);
      const viewer = page
        .frames()
        .find((frame) => frame.url().startsWith("chrome-extension://"))!;
      await expect
        .poll(
          () =>
            viewer
              .locator("pdf-viewer")
              .evaluate((element) => Reflect.get(element, "loadProgress_")),
          { timeout: 30_000 },
        )
        .toBe(100);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    }
    await page.evaluate(() => document.fonts.ready);
    const width = page.viewportSize()!.width;
    const documentWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(
      documentWidth,
      `${file} must not overflow the page horizontally`,
    ).toBe(width);
    await page.screenshot({ path: `docs/screenshots/${file}.png` });
    sizes.push({ file, width, documentWidth });
  }
  try {
    const executive = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await executive.newPage();
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await capture(page, "login-desktop");
    await login(page);
    await capture(page, "worklist-desktop");
    await page.goto("/claims/CLM-3381");
    await expect(
      page.getByText("Cannot submit yet: Ultrasound report is missing", { exact: true }),
    ).toBeVisible();
    await capture(page, "claim-desktop");
    await page.setViewportSize({ width: 390, height: 1000 });
    await capture(page, "claim-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/claims/CLM-3385");
    await expect(
      page.getByText("Cannot submit yet: Platelet count is too old", { exact: true }),
    ).toBeVisible();
    await capture(page, "platelet-stale-desktop");
    await page.goto("/claims/CLM-3381/preauth");
    await page.getByText("11 confirmed", { exact: true }).click();
    await expect(
      page.getByText(/Confirmed by Priya Kulkarni/).first(),
    ).toBeVisible();
    await capture(page, "preauth-desktop");
    await page.goto("/queries");
    await expect(
      page.getByRole("heading", { name: "Query inbox", exact: true }),
    ).toBeVisible();
    await capture(page, "queries-desktop");
    await page.goto(`/queries/${seedId("query:CLM-3381:ultrasound")}`);
    await expect(
      page.getByRole("heading", { name: "What the insurer or TPA is asking for", exact: true }),
    ).toBeVisible();
    await capture(page, "query-detail-desktop");
    await page.goto("/insights");
    await expect(
      page.getByRole("heading", { name: "Deductions by reason", exact: true }),
    ).toBeVisible();
    await capture(page, "insights-desktop");
    const headContext = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 1000 },
    });
    const head = await headContext.newPage();
    await login(head, "Desk head");
    await head.goto(
      `/settings/checklists?payer=${seedId("payer:Company B")}&procedure=${seedId("procedure:Gall bladder removal")}&stage=PREAUTH`,
    );
    await expect(
      head.getByRole("columnheader", { name: "Rule applies to", exact: true }),
    ).toBeVisible();
    await capture(head, "checklists-desktop");
    await head.goto("/settings/audit");
    await expect(
      head.getByRole("heading", { name: "Activity log", exact: true }),
    ).toBeVisible();
    await capture(head, "audit-desktop");
    console.log(JSON.stringify(sizes, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Screenshot capture failed",
  );
  process.exitCode = 1;
});
