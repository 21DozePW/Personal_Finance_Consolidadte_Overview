import { describe, it, expect } from "vitest";
import { computeGoalProgress, wholeMonthsBetween } from "@/lib/goal-progress";

const may2026 = new Date(Date.UTC(2026, 4, 12));

describe("wholeMonthsBetween", () => {
  it("returns 0 for same month or past target", () => {
    expect(wholeMonthsBetween(may2026, new Date(Date.UTC(2026, 4, 31)))).toBe(0);
    expect(wholeMonthsBetween(may2026, new Date(Date.UTC(2026, 0, 1)))).toBe(0);
  });
  it("counts whole calendar months forward", () => {
    expect(wholeMonthsBetween(may2026, new Date(Date.UTC(2026, 11, 1)))).toBe(7);
    expect(wholeMonthsBetween(may2026, new Date(Date.UTC(2027, 4, 1)))).toBe(12);
  });
});

describe("computeGoalProgress", () => {
  it("flags on-track when planned contributions cover the remaining", () => {
    const out = computeGoalProgress({
      targetAmountMinor: 1_200_000, // 12 000
      currentAmountMinor: 0,
      monthlyContributionMinor: 100_000, // 1000 / month
      targetDate: new Date(Date.UTC(2027, 4, 1)),
      asOf: may2026,
    });
    expect(out.monthsRemaining).toBe(12);
    expect(out.requiredMonthlyMinor).toBe(100_000);
    expect(out.projectedShortfallMinor).toBe(0);
    expect(out.onTrack).toBe(true);
  });

  it("flags behind when planned < required", () => {
    const out = computeGoalProgress({
      targetAmountMinor: 1_200_000,
      currentAmountMinor: 0,
      monthlyContributionMinor: 50_000,
      targetDate: new Date(Date.UTC(2027, 4, 1)),
      asOf: may2026,
    });
    expect(out.projectedShortfallMinor).toBe(600_000);
    expect(out.onTrack).toBe(false);
  });

  it("clamps pctComplete between 0 and 1", () => {
    const below = computeGoalProgress({
      targetAmountMinor: 1000,
      currentAmountMinor: -500,
      monthlyContributionMinor: 0,
      targetDate: new Date(Date.UTC(2027, 0, 1)),
      asOf: may2026,
    });
    expect(below.pctComplete).toBe(0);
    const above = computeGoalProgress({
      targetAmountMinor: 1000,
      currentAmountMinor: 3000,
      monthlyContributionMinor: 0,
      targetDate: new Date(Date.UTC(2027, 0, 1)),
      asOf: may2026,
    });
    expect(above.pctComplete).toBe(1);
  });

  it("handles a zero target gracefully", () => {
    const out = computeGoalProgress({
      targetAmountMinor: 0,
      currentAmountMinor: 100,
      monthlyContributionMinor: 0,
      targetDate: new Date(Date.UTC(2027, 0, 1)),
      asOf: may2026,
    });
    expect(out.pctComplete).toBe(1);
    expect(out.remainingMinor).toBe(0);
    expect(out.onTrack).toBe(true);
  });

  it("required monthly is the full remaining when target is this month", () => {
    const out = computeGoalProgress({
      targetAmountMinor: 5_000,
      currentAmountMinor: 1_000,
      monthlyContributionMinor: 0,
      targetDate: new Date(Date.UTC(2026, 4, 28)), // same month as asOf
      asOf: may2026,
    });
    expect(out.monthsRemaining).toBe(0);
    expect(out.requiredMonthlyMinor).toBe(4_000);
  });
});
