/**
 * Forecast scenarios.
 *
 * A scenario is a named bundle of assumptions. The projection itself is
 * computed on demand by joining recorded recurring commitments (Phase 6)
 * with the assumption deltas (Phase 9) and threading them through pure
 * forecast math in `src/lib/forecast.ts`.
 *
 * Anyone signed in can create scenarios; deletion is permitted by the
 * creator or any Admin (we let any session for v1 — household is two
 * users).
 */

import "server-only";
import type { ForecastScenario, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";
import { BASE_CURRENCY, convertToBaseMinor } from "@/lib/fx";
import { getLatestRateLookup } from "@/server/fx";
import { listProjectable } from "@/server/recurring";
import { projectCashFlow } from "@/lib/cash-flow";
import { pickMilestoneRows, projectForecast, type ForecastResult } from "@/lib/forecast";
import {
  assumptionsSchema,
  createScenarioSchema,
  updateScenarioSchema,
  type ScenarioAssumptions,
} from "@/schemas/scenario";

export class ScenarioError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "ScenarioError";
  }
}

function chfAmount(raw: string | null | undefined): number {
  if (raw == null || raw === "") return 0;
  try {
    return Number(parseAmountToMinor(raw, BASE_CURRENCY));
  } catch (err) {
    if (err instanceof ParseAmountError) {
      throw new ScenarioError("INVALID_INPUT", err.message);
    }
    throw err;
  }
}

function pctToDecimal(raw: string | null | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) {
    throw new ScenarioError("INVALID_INPUT", `Invalid percentage "${raw}".`);
  }
  return n / 100;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listScenarios() {
  return prisma.forecastScenario.findMany({
    orderBy: [{ isBaseline: "desc" }, { updatedAt: "desc" }],
    include: { createdBy: { select: { id: true, email: true } } },
  });
}

export async function getScenario(id: string) {
  return prisma.forecastScenario.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Starting state
// ---------------------------------------------------------------------------

/**
 * Sum of every active account's latest balance, converted to CHF via the
 * latest available FX rate (account-currency → CHF). Returns 0 when no
 * accounts exist. Currencies without a rate contribute 0 (with a warning we
 * surface upstream if you'd rather block them out).
 */
async function loadStartingNetWorthChfMinor(): Promise<number> {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: {
      id: true,
      currency: true,
      accountKind: true,
      balances: {
        orderBy: { asOfDate: "desc" },
        take: 1,
        select: { balanceMinor: true },
      },
    },
  });
  if (accounts.length === 0) return 0;
  const currencies = Array.from(new Set(accounts.map((a) => a.currency)));
  const rateLookup = await getLatestRateLookup(currencies);

  const LIAB_KINDS = new Set(["CREDIT_CARD", "LOAN", "LEASE", "MORTGAGE", "OTHER_LIABILITY"]);
  let net = 0;
  for (const acc of accounts) {
    const balance = acc.balances[0];
    if (!balance) continue;
    const rate = acc.currency === BASE_CURRENCY ? 1 : rateLookup(acc.currency);
    const chf = convertToBaseMinor(balance.balanceMinor, acc.currency, rate);
    if (chf == null) continue;
    const sign = LIAB_KINDS.has(acc.accountKind) ? -1 : 1;
    net += sign * Math.abs(chf);
  }
  return net;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export type ScenarioProjection = {
  scenario: ForecastScenario;
  startingNetWorthChfMinor: number;
  result: ForecastResult;
  milestones: ReturnType<typeof pickMilestoneRows>;
};

export async function getScenarioProjection(id: string): Promise<ScenarioProjection> {
  const scenario = await prisma.forecastScenario.findUnique({ where: { id } });
  if (!scenario) throw new ScenarioError("NOT_FOUND", "Scenario not found.");

  const parsedAssumptions = assumptionsSchema.safeParse(scenario.assumptions);
  if (!parsedAssumptions.success) {
    throw new ScenarioError(
      "INVALID_INPUT",
      `Stored assumptions are invalid: ${parsedAssumptions.error.issues[0]?.message ?? "unknown"}.`,
    );
  }
  const assumptions = parsedAssumptions.data;
  const startingNet = await loadStartingNetWorthChfMinor();
  const result = await runProjection(assumptions, startingNet);
  return {
    scenario,
    startingNetWorthChfMinor: startingNet,
    result,
    milestones: pickMilestoneRows(result.rows),
  };
}

/**
 * Test/seam helper — used by tests to drive the projection without seeding
 * a `ForecastScenario` row.
 */
