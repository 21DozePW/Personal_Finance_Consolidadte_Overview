import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let createBudget: typeof import("@/server/budgets").createBudget;
let upsertBudgetLine: typeof import("@/server/budgets").upsertBudgetLine;
let copyBudgetMonth: typeof import("@/server/budgets").copyBudgetMonth;
let getBudgetSummary: typeof import("@/server/budgets").getBudgetSummary;
let BudgetError: typeof import("@/server/budgets").BudgetError;
let createInstitution: typeof import("@/server/institutions").createInstitution;
let createAccount: typeof import("@/server/accounts").createAccount;
let createCategory: typeof import("@/server/categories").createCategory;
let createSingleTransaction: typeof import("@/server/transactions").createSingleTransaction;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const mod = await import("@/server/budgets");
  createBudget = mod.createBudget;
  upsertBudgetLine = mod.upsertBudgetLine;
  copyBudgetMonth = mod.copyBudgetMonth;
  getBudgetSummary = mod.getBudgetSummary;
  BudgetError = mod.BudgetError;
  ({ createInstitution } = await import("@/server/institutions"));
  ({ createAccount } = await import("@/server/accounts"));
  ({ createCategory } = await import("@/server/categories"));
  ({ createSingleTransaction } = await import("@/server/transactions"));
});

afterAll(async () => {
  await prisma.$disconnect();
  process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
});

async function reset() {
  await prisma.auditLog.deleteMany({});
  await prisma.budgetLine.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.accountBalance.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.institution.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.fxRate.deleteMany({});
  await prisma.recurringCommitment.deleteMany({});
  await prisma.user.deleteMany({});
}

async function setup() {
  const admin = await prisma.user.create({
    data: {
      googleSub: `sub-${Math.random()}`,
      email: `admin-${Math.random()}@example.com`,
      displayName: "A",
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
  const inst = await createInstitution(admin.id, { name: "B", type: "BANK" });
  const acc = await createAccount(admin.id, {
    institutionId: inst.id,
    alias: "Checking",
    accountKind: "CHECKING",
    currency: "CHF",
  });
  const groceries = await createCategory(admin.id, { name: "Groceries", kind: "EXPENSE" });
  const salary = await createCategory(admin.id, { name: "Salary", kind: "INCOME" });
  return { admin, acc, groceries, salary };
}

d("Budgets", () => {
  beforeEach(async () => {
    await reset();
  });

  it("rejects non-CHF budgets in v1", async () => {
    const { admin } = await setup();
    await expect(
      createBudget(admin.id, {
        name: "USD",
        currency: "USD",
        periodKind: "MONTHLY",
        startMonth: "2026-01",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CURRENCY" });
  });

  it("creates a budget and upserts lines per category+month", async () => {
    const { admin, groceries } = await setup();
    const budget = await createBudget(admin.id, {
      name: "2026",
      currency: "CHF",
      periodKind: "MONTHLY",
      startMonth: "2026-01",
    });
    await upsertBudgetLine(admin.id, budget.id, {
      categoryId: groceries.id,
      month: "2026-05",
      plannedAmount: "800",
      carryOverRule: "RESET",
    });
    await upsertBudgetLine(admin.id, budget.id, {
      categoryId: groceries.id,
      month: "2026-05",
      plannedAmount: "1000", // re-upsert
      carryOverRule: "ROLLOVER_SURPLUS",
    });
    const lines = await prisma.budgetLine.findMany({ where: { budgetId: budget.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.plannedAmountMinor.toString()).toBe("100000");
    expect(lines[0]!.carryOverRule).toBe("ROLLOVER_SURPLUS");
  });

  it("copies lines from a previous month, overwriting target-month lines", async () => {
    const { admin, groceries, salary } = await setup();
    const budget = await createBudget(admin.id, {
      name: "2026",
      currency: "CHF",
      periodKind: "MONTHLY",
      startMonth: "2026-01",
    });
    await upsertBudgetLine(admin.id, budget.id, {
      categoryId: groceries.id,
      month: "2026-04",
      plannedAmount: "800",
      carryOverRule: "RESET",
    });
    await upsertBudgetLine(admin.id, budget.id, {
      categoryId: salary.id,
      month: "2026-04",
      plannedAmount: "5000",
      carryOverRule: "RESET",
    });
    const copied = await copyBudgetMonth(admin.id, budget.id, {
      fromMonth: "2026-04",
      toMonth: "2026-05",
    });
    expect(copied).toBe(2);
    const may = await prisma.budgetLine.findMany({
      where: { budgetId: budget.id, month: "2026-05" },
    });
    expect(may).toHaveLength(2);
  });

  it("computes variance against real transactions with carry-over", async () => {
    const { admin, acc, groceries } = await setup();
    const budget = await createBudget(admin.id, {
      name: "2026",
      currency: "CHF",
      periodKind: "MONTHLY",
      startMonth: "2026-01",
    });
    await upsertBudgetLine(admin.id, budget.id, {
      categoryId: groceries.id,
      month: "2026-04",
      plannedAmount: "1000",
      carryOverRule: "ROLLOVER_SURPLUS",
    });
    await upsertBudgetLine(admin.id, budget.id, {
      categoryId: groceries.id,
      month: "2026-05",
      plannedAmount: "1000",
      carryOverRule: "ROLLOVER_SURPLUS",
    });

    // April: spend 400 → surplus 600
    await createSingleTransaction(admin.id, {
      accountId: acc.id,
      occurredOn: "2026-04-15",
      kind: "EXPENSE",
      amount: "400",
      categoryId: groceries.id,
    });
    // May: spend 700 → after carry-in 600, effective 1600, variance 900
    await createSingleTransaction(admin.id, {
      accountId: acc.id,
      occurredOn: "2026-05-10",
      kind: "EXPENSE",
      amount: "700",
      categoryId: groceries.id,
    });

    const summary = await getBudgetSummary(budget.id);
    expect(summary).toHaveLength(2);
    expect(summary[0]!.month).toBe("2026-04");
    expect(summary[0]!.rows[0]!.actualMinor).toBe(40_000);
    expect(summary[0]!.rows[0]!.varianceMinor).toBe(60_000);

    expect(summary[1]!.month).toBe("2026-05");
    expect(summary[1]!.rows[0]!.carriedInMinor).toBe(60_000);
    expect(summary[1]!.rows[0]!.effectivePlannedMinor).toBe(160_000);
    expect(summary[1]!.rows[0]!.actualMinor).toBe(70_000);
    expect(summary[1]!.rows[0]!.varianceMinor).toBe(90_000);
  });

  it("excludes transfers from actuals", async () => {
    const { admin, acc, groceries } = await setup();
    const budget = await createBudget(admin.id, {
      name: "2026",
      currency: "CHF",
      periodKind: "MONTHLY",
      startMonth: "2026-01",
    });
    await upsertBudgetLine(admin.id, budget.id, {
      categoryId: groceries.id,
      month: "2026-05",
      plannedAmount: "100",
      carryOverRule: "RESET",
    });
    // Manually create a transfer-like transaction (isTransfer=true) with the
    // groceries category just to confirm it's ignored.
    await prisma.transaction.create({
      data: {
        accountId: acc.id,
        occurredOn: new Date("2026-05-10T00:00:00Z"),
        amountMinor: -10_000n,
        currency: "CHF",
        categoryId: groceries.id,
        isTransfer: true,
        source: "MANUAL",
      },
    });
    const summary = await getBudgetSummary(budget.id);
    expect(summary[0]!.rows[0]!.actualMinor).toBe(0);
  });
});
