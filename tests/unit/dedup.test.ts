import { describe, it, expect } from "vitest";
import { rowDedupKey, fileHash, buildCategorySuggester } from "@/lib/import/dedup";

describe("rowDedupKey", () => {
  it("prefers externalId when provided", () => {
    const k1 = rowDedupKey({
      accountId: "acc1",
      externalId: "FIT-1",
      occurredOn: "2026-05-12",
      amountMinor: -1234n,
      merchantNormalized: "migros",
    });
    expect(k1).toBe("ext:acc1:FIT-1");
  });

  it("hashes account + date + amount + merchant otherwise", () => {
    const k = rowDedupKey({
      accountId: "acc1",
      externalId: null,
      occurredOn: "2026-05-12",
      amountMinor: -1234n,
      merchantNormalized: "migros",
    });
    expect(k).toMatch(/^h:[0-9a-f]{64}$/);

    // Same inputs → same hash.
    const k2 = rowDedupKey({
      accountId: "acc1",
      externalId: null,
      occurredOn: "2026-05-12",
      amountMinor: -1234n,
      merchantNormalized: "migros",
    });
    expect(k).toBe(k2);

    // Different merchant → different hash.
    const k3 = rowDedupKey({
      accountId: "acc1",
      externalId: null,
      occurredOn: "2026-05-12",
      amountMinor: -1234n,
      merchantNormalized: "coffee",
    });
    expect(k).not.toBe(k3);
  });

  it("is whitespace insensitive on the merchant", () => {
    const a = rowDedupKey({
      accountId: "acc1",
      externalId: null,
      occurredOn: "2026-05-12",
      amountMinor: 1n,
      merchantNormalized: "  coffee  shop  ",
    });
    const b = rowDedupKey({
      accountId: "acc1",
      externalId: null,
      occurredOn: "2026-05-12",
      amountMinor: 1n,
      merchantNormalized: "coffee shop",
    });
    expect(a).toBe(b);
  });
});

describe("fileHash", () => {
  it("is stable across identical content", () => {
    expect(fileHash("hello")).toBe(fileHash("hello"));
    expect(fileHash("hello")).not.toBe(fileHash("hello!"));
  });
});

describe("buildCategorySuggester", () => {
  it("returns the most-used categoryId per merchant, breaking ties by recency", () => {
    const history = [
      { merchantNormalized: "migros", categoryId: "cat-groc", occurredOn: new Date("2026-04-01") },
      { merchantNormalized: "migros", categoryId: "cat-groc", occurredOn: new Date("2026-04-15") },
      { merchantNormalized: "migros", categoryId: "cat-food", occurredOn: new Date("2026-04-20") },
      {
        merchantNormalized: "starbucks",
        categoryId: "cat-cafe",
        occurredOn: new Date("2026-05-01"),
      },
      // Tie-breaker check: equal counts, later date should win
      { merchantNormalized: "shop", categoryId: "a", occurredOn: new Date("2026-01-01") },
      { merchantNormalized: "shop", categoryId: "b", occurredOn: new Date("2026-05-01") },
    ];
    const suggest = buildCategorySuggester(history);
    expect(suggest("Migros")).toBe("cat-groc");
    expect(suggest("starbucks")).toBe("cat-cafe");
    expect(suggest("shop")).toBe("b");
    expect(suggest("unknown")).toBeNull();
    expect(suggest(null)).toBeNull();
  });

  it("ignores rows without merchant or category", () => {
    const suggest = buildCategorySuggester([
      { merchantNormalized: null, categoryId: "x", occurredOn: new Date() },
      { merchantNormalized: "shop", categoryId: null, occurredOn: new Date() },
    ]);
    expect(suggest("shop")).toBeNull();
  });
});
