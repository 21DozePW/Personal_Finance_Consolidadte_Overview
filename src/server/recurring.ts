/**
 * Recurring commitment CRUD. Any household member may create / edit /
 * delete — guard role at the call site (UI defaults to requireSession).
 *
 * Auto-generated LOAN_PAYMENT rows are also stored here but are
 * "managed by loan terms" — editing them directly is allowed (user might
 * tweak the day rule), but a subsequent LoanTerms update will re-sync the
 * row.
 *
 * Audit log never stores decrypted notes; we record metadata only.
 */

import "server-only";
import type { Account, RecurringCommitment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { encryptField, decryptField } from "@/lib/encryption";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";
import { upsertRecurringSchema, updateRecurringSchema } from "@/schemas/recurring";

export class RecurringError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "ACCOUNT_NOT_FOUND" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "RecurringError";
  }
}

export type RecurringWithDecrypted = RecurringCommitment & {
  notes: string | null;
  isManagedByLoanTerms: boolean;
};

function decorate(row: RecurringCommitment): RecurringWithDecrypted {
  return {
    ...row,
    notes: decryptField(row.notesEncrypted),
    isManagedByLoanTerms: row.kind === "LOAN_PAYMENT",
  };
}

function dateOnly(input: string): Date {
  return new Date(`${input}T00:00:00Z`);
}

async function loadAccount(id: string): Promise<Pick<Account, "id" | "currency">> {
  const acc = await prisma.account.findUnique({
    where: { id },
    select: { id: true, currency: true },
  });
  if (!acc) throw new RecurringError("ACCOUNT_NOT_FOUND", "Account not found.");
  return acc;
}

function parseAmount(raw: string, currency: string): bigint {
  try {
    return parseAmountToMinor(raw, currency);
  } catch (err) {
    if (err instanceof ParseAmountError) {
      throw new RecurringError("INVALID_INPUT", err.message);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listRecurring() {
  const rows = await prisma.recurringCommitment.findMany({
    orderBy: [{ nextDueDate: "asc" }, { name: "asc" }],
    include: {
      account: { select: { id: true, alias: true, currency: true } },
      category: { select: { id: true, name: true, kind: true } },
    },
  });
  return rows.map((r) => ({
    ...decorate(r),
    account: r.account,
    category: r.category,
  }));
}

export async function getRecurring(id: string) {
  const row = await prisma.recurringCommitment.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, alias: true, currency: true } },
      category: { select: { id: true, name: true, kind: true } },
    },
  });
  if (!row) return null;
  return { ...decorate(row), account: row.account, category: row.category };
}

/**
 * Returns commitments shaped for the cash-flow projector. Lighter than the
 * full list query above.
 */
export async function listProjectable() {
  const rows = await prisma.recurringCommitment.findMany({
    select: {
      id: true,
      name: true,
      accountId: true,
      amountMinor: true,
      currency: true,
      cadence: true,
      kind: true,
      nextDueDate: true,
      endDate: true,
    },
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createRecurring(
  actorUserId: string,
  raw: unknown,
): Promise<RecurringWithDecrypted> {
  const parsed = upsertRecurringSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RecurringError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const input = parsed.data;
  const acc = await loadAccount(input.accountId);
  const amountMinor = parseAmount(input.amount, acc.currency);

  const created = await prisma.recurringCommitment.create({
    data: {
      name: input.name,
      accountId: acc.id,
      categoryId: input.categoryId,
      amountMinor,
      currency: acc.currency,
      cadence: input.cadence,
      kind: input.kind,
      dayRule: input.dayRule,
      nextDueDate: dateOnly(input.nextDueDate),
      endDate: input.endDate ? dateOnly(input.endDate) : null,
      notesEncrypted: encryptField(input.notes),
    },
  });
  await recordAudit({
    actorUserId,
    action: "RECURRING_CREATED",
    entityType: "RecurringCommitment",
    entityId: created.id,
    after: {
      name: created.name,
      accountId: created.accountId,
      cadence: created.cadence,
      kind: created.kind,
      amountMinor: created.amountMinor.toString(),
      currency: created.currency,
      nextDueDate: input.nextDueDate,
    },
  });
  return decorate(created);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateRecurring(
  actorUserId: string,
  id: string,
  raw: unknown,
): Promise<RecurringWithDecrypted> {
  const parsed = updateRecurringSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RecurringError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const before = await prisma.recurringCommitment.findUnique({ where: { id } });
  if (!before) throw new RecurringError("NOT_FOUND", "Recurring commitment not found.");

  const input = parsed.data;
  const account = input.accountId
    ? await loadAccount(input.accountId)
    : { id: before.accountId, currency: before.currency };

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.accountId !== undefined) data.accountId = account.id;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.amount !== undefined) {
    data.amountMinor = parseAmount(input.amount, account.currency);
    data.currency = account.currency;
  } else if (input.accountId !== undefined && account.currency !== before.currency) {
    // Account changed currency → keep stored value but flag it: easiest is
    // to leave currency as-is. Real change should pass amount too.
    data.currency = account.currency;
  }
  if (input.cadence !== undefined) data.cadence = input.cadence;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.dayRule !== undefined) data.dayRule = input.dayRule;
  if (input.nextDueDate !== undefined) data.nextDueDate = dateOnly(input.nextDueDate);
  if (input.endDate !== undefined) {
    data.endDate = input.endDate ? dateOnly(input.endDate) : null;
  }
  if (input.notes !== undefined) data.notesEncrypted = encryptField(input.notes);

  const updated = await prisma.recurringCommitment.update({ where: { id }, data });
  await recordAudit({
    actorUserId,
    action: "RECURRING_UPDATED",
    entityType: "RecurringCommitment",
    entityId: id,
    before: {
      name: before.name,
      accountId: before.accountId,
      cadence: before.cadence,
      kind: before.kind,
      amountMinor: before.amountMinor.toString(),
      currency: before.currency,
    },
    after: {
      name: updated.name,
      accountId: updated.accountId,
      cadence: updated.cadence,
      kind: updated.kind,
      amountMinor: updated.amountMinor.toString(),
      currency: updated.currency,
      notesChanged: input.notes !== undefined,
    },
  });
  return decorate(updated);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteRecurring(actorUserId: string, id: string): Promise<void> {
  const before = await prisma.recurringCommitment.findUnique({ where: { id } });
  if (!before) throw new RecurringError("NOT_FOUND", "Recurring commitment not found.");
  await prisma.recurringCommitment.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "RECURRING_DELETED",
    entityType: "RecurringCommitment",
    entityId: id,
    before: {
      name: before.name,
      accountId: before.accountId,
      cadence: before.cadence,
      kind: before.kind,
      amountMinor: before.amountMinor.toString(),
      currency: before.currency,
    },
  });
}
