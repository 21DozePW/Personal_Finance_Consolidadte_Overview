import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let createGoal: typeof import("@/server/goals").createGoal;
let updateGoal: typeof import("@/server/goals").updateGoal;
let deleteGoal: typeof import("@/server/goals").deleteGoal;
let getGoalWithProgress: typeof import("@/server/goals").getGoalWithProgress;
let refreshGoalProgress: typeof import("@/server/goals").refreshGoalProgress;
let GoalError: typeof import("@/server/goals").GoalError;
let createInstitution: typeof import("@/server/institutions").createInstitution;
let createAccount: typeof import("@/server/accounts").createAccount;
let recordBalance: typeof import("@/server/balances").recordBalance;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const goals = await import("@/server/goals");
  createGoal = goals.createGoal;
  updateGoal = goals.updateGoal;
  deleteGoal = goals.deleteGoal;
  getGoalWithProgress = goals.getGoalWithProgress;
  refreshGoalProgress = goals.refreshGoalProgress;
  GoalError = goals.GoalError;
  ({ createInstitution } = await import("@/server/institutions"));
  ({ createAccount } = await import("@/server/accounts"));
  ({ recordBalance } = await import("@/server/balances"));
});

afterAll(async () => {
  await prisma.$disconnect();
  process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
});

async function reset() {
  await prisma.auditLog.deleteMany({});
  await prisma.goal.deleteMany({});
  await prisma.budgetLine.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.recurringCommitment.deleteMany({});
  await prisma.loanTerms.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.accountBalance.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.institution.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.fxRate.deleteMany({});
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
  return { admin, inst };
}

async function makeAccount(adminId: string, instId: string, currency: string) {
  return createAccount(adminId, {
    institutionId: instId,
    alias: `${currency} chk`,
    accountKind: "SAVINGS",
    currency,
  });
}

async function seedRate(quote: string, date: string, rate: number) {
  return prisma.fxRate.create({
    data: {
      baseCurrency: "CHF",
      quoteCurrency: quote,
      asOfDate: new Date(`${date}T00:00:00Z`),
      rate: rate.toString(),
      source: "MANUAL",
    },
  });
}

d("Goals", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates a goal and computes progress", async () => {
    const { admin } = await setup();
    const goal = await createGoal(admin.id, {
      name: "Italy 2027",
      kind: "SAVINGS",
      currency: "CHF",
      targetAmount: "10000",
      targetDate: "2027-12-31",
      currentAmount: "1000",
      monthlyContribution: "500",
    });
    const fetched = await getGoalWithProgress(goal.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.derivedCurrentMinor).toBe(100_000);
    expect(fetched!.progress.pctComplete).toBeCloseTo(0.1);
    expect(fetched!.hasFxWarning).toBe(false);
  });

  it("rejects a non-existent linked account", async () => {
    const { admin } = await setup();
    await expect(
      createGoal(admin.id, {
        name: "X",
        kind: "SAVINGS",
        currency: "CHF",
        targetAmount: "1",
        targetDate: "2027-01-01",
        linkedAccountId: "acc_missing",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
  });

  it("derives current amount from the linked account's latest balance", async () => {
    const { admin, inst } = await setup();
    const account = await makeAccount(admin.id, inst.id, "CHF");
    await recordBalance(admin.id, account.id, { asOfDate: "2026-05-12", amount: "1234.56" });
    const goal = await createGoal(admin.id, {
      name: "X",
      kind: "SAVINGS",
      currency: "CHF",
      targetAmount: "10000",
      targetDate: "2027-01-01",
      linkedAccountId: account.id,
    });
    const fetched = await getGoalWithProgress(goal.id);
    expect(fetched!.derivedCurrentMinor).toBe(123_456);
    expect(fetched!.hasFxWarning).toBe(false);
  });

  it("flags FX risk when linked account currency differs and converts via latest rate", async () => {
    const { admin, inst } = await setup();
    const usd = await makeAccount(admin.id, inst.id, "USD");
    await recordBalance(admin.id, usd.id, { asOfDate: "2026-05-12", amount: "1100" });
    await seedRate("USD", "2026-05-12", 1.1); // 1 CHF = 1.10 USD

    const goal = await createGoal(admin.id, {
      name: "Mixed",
      kind: "SAVINGS",
      currency: "CHF",
      targetAmount: "10000",
      targetDate: "2027-01-01",
      linkedAccountId: usd.id,
    });
    const fetched = await getGoalWithProgress(goal.id);
    // 1100 USD / 1.1 = 1000 CHF = 100 000 minor
    expect(fetched!.derivedCurrentMinor).toBe(100_000);
    expect(fetched!.hasFxWarning).toBe(true);
    expect(fetched!.fxWarningReason).toContain("USD");
  });

  it("surfaces a missing-rate FX warning instead of silently computing", async () => {
    const { admin, inst } = await setup();
    const brl = await makeAccount(admin.id, inst.id, "BRL");
    await recordBalance(admin.id, brl.id, { asOfDate: "2026-05-12", amount: "5000" });
    // No BRL rate seeded.
    const goal = await createGoal(admin.id, {
      name: "No rate",
      kind: "SAVINGS",
      currency: "CHF",
      targetAmount: "10000",
      targetDate: "2027-01-01",
      linkedAccountId: brl.id,
    });
    const fetched = await getGoalWithProgress(goal.id);
    expect(fetched!.hasFxWarning).toBe(true);
    expect(fetched!.fxWarningReason).toContain("no FX rate");
  });

  it("refreshGoalProgress writes the derived amount back to currentAmountMinor", async () => {
    const { admin, inst } = await setup();
    const account = await makeAccount(admin.id, inst.id, "CHF");
    await recordBalance(admin.id, account.id, { asOfDate: "2026-05-12", amount: "9999" });
    const goal = await createGoal(admin.id, {
      name: "X",
      kind: "SAVINGS",
      currency: "CHF",
      targetAmount: "10000",
      targetDate: "2027-01-01",
      linkedAccountId: account.id,
    });
    const before = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(before.currentAmountMinor.toString()).toBe("0");
    const refreshed = await refreshGoalProgress(admin.id, goal.id);
    expect(refreshed.currentAmountMinor.toString()).toBe("999900");
  });

  it("update + delete with audit", async () => {
    const { admin } = await setup();
    const goal = await createGoal(admin.id, {
      name: "X",
      kind: "SAVINGS",
      currency: "CHF",
      targetAmount: "1000",
      targetDate: "2027-01-01",
    });
    await updateGoal(admin.id, goal.id, {
      name: "Renamed",
      targetAmount: "2000",
      monthlyContribution: "100",
    });
    const updated = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(updated.name).toBe("Renamed");
    expect(updated.targetAmountMinor.toString()).toBe("200000");
    await deleteGoal(admin.id, goal.id);
    expect(await prisma.goal.findUnique({ where: { id: goal.id } })).toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { entityType: "Goal" } });
    expect(audits.length).toBeGreaterThanOrEqual(3); // create, update, delete
  });
});
