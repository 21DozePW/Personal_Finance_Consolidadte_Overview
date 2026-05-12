/**
 * LoanTerms CRUD + RecurringCommitment sync.
 *
 * Each `LoanTerms` row is 1:1 with an account whose `accountKind` is LOAN,
 * LEASE, or MORTGAGE. Creating loan terms automatically writes a single
 * `RecurringCommitment` (kind = LOAN_PAYMENT, cadence = MONTHLY) so the loan
 * shows up in cash-flow projections in Phase 6. We use the convention
 * `(accountId, kind = LOAN_PAYMENT)` to find it back — at most one such row
 * per account.
 *
 * Audit log never stores decrypted amounts beyond the cent; encrypted notes
 * stay encrypted at rest.
 */

import "server-only";
import type { Account, LoanTerms } from "@prisma/client";
import { AccountKind, RecurringKind, RecurringCadence } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";
import {
  generateSchedule,
  monthlyPayment as computeMonthlyPayment,
  nthDueDate,
  type ScheduleRow,
} from "@/lib/amortization";
import {
  createLoanTermsSchema,
  pctStringToBps,
  updateLoanTermsSchema,
  type CreateLoanTermsInput,
} from "@/schemas/loan-terms";

export class LoanTermsError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "ACCOUNT_NOT_FOUND"
      | "NOT_LIABILITY"
      | "ALREADY_EXISTS"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "LoanTermsError";
  }
}

const LIABILITY_LOAN_KINDS = new Set<AccountKind>([
  AccountKind.LOAN,
  AccountKind.LEASE,
  AccountKind.MORTGAGE,
]);

function dateOnly(input: string): Date {
  return new Date(`${input}T00:00:00Z`);
}

async function loadLoanAccount(
  id: string,
): Promise<Pick<Account, "id" | "currency" | "accountKind" | "alias">> {
  const acc = await prisma.account.findUnique({
    where: { id },
    select: { id: true, currency: true, accountKind: true, alias: true },
  });
  if (!acc) throw new LoanTermsError("ACCOUNT_NOT_FOUND", "Account not found.");
  if (!LIABILITY_LOAN_KINDS.has(acc.accountKind)) {
    throw new LoanTermsError(
      "NOT_LIABILITY",
      "Loan terms can only be attached to LOAN, LEASE, or MORTGAGE accounts.",
    );
  }
  return acc;
}

function parsedMinor(raw: string, currency: string): bigint {
  try {
    return parseAmountToMinor(raw, currency);
  } catch (err) {
    if (err instanceof ParseAmountError) {
      throw new LoanTermsError("INVALID_INPUT", err.message);
    }
    throw err;
  }
}

function endDateFor(startDate: Date, termMonths: number, paymentDayOfMonth: number): Date {
  return nthDueDate(startDate, termMonths, paymentDayOfMonth);
}

async function syncRecurringCommitment(
  accountId: string,
  currency: string,
  alias: string,
  monthlyPaymentMinor: bigint,
  paymentDayOfMonth: number,
  nextDueDate: Date,
  endDate: Date,
): Promise<void> {
  const existing = await prisma.recurringCommitment.findFirst({
    where: { accountId, kind: RecurringKind.LOAN_PAYMENT },
    select: { id: true },
  });
  const baseData = {
    name: `${alias} payment`,
    accountId,
    amountMinor: monthlyPaymentMinor,
    currency,
    cadence: RecurringCadence.MONTHLY,
    dayRule: `day ${paymentDayOfMonth}`,
    nextDueDate,
    endDate,
    kind: RecurringKind.LOAN_PAYMENT,
  };
  if (existing) {
    await prisma.recurringCommitment.update({ where: { id: existing.id }, data: baseData });
  } else {
    await prisma.recurringCommitment.create({ data: baseData });
  }
}

