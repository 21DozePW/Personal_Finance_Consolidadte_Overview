import { describe, it, expect } from "vitest";
import { fractionDigits, toMinor, fromMinor, formatMoney } from "@/lib/money";

describe("money helpers", () => {
  it("returns 2 fraction digits for CHF, USD, EUR, BRL", () => {
    expect(fractionDigits("CHF")).toBe(2);
    expect(fractionDigits("USD")).toBe(2);
    expect(fractionDigits("EUR")).toBe(2);
    expect(fractionDigits("BRL")).toBe(2);
  });

  it("returns 0 fraction digits for JPY", () => {
    expect(fractionDigits("JPY")).toBe(0);
  });

  it("round-trips CHF amounts via minor units", () => {
    expect(toMinor(1234.56, "CHF")).toBe(123456);
    expect(fromMinor(123456, "CHF")).toBeCloseTo(1234.56, 5);
  });

  it("avoids float drift for known-tricky values", () => {
    expect(toMinor(0.1 + 0.2, "CHF")).toBe(30);
  });

  it("formats CHF in de-CH locale with the currency symbol", () => {
    const formatted = formatMoney(123456, "CHF");
    expect(formatted).toContain("CHF");
    expect(formatted).toMatch(/1.234.56/);
  });
});
