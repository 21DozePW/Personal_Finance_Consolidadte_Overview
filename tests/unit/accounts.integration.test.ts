/**
 * Integration coverage for the accounts + balances surface against real
 * Postgres. Skipped when DATABASE_URL is unset.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { InstitutionType, PrismaClient, UserRole } from "@prisma/client";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let createAccount: typeof import("@/server/accounts").createAccount;
let updateAccount: typeof import("@/server/accounts").updateAccount;
let deleteAccount: typeof import("@/server/accounts").deleteAccount;
let getAccount: typeof import("@/server/accounts").getAccount;
let listAccounts: typeof import("@/server/accounts").listAccounts;
let recordBalance: typeof import("@/server/balances").recordBalance;
let listBalances: typeof import("@/server/balances").listBalances;
let createInstitution: typeof import("@/server/institutions").createInstitution;
let deleteInstitution: typeof import("@/server/institutions").deleteInstitution;
let InstitutionError: typeof import("@/server/institutions").InstitutionError;
let AccountError: typeof import("@/server/accounts").AccountError;
let BalanceError: typeof import("@/server/balances").BalanceError;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const accountsMod = await import("@/server/accounts");
  const balancesMod = await import("@/server/balances");
  const institutionsMod = await import("@/server/institutions");
  createAccount = accountsMod.createAccount;
  updateAccount = accountsMod.updateAccount;
  deleteAccount = accountsMod.deleteAccount;
  getAccount = accountsMod.getAccount;
  listAccounts = accountsMod.listAccounts;
  AccountError = accountsMod.AccountError;
  recordBalance = balancesMod.recordBalance;
  listBalances = balancesMod.listBalances;
  BalanceError = balancesMod.BalanceError;
  createInstitution = institutionsMod.createInstitution;
  deleteInstitution = institutionsMod.deleteInstitution;
  InstitutionError = institutionsMod.InstitutionError;
});

afterAll(async () => {
  await prisma.$disconnect();
  process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
});

async function reset() {
  await prisma.auditLog.deleteMany({});
  await prisma.accountBalance.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.institution.deleteMany({});
  await prisma.allowedEmail.deleteMany({});
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

d("institutions + accounts business logic", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates and lists institutions, then refuses to delete one with accounts", async () => {
    const admin = await makeAdmin();
    const ubs = await createInstitution(admin.id, {
      name: "UBS",
      type: InstitutionType.BANK,
      country: "ch",
      website: "https://ubs.com",
    });
    expect(ubs.country).toBe("CH");

    const acc = await createAccount(admin.id, {
      institutionId: ubs.id,
      alias: "Joint Checking",
      accountKind: "CHECKING",
      currency: "chf",
    });
    expect(acc.currency).toBe("CHF");

    await expect(deleteInstitution(admin.id, ubs.id)).rejects.toBeInstanceOf(InstitutionError);
    await deleteAccount(admin.id, acc.id);
    await deleteInstitution(admin.id, ubs.id);
  });

  it("encrypts notes and lastFour at rest but exposes plaintext to authenticated callers", async () => {
    const admin = await makeAdmin();
    const inst = await createInstitution(admin.id, { name: "Migros Bank", type: "BANK" });
    const acc = await createAccount(admin.id, {
      institutionId: inst.id,
      alias: "Savings",
      accountKind: "SAVINGS",
      currency: "CHF",
      lastFour: "1234",
      notes: "primary household savings",
    });

    // The decorated record has decrypted plaintext.
    expect(acc.lastFour).toBe("1234");
    expect(acc.notes).toBe("primary household savings");

    // The raw DB row does not.
    const raw = await prisma.account.findUniqueOrThrow({ where: { id: acc.id } });
    expect(raw.lastFourEncrypted).not.toBe("1234");
    expect(raw.lastFourEncrypted).toMatch(/^v1\./);
    expect(raw.notesEncrypted).not.toContain("household");
    expect(raw.notesEncrypted).toMatch(/^v1\./);

    const decorated = await getAccount(acc.id);
    expect(decorated?.notes).toBe("primary household savings");
    expect(decorated?.isAsset).toBe(true);
  });

  it("does not leak decrypted secrets into the audit log on update", async () => {
    const admin = await makeAdmin();
    const inst = await createInstitution(admin.id, { name: "Yuh", type: "BANK" });
    const acc = await createAccount(admin.id, {
      institutionId: inst.id,
      alias: "Personal",
      accountKind: "CHECKING",
      currency: "CHF",
      notes: "original secret",
    });
    await updateAccount(admin.id, acc.id, { notes: "newer secret" });

    const audits = await prisma.auditLog.findMany({
      where: { entityType: "Account", entityId: acc.id },
    });
    const text = JSON.stringify(audits);
    expect(text).not.toContain("original secret");
    expect(text).not.toContain("newer secret");
  });

  it("classifies kinds into asset/liability buckets in listAccounts", async () => {
    const admin = await makeAdmin();
    const inst = await createInstitution(admin.id, { name: "Test", type: "BANK" });
    await createAccount(admin.id, {
      institutionId: inst.id,
      alias: "Cash",
      accountKind: "CASH",
      currency: "CHF",
    });
    await createAccount(admin.id, {
      institutionId: inst.id,
      alias: "Credit card",
      accountKind: "CREDIT_CARD",
      currency: "CHF",
    });
    const accounts = await listAccounts({ includeInactive: false });
    const assets = accounts.filter((a) => a.isAsset).map((a) => a.alias);
    const liabs = accounts.filter((a) => !a.isAsset).map((a) => a.alias);
    expect(assets).toEqual(["Cash"]);
    expect(liabs).toEqual(["Credit card"]);
  });

  it("records balances, upserts on the same day, and rejects bad amounts", async () => {
    const admin = await makeAdmin();
    const inst = await createInstitution(admin.id, { name: "Test", type: "BANK" });
    const acc = await createAccount(admin.id, {
      institutionId: inst.id,
      alias: "Savings",
      accountKind: "SAVINGS",
      currency: "CHF",
    });

    const b1 = await recordBalance(admin.id, acc.id, {
      asOfDate: "2026-05-12",
      amount: "1234.56",
    });
    expect(b1.balanceMinor.toString()).toBe("123456");

    // Same-day re-record overwrites.
    const b2 = await recordBalance(admin.id, acc.id, {
      asOfDate: "2026-05-12",
      amount: "2000",
    });
    expect(b2.id).toBe(b1.id);
    expect(b2.balanceMinor.toString()).toBe("200000");

    const list = await listBalances(acc.id);
    expect(list).toHaveLength(1);

    await expect(
      recordBalance(admin.id, acc.id, { asOfDate: "2026-05-12", amount: "abc" }),
    ).rejects.toBeInstanceOf(BalanceError);
  });

  it("refuses to delete an account that has balances", async () => {
    const admin = await makeAdmin();
    const inst = await createInstitution(admin.id, { name: "Test", type: "BANK" });
    const acc = await createAccount(admin.id, {
      institutionId: inst.id,
      alias: "Savings",
      accountKind: "SAVINGS",
      currency: "CHF",
    });
    await recordBalance(admin.id, acc.id, { asOfDate: "2026-05-12", amount: "100" });
    await expect(deleteAccount(admin.id, acc.id)).rejects.toMatchObject({ code: "HAS_HISTORY" });
  });

  it("rejects accounts pointing at a missing institution", async () => {
    const admin = await makeAdmin();
    await expect(
      createAccount(admin.id, {
        institutionId: "inst_does_not_exist",
        alias: "Nope",
        accountKind: "CHECKING",
        currency: "CHF",
      }),
    ).rejects.toMatchObject({ code: "INSTITUTION_NOT_FOUND" });
  });
});
