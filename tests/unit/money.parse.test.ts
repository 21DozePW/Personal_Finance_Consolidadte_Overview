import { describe, it, expect } from "vitest";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";

describe("parseAmountToMinor", () => {
  it("parses a simple decimal in CHF (2 fraction digits)", () => {
    expect(parseAmountToMinor("1234.56", "CHF")).toBe(123456n);
    expect(parseAmountToMinor("0.01", "CHF")).toBe(1n);
    expect(parseAmountToMinor("100", "CHF")).toBe(10000n);
  });

  it("accepts comma as decimal separator", () => {
    expect(parseAmountToMinor("1234,56", "EUR")).toBe(123456n);
  });

  it("handles negative amounts", () => {
    expect(parseAmountToMinor("-42", "USD")).toBe(-4200n);
    expect(parseAmountToMinor("-0.05", "USD")).toBe(-5n);
  });

  it("pads short fractional parts", () => {
    expect(parseAmountToMinor("10.5", "CHF")).toBe(1050n);
    expect(parseAmountToMinor("10.50", "CHF")).toBe(1050n);
  });

  it("handles JPY (0 fraction digits)", () => {
    expect(parseAmountToMinor("1234", "JPY")).toBe(1234n);
    expect(() => parseAmountToMinor("1234.5", "JPY")).toThrow(ParseAmountError);
  });

  it("rejects too many decimal places", () => {
    expect(() => parseAmountToMinor("1.234", "CHF")).toThrow(ParseAmountError);
  });

  it("rejects garbage input", () => {
    expect(() => parseAmountToMinor("abc", "CHF")).toThrow(ParseAmountError);
    expect(() => parseAmountToMinor("", "CHF")).toThrow(ParseAmountError);
    expect(() => parseAmountToMinor("1.2.3", "CHF")).toThrow(ParseAmountError);
  });
});
