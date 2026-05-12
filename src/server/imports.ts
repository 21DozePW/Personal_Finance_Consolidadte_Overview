/**
 * Import lifecycle.
 *
 *   createImportBatch  — parses the file, stores the parsed rows + dedup
 *                        decisions in ImportBatch.previewData, status=PENDING.
 *   commitImportBatch  — reads previewData, creates Transaction rows, status
 *                        becomes COMMITTED. fxRateToBase is captured per row
 *                        using getRateForDate(occurredOn).
 *   revertImportBatch  — deletes the Transaction rows for a COMMITTED batch,
 *                        marks status REVERTED.
 *
 * Any authenticated household member may import.
 */

import "server-only";
import type { Prisma } from "@prisma/client";
import { ImportStatus, TransactionSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { encryptField } from "@/lib/encryption";
import { parseAmountToMinor, ParseAmountError } from "@/lib/money";
import { getRateForDate } from "@/server/fx";
import {
  buildCategorySuggester,
  fileHash,
  ImportParseError,
  parseCsvFile,
  parseOfx,
  rowDedupKey,
  type ColumnMap,
  type ParsedRow,
} from "@/lib/import";
import { startImportSchema, type StartImportInput } from "@/schemas/import";

export class ImportError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "PARSE_FAILED"
      | "ACCOUNT_NOT_FOUND"
      | "PROFILE_NOT_FOUND"
      | "NOT_FOUND"
      | "BAD_STATE",
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export type PreviewRow = ParsedRow & {
  amountMinor: string; // bigint as string for JSON
  dedupKey: string;
  isDuplicate: boolean;
  suggestedCategoryId: string | null;
};

type PreviewPayload = {
  format: "CSV" | "OFX";
  profileId: string | null;
  rows: PreviewRow[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Create + parse
// ---------------------------------------------------------------------------

export async function createImportBatch(
  actorUserId: string,
  rawInput: unknown,
  fileContent: string,
) {
  const parsed = startImportSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ImportError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const input = parsed.data;

  const account = await prisma.account.findUnique({
    where: { id: input.accountId },
    select: { id: true, currency: true, alias: true },
  });
  if (!account) throw new ImportError("ACCOUNT_NOT_FOUND", "Account not found.");

  let parsedRows: ParsedRow[] = [];
  const warnings: string[] = [];

  if (input.format === "CSV") {
    const { columnMap, dateFormat, decimalSeparator } = await resolveCsvOptions(input);
    try {
      const result = parseCsvFile(fileContent, { columnMap, dateFormat, decimalSeparator });
      parsedRows = result.rows;
      warnings.push(...result.warnings);
    } catch (err) {
      if (err instanceof ImportParseError) {
        throw new ImportError("PARSE_FAILED", err.message);
      }
      throw err;
    }
  } else {
    try {
      const result = parseOfx(fileContent);
      parsedRows = result.rows;
      warnings.push(...result.warnings);
    } catch (err) {
      if (err instanceof ImportParseError) {
        throw new ImportError("PARSE_FAILED", err.message);
      }
      throw err;
    }
  }

  // Convert raw rows to minor units + compute dedup keys.
  const rowsWithMinor: Array<ParsedRow & { amountMinor: bigint }> = [];
  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i]!;
    try {
      rowsWithMinor.push({ ...r, amountMinor: parseAmountToMinor(r.amount, account.currency) });
    } catch (err) {
      if (err instanceof ParseAmountError) {
        warnings.push(`Row ${i + 1}: ${err.message} (amount="${r.amount}")`);
      } else {
        throw err;
      }
    }
  }

  // Dedup against existing transactions on the same account.
  const existingKeys = await loadExistingDedupKeys(account.id);
  const seenInBatch = new Set<string>();
  const previewRows: PreviewRow[] = rowsWithMinor.map((r) => {
    const merchantNormalized = r.merchant
      ? r.merchant.trim().toLowerCase().slice(0, 120)
      : r.description
        ? r.description.trim().toLowerCase().slice(0, 120)
        : null;
    const dedupKey = rowDedupKey({
      accountId: account.id,
      externalId: r.externalId,
      occurredOn: r.occurredOn,
      amountMinor: r.amountMinor,
      merchantNormalized,
    });
    const isDuplicate = existingKeys.has(dedupKey) || seenInBatch.has(dedupKey);
    seenInBatch.add(dedupKey);
    return {
      ...r,
      amountMinor: r.amountMinor.toString(),
      dedupKey,
      isDuplicate,
      suggestedCategoryId: null,
    };
  });

  // Suggest categories from historical transactions on this account.
  const history = await prisma.transaction.findMany({
    where: { accountId: account.id, merchantNormalized: { not: null }, categoryId: { not: null } },
    select: { merchantNormalized: true, categoryId: true, occurredOn: true },
    orderBy: { occurredOn: "desc" },
    take: 2000,
  });
  const suggester = buildCategorySuggester(history);
  for (const r of previewRows) {
    r.suggestedCategoryId = suggester(r.merchant ?? r.description);
  }

  const skipped = previewRows.filter((r) => r.isDuplicate).length;
  const willImport = previewRows.length - skipped;

  const payload: PreviewPayload = {
    format: input.format,
    profileId: input.profileId ?? null,
    rows: previewRows,
    warnings,
  };

  const batch = await prisma.importBatch.create({
    data: {
      accountId: account.id,
      fileName: input.fileName,
      fileHash: fileHash(fileContent),
      rowCount: previewRows.length,
      importedCount: willImport,
      skippedCount: skipped,
      status: ImportStatus.PENDING,
      previewData: payload as unknown as Prisma.InputJsonValue,
      createdByUserId: actorUserId,
    },
  });

  await recordAudit({
    actorUserId,
    action: "IMPORT_BATCH_CREATED",
    entityType: "ImportBatch",
    entityId: batch.id,
    after: {
      accountId: account.id,
      fileName: batch.fileName,
      rowCount: batch.rowCount,
      willImport,
      skipped,
      format: input.format,
    },
  });
  return batch;
}

async function resolveCsvOptions(input: StartImportInput): Promise<{
  columnMap: ColumnMap;
  dateFormat: string;
  decimalSeparator: "." | ",";
}> {
  if (input.profileId) {
    const profile = await prisma.importProfile.findUnique({ where: { id: input.profileId } });
    if (!profile) throw new ImportError("PROFILE_NOT_FOUND", "Import profile not found.");
    return {
      columnMap: profile.columnMap as unknown as ColumnMap,
      dateFormat: profile.dateFormat,
      decimalSeparator: profile.decimalSeparator as "." | ",",
    };
  }
  if (!input.columnMap || !input.dateFormat || !input.decimalSeparator) {
    throw new ImportError(
      "INVALID_INPUT",
      "Either a saved profile or an inline columnMap + dateFormat + decimalSeparator must be supplied.",
    );
  }
  return {
    columnMap: input.columnMap as ColumnMap,
    dateFormat: input.dateFormat,
    decimalSeparator: input.decimalSeparator,
  };
}

async function loadExistingDedupKeys(accountId: string): Promise<Set<string>> {
  const rows = await prisma.transaction.findMany({
    where: { accountId },
    select: {
      externalId: true,
      occurredOn: true,
      amountMinor: true,
      merchantNormalized: true,
    },
    take: 50_000,
  });
  const set = new Set<string>();
  for (const r of rows) {
    if (r.externalId) {
      set.add(`ext:${accountId}:${r.externalId}`);
    }
    set.add(
      rowDedupKey({
        accountId,
        externalId: null,
        occurredOn: r.occurredOn.toISOString().slice(0, 10),
        amountMinor: r.amountMinor,
        merchantNormalized: r.merchantNormalized,
      }),
    );
  }
  return set;
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export async function commitImportBatch(actorUserId: string, batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new ImportError("NOT_FOUND", "Import batch not found.");
  if (batch.status !== ImportStatus.PENDING) {
    throw new ImportError("BAD_STATE", `Batch is ${batch.status.toLowerCase()}, not pending.`);
  }
  const payload = batch.previewData as unknown as PreviewPayload | null;
  if (!payload?.rows) throw new ImportError("BAD_STATE", "Batch has no preview data.");

  const account = await prisma.account.findUnique({
    where: { id: batch.accountId },
    select: { id: true, currency: true },
  });
  if (!account) throw new ImportError("ACCOUNT_NOT_FOUND", "Account no longer exists.");

  const toCreate = payload.rows.filter((r) => !r.isDuplicate);
  let imported = 0;

  for (const r of toCreate) {
    const occurredOn = new Date(`${r.occurredOn}T00:00:00Z`);
    const fxRow = await getRateForDate(account.currency, occurredOn);
    const fxRate = fxRow ? fxRow.rate : null;
    const minor = BigInt(r.amountMinor);
    const merchantNormalized = r.merchant
      ? r.merchant.trim().toLowerCase().slice(0, 120) || null
      : r.description
        ? r.description.trim().toLowerCase().slice(0, 120) || null
        : null;
    await prisma.transaction.create({
      data: {
        accountId: account.id,
        occurredOn,
        amountMinor: minor,
        currency: account.currency,
        fxRateToBase: fxRate,
        descriptionEncrypted: encryptField(r.description),
        merchantNormalized,
        categoryId: r.suggestedCategoryId ?? null,
        isTransfer: false,
        source: TransactionSource.CSV_IMPORT,
        externalId: r.externalId,
        importBatchId: batch.id,
        createdByUserId: actorUserId,
      },
    });
    imported += 1;
  }

  const updated = await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: ImportStatus.COMMITTED,
      importedCount: imported,
      skippedCount: batch.rowCount - imported,
    },
  });
  await recordAudit({
    actorUserId,
    action: "IMPORT_BATCH_COMMITTED",
    entityType: "ImportBatch",
    entityId: batch.id,
    after: { imported, skipped: batch.rowCount - imported },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Revert + listing
// ---------------------------------------------------------------------------

export async function revertImportBatch(actorUserId: string, batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new ImportError("NOT_FOUND", "Import batch not found.");
  if (batch.status !== ImportStatus.COMMITTED) {
    throw new ImportError(
      "BAD_STATE",
      `Only committed batches can be reverted (current: ${batch.status.toLowerCase()}).`,
    );
  }
  const result = await prisma.transaction.deleteMany({ where: { importBatchId: batch.id } });
  const updated = await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: ImportStatus.REVERTED },
  });
  await recordAudit({
    actorUserId,
    action: "IMPORT_BATCH_REVERTED",
    entityType: "ImportBatch",
    entityId: batch.id,
    after: { deletedTransactions: result.count },
  });
  return updated;
}

export async function listImportBatches() {
  return prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { account: { select: { id: true, alias: true, currency: true } } },
  });
}

export async function getImportBatch(id: string) {
  return prisma.importBatch.findUnique({
    where: { id },
    include: { account: { select: { id: true, alias: true, currency: true } } },
  });
}
