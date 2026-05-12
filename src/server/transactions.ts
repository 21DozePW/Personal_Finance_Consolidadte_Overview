/**
 * Transactions: create / edit / delete / list. All household members may
 * write — guard role at the call site.
 *
 * Every write captures `fxRateToBase` using the FX rate available for
 * `occurredOn` (carry-forward when there's no exact-date row). Stored
 * captured rates are never recomputed on read, per spec §7.5.
 *
 * Three creation flavours:
 *   - single: one row, one category, sign derived from `kind` (EXPENSE / INCOME)
 *   - transfer: two linked rows in possibly different currencies
 *   - split: N sibling rows sharing a `splitGroupId`
 */

import "server-only";
import type { Prisma, Transaction, TransactionSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { decryptField, encryptField } from "@/lib/encryption";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";
import { getRateForDate } from "@/server/fx";
import {
  createSingleTransactionSchema,
  createSplitSchema,
  createTransferSchema,
  listFiltersSchema,
  updateTransactionSchema,
  type TxnKind,
} from "@/schemas/transaction";

export class TransactionError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "ACCOUNT_NOT_FOUND"
      | "CATEGORY_NOT_FOUND"
      | "SPLIT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "TransactionError";
  }
}

type DecryptedTransaction = Transaction & {
  description: string | null;
};

function decorate(row: Transaction): DecryptedTransaction {
  return { ...row, description: decryptField(row.descriptionEncrypted) };
}

function dateOnly(input: string): Date {
  return new Date(`${input}T00:00:00Z`);
}

function signedAmount(kind: TxnKind, minor: bigint): bigint {
  return kind === "EXPENSE" ? -(minor < 0n ? -minor : minor) : minor < 0n ? -minor : minor;
}

function normalizeMerchant(description: string | null, merchant: string | null): string | null {
  const candidate = merchant ?? description;
  if (!candidate) return null;
  return candidate.trim().toLowerCase().slice(0, 120) || null;
}

async function loadAccount(id: string) {
  const acc = await prisma.account.findUnique({
    where: { id },
    select: { id: true, currency: true, isActive: true },
  });
  if (!acc) throw new TransactionError("ACCOUNT_NOT_FOUND", "Account not found.");
  return acc;
}

async function captureRate(currency: string, occurredOn: Date): Promise<Prisma.Decimal | null> {
  const row = await getRateForDate(currency, occurredOn);
  return row ? row.rate : null;
}

async function ensureCategory(id: string | null): Promise<void> {
  if (!id) return;
  const cat = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!cat) throw new TransactionError("CATEGORY_NOT_FOUND", "Category not found.");
}

// ---------------------------------------------------------------------------
// Create: single
// ---------------------------------------------------------------------------

export async function createSingleTransaction(
  actorUserId: string,
  raw: unknown,
  opts: { source?: TransactionSource } = {},
): Promise<DecryptedTransaction> {
  const parsed = createSingleTransactionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TransactionError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  const input = parsed.data;
  const account = await loadAccount(input.accountId);
  await ensureCategory(input.categoryId);

  let abs: bigint;
  try {
    abs = parseAmountToMinor(input.amount, account.currency);
  } catch (err) {
    if (err instanceof ParseAmountError) {
      throw new TransactionError("INVALID_INPUT", err.message);
    }
    throw err;
  }
  const occurredOn = dateOnly(input.occurredOn);
  const fxRate = await captureRate(account.currency, occurredOn);

  const created = await prisma.transaction.create({
    data: {
      accountId: account.id,
      occurredOn,
      postedOn: input.postedOn ? dateOnly(input.postedOn) : null,
      amountMinor: signedAmount(input.kind, abs),
      currency: account.currency,
      fxRateToBase: fxRate,
      descriptionEncrypted: encryptField(input.description),
      merchantNormalized: normalizeMerchant(input.description, input.merchant),
      categoryId: input.categoryId,
      isTransfer: false,
      source: opts.source ?? "MANUAL",
      createdByUserId: actorUserId,
    },
  });
  await recordAudit({
    actorUserId,
    action: "TRANSACTION_CREATED",
    entityType: "Transaction",
    entityId: created.id,
    after: {
      accountId: created.accountId,
      occurredOn: input.occurredOn,
      amountMinor: created.amountMinor.toString(),
      currency: created.currency,
      categoryId: created.categoryId,
      isTransfer: false,
    },
  });
  return decorate(created);
}

