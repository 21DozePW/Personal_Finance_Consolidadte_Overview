import { test, expect } from "@playwright/test";

test("home page renders the Phase 0 landing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Household Finance" })).toBeVisible();
  await expect(page.getByText("Base currency:")).toBeVisible();
});
