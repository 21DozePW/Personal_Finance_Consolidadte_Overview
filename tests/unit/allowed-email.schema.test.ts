import { describe, it, expect } from "vitest";
import { inviteAllowedEmailSchema } from "@/schemas/allowed-email";

describe("inviteAllowedEmailSchema", () => {
  it("normalizes email to lowercase + trimmed", () => {
    const out = inviteAllowedEmailSchema.parse({
      email: "  Foo@Example.COM ",
      intendedRole: "MEMBER",
    });
    expect(out.email).toBe("foo@example.com");
  });

  it("defaults intendedRole to MEMBER", () => {
    const out = inviteAllowedEmailSchema.parse({ email: "a@b.co" });
    expect(out.intendedRole).toBe("MEMBER");
  });

  it("accepts ADMIN role", () => {
    const out = inviteAllowedEmailSchema.parse({ email: "a@b.co", intendedRole: "ADMIN" });
    expect(out.intendedRole).toBe("ADMIN");
  });

  it("rejects invalid emails", () => {
    const result = inviteAllowedEmailSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown roles", () => {
    const result = inviteAllowedEmailSchema.safeParse({ email: "a@b.co", intendedRole: "OWNER" });
    expect(result.success).toBe(false);
  });

  it("rejects an email longer than 254 chars", () => {
    const long = `${"a".repeat(250)}@b.co`;
    const result = inviteAllowedEmailSchema.safeParse({ email: long });
    expect(result.success).toBe(false);
  });
});
