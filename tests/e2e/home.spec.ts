import { test, expect } from "@playwright/test";

test("unauthenticated visit to / redirects to the sign-in page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();
});

test("unauthenticated /admin/users hits a 403-equivalent (redirect to sign-in)", async ({
  page,
}) => {
  const response = await page.goto("/admin/users");
  // Middleware rewrites/redirects unauthenticated users to /signin.
  expect(response?.url() ?? "").toMatch(/\/signin/);
});
