/**
 * Frankfurter provider — ECB reference rates, free, no API key, no rate
 * limits (within reason). Used as the fallback for EUR + USD when the
 * primary provider fails. BRL is not reliably available from ECB feeds, so
 * we only attempt currencies on a known allow-list.
 *
 * Docs: https://www.frankfurter.app (mirrors api.frankfurter.dev).
 *
 * Response shape for /latest, /{date}, /{start}..{end}:
 *   { base: "CHF", date: "YYYY-MM-DD", rates: { USD: 1.10, EUR: 1.05 } }
 *   range endpoint: { start_date, end_date, base, rates: { "YYYY-MM-DD": { USD, EUR } } }
 */

import type { FxFetchResult, FxProvider, FetcherFn } from "./types";
import { FxProviderError } from "./types";

const BASE_URL = "https://api.frankfurter.dev/v1";
const TIMEOUT_MS = 15_000;

/**
 * ECB-quoted currencies that Frankfurter exposes. List is intentionally
 * conservative — if the API later supports more, we widen this set.
 */
const FRANKFURTER_SUPPORTED = new Set([
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "RON",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "USD",
  "ZAR",
]);

type LatestResponse = {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
};

type RangeResponse = {
  base?: string;
  rates?: Record<string, Record<string, number>>;
};

export class FrankfurterProvider implements FxProvider {
  readonly id = "FRANKFURTER" as const;

  constructor(
    private readonly opts: { base?: string; fetcher?: FetcherFn; timeoutMs?: number } = {},
  ) {}

  private get fetcher(): FetcherFn {
    return this.opts.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private get base(): string {
    return this.opts.base ?? "CHF";
  }

  private filterSupported(quotes: readonly string[]): string[] {
    return quotes.filter((q) => FRANKFURTER_SUPPORTED.has(q.toUpperCase()) && q !== this.base);
  }

  private async getJson<T>(url: URL): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? TIMEOUT_MS);
    try {
      const res = await this.fetcher(url.toString(), { signal: controller.signal });
      if (!res.ok) {
        throw new FxProviderError(this.id, `HTTP ${res.status} from ${url.pathname}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof FxProviderError) throw err;
      throw new FxProviderError(this.id, (err as Error).message ?? "fetch failed");
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchLatest({ quotes }: { quotes: readonly string[] }): Promise<FxFetchResult[]> {
    const supported = this.filterSupported(quotes);
    if (supported.length === 0) return [];
    const url = new URL(`${BASE_URL}/latest`);
    url.searchParams.set("base", this.base);
    url.searchParams.set("symbols", supported.join(","));
    const data = await this.getJson<LatestResponse>(url);
    return parseLatest(data, this.base);
  }

  async fetchHistorical({
    quotes,
    date,
  }: {
    quotes: readonly string[];
    date: string;
  }): Promise<FxFetchResult[]> {
    const supported = this.filterSupported(quotes);
    if (supported.length === 0) return [];
    const url = new URL(`${BASE_URL}/${date}`);
    url.searchParams.set("base", this.base);
    url.searchParams.set("symbols", supported.join(","));
    const data = await this.getJson<LatestResponse>(url);
    return parseLatest(data, this.base, date);
  }

  async fetchTimeseries({
    quotes,
    startDate,
    endDate,
  }: {
    quotes: readonly string[];
    startDate: string;
    endDate: string;
  }): Promise<FxFetchResult[]> {
    const supported = this.filterSupported(quotes);
    if (supported.length === 0) return [];
    const url = new URL(`${BASE_URL}/${startDate}..${endDate}`);
    url.searchParams.set("base", this.base);
    url.searchParams.set("symbols", supported.join(","));
    const data = await this.getJson<RangeResponse>(url);
    return parseRange(data, this.base);
  }
}

function parseLatest(data: LatestResponse, base: string, fallbackDate?: string): FxFetchResult[] {
  const asOfDate = data.date ?? fallbackDate ?? new Date().toISOString().slice(0, 10);
  const out: FxFetchResult[] = [];
  for (const [quote, rate] of Object.entries(data.rates ?? {})) {
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    out.push({ baseCurrency: base, quoteCurrency: quote.toUpperCase(), rate, asOfDate });
  }
  return out;
}

function parseRange(data: RangeResponse, base: string): FxFetchResult[] {
  const out: FxFetchResult[] = [];
  for (const [date, perQuote] of Object.entries(data.rates ?? {})) {
    for (const [quote, rate] of Object.entries(perQuote)) {
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
      out.push({ baseCurrency: base, quoteCurrency: quote.toUpperCase(), rate, asOfDate: date });
    }
  }
  return out;
}
