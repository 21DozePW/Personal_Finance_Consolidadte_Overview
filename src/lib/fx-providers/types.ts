import type { FxSource } from "@prisma/client";

/**
 * One observed exchange rate, returned by a provider for a given (base,
 * quote, date). `rate` is "units of quote per 1 base" — for CHF→USD around
 * 1.10, a rate of 1.10 means 1 CHF = 1.10 USD.
 */
export type FxFetchResult = {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  asOfDate: string; // YYYY-MM-DD
};

export type FetchOpts = {
  /** Quote currencies to fetch (base is provider-fixed to CHF in v1). */
  quotes: readonly string[];
  /** Inclusive YYYY-MM-DD date, for historical fetches. */
  date?: string;
  /** Inclusive start/end date for timeseries fetches. */
  startDate?: string;
  endDate?: string;
};

export interface FxProvider {
  readonly id: Exclude<FxSource, "MANUAL">;
  /** Latest available rates (provider decides the date). */
  fetchLatest(opts: { quotes: readonly string[] }): Promise<FxFetchResult[]>;
  /** Exact-date historical rates. */
  fetchHistorical(opts: { quotes: readonly string[]; date: string }): Promise<FxFetchResult[]>;
  /** Date-range historical rates for backfill. */
  fetchTimeseries(opts: {
    quotes: readonly string[];
    startDate: string;
    endDate: string;
  }): Promise<FxFetchResult[]>;
}

export class FxProviderError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
  ) {
    super(message);
    this.name = "FxProviderError";
  }
}

export type FetcherFn = typeof fetch;
