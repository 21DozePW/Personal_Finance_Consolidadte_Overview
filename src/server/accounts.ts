/**
 * Accounts CRUD. Sensitive fields (`lastFour`, `notes`) are encrypted at rest
 * with AES-256-GCM via `src/lib/encryption.ts`. Audit logs never include
 * decrypted values — only structural metadata.
 *
 * Guard role at the call site: Admin for create/update/delete, any
 * authenticated user for read.
 */

import "server-only";
import type { Account } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { decryptField, encryptField } from "@/lib/encryption";
import { isAssetKind } from "@/lib/account-kinds";
import { createAccountSchema, updateAccountSchema } from "@/schemas/account";

export class AccountError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "HAS_HISTORY" | "INSTITUTION_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export type AccountWithDecrypted = Account & {
  lastFour: string | null;
  notes: string | null;
  isAsset: boolean;
};

function decorate(account: Account): AccountWithDecrypted {
  return {
    ...account,
    lastFour: decryptField(account.lastFourEncrypted),
    notes: decryptField(account.notesEncrypted),
    isAsset: isAssetKind(account.accountKind),
  };
}

export async function listAccounts(opts: { includeInactive?: boolean } = {}) {
  const accounts = await prisma.account.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { alias: "asc" }],
    include: {
      institution: { select: { id: true, name: true, type: true } },
      balances: {
        orderBy: { asOfDate: "desc" },
        take: 1,
        select: { balanceMinor: true, asOfDate: true, source: true },
      },
    },
  });
  return accounts.map((a) => ({
    ...decorate(a),
    institution: a.institution,
    latestBalance: a.balances[0] ?? null,
  }));
}

export async function getAccount(id: string) {
  const account = await prisma.account.findUnique({
    where: { id },
    include: { institution: true },
  });
  if (!account) return null;
  return { ...decorate(account), institution: account.institution };
}

export async function createAccount(actorUserId: string, raw: unknown) {
  const parsed = createAccountSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AccountError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const input = parsed.data;

  const institution = await prisma.institution.findUnique({
    where: { id: input.institutionId },
    select: { id: true },
  });
  if (!institution) {
    throw new AccountError("INSTITUTION_NOT_FOUND", "Pick a valid institution.");
  }

  const created = await prisma.account.create({
    data: {
      institutionId: input.institutionId,
      alias: input.alias,
      accountKind: input.accountKind,
      currency: input.currency,
      lastFourEncrypted: encryptField(input.lastFour),
      notesEncrypted: encryptField(input.notes),
      openedAt: input.openedAt,
      displayOrder: input.displayOrder,
    },
  });
  await recordAudit({
    actorUserId,
    action: "ACCOUNT_CREATED",
    entityType: "Account",
    entityId: created.id,
    after: {
      institutionId: created.institutionId,
      alias: created.alias,
      accountKind: created.accountKind,
      currency: created.currency,
      displayOrder: created.displayOrder,
    },
  });
  return decorate(created);
}

export async function updateAccount(actorUserId: string, id: string, raw: unknown) {
  const parsed = updateAccountSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AccountError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const before = await prisma.account.findUnique({ where: { id } });
  if (!before) throw new AccountError("NOT_FOUND", "Account not found.");

  const data: Record<string, unknown> = {};
  const input = parsed.data;
  if (input.institutionId !== undefined) data.institutionId = input.institutionId;
  if (input.alias !== undefined) data.alias = input.alias;
  if (input.accountKind !== undefined) data.accountKind = input.accountKind;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
  if (input.openedAt !== undefined) data.openedAt = input.openedAt;
  if (input.closedAt !== undefined) data.closedAt = input.closedAt;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  // Encrypted fields: only touch if the caller sent them (incl. explicit null
  // to clear).
  if ("lastFour" in input && input.lastFour !== undefined) {
    data.lastFourEncrypted = encryptField(input.lastFour);
  }
  if ("notes" in input && input.notes !== undefined) {
    data.notesEncrypted = encryptField(input.notes);
  }

  const updated = await prisma.account.update({ where: { id }, data });
  await recordAudit({
    actorUserId,
    action: "ACCOUNT_UPDATED",
    entityType: "Account",
    entityId: id,
    // Audit only non-secret metadata.
    before: {
      alias: before.alias,
      accountKind: before.accountKind,
      currency: before.currency,
      institutionId: before.institutionId,
      isActive: before.isActive,
      displayOrder: before.displayOrder,
    },
    after: {
      alias: updated.alias,
      accountKind: updated.accountKind,
      currency: updated.currency,
      institutionId: updated.institutionId,
      isActive: updated.isActive,
      displayOrder: updated.displayOrder,
      // Don't include lastFour/notes; record whether they were changed.
      lastFourChanged: "lastFour" in input && input.lastFour !== undefined,
      notesChanged: "notes" in input && input.notes !== undefined,
    },
  });
  return decorate(updated);
}

export async function deleteAccount(actorUserId: string, id: string) {
  const before = await prisma.account.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true, balances: true } } },
  });
  if (!before) throw new AccountError("NOT_FOUND", "Account not found.");
  if (before._count.transactions > 0 || before._count.balances > 0) {
    throw new AccountError(
      "HAS_HISTORY",
      "Cannot delete an account with balance or transaction history. Deactivate it instead.",
    );
  }
  await prisma.account.delete({ where: { id } });
  await recordAudit({
    actorUserId,
    action: "ACCOUNT_DELETED",
    entityType: "Account",
    entityId: id,
    before: { alias: before.alias, accountKind: before.accountKind, currency: before.currency },
  });
}