// ---------------------------------------------------------------------------
// Create: transfer (linked pair; cross-currency allowed)
// ---------------------------------------------------------------------------

export async function createTransfer(
  actorUserId: string,
  raw: unknown,
): Promise<{ from: DecryptedTransaction; to: DecryptedTransaction }> {
  const parsed = createTransferSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TransactionError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  const input = parsed.data;
  const [fromAcc, toAcc] = await Promise.all([
    loadAccount(input.fromAccountId),
    loadAccount(input.toAccountId),
  ]);

  let fromAbs: bigint;
  let toAbs: bigint;
  try {
    fromAbs = parseAmountToMinor(input.fromAmount, fromAcc.currency);
    toAbs = parseAmountToMinor(input.toAmount, toAcc.currency);
  } catch (err) {
    if (err instanceof ParseAmountError) {
      throw new TransactionError("INVALID_INPUT", err.message);
    }
    throw err;
  }
  if (fromAbs <= 0n || toAbs <= 0n) {
    throw new TransactionError("INVALID_INPUT", "Transfer amounts must be positive.");
  }

  const occurredOn = dateOnly(input.occurredOn);
  const [fromFx, toFx] = await Promise.all([
    captureRate(fromAcc.currency, occurredOn),
    captureRate(toAcc.currency, occurredOn),
  ]);

  const encDescription = encryptField(input.description);

  const result = await prisma.$transaction(async (tx) => {
    const out = await tx.transaction.create({
      data: {
        accountId: fromAcc.id,
        occurredOn,
        postedOn: input.postedOn ? dateOnly(input.postedOn) : null,
        amountMinor: -fromAbs,
        currency: fromAcc.currency,
        fxRateToBase: fromFx,
        descriptionEncrypted: encDescription,
        merchantNormalized: normalizeMerchant(input.description, null),
        isTransfer: true,
        source: "MANUAL",
        createdByUserId: actorUserId,
      },
    });
    const inn = await tx.transaction.create({
      data: {
        accountId: toAcc.id,
        occurredOn,
        postedOn: input.postedOn ? dateOnly(input.postedOn) : null,
        amountMinor: toAbs,
        currency: toAcc.currency,
        fxRateToBase: toFx,
        descriptionEncrypted: encDescription,
        merchantNormalized: normalizeMerchant(input.description, null),
        isTransfer: true,
        transferPairId: out.id,
        source: "MANUAL",
        createdByUserId: actorUserId,
      },
    });
    // Link out → in so both rows reference each other.
    const linkedOut = await tx.transaction.update({
      where: { id: out.id },
      data: { transferPairId: inn.id },
    });
    return { out: linkedOut, inn };
  });

  await recordAudit({
    actorUserId,
    action: "TRANSFER_CREATED",
    entityType: "Transaction",
    entityId: result.out.id,
    after: {
      fromAccountId: fromAcc.id,
      toAccountId: toAcc.id,
      occurredOn: input.occurredOn,
      fromAmountMinor: result.out.amountMinor.toString(),
      toAmountMinor: result.inn.amountMinor.toString(),
      fromCurrency: fromAcc.currency,
      toCurrency: toAcc.currency,
      pairId: result.inn.id,
    },
  });
  return { from: decorate(result.out), to: decorate(result.inn) };
}

// ---------------------------------------------------------------------------
// Create: split (multiple rows, shared splitGroupId)
// ---------------------------------------------------------------------------

