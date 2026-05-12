/**
 * FX orchestration. Owns:
 *   - rate selection (latest per quote, historical with carry-forward)
 *   - daily/on-demand fetch with primary → fallback provider chain
 *   - manual overrides (Admin, audit-logged)
 *   - 365-day backfill when a new account currency is first used
 *
 * Conversion math lives in `src/lib/fx.ts` (pure). Provider HTTP code lives
 * in `src/lib/fx-providers/*` and is injected here so tests can stub out
 * fetch.
 */

import "server-only";
import type { FxRate, FxSource, Prisma } from "@prisma/client";
import { FxFetchStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { BASE_CURRENCY } from "@/lib/fx";
import type { FxFetchResult, FxProvider, ProviderChain } from "@/lib/fx-providers";
import { defaultProviderChain, FxProviderError } from "@/lib/fx-providers";

export class FxError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "NO_PROVIDER" | "ALL_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "FxError";
  }
}

let providerChainOverride: ProviderChain | null = null;

/** Test/seam helper: override the provider chain used by orchestration. */
export function __setProviderChainForTests(chain: ProviderChain | null) {
  providerChainOverride = chain;
}

function getChain(): ProviderChain {
  return providerChainOverride ?? defaultProviderChain();
}

function toDateOnly(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new FxError("INVALID_INPUT", `Bad date: ${input}`);
  }
  return new Date(`${input}T00:00:00Z`);
}

function isoDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

async function upsertRate(result: FxFetchResult, source: FxSource): Promise<FxRate> {
  return prisma.fxRate.upsert({
    where: {
      baseCurrency_quoteCurrency_asOfDate: {
        baseCurrency: result.baseCurrency,
        quoteCurrency: result.quoteCurrency,
        asOfDate: toDateOnly(result.asOfDate),
      },
    },
    update: { rate: result.rate.toString(), source, fetchedAt: new Date() },
    create: {
      baseCurrency: result.baseCurrency,
      quoteCurrency: result.quoteCurrency,
      asOfDate: toDateOnly(result.asOfDate),
      rate: result.rate.toString(),
      source,
    },
  });
}

// ---------------------------------------------------------------------------
// Rate selection
// ---------------------------------------------------------------------------

/**
 * Returns the most recent FxRate per requested quote currency, or null if no
 * rate exists yet for that currency. Caller passes already-deduped
 * currencies; CHF→CHF is implicit and never returned.
 */
export async function getLatestRates(quotes: readonly string[]): Promise<Map<string, FxRate>> {
  const filtered = Array.from(new Set(quotes.filter((c) => c !== BASE_CURRENCY)));
  if (filtered.length === 0) return new Map();
  const rows = await prisma.fxRate.findMany({
    where: { baseCurrency: BASE_CURRENCY, quoteCurrency: { in: filtered } },
    orderBy: [{ quoteCurrency: "asc" }, { asOfDate: "desc" }],
    distinct: ["quoteCurrency"],
  });
  return new Map(rows.map((r) => [r.quoteCurrency, r]));
}

/**
 * Returns a (quote → numeric rate) lookup for use with
 * `src/lib/fx.ts:convertToBaseMinor`. Missing rates simply return `null` for
 * that currency.
 */
export async function getLatestRateLookup(
  quotes: readonly string[],
): Promise<(quote: string) => number | null> {
  const rates = await getLatestRates(quotes);
  return (quote) => {
    if (quote === BASE_CURRENCY) return 1;
    const r = rates.get(quote);
    return r ? Number(r.rate) : null;
  };
}

/**
 * Returns the rate to use for `quote` on the given `date`. If no row exists
 * for that exact date, carry-forward (most recent earlier date).
 */
export async function getRateForDate(quote: string, date: string | Date): Promise<FxRate | null> {
  if (quote === BASE_CURRENCY) return null;
  return prisma.fxRate.findFirst({
    where: {
      baseCurrency: BASE_CURRENCY,
      quoteCurrency: quote,
      asOfDate: { lte: toDateOnly(date) },
    },
    orderBy: { asOfDate: "desc" },
  });
}

export async function listRecentRates(quote: string, limit = 30) {
  return prisma.fxRate.findMany({
    where: { baseCurrency: BASE_CURRENCY, quoteCurrency: quote },
    orderBy: { asOfDate: "desc" },
    take: limit,
  });
}

