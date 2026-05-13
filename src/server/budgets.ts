/**
 * Budgets: CRUD for budgets and their per-(category, month) lines, plus the
 * server-side glue that loads transactions, converts them to the budget
 * currency, and feeds them into `src/lib/budget-variance.ts`.
 *
 * Cross-currency: each transaction has `fxRateToBase` captured at write
 * time. For a budget in the BASE_CURRENCY (CHF) we apply that rate directly.
 * For a non-CHF budget we'd need a second hop through the base currency —
 * v1 only supports CHF budgets and rejects anything else on create.
 */

import "server-only";
import type { Budget, BudgetCarryOverRule, BudgetLine, CategoryKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";
import { BASE_CURRENCY, convertToBaseMinor } from "@/lib/fx";
import {
  cascadeVariance,
  type BudgetLineInput,
  type MonthlyActuals,
  type MonthSummary,
} from "@/lib/budget-variance";
import {
  copyMonthSchema,
  createBudgetSchema,
  updateBudgetSchema,
  upsertBudgetLineSchema,
} from "@/schemas/budget";

export class BudgetError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "UNSUPPORTED_CURRENCY"
      | "CATEGORY_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "BudgetError";
  }
}

function parseAmount(raw: string, currency: string): bigint {
  try {
    return parseAmountToMinor(raw, currency);
  } catch (err) {
    if (err instanceof ParseAmountError) throw new BudgetError("INVALID_INPUT", err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listBudgets() {
  return prisma.budget.findMany({
    orderBy: [{ isActive: "desc" }, { startMonth: "desc" }, { name: "asc" }],
    include: { _count: { select: { lines: true } } },
  });
}

export async function getBudget(id: string) {
  return prisma.budget.findUnique({ where: { id } });
}

export async function listBudgetLines(budgetId: string, month?: string) {
  return prisma.budgetLine.findMany({
    where: { budgetId, ...(month ? { month } : {}) },
    orderBy: [{ month: "asc" }, { categoryId: "asc" }],
    include: { category: { select: { id: true, name: true, kind: true } } },
  });
}

// ---------------------------------------------------------------------------
// Budget create / update / delete
// ---------------------------------------------------------------------------

export async function createBudget(actorUserId: string, raw: unknown): Promise<Budget> {
  const parsed = createBudgetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BudgetError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  if (parsed.data.currency !== BASE_CURRENCY) {
    throw new BudgetError(
      "UNSUPPORTED_CURRENCY",
      `v1 supports ${BASE_CURRENCY}-denominated budgets only.`,
    );
  }
  const created = await prisma.budget.create({ data: parsed.data });
  await recordAudit({
    actorUserId,
    action: "BUDGET_CREATED",
    entityType: "Budget",
    entityId: created.id,
    after: {
      name: created.name,
      currency: created.currency,
      startMonth: created.startMonth,
      endMonth: created.endMonth,
      periodKind: created.periodKind,
    },
  });
  return created;
}

export async function updateBudget(actorUserId: string, id: string, raw: unknown): Promise<Budget> {
  const parsed = updateBudgetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BudgetError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const before = await prisma.budget.findUnique({ where: { id } });
  if (!before) throw new BudgetError("NOT_FOUND", "Budget not found.");
  if (parsed.data.currency && parsed.data.currency !== BASE_CURRENCY) {
    throw new BudgetError("UNSUPPORTED_CURRENCY", `v1 supports ${BASE_CURRENCY} only.`);
  }
  const updated = await prisma.budget.update({ where: { id }, data: parsed.data });
  await recordAudit({
    actorUserId,
    action: "BUDGET_UPDATED",
    entityType: "Budget",
    entityId: id,
    before: {
      name: before.name,
      startMonth: before.startMonth,
      endMonth: before.endMonth,
      isActive: before.isActive,
    },
    after: {
      name: updated.name,
      startMonth: updated.startMonth,
      endMonth: updated.endMonth,
      isActive: updated.isActive,
    },
  });
  return updated;
}

export async function deleteBudget(actorUserId: string, id: string): Promise<void> {
  const before = await prisma.budget.findUnique({ where: { id } });
  if (!before) throw new BudgetError("NOT_FOUND", "Budget not found.");
  await prisma.budget.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "BUDGET_DELETED",
    entityType: "Budget",
    entityId: id,
    before: { name: before.name },
  });
}

// ---------------------------------------------------------------------------
// Line upsert / delete
// ---------------------------------------------------------------------------

export async function upsertBudgetLine(
  actorUserId: string,
  budgetId: string,
  raw: unknown,
): Promise<BudgetLine> {
  const parsed = upsertBudgetLineSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BudgetError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new BudgetError("NOT_FOUND", "Budget not found.");
  const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) throw new BudgetError("CATEGORY_NOT_FOUND", "Category not found.");

  const plannedAmountMinor = parseAmount(parsed.data.plannedAmount, budget.currency);
  const row = await prisma.budgetLine.upsert({
    where: {
      budgetId_categoryId_month: {
        budgetId,
        categoryId: parsed.data.categoryId,
        month: parsed.data.month,
      },
    },
    update: {
      plannedAmountMinor,
      carryOverRule: parsed.data.carryOverRule as BudgetCarryOverRule,
    },
    create: {
      budgetId,
      categoryId: parsed.data.categoryId,
      month: parsed.data.month,
      plannedAmountMinor,
      carryOverRule: parsed.data.carryOverRule as BudgetCarryOverRule,
    },
  });
  await recordAudit({
    actorUserId,
    action: "BUDGET_LINE_UPSERTED",
    entityType: "BudgetLine",
    entityId: row.id,
    after: {
      budgetId,
      categoryId: row.categoryId,
      month: row.month,
      plannedAmountMinor: row.plannedAmountMinor.toString(),
      carryOverRule: row.carryOverRule,
    },
  });
  return row;
}

