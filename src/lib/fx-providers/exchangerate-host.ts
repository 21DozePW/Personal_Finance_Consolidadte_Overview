/**
 * exchangerate.host provider.
 *
 * Free, no API key required for the documented endpoints. Returns rates with
 * `base` set to CHF in our usage. Supports BRL plus all currencies we care
 * about in v1.
 *
 * Response shape (for /latest, /YYYY-MM-DD, /timeseries):
 *   { success: true, base: "CHF", date: "YYYY-MM-DD", rates: { USD: 1.1, ... } }
 *   /timeseries adds `rates: { "YYYY-MM-DD": { USD: 1.1, ... }, ... }`
 */

import type { FxFetchResult, FxProvider, FetcherFn } from "./types";
import { FxProviderError } from "./types";

const BASE_URL = "https://api.exchangerate.host";
const TIMEOUT_MS = 15_000;

type LatestResponse = {
  success?: boolean;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
};

type TimeseriesResponse = {
  success?: boolean;
  base?: string;
  rates?: Record<string, Record<string, number>>;
};

export class ExchangerateHostProvider implements FxProvider {
  readonly id = "EXCHANGERATE_HOST" as const;

  constructor(
    private readonly opts: {
      base?: string;
      fetcher?: FetcherFn;
      apiKey?: string;
      timeoutMs?: number;
    } = {},
  ) {}

  private get fetcher(): FetcherFn {
    return this.opts.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private get base(): string {
    return this.opts.base ?? "CHF";
  }

  private withCommonParams(url: URL, quotes: readonly string[]): URL {
    url.searchParams.set("base", this.base);
    url.searchParams.set("symbols", quotes.join(","));
    if (this.opts.apiKey) url.searchParams.set("access_key", this.opts.apiKey);
    return url;
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
    if (quotes.length === 0) return [];
    const url = this.withCommonParams(new URL(`${BASE_URL}/latest`), quotes);
    const data = await this.getJson<LatestResponse>(url);
    return parseLatest(data, this.base, this.id);
  }

  async fetchHistorical({
    quotes,
    date,
  }: {
    quotes: readonly string[];
    date: string;
  }): Promise<FxFetchResult[]> {
    if (quotes.length === 0) return [];
    const url = this.withCommonParams(new URL(`${BASE_URL}/${date}`), quotes);
    const data = await this.getJson<LatestResponse>(url);
    return parseLatest(data, this.base, this.id, date);
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
    if (quotes.length === 0) return [];
    const url = this.withCommonParams(new URL(`${BASE_URL}/timeseries`), quotes);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    const data = await this.getJson<TimeseriesResponse>(url);
    return parseTimeseries(data, this.base, this.id);
  }
}

function parseLatest(
  data: LatestResponse,
  base: string,
  providerId: string,
  fallbackDate?: string,
): FxFetchResult[] {
  if (data.success === false) {
    throw new FxProviderError(providerId, "provider reported failure");
  }
  const asOfDate = data.date ?? fallbackDate ?? new Date().toISOString().slice(0, 10);
  const out: FxFetchResult[] = [];
  for (const [quote, rate] of Object.entries(data.rates ?? {})) {
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    out.push({ baseCurrency: base, quoteCurrency: quote.toUpperCase(), rate, asOfDate });
  }
  return out;
}

function parseTimeseries(
  data: TimeseriesResponse,
  base: string,
  providerId: string,
): FxFetchResult[] {
  if (data.success === false) {
    throw new FxProviderError(providerId, "provider reported failure");
  }
  const out: FxFetchResult[] = [];
  for (const [date, perQuote] of Object.entries(data.rates ?? {})) {
    for (const [quote, rate] of Object.entries(perQuote)) {
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
      out.push({ baseCurrency: base, quoteCurrency: quote.toUpperCase(), rate, asOfDate: date });
    }
  }
  return out;
}
