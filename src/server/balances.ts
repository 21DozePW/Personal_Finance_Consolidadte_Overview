/**
 * Account balance recording. Any authenticated user may record balances; the
 * row is keyed by (accountId, asOfDate) so updating the same day overwrites.
 *
 * Phase 2 stores `balanceMinor` in the account's native currency. Phase 2.5
 * adds `fxRateToBase` to every row so historical net-worth views work.
 */

import "server-only";
import type { BalanceSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { recordBalanceSchema } from "@/schemas/balance";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";

export class BalanceError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "ACCOUNT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "BalanceError";
  }
}

export async function listBalances(accountId: string, opts: { limit?: number } = {}) {
  return prisma.accountBalance.findMany({
    where: { accountId },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    take: opts.limit ?? 60,
  });
}

export async function recordBalance(actorUserId: string, accountId: string, raw: unknown) {
  const parsed = recordBalanceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BalanceError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, currency: true, isActive: true },
  });
  if (!account) throw new BalanceError("ACCOUNT_NOT_FOUND", "Account not found.");

  let balanceMinor: bigint;
  try {
    balanceMinor = parseAmountToMinor(parsed.data.amount, account.currency);
  } catch (err) {
    if (err instanceof ParseAmountError) {
      throw new BalanceError("INVALID_INPUT", err.message);
    }
    throw err;
  }

  const asOfDate = new Date(`${parsed.data.asOfDate}T00:00:00Z`);
  const source = parsed.data.source as BalanceSource;

  const result = await prisma.accountBalance.upsert({
    where: { accountId_asOfDate: { accountId, asOfDate } },
    update: { balanceMinor, source, createdByUserId: actorUserId },
    create: {
      accountId,
      asOfDate,
      balanceMinor,
      source,
      createdByUserId: actorUserId,
    },
  });

  await recordAudit({
    actorUserId,
    action: "BALANCE_RECORDED",
    entityType: "AccountBalance",
    entityId: result.id,
    after: {
      accountId,
      asOfDate: parsed.data.asOfDate,
      currency: account.currency,
      source,
      // Audit log keeps balanceMinor as a string — JSON cannot hold bigint.
      balanceMinor: balanceMinor.toString(),
    },
  });
  return result;
}