export async function runProjection(
  assumptions: ScenarioAssumptions,
  startingNetWorthMinor: number,
): Promise<ForecastResult> {
  const commitments = await listProjectable();
  const currencies = Array.from(new Set(commitments.map((c) => c.currency)));
  const rateLookup = await getLatestRateLookup(currencies);
  const fromDate = new Date(`${assumptions.startMonth}-01T00:00:00Z`);
  const cashflow = projectCashFlow(commitments, {
    from: fromDate,
    months: assumptions.horizonMonths,
    rateLookup,
  });

  const lumpSumsMinor = assumptions.lumpSums.map((l) => ({
    month: l.month,
    amountChfMinor: chfAmount(l.amount),
    description: l.description,
  }));

  return projectForecast({
    startingNetWorthMinor,
    occurrences: cashflow.occurrences,
    assumptions: {
      startMonth: assumptions.startMonth,
      horizonMonths: assumptions.horizonMonths,
      monthlyIncomeAdjustmentChfMinor: chfAmount(assumptions.monthlyIncomeAdjustment),
      monthlyExpenseAdjustmentChfMinor: chfAmount(assumptions.monthlyExpenseAdjustment),
      annualIncomeGrowth: pctToDecimal(assumptions.annualIncomeGrowthPct),
      annualExpenseGrowth: pctToDecimal(assumptions.annualExpenseGrowthPct),
      annualReturn: pctToDecimal(assumptions.annualReturnPct),
      lumpSums: lumpSumsMinor,
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createScenario(actorUserId: string, raw: unknown): Promise<ForecastScenario> {
  const parsed = createScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScenarioError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  // Validate that assumption numerics parse cleanly now rather than later.
  pctToDecimal(parsed.data.assumptions.annualReturnPct);
  for (const ls of parsed.data.assumptions.lumpSums) {
    chfAmount(ls.amount);
  }

  if (parsed.data.isBaseline) {
    // Only one baseline scenario at a time.
    await prisma.forecastScenario.updateMany({
      where: { isBaseline: true },
      data: { isBaseline: false },
    });
  }

  const created = await prisma.forecastScenario.create({
    data: {
      name: parsed.data.name,
      isBaseline: parsed.data.isBaseline ?? false,
      assumptions: parsed.data.assumptions as unknown as Prisma.InputJsonValue,
      createdByUserId: actorUserId,
    },
  });
  await recordAudit({
    actorUserId,
    action: "SCENARIO_CREATED",
    entityType: "ForecastScenario",
    entityId: created.id,
    after: { name: created.name, isBaseline: created.isBaseline },
  });
  return created;
}

export async function updateScenario(
  actorUserId: string,
  id: string,
  raw: unknown,
): Promise<ForecastScenario> {
  const parsed = updateScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScenarioError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const before = await prisma.forecastScenario.findUnique({ where: { id } });
  if (!before) throw new ScenarioError("NOT_FOUND", "Scenario not found.");

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.assumptions !== undefined) {
    pctToDecimal(parsed.data.assumptions.annualReturnPct);
    for (const ls of parsed.data.assumptions.lumpSums) chfAmount(ls.amount);
    data.assumptions = parsed.data.assumptions as unknown as Prisma.InputJsonValue;
  }
  if (parsed.data.isBaseline !== undefined) {
    data.isBaseline = parsed.data.isBaseline;
    if (parsed.data.isBaseline) {
      await prisma.forecastScenario.updateMany({
        where: { isBaseline: true, NOT: { id } },
        data: { isBaseline: false },
      });
    }
  }
  const updated = await prisma.forecastScenario.update({ where: { id }, data });
  await recordAudit({
    actorUserId,
    action: "SCENARIO_UPDATED",
    entityType: "ForecastScenario",
    entityId: id,
    before: { name: before.name, isBaseline: before.isBaseline },
    after: { name: updated.name, isBaseline: updated.isBaseline },
  });
  return updated;
}

export async function deleteScenario(actorUserId: string, id: string): Promise<void> {
  const before = await prisma.forecastScenario.findUnique({ where: { id } });
  if (!before) throw new ScenarioError("NOT_FOUND", "Scenario not found.");
  await prisma.forecastScenario.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "SCENARIO_DELETED",
    entityType: "ForecastScenario",
    entityId: id,
    before: { name: before.name },
  });
}

export async function cloneScenario(
  actorUserId: string,
  id: string,
  newName: string,
): Promise<ForecastScenario> {
  const source = await prisma.forecastScenario.findUnique({ where: { id } });
  if (!source) throw new ScenarioError("NOT_FOUND", "Scenario not found.");
  return createScenario(actorUserId, {
    name: newName,
    isBaseline: false,
    assumptions: source.assumptions,
  });
}
