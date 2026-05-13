/**
 * Goals CRUD + progress derivation.
 *
 * Goals can be linked to an account; in that case "current amount" is
 * derived from the latest AccountBalance. If the account's currency differs
 * from the goal's, we convert via the latest FX rate and surface a
 * cross-currency warning so the user knows the projection carries FX risk.
 *
 * `currentAmountMinor` is also stored on the Goal row as a snapshot —
 * useful for forecasting and historical comparisons. Calling
 * `refreshGoalProgress` writes the latest derived value back.
 *
 * Audit log captures metadata changes; no encrypted fields on Goal.
 */

import "server-only";
import type { Goal } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";
import { BASE_CURRENCY, convertToBaseMinor, convertFromBaseMinor } from "@/lib/fx";
import { getLatestRateLookup } from "@/server/fx";
import { computeGoalProgress, type GoalProgress } from "@/lib/goal-progress";
import { createGoalSchema, updateGoalSchema } from "@/schemas/goal";

export class GoalError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "ACCOUNT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "GoalError";
  }
}

function parseAmount(raw: string, currency: string): bigint {
  try {
    return parseAmountToMinor(raw, currency);
  } catch (err) {
    if (err instanceof ParseAmountError) throw new GoalError("INVALID_INPUT", err.message);
    throw err;
  }
}