export async function listFetchLog(limit = 20) {
  return prisma.fxRateFetchLog.findMany({
    orderBy: { runAt: "desc" },
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// Active currencies
// ---------------------------------------------------------------------------

/**
 * Currencies the system needs rates for: any active account's currency
 * plus the TRACKED_CURRENCIES allow-list from env. CHF is excluded.
 */
export async function getActiveCurrencies(): Promise<string[]> {
  const accountCurrencies = await prisma.account.findMany({
    where: { isActive: true },
    distinct: ["currency"],
    select: { currency: true },
  });
  const envTracked = (process.env.TRACKED_CURRENCIES ?? "CHF,USD,EUR,BRL")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const set = new Set<string>([
    ...accountCurrencies.map((a) => a.currency.toUpperCase()),
    ...envTracked,
  ]);
  set.delete(BASE_CURRENCY);
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Fetch orchestration
// ---------------------------------------------------------------------------

export type FetchSummary = {
  status: FxFetchStatus;
  fetched: string[];
  missing: string[];
  errorMessage: string | null;
  logId: string;
};

async function tryProvider(
  provider: FxProvider,
  quotes: string[],
): Promise<{ ok: FxFetchResult[]; err: string | null }> {
  try {
    const out = await provider.fetchLatest({ quotes });
    return { ok: out, err: null };
  } catch (err) {
    const msg = err instanceof FxProviderError ? err.message : (err as Error).message;
    return { ok: [], err: `${provider.id}: ${msg}` };
  }
}

/**
 * Daily fetch entry point. Tries primary then fallback for currencies the
 * primary didn't return. Writes everything to `FxRate` and records a single
 * `FxRateFetchLog` row summarizing the run.
 */
export async function fetchAndStoreLatest(opts: { currencies?: string[] }): Promise<FetchSummary> {
  const currencies = (opts.currencies ?? (await getActiveCurrencies())).filter(
    (c) => c !== BASE_CURRENCY,
  );
  if (currencies.length === 0) {
    const log = await prisma.fxRateFetchLog.create({
      data: { status: FxFetchStatus.OK, currenciesFetched: [], errorMessage: null },
    });
    return {
      status: FxFetchStatus.OK,
      fetched: [],
      missing: [],
      errorMessage: null,
      logId: log.id,
    };
  }

  const fetched = new Set<string>();
  const errors: string[] = [];
  const chain = getChain();

  const primary = await tryProvider(chain.primary, currencies);
  for (const r of primary.ok) {
    await upsertRate(r, chain.primary.id);
    fetched.add(r.quoteCurrency);
  }
  if (primary.err) errors.push(primary.err);

  const stillMissing = currencies.filter((c) => !fetched.has(c));
  if (stillMissing.length > 0) {
    const fallback = await tryProvider(chain.fallback, stillMissing);
    for (const r of fallback.ok) {
      await upsertRate(r, chain.fallback.id);
      fetched.add(r.quoteCurrency);
    }
    if (fallback.err) errors.push(fallback.err);
  }

  const missing = currencies.filter((c) => !fetched.has(c));
  const status: FxFetchStatus =
    missing.length === 0
      ? FxFetchStatus.OK
      : fetched.size === 0
        ? FxFetchStatus.FAIL
        : FxFetchStatus.PARTIAL;

  const errorMessage =
    [
      missing.length > 0 ? `Missing: ${missing.join(", ")}` : null,
      errors.length > 0 ? errors.join(" | ") : null,
    ]
      .filter(Boolean)
      .join(" — ") || null;

  const log = await prisma.fxRateFetchLog.create({
    data: {
      status,
      currenciesFetched: Array.from(fetched).sort() as Prisma.InputJsonValue,
      errorMessage,
    },
  });

  return {
    status,
    fetched: Array.from(fetched).sort(),
    missing,
    errorMessage,
    logId: log.id,
  };
}

/**
 * One-time bulk historical fetch when a new account currency appears.
 * Fetches the last `days` days (default 365) and stores any rates the
 * provider returns. Best-effort — failures are logged but not thrown so the
 * account creation flow doesn't break.
 */
export async function backfillCurrency(
  quoteCurrency: string,
  opts: { days?: number } = {},
): Promise<{ inserted: number; error: string | null }> {
  if (quoteCurrency === BASE_CURRENCY) return { inserted: 0, error: null };
  const days = opts.days ?? 365;
  const today = new Date();
  const end = isoDateOf(today);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - days);
  const start = isoDateOf(startDate);

  const chain = getChain();
  const tryOne = async (provider: FxProvider) => {
    try {
      const results = await provider.fetchTimeseries({
        quotes: [quoteCurrency],
        startDate: start,
        endDate: end,
      });
      let n = 0;
      for (const r of results) {
        if (r.quoteCurrency !== quoteCurrency) continue;
        await upsertRate(r, provider.id);
        n += 1;
      }
      return { n, err: null as string | null };
    } catch (err) {
      const msg = err instanceof FxProviderError ? err.message : (err as Error).message;
      return { n: 0, err: `${provider.id}: ${msg}` };
    }
  };

  const p = await tryOne(chain.primary);
  if (p.n > 0) return { inserted: p.n, error: null };
  const f = await tryOne(chain.fallback);
  return {
    inserted: f.n,
    error: f.n > 0 ? null : [p.err, f.err].filter(Boolean).join(" | ") || null,
  };
}

// ---------------------------------------------------------------------------
// Manual override (Admin)
// ---------------------------------------------------------------------------

export async function setManualRate(
  actorUserId: string,
  input: { quoteCurrency: string; rate: number; asOfDate: string },
): Promise<FxRate> {
  if (!input.quoteCurrency || input.quoteCurrency === BASE_CURRENCY) {
    throw new FxError("INVALID_INPUT", "Pick a non-base quote currency.");
  }
  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    throw new FxError("INVALID_INPUT", "Rate must be a positive number.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)) {
    throw new FxError("INVALID_INPUT", "Pick a date.");
  }

  const before = await prisma.fxRate.findUnique({
    where: {
      baseCurrency_quoteCurrency_asOfDate: {
        baseCurrency: BASE_CURRENCY,
        quoteCurrency: input.quoteCurrency,
        asOfDate: toDateOnly(input.asOfDate),
      },
    },
  });

  const result = await upsertRate(
    {
      baseCurrency: BASE_CURRENCY,
      quoteCurrency: input.quoteCurrency,
      rate: input.rate,
      asOfDate: input.asOfDate,
    },
    "MANUAL",
  );

  await recordAudit({
    actorUserId,
    action: "FX_RATE_OVERRIDE",
    entityType: "FxRate",
    entityId: result.id,
    before: before ? { rate: before.rate.toString(), source: before.source } : null,
    after: { rate: result.rate.toString(), source: result.source, asOfDate: input.asOfDate },
  });

  return result;
}