async function deleteLinkedRecurring(accountId: string): Promise<void> {
  await prisma.recurringCommitment.deleteMany({
    where: { accountId, kind: RecurringKind.LOAN_PAYMENT },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getLoanTermsByAccount(accountId: string) {
  return prisma.loanTerms.findUnique({ where: { accountId } });
}

export function scheduleForLoan(loan: LoanTerms): ScheduleRow[] {
  return generateSchedule({
    principalMinor: Number(loan.principalMinor),
    interestRatePctBps: loan.interestRatePctBps,
    termMonths: loan.termMonths,
    startDate: loan.startDate,
    paymentDayOfMonth: loan.paymentDayOfMonth,
    paymentMinor: Number(loan.monthlyPaymentMinor),
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createLoanTerms(
  actorUserId: string,
  accountId: string,
  raw: unknown,
): Promise<LoanTerms> {
  const parsed = createLoanTermsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LoanTermsError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const account = await loadLoanAccount(accountId);

  const existing = await prisma.loanTerms.findUnique({ where: { accountId } });
  if (existing)
    throw new LoanTermsError(
      "ALREADY_EXISTS",
      "This account already has loan terms — edit them instead.",
    );

  return persistLoanTerms(actorUserId, account, parsed.data, null);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateLoanTerms(
  actorUserId: string,
  accountId: string,
  raw: unknown,
): Promise<LoanTerms> {
  const parsed = updateLoanTermsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LoanTermsError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const account = await loadLoanAccount(accountId);
  const before = await prisma.loanTerms.findUnique({ where: { accountId } });
  if (!before) throw new LoanTermsError("NOT_FOUND", "Loan terms not found.");

  // Merge update into a full input so the regen logic stays linear.
  const merged: CreateLoanTermsInput = {
    principal: parsed.data.principal ?? (Number(before.principalMinor) / 100).toString(),
    interestRatePct: parsed.data.interestRatePct ?? (before.interestRatePctBps / 10_000).toString(),
    termMonths: parsed.data.termMonths ?? before.termMonths,
    startDate: parsed.data.startDate ?? before.startDate.toISOString().slice(0, 10),
    paymentDayOfMonth: parsed.data.paymentDayOfMonth ?? before.paymentDayOfMonth,
    monthlyPaymentOverride: parsed.data.monthlyPaymentOverride,
  };

  return persistLoanTerms(actorUserId, account, merged, before, parsed.data.remainingBalance);
}

async function persistLoanTerms(
  actorUserId: string,
  account: Pick<Account, "id" | "currency" | "alias">,
  input: CreateLoanTermsInput,
  before: LoanTerms | null,
  remainingBalanceOverride?: string,
): Promise<LoanTerms> {
  const principalMinor = parsedMinor(input.principal, account.currency);
  const interestRatePctBps = pctStringToBps(input.interestRatePct);
  const startDate = dateOnly(input.startDate);
  const endDate = endDateFor(startDate, input.termMonths, input.paymentDayOfMonth);
  const monthlyPaymentMinor =
    input.monthlyPaymentOverride != null && input.monthlyPaymentOverride !== ""
      ? parsedMinor(input.monthlyPaymentOverride, account.currency)
      : BigInt(
          computeMonthlyPayment({
            principalMinor: Number(principalMinor),
            interestRatePctBps,
            termMonths: input.termMonths,
          }),
        );

  const remainingBalanceMinor =
    remainingBalanceOverride != null && remainingBalanceOverride !== ""
      ? parsedMinor(remainingBalanceOverride, account.currency)
      : (before?.remainingBalanceMinor ?? principalMinor);

  // Estimate payoffDate by simulating with the chosen monthly payment.
  const projected = generateSchedule({
    principalMinor: Number(remainingBalanceMinor),
    interestRatePctBps,
    termMonths: input.termMonths,
    startDate,
    paymentDayOfMonth: input.paymentDayOfMonth,
    paymentMinor: Number(monthlyPaymentMinor),
  });
  const payoffDate = projected[projected.length - 1]?.dueDate ?? endDate;

  const data = {
    accountId: account.id,
    principalMinor,
    interestRatePctBps,
    termMonths: input.termMonths,
    startDate,
    endDate,
    monthlyPaymentMinor,
    paymentDayOfMonth: input.paymentDayOfMonth,
    remainingBalanceMinor,
    payoffDate,
  };
  const upserted = await prisma.loanTerms.upsert({
    where: { accountId: account.id },
    update: data,
    create: data,
  });

  const nextDue = nthDueDate(startDate, 1, input.paymentDayOfMonth);
  await syncRecurringCommitment(
    account.id,
    account.currency,
    account.alias,
    monthlyPaymentMinor,
    input.paymentDayOfMonth,
    nextDue,
    endDate,
  );

  await recordAudit({
    actorUserId,
    action: before ? "LOAN_TERMS_UPDATED" : "LOAN_TERMS_CREATED",
    entityType: "LoanTerms",
    entityId: upserted.id,
    before: before
      ? {
          principalMinor: before.principalMinor.toString(),
          interestRatePctBps: before.interestRatePctBps,
          termMonths: before.termMonths,
          monthlyPaymentMinor: before.monthlyPaymentMinor.toString(),
          paymentDayOfMonth: before.paymentDayOfMonth,
          startDate: before.startDate.toISOString().slice(0, 10),
          remainingBalanceMinor: before.remainingBalanceMinor.toString(),
        }
      : null,
    after: {
      principalMinor: upserted.principalMinor.toString(),
      interestRatePctBps: upserted.interestRatePctBps,
      termMonths: upserted.termMonths,
      monthlyPaymentMinor: upserted.monthlyPaymentMinor.toString(),
      paymentDayOfMonth: upserted.paymentDayOfMonth,
      startDate: upserted.startDate.toISOString().slice(0, 10),
      remainingBalanceMinor: upserted.remainingBalanceMinor.toString(),
      payoffDate: upserted.payoffDate?.toISOString().slice(0, 10) ?? null,
    },
  });
  return upserted;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteLoanTerms(actorUserId: string, accountId: string): Promise<void> {
  const before = await prisma.loanTerms.findUnique({ where: { accountId } });
  if (!before) throw new LoanTermsError("NOT_FOUND", "Loan terms not found.");
  await prisma.loanTerms.delete({ where: { accountId } });
  await deleteLinkedRecurring(accountId);
  await recordAudit({
    actorUserId,
    action: "LOAN_TERMS_DELETED",
    entityType: "LoanTerms",
    entityId: before.id,
    before: {
      principalMinor: before.principalMinor.toString(),
      termMonths: before.termMonths,
      remainingBalanceMinor: before.remainingBalanceMinor.toString(),
    },
  });
}
