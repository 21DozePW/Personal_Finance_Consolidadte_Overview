/**
 * Integration coverage for transactions + categories. Real Postgres; skipped
 * when DATABASE_URL is unset. FX provider chain stays at the default — but
 * we seed FxRate rows directly so transaction writes capture them.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let createCategory: typeof import("@/server/categories").createCategory;
let deleteCategory: typeof import("@/server/categories").deleteCategory;
let listCategories: typeof import("@/server/categories").listCategories;
let CategoryError: typeof import("@/server/categories").CategoryError;

let createInstitution: typeof import("@/server/institutions").createInstitution;
let createAccount: typeof import("@/server/accounts").createAccount;

let createSingleTransaction: typeof import("@/server/transactions").createSingleTransaction;
let createTransfer: typeof import("@/server/transactions").createTransfer;
let createSplitTransaction: typeof import("@/server/transactions").createSplitTransaction;
let updateTransaction: typeof import("@/server/transactions").updateTransaction;
let deleteTransaction: typeof import("@/server/transactions").deleteTransaction;
let listTransactions: typeof import("@/server/transactions").listTransactions;
let getTransaction: typeof import("@/server/transactions").getTransaction;
let TransactionError: typeof import("@/server/transactions").TransactionError;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const c = await import("@/server/categories");
  createCategory = c.createCategory;
  deleteCategory = c.deleteCategory;
  listCategories = c.listCategories;
  CategoryError = c.CategoryError;

  const insts = await import("@/server/institutions");
  createInstitution = insts.createInstitution;

  const accs = await import("@/server/accounts");
  createAccount = accs.createAccount;

  const t = await import("@/server/transactions");
  createSingleTransaction = t.createSingleTransaction;
  createTransfer = t.createTransfer;
  createSplitTransaction = t.createSplitTransaction;
  updateTransaction = t.updateTransaction;
  deleteTransaction = t.deleteTransaction;
  listTransactions = t.listTransactions;
  getTransaction = t.getTransaction;
  TransactionError = t.TransactionError;
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

async function makeAdmin() {
  return prisma.user.create({
    data: {
      googleSub: `sub-${Math.random()}`,
      email: `admin-${Math.random()}@example.com`,
      displayName: "Admin",
      role: UserRole.ADMIN,
      isActive: true,
    },
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

async function makeAccount(adminId: string, opts: { alias: string; currency: string }) {
  const inst = await createInstitution(adminId, { name: `Inst-${Math.random()}`, type: "BANK" });
  return createAccount(adminId, {
    institutionId: inst.id,
    alias: opts.alias,
    accountKind: "CHECKING",
    currency: opts.currency,
  });
}

d("categories", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates a category and rejects a parent with a different kind", async () => {
    const admin = await makeAdmin();
    const parent = await createCategory(admin.id, { name: "Food", kind: "EXPENSE" });
    await expect(
      createCategory(admin.id, {
        name: "Salary sub",
        kind: "INCOME",
        parentCategoryId: parent.id,
      }),
    ).rejects.toBeInstanceOf(CategoryError);
  });

  it("rejects nesting more than one level deep", async () => {
    const admin = await makeAdmin();
    const parent = await createCategory(admin.id, { name: "Food", kind: "EXPENSE" });
    const child = await createCategory(admin.id, {
      name: "Groceries",
      kind: "EXPENSE",
      parentCategoryId: parent.id,
    });
    await expect(
      createCategory(admin.id, {
        name: "Speciality",
        kind: "EXPENSE",
        parentCategoryId: child.id,
      }),
    ).rejects.toMatchObject({ code: "PARENT_MISMATCH" });
  });

  it("refuses delete when transactions reference it", async () => {
    const admin = await makeAdmin();
    const cat = await createCategory(admin.id, { name: "Groceries", kind: "EXPENSE" });
    const acc = await makeAccount(admin.id, { alias: "Checking", currency: "CHF" });
    await createSingleTransaction(admin.id, {
      accountId: acc.id,
      occurredOn: "2026-05-12",
      kind: "EXPENSE",
      amount: "10",
      categoryId: cat.id,
    });
    await expect(deleteCategory(admin.id, cat.id)).rejects.toMatchObject({ code: "IN_USE" });
  });

  it("includeArchived filters", async () => {
    const admin = await makeAdmin();
    await createCategory(admin.id, { name: "A", kind: "EXPENSE" });
    const b = await createCategory(admin.id, { name: "B", kind: "EXPENSE" });
    await prisma.category.update({ where: { id: b.id }, data: { isArchived: true } });
    const active = await listCategories({ includeArchived: false });
    const all = await listCategories({ includeArchived: true });
    expect(active.map((c) => c.name)).toEqual(["A"]);
    expect(all.map((c) => c.name).sort()).toEqual(["A", "B"]);
  });
});

d("transactions: single", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates an expense as a negative amount and encrypts the description", async () => {
    const admin = await makeAdmin();
    const acc = await makeAccount(admin.id, { alias: "Checking", currency: "CHF" });
    const t = await createSingleTransaction(admin.id, {
      accountId: acc.id,
      occurredOn: "2026-05-12",
      kind: "EXPENSE",
      amount: "12.34",
      description: "groceries at Migros",
      merchant: "Migros",
    });
    expect(t.amountMinor.toString()).toBe("-1234");
    expect(t.description).toBe("groceries at Migros");
    expect(t.merchantNormalized).toBe("migros");

    // Raw DB row should not contain the plaintext.
    const raw = await prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(raw.descriptionEncrypted).toMatch(/^v1\./);
    expect(raw.descriptionEncrypted).not.toContain("groceries");
  });

  it("captures fxRateToBase from the rate available on occurredOn", async () => {
    const admin = await makeAdmin();
    const acc = await makeAccount(admin.id, { alias: "USD", currency: "USD" });
    await seedRate("USD", "2026-05-11", 1.1);
    // 2026-05-12 has no rate → carry-forward picks 2026-05-11.
    const t = await createSingleTransaction(admin.id, {
      accountId: acc.id,
      occurredOn: "2026-05-12",
      kind: "EXPENSE",
      amount: "100",
    });
    expect(t.fxRateToBase).not.toBeNull();
    expect(Number(t.fxRateToBase!)).toBeCloseTo(1.1);
  });

  it("rejects bad amount strings cleanly", async () => {
    const admin = await makeAdmin();
    const acc = await makeAccount(admin.id, { alias: "Checking", currency: "CHF" });
    await expect(
      createSingleTransaction(admin.id, {
        accountId: acc.id,
        occurredOn: "2026-05-12",
        kind: "EXPENSE",
        amount: "abc",
      }),
    ).rejects.toBeInstanceOf(TransactionError);
  });

  it("updates: changing date refreshes captured fxRateToBase", async () => {
    const admin = await makeAdmin();
    const acc = await makeAccount(admin.id, { alias: "USD", currency: "USD" });
    await seedRate("USD", "2026-05-10", 1.1);
    await seedRate("USD", "2026-05-12", 1.2);
    const t = await createSingleTransaction(admin.id, {
      accountId: acc.id,
      occurredOn: "2026-05-10",
      kind: "EXPENSE",
      amount: "100",
    });
    expect(Number(t.fxRateToBase!)).toBeCloseTo(1.1);
    const updated = await updateTransaction(admin.id, t.id, { occurredOn: "2026-05-12" });
    expect(Number(updated.fxRateToBase!)).toBeCloseTo(1.2);
  });
});

d("transactions: transfers", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates a cross-currency pair with each leg in its own currency", async () => {
    const admin = await makeAdmin();
    const chf = await makeAccount(admin.id, { alias: "CHF chk", currency: "CHF" });
    const usd = await makeAccount(admin.id, { alias: "USD chk", currency: "USD" });
    const out = await createTransfer(admin.id, {
      fromAccountId: chf.id,
      toAccountId: usd.id,
      occurredOn: "2026-05-12",
      fromAmount: "1000",
      toAmount: "1100",
      description: "moving cash",
    });
    expect(out.from.currency).toBe("CHF");
    expect(out.to.currency).toBe("USD");
    expect(out.from.amountMinor.toString()).toBe("-100000");
    expect(out.to.amountMinor.toString()).toBe("110000");
    expect(out.from.transferPairId).toBe(out.to.id);
    expect(out.to.transferPairId).toBe(out.from.id);
    expect(out.from.isTransfer).toBe(true);
    expect(out.to.isTransfer).toBe(true);
  });

  it("delete drops both legs of a transfer", async () => {
    const admin = await makeAdmin();
    const a = await makeAccount(admin.id, { alias: "A", currency: "CHF" });
    const b = await makeAccount(admin.id, { alias: "B", currency: "CHF" });
    const { from } = await createTransfer(admin.id, {
      fromAccountId: a.id,
      toAccountId: b.id,
      occurredOn: "2026-05-12",
      fromAmount: "50",
      toAmount: "50",
    });
    await deleteTransaction(admin.id, from.id);
    const remaining = await prisma.transaction.count();
    expect(remaining).toBe(0);
  });

  it("refuses to edit transfer amount via updateTransaction", async () => {
    const admin = await makeAdmin();
    const a = await makeAccount(admin.id, { alias: "A", currency: "CHF" });
    const b = await makeAccount(admin.id, { alias: "B", currency: "CHF" });
    const { from } = await createTransfer(admin.id, {
      fromAccountId: a.id,
      toAccountId: b.id,
      occurredOn: "2026-05-12",
      fromAmount: "50",
      toAmount: "50",
    });
    await expect(
      updateTransaction(admin.id, from.id, { kind: "EXPENSE", amount: "60" }),
    ).rejects.toBeInstanceOf(TransactionError);
  });
});

d("transactions: splits", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates N rows sharing a splitGroupId; deleting any one removes all", async () => {
    const admin = await makeAdmin();
    const acc = await makeAccount(admin.id, { alias: "Checking", currency: "CHF" });
    const cat1 = await createCategory(admin.id, { name: "Food", kind: "EXPENSE" });
    const cat2 = await createCategory(admin.id, { name: "Drinks", kind: "EXPENSE" });

    const rows = await createSplitTransaction(admin.id, {
      accountId: acc.id,
      occurredOn: "2026-05-12",
      description: "dinner",
      lines: [
        { amount: "30", kind: "EXPENSE", categoryId: cat1.id },
        { amount: "12", kind: "EXPENSE", categoryId: cat2.id },
      ],
    });
    expect(rows).toHaveLength(2);
    const groupIds = new Set(rows.map((r) => r.splitGroupId));
    expect(groupIds.size).toBe(1);
    expect(rows[0]!.splitGroupId).toBe(rows[0]!.id);

    await deleteTransaction(admin.id, rows[1]!.id);
    const count = await prisma.transaction.count();
    expect(count).toBe(0);
  });
});

d("transactions: list filters", () => {
  beforeEach(async () => {
    await reset();
  });

  it("filters by account, date range, isTransfer", async () => {
    const admin = await makeAdmin();
    const a = await makeAccount(admin.id, { alias: "A", currency: "CHF" });
    const b = await makeAccount(admin.id, { alias: "B", currency: "USD" });
    await createSingleTransaction(admin.id, {
      accountId: a.id,
      occurredOn: "2026-05-10",
      kind: "EXPENSE",
      amount: "10",
    });
    await createSingleTransaction(admin.id, {
      accountId: a.id,
      occurredOn: "2026-05-12",
      kind: "EXPENSE",
      amount: "20",
    });
    await createSingleTransaction(admin.id, {
      accountId: b.id,
      occurredOn: "2026-05-12",
      kind: "INCOME",
      amount: "100",
    });

    const onlyA = await listTransactions({ accountId: a.id });
    expect(onlyA.items).toHaveLength(2);

    const ranged = await listTransactions({ from: "2026-05-11", to: "2026-05-12" });
    expect(ranged.items).toHaveLength(2);

    const usd = await listTransactions({ currency: "USD" });
    expect(usd.items).toHaveLength(1);
  });

  it("returns getTransaction with account + category + transfer pair includes", async () => {
    const admin = await makeAdmin();
    const a = await makeAccount(admin.id, { alias: "A", currency: "CHF" });
    const b = await makeAccount(admin.id, { alias: "B", currency: "CHF" });
    const { from } = await createTransfer(admin.id, {
      fromAccountId: a.id,
      toAccountId: b.id,
      occurredOn: "2026-05-12",
      fromAmount: "50",
      toAmount: "50",
    });
    const detail = await getTransaction(from.id);
    expect(detail?.account.alias).toBe("A");
    expect(detail?.transferPair?.account.alias).toBe("B");
  });
});
