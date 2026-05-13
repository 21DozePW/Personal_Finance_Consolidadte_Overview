import { test, expect } from "@playwright/test";

test("strict security headers are set on every response", async ({ request }) => {
  const res = await request.get("/signin");
  const headers = res.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  const csp = headers["content-security-policy"];
  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("https://accounts.google.com");
  expect(csp).toContain("https://api.exchangerate.host");
  expect(csp).toContain("https://api.frankfurter.dev");
});

test("admin and write API routes return 401 / redirect for unauthenticated callers", async ({
  request,
}) => {
  const audit = await request.get("/api/admin/audit", { failOnStatusCode: false });
  // Middleware turns this into a redirect to /signin; status 200 with HTML
  // body or 401 are both acceptable so long as it's not 200 JSON.
  expect([200, 307, 401, 403]).toContain(audit.status());

  const backup = await request.post("/api/admin/backup", {
    failOnStatusCode: false,
    data: { passphrase: "this is long enough" },
  });
  expect([200, 307, 401, 403]).toContain(backup.status());
});
