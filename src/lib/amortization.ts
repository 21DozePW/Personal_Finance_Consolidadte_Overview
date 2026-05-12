/**
 * Pure amortization math.
 *
 * Rate convention: `interestRatePctBps` matches the Prisma schema — a 4.25%
 * annual rate is stored as `42500` (basis points × 100). Decimal annual rate
 * is therefore `interestRatePctBps / 1_000_000`.
 *
 * Money is JS `number` in minor units throughout. The largest realistic
 * household loan (≈10 M CHF principal) is far below `Number.MAX_SAFE_INTEGER`
 * (~9·10¹⁵), so float drift is not a concern provided we round at each step.
 */

export const RATE_DIVISOR = 1_000_000; // interestRatePctBps → decimal annual rate

export function annualRate(interestRatePctBps: number): number {
  return interestRatePctBps / RATE_DIVISOR;
}

export function monthlyRate(interestRatePctBps: number): number {
  return annualRate(interestRatePctBps) / 12;
}

/**
 * Standard PMT formula. For zero-interest loans we just divide evenly.
 * Returns the per-month payment in minor units, rounded to the nearest cent.
 */
export function monthlyPayment(input: {
  principalMinor: number;
  interestRatePctBps: number;
  termMonths: number;
}): number {
  if (input.termMonths <= 0) throw new Error("termMonths must be positive");
  if (input.principalMinor <= 0) return 0;
  const r = monthlyRate(input.interestRatePctBps);
  if (r === 0) return Math.round(input.principalMinor / input.termMonths);
  const factor = Math.pow(1 + r, input.termMonths);
  return Math.round((input.principalMinor * r * factor) / (factor - 1));
}

export type ScheduleRow = {
  monthNumber: number; // 1-based
  dueDate: Date;
  paymentMinor: number;
  interestMinor: number;
  principalMinor: number;
  remainingMinor: number;
};

/**
 * Build the per-month payment schedule. If `paymentMinor` is omitted, the
 * scheduled payment is derived from PMT — useful for previewing terms before
 * the user commits.
 *
 * The final row is "balloon-adjusted" so the remaining balance ends at zero
 * even though month-by-month rounding leaves a few centimes drift.
 */
export function generateSchedule(input: {
  principalMinor: number;
  interestRatePctBps: number;
  termMonths: number;
  startDate: Date;
  paymentDayOfMonth: number;
  paymentMinor?: number;
}): ScheduleRow[] {
  const payment =
    input.paymentMinor ??
    monthlyPayment({
      principalMinor: input.principalMinor,
      interestRatePctBps: input.interestRatePctBps,
      termMonths: input.termMonths,
    });
  const r = monthlyRate(input.interestRatePctBps);
  const rows: ScheduleRow[] = [];
  let remaining = input.principalMinor;
  for (let i = 1; i <= input.termMonths; i++) {
    const interest = r === 0 ? 0 : Math.round(remaining * r);
    let principalPayment = payment - interest;
    if (principalPayment < 0) principalPayment = 0;
    if (principalPayment > remaining || i === input.termMonths) {
      principalPayment = remaining;
    }
    remaining -= principalPayment;
    rows.push({
      monthNumber: i,
      dueDate: nthDueDate(input.startDate, i, input.paymentDayOfMonth),
      paymentMinor: principalPayment + interest,
      interestMinor: interest,
      principalMinor: principalPayment,
      remainingMinor: remaining,
    });
    if (remaining <= 0) break;
  }
  return rows;
}

/**
 * Project the date of the Nth payment relative to a loan's `startDate` and
 * `paymentDayOfMonth`. Payment 1 falls in the same calendar month as
 * `startDate`; subsequent payments advance one month each. End-of-month
 * days (29/30/31) clamp to the month's last available day.
 */
export function nthDueDate(startDate: Date, n: number, dayOfMonth: number): Date {
  const base = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + n - 1, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day));
}

/**
 * "What if I pay an extra X every month from today?" — compares the baseline
 * remaining-schedule (assuming only `baselinePaymentMinor` per month) with
 * one where each payment is increased by `extraMinor`.
 */
export function payoffWithExtra(input: {
  remainingBalanceMinor: number;
  interestRatePctBps: number;
  baselinePaymentMinor: number;
  extraMinor: number;
}): {
  baseline: { months: number; totalInterestMinor: number };
  withExtra: { months: number; totalInterestMinor: number };
  monthsSaved: number;
  interestSavedMinor: number;
} {
  const baseline = simulatePayoff({
    remainingBalanceMinor: input.remainingBalanceMinor,
    interestRatePctBps: input.interestRatePctBps,
    paymentMinor: input.baselinePaymentMinor,
  });
  const withExtra = simulatePayoff({
    remainingBalanceMinor: input.remainingBalanceMinor,
    interestRatePctBps: input.interestRatePctBps,
    paymentMinor: input.baselinePaymentMinor + input.extraMinor,
  });
  return {
    baseline,
    withExtra,
    monthsSaved: Math.max(0, baseline.months - withExtra.months),
    interestSavedMinor: Math.max(0, baseline.totalInterestMinor - withExtra.totalInterestMinor),
  };
}

/**
 * Hard-capped at 12 000 iterations (1000 years) so a degenerate
 * payment-below-interest input can't spin forever; returns Infinity if the
 * payment is too small to cover the monthly interest.
 */
export function simulatePayoff(input: {
  remainingBalanceMinor: number;
  interestRatePctBps: number;
  paymentMinor: number;
}): { months: number; totalInterestMinor: number } {
  const r = monthlyRate(input.interestRatePctBps);
  let remaining = input.remainingBalanceMinor;
  let totalInterest = 0;
  let months = 0;
  while (remaining > 0 && months < 12_000) {
    const interest = r === 0 ? 0 : Math.round(remaining * r);
    if (r > 0 && input.paymentMinor <= interest) {
      return { months: Number.POSITIVE_INFINITY, totalInterestMinor: Number.POSITIVE_INFINITY };
    }
    const principalPayment = Math.min(remaining, input.paymentMinor - interest);
    remaining -= principalPayment;
    totalInterest += interest;
    months += 1;
  }
  return { months, totalInterestMinor: totalInterest };
}
