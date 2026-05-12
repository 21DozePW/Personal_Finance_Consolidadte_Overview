import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let createRecurring: typeof import("@/server/recurring").createRecurring;
let updateRecurring: typeof import("@/server/recurring").updateRecurring;
let deleteRecurring: typeof import("@/server/recurring").deleteRecurring;
let listRecurring: typeof import("@/server/recurring").listRecurring;
let RecurringError: typeof import("@/server/recurring").RecurringError;

let createInstitution: typeof import("@/server/institutions").createInstitution;
let createAccount: typeof import("@/server/accounts").createAccount;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const m = await import("@/server/recurring");
  createRecurring = m.createRecurring;
  updateRecurring = m.updateRecurring;
  deleteRecurring = m.deleteRecurring;
  listRecurring = m.listRecurring;
  RecurringError = m.RecurringError;
  ({ createInstitution } = await import("@/server/institutions"));
  ({ createAccount } = await import("@/server/accounts"));
});

afterAll(async () => {
  await prisma.$disconnect();
  process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
});

async function reset() {
  await prisma.auditLog.deleteMany({});
  await prisma.recurringCommitment.deleteMany({});
  await prisma.loanTerms.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.accountBalance.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.institution.deleteMany({});
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
  return { admin, acc };
}

d("RecurringCommitment lifecycle", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates a recurring commitment with encrypted notes", async () => {
    const { admin, acc } = await setup();
    const r = await createRecurring(admin.id, {
      name: "Spotify",
      accountId: acc.id,
      amount: "15.95",
      cadence: "MONTHLY",
      kind: "SUBSCRIPTION",
      nextDueDate: "2026-05-15",
      notes: "Family plan",
    });
    expect(r.amountMinor.toString()).toBe("1595");
    expect(r.notes).toBe("Family plan");
    expect(r.isManagedByLoanTerms).toBe(false);

    const raw = await prisma.recurringCommitment.findUniqueOrThrow({ where: { id: r.id } });
    expect(raw.notesEncrypted).toMatch(/^v1\./);
    expect(raw.notesEncrypted).not.toContain("Family");
  });

  it("rejects bad amounts cleanly", async () => {
    const { admin, acc } = await setup();
    await expect(
      createRecurring(admin.id, {
        name: "X",
        accountId: acc.id,
        amount: "abc",
        cadence: "MONTHLY",
        kind: "EXPENSE",
        nextDueDate: "2026-05-15",
      }),
    ).rejects.toBeInstanceOf(RecurringError);
  });

  it("update changes amount + cadence and audit-logs only metadata", async () => {
    const { admin, acc } = await setup();
    const r = await createRecurring(admin.id, {
      name: "Gym",
      accountId: acc.id,
      amount: "50",
      cadence: "MONTHLY",
      kind: "EXPENSE",
      nextDueDate: "2026-05-15",
      notes: "Hidden",
    });
    await updateRecurring(admin.id, r.id, {
      amount: "60",
      cadence: "QUARTERLY",
      notes: "Updated",
    });
    const updated = await prisma.recurringCommitment.findUniqueOrThrow({ where: { id: r.id } });
    expect(updated.amountMinor.toString()).toBe("6000");
    expect(updated.cadence).toBe("QUARTERLY");
    const audits = await prisma.auditLog.findMany({ where: { entityId: r.id } });
    const text = JSON.stringify(audits);
    expect(text).not.toContain("Hidden");
    expect(text).not.toContain("Updated");
  });

  it("deletes a commitment", async () => {
    const { admin, acc } = await setup();
    const r = await createRecurring(admin.id, {
      name: "Z",
      accountId: acc.id,
      amount: "1",
      cadence: "WEEKLY",
      kind: "EXPENSE",
      nextDueDate: "2026-05-15",
    });
    await deleteRecurring(admin.id, r.id);
    expect(await listRecurring()).toHaveLength(0);
  });

  it("listRecurring decrypts notes and flags LOAN_PAYMENT rows", async () => {
    const { admin, acc } = await setup();
    await createRecurring(admin.id, {
      name: "Mortgage",
      accountId: acc.id,
      amount: "3096",
      cadence: "MONTHLY",
      kind: "LOAN_PAYMENT",
      nextDueDate: "2026-05-01",
      notes: "Auto",
    });
    const items = await listRecurring();
    expect(items).toHaveLength(1);
    expect(items[0]!.isManagedByLoanTerms).toBe(true);
    expect(items[0]!.notes).toBe("Auto");
  });
});
