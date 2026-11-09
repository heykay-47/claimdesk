import { test, expect, type Request } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { seedId } from "../seed/data";
import { login } from "./helpers";
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => login(page));

test("executive filters to gaps, uploads and confirms the missing ultrasound", async ({
  page,
}) => {
  await page.getByRole("link", { name: /Claims not ready to submit/ }).click();
  await expect(page).toHaveURL(/view=gaps/);
  await expect(
    page.getByRole("link", { name: /Claims not ready to submit/ }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "CLM-3381", exact: true }).click();
  await expect(
    page.getByText("Cannot submit yet: Ultrasound report is missing", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Upload documents", { exact: true }).setInputFiles({
    name: `E2E-${process.env.E2E_RUN_ID}-ultrasound.pdf`,
    mimeType: "application/pdf",
    buffer: await readFile("seed/files/CLM-3381-ULTRASOUND_REPORT.pdf"),
  });
  await expect(
    page.getByText("AI sorted · needs confirmation", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  const slot = page.locator(".gap-slot").filter({
    has: page.getByRole("heading", {
      name: "Ultrasound report",
      exact: true,
    }),
  });
  await expect(slot.locator(".document-meta")).toContainText(
    "needs confirmation",
  );
  await slot.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Ready to submit", { exact: true }),
  ).toBeVisible();
});

test("answering every query returns the claim to pre-auth sent", async ({
  page,
}) => {
  for (const [index, key] of [
    "query:CLM-3381:ultrasound",
    "query:CLM-3385:platelets",
  ].entries()) {
    await page.goto(`/queries/${seedId(key)}`);
    await page
      .getByRole("button", { name: "Draft reply", exact: true })
      .click();
    await expect(page.getByLabel("Reply body")).toHaveValue(/Dear Claims Team/);
    await page
      .getByRole("button", { name: "Mark reply as sent", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Yes, record as sent", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Recorded reply", exact: true }),
    ).toBeVisible();
    await page.goto("/claims/CLM-3381");
    await expect(page.locator(".claim-title-status")).toContainText(
      index === 0 ? "Query" : "Pre-auth sent",
    );
  }
});

test("settings return 403 to executives and rule actions independently enforce the head role", async ({
  page,
  browser,
  baseURL,
}) => {
  const denied = await page.goto("/settings/checklists");
  expect(denied?.status()).toBe(403);
  await expect(
    page.getByRole("heading", { name: "Desk head access required" }),
  ).toBeVisible();
  await page.goto("/claims/CLM-3385");
  await expect(
    page.getByText("Cannot submit yet: Platelet count is too old", { exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({ baseURL });
  try {
    const head = await context.newPage();
    await login(head, "Desk head");
    await head.goto(
      `/settings/checklists?payer=${seedId("payer:Company D")}&procedure=${seedId("procedure:Dengue with low platelets")}&stage=ENHANCEMENT`,
    );
    const row = head
      .getByRole("row")
      .filter({ has: head.getByText("Platelet count", { exact: true }) });
    await expect(
      row.getByRole("button", { name: "Save", exact: true }),
    ).toHaveCount(0);
    await row
      .getByLabel("Requirement for Platelet count", { exact: true })
      .selectOption("WAIVED");
    await row.getByRole("button", { name: "Save", exact: true }).click();
    const requestPromise = head.waitForRequest(
      (request) =>
        request.method() === "POST" && !!request.headers()["next-action"],
    );
    await head
      .getByRole("button", { name: "Confirm waiver", exact: true })
      .click();
    const actionRequest: Request = await requestPromise;
    await expect(
      head.getByText("Checklist rule saved. Claim readiness updated.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: /^(Save|Saving…)$/ }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText("Ready to submit", { exact: true }),
    ).toBeVisible();
    await row
      .getByLabel("Requirement for Platelet count", { exact: true })
      .selectOption("REQUIRED");
    await row.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      row.getByRole("button", { name: /^(Save|Saving…)$/ }),
    ).toHaveCount(0);
    const rejection = await page.request.post("/claims", {
      headers: {
        "next-action": actionRequest.headers()["next-action"],
        "content-type": actionRequest.headers()["content-type"],
        origin: baseURL!,
      },
      data: actionRequest.postData()!,
    });
    expect(await rejection.text()).toContain(
      "This action requires the desk head role",
    );
    await page.reload();
    await expect(
      page.getByText("Cannot submit yet: Platelet count is too old", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a new claim starts blocked and lists submission blockers", async ({
  page,
}) => {
  await page.goto("/claims/new");
  await page
    .getByLabel("Patient name", { exact: true })
    .fill("E2E Fictional Patient");
  await page
    .getByLabel("UHID", { exact: true })
    .fill(`E2E-${process.env.E2E_RUN_ID}`);
  await page.getByLabel("Age", { exact: true }).fill("42");
  await page
    .getByRole("combobox", { name: "Gender", exact: true })
    .selectOption("Female");
  await page
    .getByLabel("Policy number", { exact: true })
    .fill("SYN-E2E-POLICY");
  await page
    .getByRole("combobox", { name: "Insurer or TPA", exact: true })
    .selectOption(seedId("payer:Company B"));
  await page
    .getByRole("combobox", { name: "Procedure", exact: true })
    .selectOption(seedId("procedure:Gall bladder removal"));
  await page
    .getByLabel("Treating doctor", { exact: true })
    .fill("Dr. Synthetic Test");
  const admitted = new Date(Date.now() + 5.5 * 3600000 - 3600000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Admitted at").fill(admitted);
  await page.getByLabel("Estimated amount (₹)", { exact: true }).fill("95000");
  await page.getByRole("button", { name: "Create claim", exact: true }).click();
  await expect(page).toHaveURL(/\/claims\/CLM-/);
  await expect(
    page.getByRole("button", { name: "Mark pre-auth sent", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".blockers")).toContainText(
    "items block submission",
  );
  await expect(page.locator(".blockers")).toContainText("missing");
});

test("packet downloads are authenticated PDFs and insights are available to executives", async ({
  page,
  playwright,
}) => {
  const guest = await playwright.request.newContext();
  try {
    expect(
      (
        await guest.get(
          `${test.info().project.use.baseURL}/api/claims/CLM-3381/packet`,
        )
      ).status(),
    ).toBe(401);
  } finally {
    await guest.dispose();
  }
  const response = await page.request.get("/api/claims/CLM-3381/packet");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(
    (await PDFDocument.load(await response.body())).getPageCount(),
  ).toBeGreaterThan(1);
  await page.goto("/claims/CLM-3381");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download packet", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("CLM-3381-preauth-packet.pdf");
  expect(await download.failure()).toBeNull();
  await page.getByRole("link", { name: "Insights", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Waiting for insurer decisions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Deductions by reason", exact: true }),
  ).toBeVisible();
});
