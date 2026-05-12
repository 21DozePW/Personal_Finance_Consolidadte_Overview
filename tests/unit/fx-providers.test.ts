import { describe, it, expect } from "vitest";
import { ExchangerateHostProvider, FrankfurterProvider, FxProviderError } from "@/lib/fx-providers";

function mockFetch(handler: (url: string) => { status: number; body: unknown }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status, body } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("ExchangerateHostProvider", () => {
  it("parses /latest into FxFetchResult[]", async () => {
    const fetcher = mockFetch((url) => {
      expect(url).toContain("/latest");
      expect(url).toContain("base=CHF");
      expect(url).toContain("symbols=USD%2CEUR");
      return {
        status: 200,
        body: { success: true, base: "CHF", date: "2026-05-12", rates: { USD: 1.105, EUR: 0.95 } },
      };
    });
    const provider = new ExchangerateHostProvider({ fetcher });
    const out = await provider.fetchLatest({ quotes: ["USD", "EUR"] });
    expect(out).toEqual([
      { baseCurrency: "CHF", quoteCurrency: "USD", rate: 1.105, asOfDate: "2026-05-12" },
      { baseCurrency: "CHF", quoteCurrency: "EUR", rate: 0.95, asOfDate: "2026-05-12" },
    ]);
  });

  it("skips non-positive or non-numeric rates", async () => {
    const fetcher = mockFetch(() => ({
      status: 200,
      body: { base: "CHF", date: "2026-05-12", rates: { USD: 1.1, EUR: 0, BRL: -1, JPY: "x" } },
    }));
    const provider = new ExchangerateHostProvider({ fetcher });
    const out = await provider.fetchLatest({ quotes: ["USD", "EUR", "BRL", "JPY"] });
    expect(out.map((r) => r.quoteCurrency)).toEqual(["USD"]);
  });

  it("throws FxProviderError on HTTP failure", async () => {
    const fetcher = mockFetch(() => ({ status: 503, body: { error: "down" } }));
    const provider = new ExchangerateHostProvider({ fetcher });
    await expect(provider.fetchLatest({ quotes: ["USD"] })).rejects.toBeInstanceOf(FxProviderError);
  });

  it("flattens /timeseries into rows", async () => {
    const fetcher = mockFetch(() => ({
      status: 200,
      body: {
        success: true,
        base: "CHF",
        rates: {
          "2026-05-10": { USD: 1.1 },
          "2026-05-11": { USD: 1.11 },
          "2026-05-12": { USD: 1.105 },
        },
      },
    }));
    const provider = new ExchangerateHostProvider({ fetcher });
    const out = await provider.fetchTimeseries({
      quotes: ["USD"],
      startDate: "2026-05-10",
      endDate: "2026-05-12",
    });
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.asOfDate)).toEqual(["2026-05-10", "2026-05-11", "2026-05-12"]);
  });

  it("treats success:false as a provider error", async () => {
    const fetcher = mockFetch(() => ({
      status: 200,
      body: { success: false, error: { type: "rate_limited" } },
    }));
    const provider = new ExchangerateHostProvider({ fetcher });
    await expect(provider.fetchLatest({ quotes: ["USD"] })).rejects.toBeInstanceOf(FxProviderError);
  });

  it("returns an empty list when no quotes are requested without calling the API", async () => {
    let called = false;
    const fetcher = mockFetch(() => {
      called = true;
      return { status: 200, body: {} };
    });
    const provider = new ExchangerateHostProvider({ fetcher });
    const out = await provider.fetchLatest({ quotes: [] });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });
});

describe("FrankfurterProvider", () => {
  it("filters unsupported currencies before hitting the API", async () => {
    let called = false;
    const fetcher = mockFetch(() => {
      called = true;
      return { status: 200, body: {} };
    });
    const provider = new FrankfurterProvider({ fetcher });
    const out = await provider.fetchLatest({ quotes: ["XYZ", "AAA"] });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("parses /latest for supported quotes (CHF base)", async () => {
    const fetcher = mockFetch((url) => {
      expect(url).toContain("base=CHF");
      // CHF is filtered out as same-as-base.
      expect(url).toContain("symbols=USD%2CEUR");
      return {
        status: 200,
        body: { base: "CHF", date: "2026-05-12", rates: { USD: 1.105, EUR: 0.95 } },
      };
    });
    const provider = new FrankfurterProvider({ fetcher });
    const out = await provider.fetchLatest({ quotes: ["USD", "EUR", "CHF"] });
    expect(out.map((r) => r.quoteCurrency).sort()).toEqual(["EUR", "USD"]);
  });

  it("parses the range endpoint", async () => {
    const fetcher = mockFetch(() => ({
      status: 200,
      body: {
        base: "CHF",
        rates: {
          "2026-05-10": { USD: 1.1 },
          "2026-05-11": { USD: 1.11 },
        },
      },
    }));
    const provider = new FrankfurterProvider({ fetcher });
    const out = await provider.fetchTimeseries({
      quotes: ["USD"],
      startDate: "2026-05-10",
      endDate: "2026-05-11",
    });
    expect(out).toHaveLength(2);
  });
});