export async function createSplitTransaction(
  actorUserId: string,
  raw: unknown,
): Promise<DecryptedTransaction[]> {
  const parsed = createSplitSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TransactionError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  const input = parsed.data;
  const account = await loadAccount(input.accountId);
  for (const line of input.lines) {
    await ensureCategory(line.categoryId);
  }

  let absLines: Array<{ minor: bigint; kind: TxnKind; categoryId: string | null }>;
  try {
    absLines = input.lines.map((l) => ({
      minor: parseAmountToMinor(l.amount, account.currency),
      kind: l.kind,
      categoryId: l.categoryId,
    }));
  } catch (err) {
    if (err instanceof ParseAmountError) {
      throw new TransactionError("INVALID_INPUT", err.message);
    }
    throw err;
  }

  const occurredOn = dateOnly(input.occurredOn);
  const fxRate = await captureRate(account.currency, occurredOn);
  const encDescription = encryptField(input.description);
  const normalizedMerchant = normalizeMerchant(input.description, input.merchant);

  const created = await prisma.$transaction(async (tx) => {
    const firstId = (
      await tx.transaction.create({
        data: {
          accountId: account.id,
          occurredOn,
          postedOn: input.postedOn ? dateOnly(input.postedOn) : null,
          amountMinor: signedAmount(absLines[0]!.kind, absLines[0]!.minor),
          currency: account.currency,
          fxRateToBase: fxRate,
          descriptionEncrypted: encDescription,
          merchantNormalized: normalizedMerchant,
          categoryId: absLines[0]!.categoryId,
          isTransfer: false,
          source: "MANUAL",
          createdByUserId: actorUserId,
        },
      })
    ).id;

    // Tag the first row's splitGroupId with its own id so all siblings share it.
    await tx.transaction.update({ where: { id: firstId }, data: { splitGroupId: firstId } });

    const rest = [] as Transaction[];
    for (const line of absLines.slice(1)) {
      const row = await tx.transaction.create({
        data: {
          accountId: account.id,
          occurredOn,
          postedOn: input.postedOn ? dateOnly(input.postedOn) : null,
          amountMinor: signedAmount(line.kind, line.minor),
          currency: account.currency,
          fxRateToBase: fxRate,
          descriptionEncrypted: encDescription,
          merchantNormalized: normalizedMerchant,
          categoryId: line.categoryId,
          isTransfer: false,
          splitGroupId: firstId,
          source: "MANUAL",
          createdByUserId: actorUserId,
        },
      });
      rest.push(row);
    }
    const first = await tx.transaction.findUniqueOrThrow({ where: { id: firstId } });
    return [first, ...rest];
  });

  await recordAudit({
    actorUserId,
    action: "SPLIT_CREATED",
    entityType: "Transaction",
    entityId: created[0]!.id,
    after: {
      accountId: account.id,
      occurredOn: input.occurredOn,
      lines: created.map((r) => ({
        id: r.id,
        categoryId: r.categoryId,
        amountMinor: r.amountMinor.toString(),
      })),
    },
  });

  return created.map(decorate);
}

// ---------------------------------------------------------------------------
// Update / delete
// ---------------------------------------------------------------------------

export async function updateTransaction(
  actorUserId: string,
  id: string,
  raw: unknown,
): Promise<DecryptedTransaction> {
  const parsed = updateTransactionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TransactionError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  const before = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      accountId: true,
      currency: true,
      occurredOn: true,
      categoryId: true,
      isTransfer: true,
      amountMinor: true,
    },
  });
  if (!before) throw new TransactionError("NOT_FOUND", "Transaction not found.");
  if (before.isTransfer) {
    // Transfers should be deleted and re-created rather than edited in place
    // for v1; we still allow tweaking category / description / dates but not
    // amount or kind.
    if (parsed.data.amount || parsed.data.kind) {
      throw new TransactionError(
        "INVALID_INPUT",
        "Edit transfer amount or direction by deleting and re-creating.",
      );
    }
  }
  await ensureCategory(parsed.data.categoryId ?? null);

  const data: Record<string, unknown> = {};

  if (parsed.data.occurredOn) {
    const occurredOn = dateOnly(parsed.data.occurredOn);
    data.occurredOn = occurredOn;
    // Re-capture FX for the new date so historical views stay coherent.
    data.fxRateToBase = await captureRate(before.currency, occurredOn);
  }
  if (parsed.data.postedOn !== undefined) {
    data.postedOn = parsed.data.postedOn ? dateOnly(parsed.data.postedOn) : null;
  }
  if (parsed.data.amount && parsed.data.kind && !before.isTransfer) {
    let abs: bigint;
    try {
      abs = parseAmountToMinor(parsed.data.amount, before.currency);
    } catch (err) {
      if (err instanceof ParseAmountError) {
        throw new TransactionError("INVALID_INPUT", err.message);
      }
      throw err;
    }
    data.amountMinor = signedAmount(parsed.data.kind, abs);
  } else if (parsed.data.amount || parsed.data.kind) {
    throw new TransactionError("INVALID_INPUT", "When changing amount, send both amount and kind.");
  }
  if (parsed.data.categoryId !== undefined) data.categoryId = parsed.data.categoryId;
  if (parsed.data.description !== undefined) {
    data.descriptionEncrypted = encryptField(parsed.data.description);
  }
  if (parsed.data.merchant !== undefined) {
    data.merchantNormalized = normalizeMerchant(
      parsed.data.description ?? null,
      parsed.data.merchant,
    );
  }

  const updated = await prisma.transaction.update({ where: { id }, data });
  await recordAudit({
    actorUserId,
    action: "TRANSACTION_UPDATED",
    entityType: "Transaction",
    entityId: id,
    before: {
      accountId: before.accountId,
      occurredOn: before.occurredOn.toISOString().slice(0, 10),
      amountMinor: before.amountMinor.toString(),
      categoryId: before.categoryId,
    },
    after: {
      occurredOn: updated.occurredOn.toISOString().slice(0, 10),
      amountMinor: updated.amountMinor.toString(),
      categoryId: updated.categoryId,
      descriptionChanged: parsed.data.description !== undefined,
    },
  });
  return decorate(updated);
}

