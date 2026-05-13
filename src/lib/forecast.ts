/**
 * Pure forecast math.
 *
 * Given a starting net worth in CHF, the recurring-commitment occurrences
 * to be applied month-by-month, and a set of assumptions, project a flat
 * monthly series:
 *   { month, income, expenses, lumpSum, net, endingNetWorthChfMinor }
 *
 * All amounts in minor units (CHF cents). Percentages here are decimal
 * fractions ("0.045" for 4.5%) — the caller converts user-supplied pct
 * strings into decimals.
 */

import type { Occurrence } from "./cash-flow";

export type ForecastAssumptions = {
  startMonth: string; // YYYY-MM
  horizonMonths: number;
  monthlyIncomeAdjustmentChfMinor: number;
  monthlyExpenseAdjustmentChfMinor: number;
  annualIncomeGrowth: number; // decimal e.g. 0.03
  annualExpenseGrowth: number;
  annualReturn: number; // applied monthly to running net worth
  lumpSums: Array<{ month: string; amountChfMinor: number; description?: string }>;
};

export type ForecastRow = {
  month: string;
  monthIndex: number; // 0-based
  incomeMinor: number;
  expenseMinor: number;
  lumpSumMinor: number;
  netMinor: number;
  returnMinor: number;
  startingNetWorthMinor: number;
  endingNetWorthMinor: number;
};

export type ForecastResult = {
  rows: ForecastRow[];
  endingNetWorthMinor: number;
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  totalLumpSumMinor: number;
  totalReturnMinor: number;
};

function monthIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(startMonth: string, n: number): string {
  const [y, m] = startMonth.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return monthIso(d);
}

/**
 * Bucket occurrences by month, summing income (positive) and expense
 * (positive — kind ≠ INCOME, signed positive amounts).
 */
function bucketOccurrences(occs: Occurrence[]): Map<string, { income: number; expense: number }> {
  const buckets = new Map<string, { income: number; expense: number }>();
  for (const o of occs) {
    if (o.chfMinor == null) continue;
    const key = monthIso(o.dueDate);
    const slot = buckets.get(key) ?? { income: 0, expense: 0 };
    if (o.kind === "INCOME") slot.income += o.chfMinor;
    else slot.expense += o.chfMinor;
    buckets.set(key, slot);
  }
  return buckets;
}

export function projectForecast(input: {
  startingNetWorthMinor: number;
  occurrences: Occurrence[];
  assumptions: ForecastAssumptions;
}): ForecastResult {
  const { startingNetWorthMinor, occurrences, assumptions } = input;
  const buckets = bucketOccurrences(occurrences);
  const monthlyReturn = assumptions.annualReturn / 12;

  const rows: ForecastRow[] = [];
  let net = startingNetWorthMinor;
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalLump = 0;
  let totalReturn = 0;

  for (let i = 0; i < assumptions.horizonMonths; i++) {
    const month = addMonths(assumptions.startMonth, i);
    const yearIdx = Math.floor(i / 12);

    const incomeGrowth = Math.pow(1 + assumptions.annualIncomeGrowth, yearIdx);
    const expenseGrowth = Math.pow(1 + assumptions.annualExpenseGrowth, yearIdx);

    const bucket = buckets.get(month) ?? { income: 0, expense: 0 };
    const adjustedIncome =
      Math.round(bucket.income * incomeGrowth) +
      Math.round(assumptions.monthlyIncomeAdjustmentChfMinor * incomeGrowth);
    const adjustedExpense =
      Math.round(bucket.expense * expenseGrowth) +
      Math.round(assumptions.monthlyExpenseAdjustmentChfMinor * expenseGrowth);

    const lump = assumptions.lumpSums
      .filter((l) => l.month === month)
      .reduce((s, l) => s + l.amountChfMinor, 0);

    const startingNet = net;
    const cashflow = adjustedIncome - adjustedExpense + lump;
    const returnApplied =
      monthlyReturn === 0 ? 0 : Math.round((net + cashflow / 2) * monthlyReturn);
    net = startingNet + cashflow + returnApplied;

    totalIncome += adjustedIncome;
    totalExpenses += adjustedExpense;
    totalLump += lump;
    totalReturn += returnApplied;

    rows.push({
      month,
      monthIndex: i,
      incomeMinor: adjustedIncome,
      expenseMinor: adjustedExpense,
      lumpSumMinor: lump,
      netMinor: cashflow,
      returnMinor: returnApplied,
      startingNetWorthMinor: startingNet,
      endingNetWorthMinor: net,
    });
  }

  return {
    rows,
    endingNetWorthMinor: net,
    totalIncomeMinor: totalIncome,
    totalExpensesMinor: totalExpenses,
    totalLumpSumMinor: totalLump,
    totalReturnMinor: totalReturn,
  };
}

export const FORECAST_MILESTONES = [12, 36, 60] as const;
export type Milestone = (typeof FORECAST_MILESTONES)[number];

export function pickMilestoneRows(rows: ForecastRow[]): Partial<Record<Milestone, ForecastRow>> {
  const out: Partial<Record<Milestone, ForecastRow>> = {};
  for (const m of FORECAST_MILESTONES) {
    const idx = m - 1;
    if (idx < rows.length) out[m] = rows[idx];
  }
  return out;
}
