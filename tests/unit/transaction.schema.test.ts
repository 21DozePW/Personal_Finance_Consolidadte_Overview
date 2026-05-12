import { describe, it, expect } from "vitest";
import {
  createSingleTransactionSchema,
  createSplitSchema,
  createTransferSchema,
  listFiltersSchema,
} from "@/schemas/transaction";

describe("createSingleTransactionSchema", () => {
  it("treats empty strings as null for optional fields", () => {
    const out = createSingleTransactionSchema.parse({
      accountId: "acc1",
      occurredOn: "2026-05-12",
      kind: "EXPENSE",
      amount: "12.34",
      categoryId: "",
      description: "",
      merchant: "",
      postedOn: "",
    });
    expect(out.categoryId).toBeNull();
    expect(out.description).toBeNull();
    expect(out.merchant).toBeNull();
    expect(out.postedOn).toBeNull();
  });

  it("rejects malformed dates", () => {
    expect(
      createSingleTransactionSchema.safeParse({
        accountId: "a",
        occurredOn: "12.05.2026",
        kind: "EXPENSE",
        amount: "1",
      }).success,
    ).toBe(false);
  });
});

describe("createTransferSchema", () => {
  it("refuses same source and destination", () => {
    const r = createTransferSchema.safeParse({
      fromAccountId: "a",
      toAccountId: "a",
      occurredOn: "2026-05-12",
      fromAmount: "1",
      toAmount: "1",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid cross-currency transfer", () => {
    const r = createTransferSchema.safeParse({
      fromAccountId: "a",
      toAccountId: "b",
      occurredOn: "2026-05-12",
      fromAmount: "100",
      toAmount: "110",
    });
    expect(r.success).toBe(true);
  });
});

describe("createSplitSchema", () => {
  it("requires at least two lines", () => {
    const r = createSplitSchema.safeParse({
      accountId: "a",
      occurredOn: "2026-05-12",
      lines: [{ amount: "10", kind: "EXPENSE", categoryId: null }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts two lines", () => {
    const r = createSplitSchema.safeParse({
      accountId: "a",
      occurredOn: "2026-05-12",
      lines: [
        { amount: "10", kind: "EXPENSE", categoryId: null },
        { amount: "20", kind: "EXPENSE", categoryId: null },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("listFiltersSchema", () => {
  it("coerces limit to a number and uppercases currency", () => {
    const out = listFiltersSchema.parse({ limit: "25", currency: "usd" });
    expect(out.limit).toBe(25);
    expect(out.currency).toBe("USD");
  });

  it("rejects currency that isn't 3 letters", () => {
    expect(listFiltersSchema.safeParse({ currency: "us" }).success).toBe(false);
  });
});
