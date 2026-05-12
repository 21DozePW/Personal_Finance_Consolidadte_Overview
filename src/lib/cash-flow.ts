/**
 * Pure cash-flow projection.
 *
 * Given a list of recurring commitments and a horizon (in months), expand
 * each commitment into its individual occurrences, then aggregate by
 * calendar month. CUSTOM cadence has no machine-projectable schedule and is
 * skipped — the UI shows those separately.
 *
 * Money is JS `number` in minor units throughout. `INCOME` rows add to net,
 * everything else (EXPENSE / LOAN_PAYMENT / LEASE_PAYMENT / SUBSCRIPTION)
 * subtracts from net.
 */

import type { RecurringCadence, RecurringKind } from "@prisma/client";
import { BASE_CURRENCY, convertToBaseMinor } from "./fx";

export type ProjectableCommitment = {
  id: string;
  name: string;
  accountId: string;
  amountMinor: bigint | number;
  currency: string;
  cadence: RecurringCadence;
  kind: RecurringKind;
  nextDueDate: Date;
  endDate: Date | null;
};

export type Occurrence = {
  commitmentId: string;
  name: string;
  accountId: string;
  dueDate: Date;
  amountMinor: number;
  currency: string;
  kind: RecurringKind;
  /** CHF-equivalent minor units using the supplied latest rate. */
  chfMinor: number | null;
};

export type MonthBucket = {
  month: string; // YYYY-MM
  incomeChfMinor: number;
  expenseChfMinor: number;
  netChfMinor: number;
};

export type CashFlowResult = {
  occurrences: Occurrence[];
  months: MonthBucket[];
};

export function isIncome(kind: RecurringKind): boolean {
  return kind === "INCOME";
}

function addMonthsClamped(d: Date, months: number, anchorDay: number): Date {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(anchorDay, lastDay)),
  );
}

function advance(d: Date, cadence: RecurringCadence, anchorDay: number): Date {
  switch (cadence) {
    case "WEEKLY":
      return new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "MONTHLY":
      return addMonthsClamped(d, 1, anchorDay);
    case "QUARTERLY":
      return addMonthsClamped(d, 3, anchorDay);
    case "ANNUAL":
      return addMonthsClamped(d, 12, anchorDay);
    case "CUSTOM":
      return new Date(d.getTime() + 365 * 24 * 60 * 60 * 1000); // not used
  }
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function expandCommitment(
  c: ProjectableCommitment,
  opts: { from: Date; to: Date },
): Array<{ dueDate: Date }> {
  if (c.cadence === "CUSTOM") return [];
  const occurrences: Array<{ dueDate: Date }> = [];
  let cursor = c.nextDueDate;
  const anchorDay = cursor.getUTCDate();
  const hardCap = 1000; // guard against pathological inputs
  let safety = 0;

  // Skip past anything before `from` (e.g., a commitment whose nextDueDate is
  // in the past — the loan-payment commitments seeded in Phase 5 are like
  // this until first payment).
  while (cursor < opts.from && safety < hardCap) {
    cursor = advance(cursor, c.cadence, anchorDay);
    safety += 1;
  }
  safety = 0;
  while (cursor <= opts.to && safety < hardCap) {
    if (c.endDate && cursor > c.endDate) break;
    occurrences.push({ dueDate: cursor });
    cursor = advance(cursor, c.cadence, anchorDay);
    safety += 1;
  }
  return occurrences;
}

export function projectCashFlow(
  commitments: ProjectableCommitment[],
  opts: {
    from: Date;
    months: number;
    /** quote currency → numeric rate (per 1 CHF). CHF returns 1 automatically. */
    rateLookup: (quote: string) => number | null;
  },
): CashFlowResult {
  const to = new Date(
    Date.UTC(opts.from.getUTCFullYear(), opts.from.getUTCMonth() + opts.months, 0, 23, 59, 59),
  );

  const occurrences: Occurrence[] = [];
  for (const c of commitments) {
    const expanded = expandCommitment(c, { from: opts.from, to });
    for (const { dueDate } of expanded) {
      const amountMinor = Number(c.amountMinor);
      const rate = c.currency === BASE_CURRENCY ? 1 : opts.rateLookup(c.currency);
      const chfMinor = convertToBaseMinor(amountMinor, c.currency, rate);
      occurrences.push({
        commitmentId: c.id,
        name: c.name,
        accountId: c.accountId,
        dueDate,
        amountMinor,
        currency: c.currency,
        kind: c.kind,
        chfMinor,
      });
    }
  }
  occurrences.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  // Pre-seed all month buckets so empty months still appear.
  const monthMap = new Map<string, MonthBucket>();
  for (let i = 0; i < opts.months; i++) {
    const d = new Date(Date.UTC(opts.from.getUTCFullYear(), opts.from.getUTCMonth() + i, 1));
    const key = monthKey(d);
    monthMap.set(key, {
      month: key,
      incomeChfMinor: 0,
      expenseChfMinor: 0,
      netChfMinor: 0,
    });
  }

  for (const occ of occurrences) {
    const key = monthKey(occ.dueDate);
    const bucket = monthMap.get(key);
    if (!bucket) continue;
    if (occ.chfMinor == null) continue;
    if (isIncome(occ.kind)) {
      bucket.incomeChfMinor += occ.chfMinor;
    } else {
      bucket.expenseChfMinor += occ.chfMinor;
    }
    bucket.netChfMinor = bucket.incomeChfMinor - bucket.expenseChfMinor;
  }

  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  return { occurrences, months };
}
