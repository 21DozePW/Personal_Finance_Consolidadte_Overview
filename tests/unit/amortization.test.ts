import { describe, it, expect } from "vitest";
import {
  generateSchedule,
  monthlyPayment,
  nthDueDate,
  payoffWithExtra,
  simulatePayoff,
} from "@/lib/amortization";

describe("monthlyPayment", () => {
  it("matches a known reference for a 500 k @ 4.25% / 240 m mortgage", () => {
    // Independent reference: $500,000 at 4.25% over 20 years → ~$3,096.57/mo.
    // Same math in minor units (50000000 cents) → ~309657 cents.
    const pmt = monthlyPayment({
      principalMinor: 50_000_000,
      interestRatePctBps: 42_500, // 4.25%
      termMonths: 240,
    });
    expect(pmt).toBeGreaterThan(309_500);
    expect(pmt).toBeLessThan(309_800);
  });

  it("returns principal / termMonths for zero-rate loans", () => {
    expect(monthlyPayment({ principalMinor: 12000, interestRatePctBps: 0, termMonths: 12 })).toBe(
      1000,
    );
  });

  it("returns 0 for zero principal", () => {
    expect(monthlyPayment({ principalMinor: 0, interestRatePctBps: 42_500, termMonths: 12 })).toBe(
      0,
    );
  });

  it("throws on non-positive term", () => {
    expect(() =>
      monthlyPayment({ principalMinor: 1000, interestRatePctBps: 0, termMonths: 0 }),
    ).toThrow();
  });
});

describe("generateSchedule", () => {
  const baseInput = {
    principalMinor: 50_000_000,
    interestRatePctBps: 42_500,
    termMonths: 240,
    startDate: new Date(Date.UTC(2026, 0, 1)),
    paymentDayOfMonth: 1,
  };

  it("produces termMonths rows for a non-zero-rate loan", () => {
    const rows = generateSchedule(baseInput);
    expect(rows).toHaveLength(240);
  });

  it("ends at zero remaining within rounding", () => {
    const rows = generateSchedule(baseInput);
    expect(rows[rows.length - 1]!.remainingMinor).toBe(0);
  });

  it("interest + principal = payment for non-final rows", () => {
    const rows = generateSchedule(baseInput);
    for (const row of rows.slice(0, -1)) {
      expect(row.interestMinor + row.principalMinor).toBe(row.paymentMinor);
    }
  });

  it("first payment for 500k @ 4.25% has interest > principal", () => {
    const rows = generateSchedule(baseInput);
    expect(rows[0]!.interestMinor).toBeGreaterThan(rows[0]!.principalMinor);
  });

  it("zero-rate schedule has constant principal payment and no interest", () => {
    const rows = generateSchedule({
      ...baseInput,
      interestRatePctBps: 0,
      termMonths: 10,
      principalMinor: 10_000,
    });
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.interestMinor === 0)).toBe(true);
    expect(rows[rows.length - 1]!.remainingMinor).toBe(0);
  });

  it("dueDate climbs by one calendar month each row, clamped to month end", () => {
    const rows = generateSchedule({
      ...baseInput,
      paymentDayOfMonth: 31,
      termMonths: 4,
    });
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(rows[2]!.dueDate.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(rows[3]!.dueDate.toISOString().slice(0, 10)).toBe("2026-04-30");
  });
});

describe("nthDueDate", () => {
  it("returns the Nth payment date (payment 1 falls in the start month)", () => {
    const start = new Date(Date.UTC(2026, 0, 15));
    expect(nthDueDate(start, 1, 1).toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(nthDueDate(start, 12, 15).toISOString().slice(0, 10)).toBe("2026-12-15");
    expect(nthDueDate(start, 13, 15).toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});

describe("simulatePayoff", () => {
  it("matches the original term (± 1 month rounding drift) when payment equals PMT", () => {
    const pmt = monthlyPayment({
      principalMinor: 50_000_000,
      interestRatePctBps: 42_500,
      termMonths: 240,
    });
    const out = simulatePayoff({
      remainingBalanceMinor: 50_000_000,
      interestRatePctBps: 42_500,
      paymentMinor: pmt,
    });
    // PMT rounds to the nearest cent; the simulator may need one extra
    // month to clear the residual that rounding leaves behind.
    expect(Math.abs(out.months - 240)).toBeLessThanOrEqual(1);
  });

  it("returns Infinity when payment is below the monthly interest", () => {
    const out = simulatePayoff({
      remainingBalanceMinor: 50_000_000,
      interestRatePctBps: 42_500,
      paymentMinor: 1,
    });
    expect(out.months).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("payoffWithExtra", () => {
  it("shortens the term and reduces total interest when extra is paid", () => {
    const pmt = monthlyPayment({
      principalMinor: 50_000_000,
      interestRatePctBps: 42_500,
      termMonths: 240,
    });
    const out = payoffWithExtra({
      remainingBalanceMinor: 50_000_000,
      interestRatePctBps: 42_500,
      baselinePaymentMinor: pmt,
      extraMinor: 50_000, // 500 currency-units / month
    });
    expect(out.monthsSaved).toBeGreaterThan(0);
    expect(out.interestSavedMinor).toBeGreaterThan(0);
    expect(out.withExtra.months).toBeLessThan(out.baseline.months);
  });

  it("a zero extra payment yields zero savings", () => {
    const pmt = monthlyPayment({
      principalMinor: 100_000,
      interestRatePctBps: 30_000,
      termMonths: 24,
    });
    const out = payoffWithExtra({
      remainingBalanceMinor: 100_000,
      interestRatePctBps: 30_000,
      baselinePaymentMinor: pmt,
      extraMinor: 0,
    });
    expect(out.monthsSaved).toBe(0);
    expect(out.interestSavedMinor).toBe(0);
  });
});
