/**
 * Pure FX conversion helpers (no DB access).
 *
 * Rate convention: `rate = units of quote per 1 base`. With CHF as base, a
 * USD rate of 1.10 means 1 CHF = 1.10 USD. To convert a USD amount to CHF
 * we divide by the rate; to convert CHF to USD we multiply.
 *
 * Amounts are exchanged via JS `number` for display purposes — fine for any
 * realistic household balance (Number.MAX_SAFE_INTEGER ≈ 9·10^15). Storage
 * stays in BigInt minor units in the account's native currency.
 */

import { fractionDigits } from "./money";

export const BASE_CURRENCY = "CHF";

export type RateLookup = (quoteCurrency: string) => number | null;

/**
 * Convert a native-currency minor-units amount into CHF minor-units. Returns
 * `null` when the rate is missing.
 *
 *   convertToBaseMinor(50000n, "USD", 1.10)  // → 4545454 / 10^2 → 45455 (CHF 454.55)
 *   convertToBaseMinor(50000n, "CHF", 1)     // → 50000 (passthrough)
 */
export function convertToBaseMinor(
  nativeMinor: bigint | number,
  nativeCurrency: string,
  rateQuotePerBase: number | null,
  baseCurrency: string = BASE_CURRENCY,
): number | null {
  const native = typeof nativeMinor === "bigint" ? Number(nativeMinor) : nativeMinor;
  if (nativeCurrency === baseCurrency) {
    return native; // already in base units
  }
  if (rateQuotePerBase == null || rateQuotePerBase <= 0 || !Number.isFinite(rateQuotePerBase)) {
    return null;
  }
  const nativeMajor = native / 10 ** fractionDigits(nativeCurrency);
  const baseMajor = nativeMajor / rateQuotePerBase;
  return Math.round(baseMajor * 10 ** fractionDigits(baseCurrency));
}

/**
 * Convert a CHF minor-units amount into the target currency's minor units.
 * Used for budgets and goals defined in CHF but tracked against a native
 * account.
 */
export function convertFromBaseMinor(
  baseMinor: bigint | number,
  targetCurrency: string,
  rateQuotePerBase: number | null,
  baseCurrency: string = BASE_CURRENCY,
): number | null {
  const base = typeof baseMinor === "bigint" ? Number(baseMinor) : baseMinor;
  if (targetCurrency === baseCurrency) return base;
  if (rateQuotePerBase == null || rateQuotePerBase <= 0 || !Number.isFinite(rateQuotePerBase)) {
    return null;
  }
  const baseMajor = base / 10 ** fractionDigits(baseCurrency);
  const targetMajor = baseMajor * rateQuotePerBase;
  return Math.round(targetMajor * 10 ** fractionDigits(targetCurrency));
}

/**
 * Resolve the rate to use when converting `nativeCurrency` to CHF. Returns 1
 * for CHF itself; null when there's no known rate. Caller decides how to
 * surface the missing rate.
 */
export function resolveRate(
  nativeCurrency: string,
  lookup: RateLookup,
  baseCurrency: string = BASE_CURRENCY,
): number | null {
  if (nativeCurrency === baseCurrency) return 1;
  return lookup(nativeCurrency);
}
