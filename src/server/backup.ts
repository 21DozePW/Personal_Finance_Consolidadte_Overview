/**
 * Builds an encrypted backup snapshot of every domain table. Encrypted
 * columns stay encrypted (still under `FIELD_ENCRYPTION_KEY`); the outer
 * envelope adds a passphrase-derived key on top, so the export is safe to
 * store in a personal Drive / Dropbox / iCloud.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { toJsonSafe } from "@/lib/json";
import { encryptBackup, type BackupEnvelope, type BackupSnapshot } from "@/lib/backup";

async function loadEntities(): Promise<Record<string, unknown[]>> {
  const [
    users,
    allowedEmails,
    institutions,
    accounts,
    balances,
    transactions,
    loanTerms,
    categories,
    budgets,
    budgetLines,
    recurring,
    goals,
    scenarios,
    fxRates,
    fxFetchLogs,
    importBatches,
    importProfiles,
    auditLog,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.allowedEmail.findMany(),
    prisma.institution.findMany(),
    prisma.account.findMany(),
    prisma.accountBalance.findMany(),
    prisma.transaction.findMany(),
    prisma.loanTerms.findMany(),
    prisma.category.findMany(),
    prisma.budget.findMany(),
    prisma.budgetLine.findMany(),
    prisma.recurringCommitment.findMany(),
    prisma.goal.findMany(),
    prisma.forecastScenario.findMany(),
    prisma.fxRate.findMany(),
    prisma.fxRateFetchLog.findMany(),
    prisma.importBatch.findMany(),
    prisma.importProfile.findMany(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50_000 }),
  ]);
  // toJsonSafe normalises bigint + Date for the JSON envelope.
  return {
    User: toJsonSafe(users) as unknown[],
    AllowedEmail: toJsonSafe(allowedEmails) as unknown[],
    Institution: toJsonSafe(institutions) as unknown[],
    Account: toJsonSafe(accounts) as unknown[],
    AccountBalance: toJsonSafe(balances) as unknown[],
    Transaction: toJsonSafe(transactions) as unknown[],
    LoanTerms: toJsonSafe(loanTerms) as unknown[],
    Category: toJsonSafe(categories) as unknown[],
    Budget: toJsonSafe(budgets) as unknown[],
    BudgetLine: toJsonSafe(budgetLines) as unknown[],
    RecurringCommitment: toJsonSafe(recurring) as unknown[],
    Goal: toJsonSafe(goals) as unknown[],
    ForecastScenario: toJsonSafe(scenarios) as unknown[],
    FxRate: toJsonSafe(fxRates) as unknown[],
    FxRateFetchLog: toJsonSafe(fxFetchLogs) as unknown[],
    ImportBatch: toJsonSafe(importBatches) as unknown[],
    ImportProfile: toJsonSafe(importProfiles) as unknown[],
    AuditLog: toJsonSafe(auditLog) as unknown[],
  };
}

export async function buildBackup(
  actorUserId: string,
  passphrase: string,
): Promise<BackupEnvelope> {
  const data = await loadEntities();
  const entityCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) entityCounts[k] = v.length;

  const snapshot: BackupSnapshot = {
    exportedAt: new Date().toISOString(),
    entityCounts,
    data,
  };
  const envelope = encryptBackup(snapshot, passphrase);
  await recordAudit({
    actorUserId,
    action: "BACKUP_EXPORTED",
    entityType: "Backup",
    after: { entityCounts, createdAt: envelope.createdAt },
  });
  return envelope;
}
