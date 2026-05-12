import { describe, it, expect } from "vitest";
import { expandCommitment, projectCashFlow } from "@/lib/cash-flow";

const baseCommitment = {
  id: "c1",
  name: "Salary",
  accountId: "acc",
  amountMinor: 500_000n,
  currency: "CHF",
  cadence: "MONTHLY" as const,
  kind: "INCOME" as const,
  nextDueDate: new Date(Date.UTC(2026, 0, 1)),
  endDate: null,
};

describe("expandCommitment", () => {
  it("returns one occurrence per month over a 12-month window", () => {
    const from = new Date(Date.UTC(2026, 0, 1));
    const to = new Date(Date.UTC(2026, 11, 31));
    const out = expandCommitment(baseCommitment, { from, to });
    expect(out).toHaveLength(12);
  });

  it("clamps month-end day rules", () => {
    const out = expandCommitment(
      { ...baseCommitment, nextDueDate: new Date(Date.UTC(2026, 0, 31)) },
      { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 3, 30)) },
    );
    expect(out.map((o) => o.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("weekly produces ~52 occurrences in a year", () => {
    const out = expandCommitment(
      { ...baseCommitment, cadence: "WEEKLY" },
      { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 11, 31)) },
    );
    expect(out.length).toBeGreaterThanOrEqual(52);
    expect(out.length).toBeLessThanOrEqual(53);
  });

  it("quarterly produces 4 occurrences in a year", () => {
    const out = expandCommitment(
      { ...baseCommitment, cadence: "QUARTERLY" },
      { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 11, 31)) },
    );
    expect(out).toHaveLength(4);
  });

  it("annual produces 1 occurrence in a year", () => {
    const out = expandCommitment(
      { ...baseCommitment, cadence: "ANNUAL" },
      { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 11, 31)) },
    );
    expect(out).toHaveLength(1);
  });

  it("CUSTOM cadence is never auto-projected", () => {
    expect(
      expandCommitment(
        { ...baseCommitment, cadence: "CUSTOM" },
        { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 11, 31)) },
      ),
    ).toEqual([]);
  });

  it("respects endDate", () => {
    const out = expandCommitment(
      { ...baseCommitment, endDate: new Date(Date.UTC(2026, 2, 31)) },
      { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 11, 31)) },
    );
    expect(out).toHaveLength(3); // Jan / Feb / Mar
  });

  it("skips occurrences before `from`", () => {
    const out = expandCommitment(
      { ...baseCommitment, nextDueDate: new Date(Date.UTC(2024, 0, 1)) },
      { from: new Date(Date.UTC(2026, 0, 1)), to: new Date(Date.UTC(2026, 2, 31)) },
    );
    // Should advance past 2024/2025 → only 3 occurrences in Q1 2026
    expect(out).toHaveLength(3);
    expect(out[0]!.dueDate.toISOString().slice(0, 10)).toBe("2026-01-01");
  });
});

describe("projectCashFlow", () => {
  it("sums income and expense per month with FX conversion", () => {
    const out = projectCashFlow(
      [
        baseCommitment, // 5000 CHF/mo income
        {
          id: "c2",
          name: "Rent",
          accountId: "acc",
          amountMinor: 200_000n,
          currency: "CHF",
          cadence: "MONTHLY",
          kind: "EXPENSE",
          nextDueDate: new Date(Date.UTC(2026, 0, 1)),
          endDate: null,
        },
        {
          id: "c3",
          name: "Streaming",
          accountId: "acc",
          amountMinor: 1_500n, // $15 USD
          currency: "USD",
          cadence: "MONTHLY",
          kind: "SUBSCRIPTION",
          nextDueDate: new Date(Date.UTC(2026, 0, 1)),
          endDate: null,
        },
      ],
      {
        from: new Date(Date.UTC(2026, 0, 1)),
        months: 12,
        rateLookup: (q) => (q === "USD" ? 1.1 : null), // 1 CHF = 1.10 USD
      },
    );
    expect(out.months).toHaveLength(12);
    const jan = out.months[0]!;
    expect(jan.month).toBe("2026-01");
    expect(jan.incomeChfMinor).toBe(500_000);
    // Expense: 200 000 CHF + 1500 USD / 1.10 ≈ 1364 CHF cents → 201 364
    expect(jan.expenseChfMinor).toBe(201_364);
    expect(jan.netChfMinor).toBe(jan.incomeChfMinor - jan.expenseChfMinor);
  });

  it("emits empty buckets for months with no occurrences", () => {
    const out = projectCashFlow(
      [
        {
          ...baseCommitment,
          cadence: "ANNUAL",
          nextDueDate: new Date(Date.UTC(2026, 0, 1)),
        },
      ],
      { from: new Date(Date.UTC(2026, 0, 1)), months: 12, rateLookup: () => null },
    );
    expect(out.months).toHaveLength(12);
    expect(out.months[0]!.incomeChfMinor).toBe(500_000);
    expect(out.months[6]!.incomeChfMinor).toBe(0);
  });

  it("rows with no rate (foreign currency without FX) are excluded from the bucket totals", () => {
    const out = projectCashFlow(
      [
        {
          id: "c1",
          name: "USD income",
          accountId: "acc",
          amountMinor: 1000n,
          currency: "USD",
          cadence: "MONTHLY",
          kind: "INCOME",
          nextDueDate: new Date(Date.UTC(2026, 0, 1)),
          endDate: null,
        },
      ],
      { from: new Date(Date.UTC(2026, 0, 1)), months: 3, rateLookup: () => null },
    );
    // Occurrences are still emitted, but contribute 0 to totals because chfMinor is null.
    expect(out.occurrences).toHaveLength(3);
    expect(out.months.every((m) => m.incomeChfMinor === 0)).toBe(true);
  });
});
