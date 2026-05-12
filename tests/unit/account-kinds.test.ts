import { describe, it, expect } from "vitest";
import { AccountKind } from "@prisma/client";
import { isAssetKind, ACCOUNT_KIND_LABEL } from "@/lib/account-kinds";

describe("isAssetKind", () => {
  it("treats CHECKING, SAVINGS, INVESTMENT, CASH, OTHER_ASSET as assets", () => {
    expect(isAssetKind(AccountKind.CHECKING)).toBe(true);
    expect(isAssetKind(AccountKind.SAVINGS)).toBe(true);
    expect(isAssetKind(AccountKind.INVESTMENT)).toBe(true);
    expect(isAssetKind(AccountKind.CASH)).toBe(true);
    expect(isAssetKind(AccountKind.OTHER_ASSET)).toBe(true);
  });

  it("treats CREDIT_CARD, LOAN, LEASE, MORTGAGE, OTHER_LIABILITY as liabilities", () => {
    expect(isAssetKind(AccountKind.CREDIT_CARD)).toBe(false);
    expect(isAssetKind(AccountKind.LOAN)).toBe(false);
    expect(isAssetKind(AccountKind.LEASE)).toBe(false);
    expect(isAssetKind(AccountKind.MORTGAGE)).toBe(false);
    expect(isAssetKind(AccountKind.OTHER_LIABILITY)).toBe(false);
  });

  it("has a human-readable label for every kind", () => {
    for (const k of Object.values(AccountKind)) {
      expect(ACCOUNT_KIND_LABEL[k]).toBeTruthy();
    }
  });
});
