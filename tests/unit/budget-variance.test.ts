import { describe, it, expect } from "vitest";
import {
  cascadeVariance,
  computeMonthVariance,
  type BudgetLineInput,
  type MonthlyActuals,
} from "@/lib/budget-variance";

function actuals(
  map: Record<string, number>,
  incomeMap: Record<string, number> = {},
): MonthlyActuals {
  return {
    expenseActualByCategory: new Map(Object.entries(map)),
    incomeActualByCategory: new Map(Object.entries(incomeMap)),
  };
}

const groceriesReset: BudgetLineInput = {
  categoryId: "groc",
  categoryName: "Groceries",
  categoryKind: "EXPENSE",
  plannedMinor: 100_000, // 1000 CHF
  carryOverRule: "RESET",
};

describe("computeMonthVariance", () => {
  it("returns planned - actual when actual ≤ planned", () => {
    const out = computeMonthVariance(
      "2026-05",
      [groceriesReset],
      actuals({ groc: 60_000 }),
      new Map(),
    );
    expect(out.rows[0]!.varianceMinor).toBe(40_000);
    expect(out.totalActualMinor).toBe(60_000);
  });

  it("variance goes negative when over budget", () => {
    const out = computeMonthVariance(
      "2026-05",
      [groceriesReset],
      actuals({ groc: 120_000 }),
      new Map(),
    );
    expect(out.rows[0]!.varianceMinor).toBe(-20_000);
  });

  it("ignores carry-in for RESET", () => {
    const out = computeMonthVariance(
      "2026-05",
      [groceriesReset],
      actuals({ groc: 50_000 }),
      new Map([["groc", 30_000]]),
    );
    expect(out.rows[0]!.carriedInMinor).toBe(0);
    expect(out.rows[0]!.effectivePlannedMinor).toBe(100_000);
  });

  it("rolls only surplus forward (ROLLOVER_SURPLUS) — positive carry kept, negative ignored", () => {
    const line: BudgetLineInput = { ...groceriesReset, carryOverRule: "ROLLOVER_SURPLUS" };
    const positiveCarry = computeMonthVariance(
      "2026-06",
      [line],
      actuals({ groc: 0 }),
      new Map([["groc", 25_000]]),
    );
    expect(positiveCarry.rows[0]!.carriedInMinor).toBe(25_000);
    expect(positiveCarry.rows[0]!.effectivePlannedMinor).toBe(125_000);

    const negativeCarry = computeMonthVariance(
      "2026-06",
      [line],
      actuals({ groc: 0 }),
      new Map([["groc", -25_000]]),
    );
    expect(negativeCarry.rows[0]!.carriedInMinor).toBe(0);
  });

  it("ACCUMULATE carries both signs forward", () => {
    const line: BudgetLineInput = { ...groceriesReset, carryOverRule: "ACCUMULATE" };
    const out = computeMonthVariance(
      "2026-06",
      [line],
      actuals({ groc: 0 }),
      new Map([["groc", -25_000]]),
    );
    expect(out.rows[0]!.carriedInMinor).toBe(-25_000);
    expect(out.rows[0]!.effectivePlannedMinor).toBe(75_000);
  });

  it("income categories pull from incomeActualByCategory", () => {
    const salary: BudgetLineInput = {
      categoryId: "sal",
      categoryName: "Salary",
      categoryKind: "INCOME",
      plannedMinor: 800_000,
      carryOverRule: "RESET",
    };
    const out = computeMonthVariance("2026-05", [salary], actuals({}, { sal: 850_000 }), new Map());
    expect(out.rows[0]!.actualMinor).toBe(850_000);
    expect(out.rows[0]!.varianceMinor).toBe(-50_000); // planned − actual; for income, negative variance = above target
  });
});

describe("cascadeVariance", () => {
  it("propagates variance across months according to per-line rules", () => {
    const line: BudgetLineInput = { ...groceriesReset, carryOverRule: "ROLLOVER_SURPLUS" };
    const out = cascadeVariance([
      { month: "2026-05", lines: [line], actuals: actuals({ groc: 60_000 }) }, // surplus 40 000
      { month: "2026-06", lines: [line], actuals: actuals({ groc: 130_000 }) }, // effective 140 000, variance 10 000
      { month: "2026-07", lines: [line], actuals: actuals({ groc: 0 }) }, // carry-in 10 000
    ]);
    expect(out[0]!.rows[0]!.varianceMinor).toBe(40_000);
    expect(out[1]!.rows[0]!.carriedInMinor).toBe(40_000);
    expect(out[1]!.rows[0]!.effectivePlannedMinor).toBe(140_000);
    expect(out[1]!.rows[0]!.varianceMinor).toBe(10_000);
    expect(out[2]!.rows[0]!.carriedInMinor).toBe(10_000);
    expect(out[2]!.rows[0]!.effectivePlannedMinor).toBe(110_000);
  });

  it("RESET doesn't propagate even when prior month surplused", () => {
    const out = cascadeVariance([
      { month: "2026-05", lines: [groceriesReset], actuals: actuals({ groc: 0 }) },
      { month: "2026-06", lines: [groceriesReset], actuals: actuals({ groc: 0 }) },
    ]);
    expect(out[1]!.rows[0]!.carriedInMinor).toBe(0);
  });
});
