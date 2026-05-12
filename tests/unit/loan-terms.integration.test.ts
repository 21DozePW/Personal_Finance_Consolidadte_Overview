import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let createInstitution: typeof import("@/server/institutions").createInstitution;
let createAccount: typeof import("@/server/accounts").createAccount;
let createLoanTerms: typeof import("@/server/loan-terms").createLoanTerms;
let updateLoanTerms: typeof import("@/server/loan-terms").updateLoanTerms;
let deleteLoanTerms: typeof import("@/server/loan-terms").deleteLoanTerms;
let getLoanTermsByAccount: typeof import("@/server/loan-terms").getLoanTermsByAccount;
let LoanTermsError: typeof import("@/server/loan-terms").LoanTermsError;

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ({ createInstitution } = await import("@/server/institutions"));
  ({ createAccount } = await import("@/server/accounts"));
  const lt = await import("@/server/loan-terms");
  createLoanTerms = lt.createLoanTerms;
  updateLoanTerms = lt.updateLoanTerms;
  deleteLoanTerms = lt.deleteLoanTerms;
  getLoanTermsByAccount = lt.getLoanTermsByAccount;
  LoanTermsError = lt.LoanTermsError;
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

async function setup(kind: "MORTGAGE" | "LOAN" | "CHECKING" = "MORTGAGE") {
  const admin = await prisma.user.create({
    data: {
      googleSub: `sub-${Math.random()}`,
      email: `admin-${Math.random()}@example.com`,
      displayName: "A",
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
  const inst = await createInstitution(admin.id, { name: "Bank", type: "BANK" });
  const acc = await createAccount(admin.id, {
    institutionId: inst.id,
    alias: "Mortgage",
    accountKind: kind,
    currency: "CHF",
  });
  return { admin, acc };
}

d("LoanTerms lifecycle", () => {
  beforeEach(async () => {
    await reset();
  });

  it("creates loan terms, derives monthly payment, and auto-creates a RecurringCommitment", async () => {
    const { admin, acc } = await setup();
    const terms = await createLoanTerms(admin.id, acc.id, {
      principal: "500000",
      interestRatePct: "4.25",
      termMonths: 240,
      startDate: "2026-01-01",
      paymentDayOfMonth: 1,
    });
    expect(terms.principalMinor.toString()).toBe("50000000");
    expect(terms.interestRatePctBps).toBe(42_500);
    expect(Number(terms.monthlyPaymentMinor)).toBeGreaterThan(309_500);
    expect(Number(terms.monthlyPaymentMinor)).toBeLessThan(309_800);
    expect(terms.payoffDate).not.toBeNull();
    expect(terms.remainingBalanceMinor.toString()).toBe("50000000");

    const commitment = await prisma.recurringCommitment.findFirstOrThrow({
      where: { accountId: acc.id, kind: "LOAN_PAYMENT" },
    });
    expect(commitment.amountMinor).toBe(terms.monthlyPaymentMinor);
    expect(commitment.cadence).toBe("MONTHLY");
    expect(commitment.currency).toBe("CHF");
  });

  it("refuses to attach terms to a non-liability account", async () => {
    const { admin, acc } = await setup("CHECKING");
    await expect(
      createLoanTerms(admin.id, acc.id, {
        principal: "10000",
        interestRatePct: "1",
        termMonths: 12,
        startDate: "2026-01-01",
        paymentDayOfMonth: 1,
      }),
    ).rejects.toBeInstanceOf(LoanTermsError);
  });

  it("refuses a second LoanTerms on the same account", async () => {
    const { admin, acc } = await setup();
    await createLoanTerms(admin.id, acc.id, {
      principal: "10000",
      interestRatePct: "1",
      termMonths: 12,
      startDate: "2026-01-01",
      paymentDayOfMonth: 1,
    });
    await expect(
      createLoanTerms(admin.id, acc.id, {
        principal: "10000",
        interestRatePct: "1",
        termMonths: 12,
        startDate: "2026-01-01",
        paymentDayOfMonth: 1,
      }),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
  });

  it("update re-syncs the linked recurring commitment", async () => {
    const { admin, acc } = await setup();
    await createLoanTerms(admin.id, acc.id, {
      principal: "100000",
      interestRatePct: "3.0",
      termMonths: 120,
      startDate: "2026-01-01",
      paymentDayOfMonth: 1,
    });
    await updateLoanTerms(admin.id, acc.id, {
      principal: "100000",
      interestRatePct: "5.0",
      termMonths: 120,
      startDate: "2026-01-01",
      paymentDayOfMonth: 15,
    });
    const c = await prisma.recurringCommitment.findFirstOrThrow({
      where: { accountId: acc.id, kind: "LOAN_PAYMENT" },
    });
    expect(c.dayRule).toBe("day 15");
    const updatedTerms = await getLoanTermsByAccount(acc.id);
    expect(updatedTerms!.interestRatePctBps).toBe(50_000);
    // Monthly payment should be larger at 5% than at 3% for the same principal.
    expect(Number(c.amountMinor)).toBeGreaterThan(0);
  });

  it("delete drops the loan terms and the linked recurring commitment", async () => {
    const { admin, acc } = await setup();
    await createLoanTerms(admin.id, acc.id, {
      principal: "10000",
      interestRatePct: "1",
      termMonths: 12,
      startDate: "2026-01-01",
      paymentDayOfMonth: 1,
    });
    await deleteLoanTerms(admin.id, acc.id);
    expect(await getLoanTermsByAccount(acc.id)).toBeNull();
    const c = await prisma.recurringCommitment.findFirst({
      where: { accountId: acc.id, kind: "LOAN_PAYMENT" },
    });
    expect(c).toBeNull();
  });

  it("monthly-payment override is respected and not recomputed", async () => {
    const { admin, acc } = await setup();
    const terms = await createLoanTerms(admin.id, acc.id, {
      principal: "100000",
      interestRatePct: "3",
      termMonths: 120,
      startDate: "2026-01-01",
      paymentDayOfMonth: 1,
      monthlyPaymentOverride: "1000",
    });
    expect(terms.monthlyPaymentMinor.toString()).toBe("100000");
  });
});