function dateOnly(input: string): Date {
  return new Date(`${input}T00:00:00Z`);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listGoals(opts: { includeArchived?: boolean } = {}) {
  return prisma.goal.findMany({
    where: opts.includeArchived ? {} : { isArchived: false },
    orderBy: [{ isArchived: "asc" }, { priority: "desc" }, { targetDate: "asc" }],
    include: {
      linkedAccount: { select: { id: true, alias: true, currency: true } },
    },
  });
}

export async function getGoal(id: string) {
  return prisma.goal.findUnique({
    where: { id },
    include: {
      linkedAccount: { select: { id: true, alias: true, currency: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Linked-account → goal conversion
// ---------------------------------------------------------------------------

/**
 * Convert the latest balance of `linkedAccount` into the goal's currency.
 * If the rate is missing, returns null and `usedRate = null` so callers can
 * surface a "rate unavailable" warning.
 */
async function deriveCurrentFromAccount(
  linkedAccountId: string,
  goalCurrency: string,
): Promise<{
  currentMinor: number | null;
  accountCurrency: string;
  accountBalanceMinor: number | null;
  usedRateChfPerAccount: number | null;
  usedRateChfPerGoal: number | null;
}> {
  const account = await prisma.account.findUnique({
    where: { id: linkedAccountId },
    select: {
      id: true,
      currency: true,
      balances: {
        orderBy: { asOfDate: "desc" },
        take: 1,
        select: { balanceMinor: true },
      },
    },
  });
  if (!account) {
    return {
      currentMinor: null,
      accountCurrency: "",
      accountBalanceMinor: null,
      usedRateChfPerAccount: null,
      usedRateChfPerGoal: null,
    };
  }
  const latest = account.balances[0];
  const balanceMinor = latest ? Number(latest.balanceMinor) : null;

  if (balanceMinor == null) {
    return {
      currentMinor: 0,
      accountCurrency: account.currency,
      accountBalanceMinor: 0,
      usedRateChfPerAccount: null,
      usedRateChfPerGoal: null,
    };
  }

  if (account.currency === goalCurrency) {
    return {
      currentMinor: balanceMinor,
      accountCurrency: account.currency,
      accountBalanceMinor: balanceMinor,
      usedRateChfPerAccount: account.currency === BASE_CURRENCY ? 1 : null,
      usedRateChfPerGoal: goalCurrency === BASE_CURRENCY ? 1 : null,
    };
  }

  // Convert account-currency → base (CHF) → goal-currency.
  const rateLookup = await getLatestRateLookup([account.currency, goalCurrency]);
  const rateAccount = account.currency === BASE_CURRENCY ? 1 : rateLookup(account.currency);
  const rateGoal = goalCurrency === BASE_CURRENCY ? 1 : rateLookup(goalCurrency);
  const chf = convertToBaseMinor(balanceMinor, account.currency, rateAccount);
  if (chf == null) {
    return {
      currentMinor: null,
      accountCurrency: account.currency,
      accountBalanceMinor: balanceMinor,
      usedRateChfPerAccount: rateAccount,
      usedRateChfPerGoal: rateGoal,
    };
  }
  const inGoal = convertFromBaseMinor(chf, goalCurrency, rateGoal);
  return {
    currentMinor: inGoal,
    accountCurrency: account.currency,
    accountBalanceMinor: balanceMinor,
    usedRateChfPerAccount: rateAccount,
    usedRateChfPerGoal: rateGoal,
  };
}

export type GoalWithProgress = Awaited<ReturnType<typeof getGoal>> & {
  progress: GoalProgress;
  derivedCurrentMinor: number;
  hasFxWarning: boolean;
  fxWarningReason: string | null;
};

/**
 * Compute the live progress for a goal. Reads the linked account if any and
 * applies FX conversion at the latest available rate. The returned `progress`
 * uses `derivedCurrentMinor` (live) — `goal.currentAmountMinor` is the
 * stored snapshot.
 */
export async function getGoalWithProgress(id: string): Promise<GoalWithProgress | null> {
  const goal = await getGoal(id);
  if (!goal) return null;
  return decorateWithProgress(goal);
}

async function decorateWithProgress(goal: NonNullable<Awaited<ReturnType<typeof getGoal>>>) {
  let derivedCurrentMinor = Number(goal.currentAmountMinor);
  let hasFxWarning = false;
  let fxWarningReason: string | null = null;

  if (goal.linkedAccountId) {
    const derived = await deriveCurrentFromAccount(goal.linkedAccountId, goal.currency);
    if (derived.currentMinor != null) {
      derivedCurrentMinor = derived.currentMinor;
    }
    if (derived.accountCurrency && derived.accountCurrency !== goal.currency) {
      hasFxWarning = true;
      if (derived.usedRateChfPerAccount == null || derived.usedRateChfPerGoal == null) {
        fxWarningReason = `Goal is tracked in ${goal.currency} but the linked account is in ${derived.accountCurrency} and no FX rate is available — current amount cannot be computed.`;
      } else {
        fxWarningReason = `Goal is tracked in ${goal.currency} but the linked account is in ${derived.accountCurrency}. Progress carries FX risk.`;
      }
    }
  }

  const progress = computeGoalProgress({
    targetAmountMinor: Number(goal.targetAmountMinor),
    currentAmountMinor: derivedCurrentMinor,
    monthlyContributionMinor: Number(goal.monthlyContributionMinor),
    targetDate: goal.targetDate,
  });
  return { ...goal, progress, derivedCurrentMinor, hasFxWarning, fxWarningReason };
}

export async function listGoalsWithProgress(opts: { includeArchived?: boolean } = {}) {
  const goals = await listGoals(opts);
  const decorated = [] as Array<Awaited<ReturnType<typeof decorateWithProgress>>>;
  for (const g of goals) {
    decorated.push(await decorateWithProgress(g));
  }
  return decorated;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createGoal(actorUserId: string, raw: unknown): Promise<Goal> {
  const parsed = createGoalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GoalError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const input = parsed.data;
  if (input.linkedAccountId) {
    const acc = await prisma.account.findUnique({
      where: { id: input.linkedAccountId },
      select: { id: true },
    });
    if (!acc) throw new GoalError("ACCOUNT_NOT_FOUND", "Linked account not found.");
  }
  const targetAmountMinor = parseAmount(input.targetAmount, input.currency);
  const currentAmountMinor = input.currentAmount
    ? parseAmount(input.currentAmount, input.currency)
    : 0n;
  const monthlyContributionMinor = input.monthlyContribution
    ? parseAmount(input.monthlyContribution, input.currency)
    : 0n;

  const created = await prisma.goal.create({
    data: {
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      targetAmountMinor,
      targetDate: dateOnly(input.targetDate),
      linkedAccountId: input.linkedAccountId,
      currentAmountMinor,
      monthlyContributionMinor,
      priority: input.priority,
    },
  });
  await recordAudit({
    actorUserId,
    action: "GOAL_CREATED",
    entityType: "Goal",
    entityId: created.id,
    after: {
      name: created.name,
      kind: created.kind,
      currency: created.currency,
      targetAmountMinor: created.targetAmountMinor.toString(),
      targetDate: input.targetDate,
      linkedAccountId: created.linkedAccountId,
    },
  });
  return created;
}

export async function updateGoal(actorUserId: string, id: string, raw: unknown): Promise<Goal> {
  const parsed = updateGoalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GoalError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const before = await prisma.goal.findUnique({ where: { id } });
  if (!before) throw new GoalError("NOT_FOUND", "Goal not found.");
  const input = parsed.data;

  if (input.linkedAccountId) {
    const acc = await prisma.account.findUnique({
      where: { id: input.linkedAccountId },
      select: { id: true },
    });
    if (!acc) throw new GoalError("ACCOUNT_NOT_FOUND", "Linked account not found.");
  }

  const currency = input.currency ?? before.currency;
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.currency !== undefined) data.currency = currency;
  if (input.targetAmount !== undefined) {
    data.targetAmountMinor = parseAmount(input.targetAmount, currency);
  }
  if (input.targetDate !== undefined) data.targetDate = dateOnly(input.targetDate);
  if (input.linkedAccountId !== undefined) data.linkedAccountId = input.linkedAccountId;
  if (input.currentAmount !== undefined) {
    data.currentAmountMinor = parseAmount(input.currentAmount, currency);
  }
  if (input.monthlyContribution !== undefined) {
    data.monthlyContributionMinor = parseAmount(input.monthlyContribution, currency);
  }
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.isArchived !== undefined) data.isArchived = input.isArchived;

  const updated = await prisma.goal.update({ where: { id }, data });
  await recordAudit({
    actorUserId,
    action: "GOAL_UPDATED",
    entityType: "Goal",
    entityId: id,
    before: {
      name: before.name,
      targetAmountMinor: before.targetAmountMinor.toString(),
      monthlyContributionMinor: before.monthlyContributionMinor.toString(),
      linkedAccountId: before.linkedAccountId,
      isArchived: before.isArchived,
    },
    after: {
      name: updated.name,
      targetAmountMinor: updated.targetAmountMinor.toString(),
      monthlyContributionMinor: updated.monthlyContributionMinor.toString(),
      linkedAccountId: updated.linkedAccountId,
      isArchived: updated.isArchived,
    },
  });
  return updated;
}

export async function deleteGoal(actorUserId: string, id: string): Promise<void> {
  const before = await prisma.goal.findUnique({ where: { id } });
  if (!before) throw new GoalError("NOT_FOUND", "Goal not found.");
  await prisma.goal.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "GOAL_DELETED",
    entityType: "Goal",
    entityId: id,
    before: { name: before.name, kind: before.kind },
  });
}

/**
 * Snapshot the live `currentAmountMinor` from the linked account back onto
 * the Goal row. No-op when the goal isn't linked.
 */
export async function refreshGoalProgress(actorUserId: string, id: string): Promise<Goal> {
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) throw new GoalError("NOT_FOUND", "Goal not found.");
  if (!goal.linkedAccountId) return goal;

  const derived = await deriveCurrentFromAccount(goal.linkedAccountId, goal.currency);
  if (derived.currentMinor == null) return goal;
  const updated = await prisma.goal.update({
    where: { id },
    data: { currentAmountMinor: BigInt(Math.round(derived.currentMinor)) },
  });
  await recordAudit({
    actorUserId,
    action: "GOAL_PROGRESS_REFRESHED",
    entityType: "Goal",
    entityId: id,
    before: { currentAmountMinor: goal.currentAmountMinor.toString() },
    after: { currentAmountMinor: updated.currentAmountMinor.toString() },
  });
  return updated;
}
