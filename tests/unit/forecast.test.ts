import { describe, it, expect } from "vitest";
import { pickMilestoneRows, projectForecast } from "@/lib/forecast";
import type { Occurrence } from "@/lib/cash-flow";

const noOccurrences: Occurrence[] = [];

const baseAssumptions = {
  startMonth: "2026-01",
  horizonMonths: 12,
  monthlyIncomeAdjustmentChfMinor: 0,
  monthlyExpenseAdjustmentChfMinor: 0,
  annualIncomeGrowth: 0,
  annualExpenseGrowth: 0,
  annualReturn: 0,
  lumpSums: [],
};

describe("projectForecast", () => {
  it("zero-everything keeps net worth flat", () => {
    const out = projectForecast({
      startingNetWorthMinor: 100_000_00,
      occurrences: noOccurrences,
      assumptions: baseAssumptions,
    });
    expect(out.rows).toHaveLength(12);
    expect(out.rows[0]!.endingNetWorthMinor).toBe(100_000_00);
    expect(out.rows[11]!.endingNetWorthMinor).toBe(100_000_00);
    expect(out.endingNetWorthMinor).toBe(100_000_00);
  });

  it("flat monthly income adjustment accrues linearly", () => {
    const out = projectForecast({
      startingNetWorthMinor: 0,
      occurrences: noOccurrences,
      assumptions: { ...baseAssumptions, monthlyIncomeAdjustmentChfMinor: 10_000 }, // 100 CHF/mo
    });
    expect(out.rows[11]!.endingNetWorthMinor).toBe(120_000); // 12 × 10 000
    expect(out.totalIncomeMinor).toBe(120_000);
  });

  it("lump sums land in their month and accumulate", () => {
    const out = projectForecast({
      startingNetWorthMinor: 0,
      occurrences: noOccurrences,
      assumptions: {
        ...baseAssumptions,
        lumpSums: [
          { month: "2026-03", amountChfMinor: 50_000 },
          { month: "2026-06", amountChfMinor: -20_000 },
        ],
      },
    });
    expect(out.rows[0]!.endingNetWorthMinor).toBe(0);
    expect(out.rows[2]!.endingNetWorthMinor).toBe(50_000); // March
    expect(out.rows[5]!.endingNetWorthMinor).toBe(30_000); // June
    expect(out.totalLumpSumMinor).toBe(30_000);
  });

  it("annual return compounds monthly", () => {
    const out = projectForecast({
      startingNetWorthMinor: 100_000_00,
      occurrences: noOccurrences,
      assumptions: { ...baseAssumptions, annualReturn: 0.12 }, // 1% / month
    });
    // After 12 months at 1%/month with no cashflow: 100 000 × 1.01^12 ≈ 112 683
    expect(out.rows[11]!.endingNetWorthMinor).toBeGreaterThan(112_000_00);
    expect(out.rows[11]!.endingNetWorthMinor).toBeLessThan(113_000_00);
  });

  it("expense growth compounds annually across multi-year horizons", () => {
    const out = projectForecast({
      startingNetWorthMinor: 0,
      occurrences: noOccurrences,
      assumptions: {
        ...baseAssumptions,
        horizonMonths: 24,
        monthlyExpenseAdjustmentChfMinor: 10_000,
        annualExpenseGrowth: 0.5, // doubles in year 2 (well, +50%)
      },
    });
    // Year 1 expenses: 12 × 10 000 = 120 000. Year 2: 12 × 15 000 = 180 000.
    expect(out.totalExpensesMinor).toBe(300_000);
    expect(out.rows[23]!.endingNetWorthMinor).toBe(-300_000);
  });

  it("bucketed occurrences flow through as scheduled income/expense", () => {
    const occs: Occurrence[] = [
      {
        commitmentId: "c1",
        name: "Salary",
        accountId: "acc",
        dueDate: new Date(Date.UTC(2026, 0, 25)),
        amountMinor: 500_000,
        currency: "CHF",
        kind: "INCOME",
        chfMinor: 500_000,
      },
      {
        commitmentId: "c2",
        name: "Rent",
        accountId: "acc",
        dueDate: new Date(Date.UTC(2026, 0, 1)),
        amountMinor: 200_000,
        currency: "CHF",
        kind: "EXPENSE",
        chfMinor: 200_000,
      },
    ];
    const out = projectForecast({
      startingNetWorthMinor: 0,
      occurrences: occs,
      assumptions: { ...baseAssumptions, horizonMonths: 1 },
    });
    expect(out.rows[0]!.incomeMinor).toBe(500_000);
    expect(out.rows[0]!.expenseMinor).toBe(200_000);
    expect(out.rows[0]!.endingNetWorthMinor).toBe(300_000);
  });

  it("pickMilestoneRows returns rows at 12/36/60 months when available", () => {
    const out = projectForecast({
      startingNetWorthMinor: 0,
      occurrences: noOccurrences,
      assumptions: { ...baseAssumptions, horizonMonths: 60 },
    });
    const m = pickMilestoneRows(out.rows);
    expect(m[12]?.monthIndex).toBe(11);
    expect(m[36]?.monthIndex).toBe(35);
    expect(m[60]?.monthIndex).toBe(59);
  });

  it("milestones beyond the horizon are absent", () => {
    const out = projectForecast({
      startingNetWorthMinor: 0,
      occurrences: noOccurrences,
      assumptions: { ...baseAssumptions, horizonMonths: 24 },
    });
    const m = pickMilestoneRows(out.rows);
    expect(m[12]).toBeDefined();
    expect(m[36]).toBeUndefined();
  });
});
