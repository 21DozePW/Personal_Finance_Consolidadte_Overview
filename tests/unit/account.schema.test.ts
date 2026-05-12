import { describe, it, expect } from "vitest";
import { createAccountSchema, updateAccountSchema } from "@/schemas/account";

describe("createAccountSchema", () => {
  const base = {
    institutionId: "inst_abc",
    alias: "Joint Checking",
    accountKind: "CHECKING",
    currency: "chf",
  };

  it("upper-cases the currency code", () => {
    const out = createAccountSchema.parse(base);
    expect(out.currency).toBe("CHF");
  });

  it("defaults displayOrder to 0", () => {
    const out = createAccountSchema.parse(base);
    expect(out.displayOrder).toBe(0);
  });

  it("treats empty strings as null for optional fields", () => {
    const out = createAccountSchema.parse({
      ...base,
      lastFour: "",
      notes: "",
      openedAt: "",
    });
    expect(out.lastFour).toBeNull();
    expect(out.notes).toBeNull();
    expect(out.openedAt).toBeNull();
  });

  it("rejects non-4-digit lastFour", () => {
    expect(createAccountSchema.safeParse({ ...base, lastFour: "12" }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...base, lastFour: "abcd" }).success).toBe(false);
  });

  it("rejects malformed currency codes", () => {
    expect(createAccountSchema.safeParse({ ...base, currency: "CHFX" }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...base, currency: "12" }).success).toBe(false);
  });

  it("parses a YYYY-MM-DD openedAt into a Date", () => {
    const out = createAccountSchema.parse({ ...base, openedAt: "2024-01-15" });
    expect(out.openedAt).toBeInstanceOf(Date);
    expect(out.openedAt?.toISOString().slice(0, 10)).toBe("2024-01-15");
  });
});

describe("updateAccountSchema", () => {
  it("accepts isActive as a string or boolean", () => {
    expect(updateAccountSchema.parse({ isActive: "false" }).isActive).toBe(false);
    expect(updateAccountSchema.parse({ isActive: true }).isActive).toBe(true);
  });

  it("allows partial updates", () => {
    const out = updateAccountSchema.parse({ alias: "Renamed" });
    expect(out.alias).toBe("Renamed");
    expect(out.currency).toBeUndefined();
  });
});
