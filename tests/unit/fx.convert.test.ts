import { describe, it, expect } from "vitest";
import { convertToBaseMinor, convertFromBaseMinor, resolveRate, BASE_CURRENCY } from "@/lib/fx";

describe("convertToBaseMinor", () => {
  it("passes through when nativeCurrency === base", () => {
    expect(convertToBaseMinor(123456n, "CHF", 1)).toBe(123456);
    expect(convertToBaseMinor(123456n, "CHF", null)).toBe(123456); // rate ignored
  });

  it("converts USD → CHF using rate = quote per base", () => {
    // 1 CHF = 1.10 USD → $100.00 = 100 / 1.10 = 90.909... CHF ≈ 9091 minor
    const out = convertToBaseMinor(10000n, "USD", 1.1);
    expect(out).toBe(9091);
  });

  it("converts BRL → CHF for a small amount", () => {
    // 1 CHF = 5 BRL → R$ 50 = 10 CHF = 1000 minor
    expect(convertToBaseMinor(5000n, "BRL", 5)).toBe(1000);
  });

  it("returns null when the rate is missing or invalid", () => {
    expect(convertToBaseMinor(10000n, "USD", null)).toBeNull();
    expect(convertToBaseMinor(10000n, "USD", 0)).toBeNull();
    expect(convertToBaseMinor(10000n, "USD", -1)).toBeNull();
    expect(convertToBaseMinor(10000n, "USD", Number.NaN)).toBeNull();
    expect(convertToBaseMinor(10000n, "USD", Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("handles 0-decimal currencies (JPY)", () => {
    // 1 CHF = 170 JPY → ¥17000 = 100 CHF = 10000 minor
    expect(convertToBaseMinor(17000n, "JPY", 170)).toBe(10000);
  });

  it("accepts a number as well as a bigint", () => {
    expect(convertToBaseMinor(10000, "USD", 1.1)).toBe(9091);
  });
});

describe("convertFromBaseMinor", () => {
  it("converts CHF → USD", () => {
    // 100 CHF * 1.10 = 110 USD = 11000 minor
    expect(convertFromBaseMinor(10000n, "USD", 1.1)).toBe(11000);
  });

  it("passes through CHF → CHF", () => {
    expect(convertFromBaseMinor(10000n, "CHF", 1)).toBe(10000);
  });

  it("returns null when rate is missing", () => {
    expect(convertFromBaseMinor(10000n, "USD", null)).toBeNull();
  });
});

describe("resolveRate", () => {
  it("returns 1 for the base currency without consulting the lookup", () => {
    expect(resolveRate(BASE_CURRENCY, () => null)).toBe(1);
  });

  it("returns null when the lookup has no rate", () => {
    expect(resolveRate("USD", () => null)).toBeNull();
  });

  it("forwards the lookup result", () => {
    expect(resolveRate("USD", (q) => (q === "USD" ? 1.1 : null))).toBe(1.1);
  });
});