export async function deleteTransaction(actorUserId: string, id: string): Promise<void> {
  const before = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      accountId: true,
      isTransfer: true,
      transferPairId: true,
      splitGroupId: true,
      amountMinor: true,
      currency: true,
      occurredOn: true,
    },
  });
  if (!before) throw new TransactionError("NOT_FOUND", "Transaction not found.");

  // Transfers: drop both legs together.
  if (before.isTransfer && before.transferPairId) {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({
        where: { OR: [{ id: before.id }, { id: before.transferPairId! }] },
      });
    });
  } else if (before.splitGroupId) {
    // Splits: drop the whole group atomically so we don't leave orphans.
    await prisma.transaction.deleteMany({ where: { splitGroupId: before.splitGroupId } });
  } else {
    await prisma.transaction.delete({ where: { id } });
  }

  await recordAudit({
    actorUserId,
    action: "TRANSACTION_DELETED",
    entityType: "Transaction",
    entityId: id,
    before: {
      accountId: before.accountId,
      occurredOn: before.occurredOn.toISOString().slice(0, 10),
      amountMinor: before.amountMinor.toString(),
      currency: before.currency,
      isTransfer: before.isTransfer,
      splitGroupId: before.splitGroupId,
    },
  });
}

// ---------------------------------------------------------------------------
// List / get
// ---------------------------------------------------------------------------

export async function getTransaction(id: string) {
  const row = await prisma.transaction.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, alias: true, currency: true } },
      category: { select: { id: true, name: true, kind: true } },
      transferPair: {
        select: {
          id: true,
          accountId: true,
          amountMinor: true,
          currency: true,
          account: { select: { alias: true } },
        },
      },
    },
  });
  if (!row) return null;
  return { ...row, description: decryptField(row.descriptionEncrypted) };
}

export async function listTransactions(raw: unknown) {
  const parsed = listFiltersSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new TransactionError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid filter.",
    );
  }
  const f = parsed.data;
  const where: Prisma.TransactionWhereInput = {};
  if (f.accountId) where.accountId = f.accountId;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.currency) where.currency = f.currency;
  if (f.from || f.to) {
    where.occurredOn = {};
    if (f.from) (where.occurredOn as Prisma.DateTimeFilter).gte = dateOnly(f.from);
    if (f.to) (where.occurredOn as Prisma.DateTimeFilter).lte = dateOnly(f.to);
  }
  if (f.isTransfer) where.isTransfer = f.isTransfer === "true";
  if (f.q) {
    // We only have lowercased merchant available cheaply; description is
    // encrypted at rest. Fall back to a server-side decrypt filter for `q`.
    where.merchantNormalized = { contains: f.q.toLowerCase() };
  }

  const limit = f.limit ?? 50;
  const rows = await prisma.transaction.findMany({
    where,
    take: limit + 1,
    cursor: f.cursor ? { id: f.cursor } : undefined,
    skip: f.cursor ? 1 : 0,
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    include: {
      account: { select: { id: true, alias: true, currency: true } },
      category: { select: { id: true, name: true, kind: true } },
    },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((r) => ({ ...r, description: decryptField(r.descriptionEncrypted) })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
