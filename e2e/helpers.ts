import { expect, type Page } from "@playwright/test";

export async function login(
  page: Page,
  role: "Desk executive" | "Desk head" = "Desk executive",
) {
  await page.goto("/login");
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/claims$/);
  await expect(
    page.getByRole("heading", { name: "Claims", exact: true }),
  ).toBeVisible();
}
