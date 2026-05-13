/**
 * Dashboard data loader.
 *
 * Gathers everything the home page needs in a single call so the page
 * can stay a server component without N+1 fetching:
 *   - Net worth (CHF), per-bucket assets / liabilities totals
 *   - Cash flow this month
 *   - Top 3 active goals with progress
 *   - Upcoming commitments over the next 30 days
 *   - Alerts: stale balances, FX fetch failures, budget overruns
 */

import "server-only";
import { prisma } from "@/lib/db";
import { isAssetKind } from "@/lib/account-kinds";
import { BASE_CURRENCY, convertToBaseMinor } from "@/lib/fx";
import { getLatestRateLookup } from "@/server/fx";
import { listAccounts } from "@/server/accounts";
import { listGoalsWithProgress } from "@/server/goals";
import { listProjectable } from "@/server/recurring";
import { projectCashFlow } from "@/lib/cash-flow";

const STALE_DAYS = 30;

export type DashboardAlert = {
  level: "info" | "warning" | "error";
  message: string;
};

export type DashboardData = {
  netWorthChfMinor: number;
  assetsChfMinor: number;
  liabilitiesChfMinor: number;
  cashFlow: {
    incomeChfMinor: number;
    expenseChfMinor: number;
    netChfMinor: number;
    monthLabel: string;
  };
  upcoming: Array<{
    commitmentId: string;
    name: string;
    accountAlias: string;
    accountId: string;
    dueDate: Date;
    amountMinor: number;
    currency: string;
    chfMinor: number | null;
    kind: string;
  }>;
  topGoals: Awaited<ReturnType<typeof listGoalsWithProgress>>;
  alerts: DashboardAlert[];
};

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getDashboardData(): Promise<DashboardData> {
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const horizon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [accounts, commitments, goalsAll, fxLog, mostRecentBalances] = await Promise.all([
    listAccounts({ includeInactive: false }),
    listProjectable(),
    listGoalsWithProgress({ includeArchived: false }),
    prisma.fxRateFetchLog.findFirst({ orderBy: { runAt: "desc" } }),
    prisma.accountBalance.findMany({
      orderBy: { asOfDate: "desc" },
      distinct: ["accountId"],
      select: { accountId: true, asOfDate: true },
    }),
  ]);

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const latestBalanceByAccount = new Map(mostRecentBalances.map((r) => [r.accountId, r.asOfDate]));
  const currencies = Array.from(new Set(accounts.map((a) => a.currency)));
  const rateLookup = await getLatestRateLookup(currencies);

  // Net worth
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    const balance = a.latestBalance ? Number(a.latestBalance.balanceMinor) : 0;
    const rate = a.currency === BASE_CURRENCY ? 1 : rateLookup(a.currency);
    const chf = convertToBaseMinor(balance, a.currency, rate);
    if (chf == null) continue;
    const abs = Math.abs(chf);
    if (isAssetKind(a.accountKind)) assets += abs;
    else liabilities += abs;
  }
  const netWorthChfMinor = assets - liabilities;

  // Cash flow over the projection horizon — slice to current month for the
  // top tile, slice to 30 days for upcoming list.
  const cashflow = projectCashFlow(commitments, {
    from: monthStart,
    months: 2,
    rateLookup,
  });
  const currentMonthBucket = cashflow.months.find((m) => m.month === monthKey(monthStart));

  const upcoming = cashflow.occurrences
    .filter((o) => o.dueDate >= today && o.dueDate <= horizon)
    .slice(0, 20)
    .map((o) => {
      const acc = accountMap.get(o.accountId);
      return {
        commitmentId: o.commitmentId,
        name: o.name,
        accountId: o.accountId,
        accountAlias: acc?.alias ?? "—",
        dueDate: o.dueDate,
        amountMinor: o.amountMinor,
        currency: o.currency,
        chfMinor: o.chfMinor,
        kind: o.kind,
      };
    });

  // Top 3 active goals by priority.
  const topGoals = goalsAll
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  // Alerts
  const alerts: DashboardAlert[] = [];
  const staleCutoff = new Date(today.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
  for (const a of accounts) {
    const lastUpdate = latestBalanceByAccount.get(a.id);
    if (!lastUpdate) {
      alerts.push({
        level: "warning",
        message: `${a.alias} has no recorded balance yet.`,
      });
    } else if (lastUpdate < staleCutoff) {
      const days = Math.floor((today.getTime() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000));
      alerts.push({
        level: "info",
        message: `${a.alias} balance hasn't been updated in ${days} days.`,
      });
    }
  }
  for (const a of accounts) {
    if (a.currency === BASE_CURRENCY) continue;
    if (rateLookup(a.currency) == null) {
      alerts.push({
        level: "warning",
        message: `No FX rate available for ${a.currency} — net worth excludes ${a.alias}.`,
      });
    }
  }
  if (fxLog && fxLog.status !== "OK") {
    alerts.push({
      level: fxLog.status === "FAIL" ? "error" : "warning",
      message: `Most recent FX fetch ${fxLog.status.toLowerCase()}${
        fxLog.errorMessage ? `: ${fxLog.errorMessage}` : "."
      }`,
    });
  }

  return {
    netWorthChfMinor,
    assetsChfMinor: assets,
    liabilitiesChfMinor: liabilities,
    cashFlow: {
      incomeChfMinor: currentMonthBucket?.incomeChfMinor ?? 0,
      expenseChfMinor: currentMonthBucket?.expenseChfMinor ?? 0,
      netChfMinor: currentMonthBucket?.netChfMinor ?? 0,
      monthLabel: monthKey(monthStart),
    },
    upcoming,
    topGoals,
    alerts,
  };
}
