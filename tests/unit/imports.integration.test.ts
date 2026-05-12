/**
 * Integration tests for the import lifecycle. Skipped when DATABASE_URL is
 * unset.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let createImportBatch: typeof import("@/server/imports").createImportBatch;
let commitImportBatch: typeof import("@/server/imports").commitImportBatch;
let revertImportBatch: typeof import("@/server/imports").revertImportBatch;
let ImportError: typeof import("@/server/imports").ImportError;
let createInstitution: typeof import("@/server/institutions").createInstitution;
let createAccount: typeof import("@/server/accounts").createAccount;
let createCategory: typeof import("@/server/categories").createCategory;
let createSingleTransaction: typeof import("@/server/transactions").createSingleTransaction;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const imp = await import("@/server/imports");
  createImportBatch = imp.createImportBatch;
  commitImportBatch = imp.commitImportBatch;
  revertImportBatch = imp.revertImportBatch;
  ImportError = imp.ImportError;
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
  await prisma.transaction.deleteMany({});
  await prisma.importBatch.deleteMany({});
  await prisma.importProfile.deleteMany({});
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
      displayName: "Admin",
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
  const inst = await createInstitution(admin.id, { name: "Test", type: "BANK" });
  const acc = await createAccount(admin.id, {
    institutionId: inst.id,
    alias: "Checking",
    accountKind: "CHECKING",
    currency: "CHF",
  });
  return { admin, inst, acc };
}

const SAMPLE_CSV = [
  "Date,Amount,Description",
  "12.05.2026,-12.34,Migros",
  "13.05.2026,500.00,Salary",
  "14.05.2026,-7.50,Coffee shop",
].join("\n");

d("import lifecycle", () => {
  beforeEach(async () => {
    await reset();
  });

  it("parses CSV, dedups, and previews without writing transactions", async () => {
    const { admin, acc } = await setup();
    const batch = await createImportBatch(
      admin.id,
      {
        accountId: acc.id,
        fileName: "test.csv",
        format: "CSV",
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Description" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
      SAMPLE_CSV,
    );
    expect(batch.status).toBe("PENDING");
    expect(batch.rowCount).toBe(3);
    expect(batch.skippedCount).toBe(0);
    expect(batch.importedCount).toBe(3); // pending: how many will be imported

    const txnCount = await prisma.transaction.count();
    expect(txnCount).toBe(0);
  });

  it("commits a batch and creates Transaction rows with importBatchId + CSV_IMPORT source", async () => {
    const { admin, acc } = await setup();
    const batch = await createImportBatch(
      admin.id,
      {
        accountId: acc.id,
        fileName: "test.csv",
        format: "CSV",
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Description" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
      SAMPLE_CSV,
    );
    const committed = await commitImportBatch(admin.id, batch.id);
    expect(committed.status).toBe("COMMITTED");
    expect(committed.importedCount).toBe(3);

    const rows = await prisma.transaction.findMany({ where: { importBatchId: batch.id } });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.source).toBe("CSV_IMPORT");
      expect(r.descriptionEncrypted).toMatch(/^v1\./);
    }
  });

  it("dedups identical re-imports of the same file", async () => {
    const { admin, acc } = await setup();
    const first = await createImportBatch(
      admin.id,
      {
        accountId: acc.id,
        fileName: "a.csv",
        format: "CSV",
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Description" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
      SAMPLE_CSV,
    );
    await commitImportBatch(admin.id, first.id);
    const second = await createImportBatch(
      admin.id,
      {
        accountId: acc.id,
        fileName: "a-again.csv",
        format: "CSV",
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Description" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
      SAMPLE_CSV,
    );
    expect(second.skippedCount).toBe(3);
    expect(second.importedCount).toBe(0);
  });

  it("revert deletes the transactions and flips status to REVERTED", async () => {
    const { admin, acc } = await setup();
    const batch = await createImportBatch(
      admin.id,
      {
        accountId: acc.id,
        fileName: "test.csv",
        format: "CSV",
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Description" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
      SAMPLE_CSV,
    );
    await commitImportBatch(admin.id, batch.id);
    const reverted = await revertImportBatch(admin.id, batch.id);
    expect(reverted.status).toBe("REVERTED");
    const remaining = await prisma.transaction.count();
    expect(remaining).toBe(0);
  });

  it("refuses to commit a non-pending batch", async () => {
    const { admin, acc } = await setup();
    const batch = await createImportBatch(
      admin.id,
      {
        accountId: acc.id,
        fileName: "test.csv",
        format: "CSV",
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Description" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
      SAMPLE_CSV,
    );
    await commitImportBatch(admin.id, batch.id);
    await expect(commitImportBatch(admin.id, batch.id)).rejects.toBeInstanceOf(ImportError);
  });

  it("applies category suggestions from history on commit", async () => {
    const { admin, acc } = await setup();
    const groceries = await createCategory(admin.id, { name: "Groceries", kind: "EXPENSE" });

    // Seed an earlier transaction so the suggester knows Migros → groceries.
    await createSingleTransaction(admin.id, {
      accountId: acc.id,
      occurredOn: "2026-01-01",
      kind: "EXPENSE",
      amount: "20",
      description: "Migros run",
      merchant: "Migros",
      categoryId: groceries.id,
    });

    // Now import a new file containing a Migros line.
    const csv = ["Date,Amount,Description", "12.05.2026,-15.00,Migros"].join("\n");
    const batch = await createImportBatch(
      admin.id,
      {
        accountId: acc.id,
        fileName: "later.csv",
        format: "CSV",
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Description" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
      csv,
    );
    await commitImportBatch(admin.id, batch.id);
    const created = await prisma.transaction.findFirstOrThrow({
      where: { importBatchId: batch.id },
    });
    expect(created.categoryId).toBe(groceries.id);
  });

  it("captures fxRateToBase using the rate available on occurredOn", async () => {
    const admin = await prisma.user.create({
      data: {
        googleSub: `sub-${Math.random()}`,
        email: `admin-${Math.random()}@example.com`,
        displayName: "A",
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    const inst = await createInstitution(admin.id, { name: "USD bank", type: "BANK" });
    const acc = await createAccount(admin.id, {
      institutionId: inst.id,
      alias: "USD chk",
      accountKind: "CHECKING",
      currency: "USD",
    });
    await prisma.fxRate.create({
      data: {
        baseCurrency: "CHF",
        quoteCurrency: "USD",
        asOfDate: new Date("2026-05-11T00:00:00Z"),
        rate: "1.1",
        source: "MANUAL",
      },
    });
    const csv = ["Date,Amount,Description", "12.05.2026,-100,whatever"].join("\n");
    const batch = await createImportBatch(
      admin.id,
      {
        accountId: acc.id,
        fileName: "u.csv",
        format: "CSV",
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Description" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
      csv,
    );
    await commitImportBatch(admin.id, batch.id);
    const t = await prisma.transaction.findFirstOrThrow({ where: { importBatchId: batch.id } });
    expect(Number(t.fxRateToBase!)).toBeCloseTo(1.1);
  });
});
