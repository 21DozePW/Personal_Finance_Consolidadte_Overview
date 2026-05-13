/**
 * Pure goal-progress math.
 *
 * Money is in minor units of the goal currency. The caller does any FX
 * conversion from a linked account's currency into the goal currency before
 * passing `currentAmountMinor` in.
 */

export type GoalProgressInput = {
  targetAmountMinor: number;
  currentAmountMinor: number;
  monthlyContributionMinor: number;
  /** Target date — date-only (UTC midnight). */
  targetDate: Date;
  /** "Now" — used for tests and deterministic projections. */
  asOf?: Date;
};

export type GoalProgress = {
  pctComplete: number; // 0..1, clamped
  remainingMinor: number; // max(0, target − current)
  monthsRemaining: number; // whole months from asOf to targetDate, min 0
  /** Monthly contribution needed to hit the target exactly on `targetDate`. */
  requiredMonthlyMinor: number;
  /**
   * If you only contribute `monthlyContributionMinor` per month from asOf
   * onward, how short will you be on the target date (in minor units)?
   * Positive = expected shortfall. Zero or negative = on track / surplus.
   */
  projectedShortfallMinor: number;
  onTrack: boolean;
};

/**
 * Whole months between two UTC dates, treating each as midnight UTC of its
 * day. End is inclusive in the sense that "this month → next month" counts
 * as 1. Returns 0 for past or same-month targets.
 */
export function wholeMonthsBetween(asOf: Date, target: Date): number {
  const a = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const b = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), 1));
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return Math.max(0, months);
}

export function computeGoalProgress(input: GoalProgressInput): GoalProgress {
  const asOf = input.asOf ?? new Date();
  const target = input.targetAmountMinor;
  const current = input.currentAmountMinor;
  const months = wholeMonthsBetween(asOf, input.targetDate);
  const remaining = Math.max(0, target - current);
  const pctRaw = target > 0 ? current / target : current > 0 ? 1 : 0;
  const pctComplete = Math.max(0, Math.min(1, pctRaw));
  const requiredMonthlyMinor = months === 0 ? remaining : Math.ceil(remaining / months);
  const projectedTotal = current + input.monthlyContributionMinor * months;
  const projectedShortfall = target - projectedTotal;
  return {
    pctComplete,
    remainingMinor: remaining,
    monthsRemaining: months,
    requiredMonthlyMinor,
    projectedShortfallMinor: projectedShortfall,
    onTrack: projectedShortfall <= 0,
  };
}
