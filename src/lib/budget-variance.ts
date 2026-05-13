/**
 * Pure budget-variance math.
 *
 * Inputs are pre-converted into the budget's currency in minor units (we do
 * the FX conversion in `src/server/budgets.ts` using each transaction's
 * captured `fxRateToBase`). This module concerns itself only with carry-over
 * application and per-line variance computation.
 *
 * Sign convention:
 *   - Planned amounts are stored as positive minor units (the budget
 *     allocation per category per month). For EXPENSE categories they're
 *     the cap; for INCOME they're the target.
 *   - Actual is the absolute amount transacted that month in the budget
 *     currency. For EXPENSE we sum |sum(Transaction.amountMinor)|; for
 *     INCOME we sum sum(amount) — both surface as a positive number.
 *
 * Variance is always `planned - actual`. Positive variance means "under
 * budget" for expenses or "below target" for income — the UI interprets the
 * sign per category-kind so the user reads the same row consistently.
 */

import type { BudgetCarryOverRule, CategoryKind } from "@prisma/client";

export type BudgetLineInput = {
  categoryId: string;
  categoryName: string;
  categoryKind: CategoryKind;
  plannedMinor: number;
  carryOverRule: BudgetCarryOverRule;
};

export type MonthlyActuals = {
  /** Sum of |EXPENSE category transactions| for the month, in budget currency. */
  expenseActualByCategory: Map<string, number>;
  /** Sum of INCOME category transactions for the month, in budget currency. */
  incomeActualByCategory: Map<string, number>;
};

export type MonthVarianceRow = {
  categoryId: string;
  categoryName: string;
  categoryKind: CategoryKind;
  plannedMinor: number;
  carriedInMinor: number;
  effectivePlannedMinor: number;
  actualMinor: number;
  varianceMinor: number;
  carryOverRule: BudgetCarryOverRule;
};

export type MonthSummary = {
  month: string; // YYYY-MM
  rows: MonthVarianceRow[];
  totalPlannedMinor: number;
  totalActualMinor: number;
  totalVarianceMinor: number;
};

/**
 * Compute variance for a single month given the lines and the actuals seen
 * that month, plus the carry-in from the previous month's variances.
 *
 * `carryInByCategory` is the variance to roll forward per category. The
 * caller is responsible for computing it from earlier months — see
 * `cascadeVariance` below for the standard helper.
 */
export function computeMonthVariance(
  month: string,
  lines: BudgetLineInput[],
  actuals: MonthlyActuals,
  carryInByCategory: Map<string, number>,
): MonthSummary {
  const rows: MonthVarianceRow[] = lines.map((line) => {
    const actual = actualFor(line, actuals);
    const carriedIn = applyCarryOverRule(
      line.carryOverRule,
      carryInByCategory.get(line.categoryId) ?? 0,
    );
    const effectivePlanned = line.plannedMinor + carriedIn;
    return {
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      categoryKind: line.categoryKind,
      plannedMinor: line.plannedMinor,
      carriedInMinor: carriedIn,
      effectivePlannedMinor: effectivePlanned,
      actualMinor: actual,
      varianceMinor: effectivePlanned - actual,
      carryOverRule: line.carryOverRule,
    };
  });

  const totalPlanned = rows.reduce((s, r) => s + r.plannedMinor, 0);
  const totalActual = rows.reduce((s, r) => s + r.actualMinor, 0);
  return {
    month,
    rows,
    totalPlannedMinor: totalPlanned,
    totalActualMinor: totalActual,
    totalVarianceMinor: rows.reduce((s, r) => s + r.varianceMinor, 0),
  };
}

function actualFor(line: BudgetLineInput, actuals: MonthlyActuals): number {
  if (line.categoryKind === "INCOME") {
    return actuals.incomeActualByCategory.get(line.categoryId) ?? 0;
  }
  if (line.categoryKind === "EXPENSE") {
    return actuals.expenseActualByCategory.get(line.categoryId) ?? 0;
  }
  return 0; // TRANSFER never participates
}

function applyCarryOverRule(rule: BudgetCarryOverRule, priorVariance: number): number {
  switch (rule) {
    case "RESET":
      return 0;
    case "ROLLOVER_SURPLUS":
      // Only positive variance (under-budget) carries forward.
      return priorVariance > 0 ? priorVariance : 0;
    case "ACCUMULATE":
      return priorVariance;
  }
}

/**
 * Cascade variance month-by-month so each month's carry-in is the previous
 * month's variance, filtered through the per-line carry-over rule. Months
 * must be sorted ascending.
 */
export function cascadeVariance(
  monthlyInputs: Array<{ month: string; lines: BudgetLineInput[]; actuals: MonthlyActuals }>,
): MonthSummary[] {
  const carryByCategory = new Map<string, number>();
  const out: MonthSummary[] = [];
  for (const { month, lines, actuals } of monthlyInputs) {
    const summary = computeMonthVariance(month, lines, actuals, carryByCategory);
    out.push(summary);
    // Reset and re-fill carry map from this month's variances; rule is
    // applied on read (next month) so we store raw variance here.
    carryByCategory.clear();
    for (const row of summary.rows) {
      carryByCategory.set(row.categoryId, row.varianceMinor);
    }
  }
  return out;
}
