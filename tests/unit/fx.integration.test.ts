/**
 * Integration tests for the FX orchestration layer against real Postgres.
 * Providers are stubbed so we don't hit external APIs.
 *
 * Skipped automatically when DATABASE_URL is unset.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";
import type { FxFetchResult, FxProvider, ProviderChain } from "@/lib/fx-providers";

const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

let __setProviderChainForTests: typeof import("@/server/fx").__setProviderChainForTests;
let fetchAndStoreLatest: typeof import("@/server/fx").fetchAndStoreLatest;
let getLatestRates: typeof import("@/server/fx").getLatestRates;
let getRateForDate: typeof import("@/server/fx").getRateForDate;
let setManualRate: typeof import("@/server/fx").setManualRate;
let backfillCurrency: typeof import("@/server/fx").backfillCurrency;

class FakeProvider implements FxProvider {
  readonly id: "EXCHANGERATE_HOST" | "FRANKFURTER";
  public latestCalls: string[][] = [];
  public timeseriesCalls: Array<{
    quotes: readonly string[];
    startDate: string;
    endDate: string;
  }> = [];

  constructor(
    id: "EXCHANGERATE_HOST" | "FRANKFURTER",
    private readonly latestImpl: (quotes: readonly string[]) => FxFetchResult[] | Promise<never>,
    private readonly timeseriesImpl?: (opts: {
      quotes: readonly string[];
      startDate: string;
      endDate: string;
    }) => FxFetchResult[] | Promise<never>,
  ) {
    this.id = id;
  }

  async fetchLatest({ quotes }: { quotes: readonly string[] }): Promise<FxFetchResult[]> {
    this.latestCalls.push([...quotes]);
    const out = this.latestImpl(quotes);
    return Array.isArray(out) ? out : await out;
  }

  async fetchHistorical({
    quotes,
  }: {
    quotes: readonly string[];
    date: string;
  }): Promise<FxFetchResult[]> {
    const out = this.latestImpl(quotes);
    return Array.isArray(out) ? out : await out;
  }

  async fetchTimeseries(opts: {
    quotes: readonly string[];
    startDate: string;
    endDate: string;
  }): Promise<FxFetchResult[]> {
    this.timeseriesCalls.push({ ...opts, quotes: [...opts.quotes] });
    if (!this.timeseriesImpl) return [];
    const out = this.timeseriesImpl(opts);
    return Array.isArray(out) ? out : await out;
  }
}

beforeAll(async () => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const fx = await import("@/server/fx");
  __setProviderChainForTests = fx.__setProviderChainForTests;
  fetchAndStoreLatest = fx.fetchAndStoreLatest;
  getLatestRates = fx.getLatestRates;
  getRateForDate = fx.getRateForDate;
  setManualRate = fx.setManualRate;
  backfillCurrency = fx.backfillCurrency;
});

afterAll(async () => {
  __setProviderChainForTests?.(null);
  await prisma.$disconnect();
  process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
});

async function reset() {
  await prisma.auditLog.deleteMany({});
  await prisma.fxRate.deleteMany({});
  await prisma.fxRateFetchLog.deleteMany({});
  await prisma.user.deleteMany({});
}

async function makeAdmin() {
  return prisma.user.create({
    data: {
      googleSub: `sub-${Math.random()}`,
      email: `admin-${Math.random()}@example.com`,
      displayName: "Admin",
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
}

function chain(primary: FxProvider, fallback: FxProvider): ProviderChain {
  return { primary, fallback };
}

d("FX orchestration", () => {
  beforeEach(async () => {
    await reset();
  });
  afterEach(() => {
    __setProviderChainForTests(null);
  });

  it("primary returns everything: writes rates, log status=OK", async () => {
    const primary = new FakeProvider("EXCHANGERATE_HOST", () => [
      { baseCurrency: "CHF", quoteCurrency: "USD", rate: 1.1, asOfDate: "2026-05-12" },
      { baseCurrency: "CHF", quoteCurrency: "EUR", rate: 0.95, asOfDate: "2026-05-12" },
      { baseCurrency: "CHF", quoteCurrency: "BRL", rate: 5.6, asOfDate: "2026-05-12" },
    ]);
    const fallback = new FakeProvider("FRANKFURTER", () => []);
    __setProviderChainForTests(chain(primary, fallback));

    const summary = await fetchAndStoreLatest({ currencies: ["USD", "EUR", "BRL"] });
    expect(summary.status).toBe("OK");
    expect(summary.fetched.sort()).toEqual(["BRL", "EUR", "USD"]);
    expect(summary.missing).toEqual([]);
    expect(fallback.latestCalls).toHaveLength(0);

    const rates = await getLatestRates(["USD", "EUR", "BRL"]);
    expect(rates.size).toBe(3);
    expect(Number(rates.get("USD")!.rate)).toBeCloseTo(1.1);
    expect(rates.get("USD")!.source).toBe("EXCHANGERATE_HOST");
  });

  it("primary partial → fallback fills the gap", async () => {
    const primary = new FakeProvider("EXCHANGERATE_HOST", () => [
      { baseCurrency: "CHF", quoteCurrency: "USD", rate: 1.1, asOfDate: "2026-05-12" },
    ]);
    const fallback = new FakeProvider("FRANKFURTER", (quotes) =>
      quotes.includes("EUR")
        ? [{ baseCurrency: "CHF", quoteCurrency: "EUR", rate: 0.95, asOfDate: "2026-05-12" }]
        : [],
    );
    __setProviderChainForTests(chain(primary, fallback));

    const summary = await fetchAndStoreLatest({ currencies: ["USD", "EUR", "BRL"] });
    expect(summary.status).toBe("PARTIAL");
    expect(summary.fetched.sort()).toEqual(["EUR", "USD"]);
    expect(summary.missing).toEqual(["BRL"]);
    // Fallback should have been called only with the currencies primary missed.
    expect(fallback.latestCalls).toEqual([["EUR", "BRL"]]);

    const rates = await getLatestRates(["USD", "EUR", "BRL"]);
    expect(rates.get("USD")!.source).toBe("EXCHANGERATE_HOST");
    expect(rates.get("EUR")!.source).toBe("FRANKFURTER");
    expect(rates.get("BRL")).toBeUndefined();
  });

  it("primary throws → fallback used for all", async () => {
    const primary = new FakeProvider("EXCHANGERATE_HOST", () => {
      throw new Error("network down");
    });
    const fallback = new FakeProvider("FRANKFURTER", () => [
      { baseCurrency: "CHF", quoteCurrency: "USD", rate: 1.1, asOfDate: "2026-05-12" },
    ]);
    __setProviderChainForTests(chain(primary, fallback));
    const summary = await fetchAndStoreLatest({ currencies: ["USD"] });
    expect(summary.status).toBe("OK");
    expect(summary.errorMessage).toContain("EXCHANGERATE_HOST");
  });

  it("both fail → status=FAIL, log captures both errors", async () => {
    const primary = new FakeProvider("EXCHANGERATE_HOST", () => {
      throw new Error("primary boom");
    });
    const fallback = new FakeProvider("FRANKFURTER", () => {
      throw new Error("fallback boom");
    });
    __setProviderChainForTests(chain(primary, fallback));
    const summary = await fetchAndStoreLatest({ currencies: ["USD"] });
    expect(summary.status).toBe("FAIL");
    expect(summary.missing).toEqual(["USD"]);
    const log = await prisma.fxRateFetchLog.findUniqueOrThrow({ where: { id: summary.logId } });
    expect(log.status).toBe("FAIL");
    expect(log.errorMessage).toContain("primary boom");
    expect(log.errorMessage).toContain("fallback boom");
  });

  it("upserts: re-running on the same date overwrites the rate", async () => {
    const v1 = new FakeProvider("EXCHANGERATE_HOST", () => [
      { baseCurrency: "CHF", quoteCurrency: "USD", rate: 1.1, asOfDate: "2026-05-12" },
    ]);
    const fallback = new FakeProvider("FRANKFURTER", () => []);
    __setProviderChainForTests(chain(v1, fallback));
    await fetchAndStoreLatest({ currencies: ["USD"] });

    const v2 = new FakeProvider("EXCHANGERATE_HOST", () => [
      { baseCurrency: "CHF", quoteCurrency: "USD", rate: 1.12, asOfDate: "2026-05-12" },
    ]);
    __setProviderChainForTests(chain(v2, fallback));
    await fetchAndStoreLatest({ currencies: ["USD"] });

    const rows = await prisma.fxRate.findMany({ where: { quoteCurrency: "USD" } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.rate)).toBeCloseTo(1.12);
  });

  it("getRateForDate carries the most recent earlier rate forward", async () => {
    const provider = new FakeProvider("EXCHANGERATE_HOST", () => []);
    __setProviderChainForTests(chain(provider, provider));

    await prisma.fxRate.createMany({
      data: [
        {
          baseCurrency: "CHF",
          quoteCurrency: "USD",
          rate: "1.10",
          asOfDate: new Date("2026-05-10T00:00:00Z"),
          source: "EXCHANGERATE_HOST",
        },
        {
          baseCurrency: "CHF",
          quoteCurrency: "USD",
          rate: "1.12",
          asOfDate: new Date("2026-05-12T00:00:00Z"),
          source: "EXCHANGERATE_HOST",
        },
      ],
    });

    const exact = await getRateForDate("USD", "2026-05-12");
    expect(Number(exact!.rate)).toBeCloseTo(1.12);

    // 2026-05-11 has no row → carry forward from 2026-05-10.
    const between = await getRateForDate("USD", "2026-05-11");
    expect(Number(between!.rate)).toBeCloseTo(1.1);

    // Before any rate → null.
    const earlier = await getRateForDate("USD", "2026-05-09");
    expect(earlier).toBeNull();
  });

  it("setManualRate writes source=MANUAL and an audit row, overriding existing", async () => {
    const admin = await makeAdmin();
    await prisma.fxRate.create({
      data: {
        baseCurrency: "CHF",
        quoteCurrency: "USD",
        rate: "1.10",
        asOfDate: new Date("2026-05-12T00:00:00Z"),
        source: "EXCHANGERATE_HOST",
      },
    });
    const result = await setManualRate(admin.id, {
      quoteCurrency: "USD",
      rate: 1.234,
      asOfDate: "2026-05-12",
    });
    expect(result.source).toBe("MANUAL");
    expect(Number(result.rate)).toBeCloseTo(1.234);

    const audits = await prisma.auditLog.findMany({ where: { action: "FX_RATE_OVERRIDE" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).toBe(admin.id);
  });

  it("setManualRate rejects bad input", async () => {
    const admin = await makeAdmin();
    await expect(
      setManualRate(admin.id, { quoteCurrency: "CHF", rate: 1, asOfDate: "2026-05-12" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      setManualRate(admin.id, { quoteCurrency: "USD", rate: 0, asOfDate: "2026-05-12" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      setManualRate(admin.id, { quoteCurrency: "USD", rate: 1.1, asOfDate: "12-05-2026" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("backfillCurrency calls timeseries and stores returned rows", async () => {
    const primary = new FakeProvider(
      "EXCHANGERATE_HOST",
      () => [],
      () => [
        { baseCurrency: "CHF", quoteCurrency: "BRL", rate: 5.5, asOfDate: "2026-05-10" },
        { baseCurrency: "CHF", quoteCurrency: "BRL", rate: 5.6, asOfDate: "2026-05-11" },
        { baseCurrency: "CHF", quoteCurrency: "BRL", rate: 5.7, asOfDate: "2026-05-12" },
      ],
    );
    const fallback = new FakeProvider("FRANKFURTER", () => []);
    __setProviderChainForTests(chain(primary, fallback));

    const result = await backfillCurrency("BRL", { days: 30 });
    expect(result.inserted).toBe(3);
    expect(primary.timeseriesCalls).toHaveLength(1);
    expect(fallback.timeseriesCalls).toHaveLength(0);

    const rows = await prisma.fxRate.findMany({ where: { quoteCurrency: "BRL" } });
    expect(rows).toHaveLength(3);
  });

  it("backfillCurrency falls back when the primary returns nothing", async () => {
    const primary = new FakeProvider(
      "EXCHANGERATE_HOST",
      () => [],
      () => [],
    );
    const fallback = new FakeProvider(
      "FRANKFURTER",
      () => [],
      () => [{ baseCurrency: "CHF", quoteCurrency: "USD", rate: 1.1, asOfDate: "2026-05-12" }],
    );
    __setProviderChainForTests(chain(primary, fallback));

    const result = await backfillCurrency("USD", { days: 10 });
    expect(result.inserted).toBe(1);
    expect(fallback.timeseriesCalls).toHaveLength(1);
  });
});