export async function deleteBudgetLine(actorUserId: string, id: string): Promise<void> {
  const before = await prisma.budgetLine.findUnique({ where: { id } });
  if (!before) throw new BudgetError("NOT_FOUND", "Budget line not found.");
  await prisma.budgetLine.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "BUDGET_LINE_DELETED",
    entityType: "BudgetLine",
    entityId: id,
    before: {
      budgetId: before.budgetId,
      categoryId: before.categoryId,
      month: before.month,
      plannedAmountMinor: before.plannedAmountMinor.toString(),
    },
  });
}

// ---------------------------------------------------------------------------
// Copy from a prior month / year
// ---------------------------------------------------------------------------

export async function copyBudgetMonth(
  actorUserId: string,
  budgetId: string,
  raw: unknown,
): Promise<number> {
  const parsed = copyMonthSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BudgetError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const { fromMonth, toMonth } = parsed.data;
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new BudgetError("NOT_FOUND", "Budget not found.");
  const source = await prisma.budgetLine.findMany({ where: { budgetId, month: fromMonth } });
  let writes = 0;
  for (const line of source) {
    await prisma.budgetLine.upsert({
      where: {
        budgetId_categoryId_month: {
          budgetId,
          categoryId: line.categoryId,
          month: toMonth,
        },
      },
      update: { plannedAmountMinor: line.plannedAmountMinor, carryOverRule: line.carryOverRule },
      create: {
        budgetId,
        categoryId: line.categoryId,
        month: toMonth,
        plannedAmountMinor: line.plannedAmountMinor,
        carryOverRule: line.carryOverRule,
      },
    });
    writes += 1;
  }
  await recordAudit({
    actorUserId,
    action: "BUDGET_MONTH_COPIED",
    entityType: "Budget",
    entityId: budgetId,
    after: { fromMonth, toMonth, copied: writes },
  });
  return writes;
}

// ---------------------------------------------------------------------------
// Actuals load + per-month projection
// ---------------------------------------------------------------------------

function startOfMonthUtc(month: string): Date {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1));
}
function nextMonthUtc(month: string): Date {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1));
}

/**
 * Loads transactions that intersect any of the supplied months, converts
 * each to the budget currency (CHF in v1) via its captured `fxRateToBase`,
 * and groups absolute amounts by (month, category, kind).
 */
async function loadActualsForMonths(
  budgetCurrency: string,
  months: string[],
): Promise<Map<string, MonthlyActuals>> {
  if (budgetCurrency !== BASE_CURRENCY) {
    // Caller already guards on create/update, but be defensive.
    throw new BudgetError("UNSUPPORTED_CURRENCY", `Only ${BASE_CURRENCY} budgets are supported.`);
  }
  if (months.length === 0) return new Map();

  const sorted = [...months].sort();
  const from = startOfMonthUtc(sorted[0]!);
  const to = nextMonthUtc(sorted[sorted.length - 1]!);

  const where: Prisma.TransactionWhereInput = {
    occurredOn: { gte: from, lt: to },
    isTransfer: false,
  };
  const rows = await prisma.transaction.findMany({
    where,
    include: { category: { select: { id: true, kind: true } } },
  });

  const acc = new Map<string, MonthlyActuals>();
  for (const m of months) {
    acc.set(m, {
      expenseActualByCategory: new Map(),
      incomeActualByCategory: new Map(),
    });
  }

  for (const t of rows) {
    if (!t.categoryId || !t.category) continue;
    const month = `${t.occurredOn.getUTCFullYear()}-${String(
      t.occurredOn.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    const bucket = acc.get(month);
    if (!bucket) continue;
    const rate = t.fxRateToBase ? Number(t.fxRateToBase) : null;
    const chf =
      t.currency === BASE_CURRENCY
        ? Number(t.amountMinor)
        : convertToBaseMinor(t.amountMinor, t.currency, rate);
    if (chf == null) continue; // no rate → ignore (preview shows missing-FX warning)
    const abs = Math.abs(chf);
    const kind: CategoryKind = t.category.kind;
    const target =
      kind === "INCOME" ? bucket.incomeActualByCategory : bucket.expenseActualByCategory;
    target.set(t.categoryId, (target.get(t.categoryId) ?? 0) + abs);
  }
  return acc;
}

/**
 * Returns a cascaded variance summary for each month with at least one line,
 * sorted ascending. Carry-over rules are applied across months.
 */
export async function getBudgetSummary(budgetId: string): Promise<MonthSummary[]> {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new BudgetError("NOT_FOUND", "Budget not found.");

  const lines = await prisma.budgetLine.findMany({
    where: { budgetId },
    include: { category: { select: { id: true, name: true, kind: true } } },
    orderBy: [{ month: "asc" }],
  });
  const monthSet = new Set(lines.map((l) => l.month));
  const months = [...monthSet].sort();
  if (months.length === 0) return [];

  const actuals = await loadActualsForMonths(budget.currency, months);
  const inputs = months.map((month) => {
    const monthLines: BudgetLineInput[] = lines
      .filter((l) => l.month === month)
      .map((l) => ({
        categoryId: l.categoryId,
        categoryName: l.category.name,
        categoryKind: l.category.kind,
        plannedMinor: Number(l.plannedAmountMinor),
        carryOverRule: l.carryOverRule,
      }));
    return {
      month,
      lines: monthLines,
      actuals: actuals.get(month) ?? {
        expenseActualByCategory: new Map<string, number>(),
        incomeActualByCategory: new Map<string, number>(),
      },
    };
  });
  return cascadeVariance(inputs);
}
