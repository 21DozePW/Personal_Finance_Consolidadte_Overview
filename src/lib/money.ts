/**
 * Money helpers. All monetary amounts are stored as integers in minor units
 * (e.g. centimes for CHF, cents for USD) to avoid float drift. ISO 4217
 * currencies that have 0 fractional digits (JPY, KRW) are supported via
 * `fractionDigits`.
 */

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function fractionDigits(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

export function toMinor(amount: number, currency: string): number {
  const digits = fractionDigits(currency);
  return Math.round(amount * 10 ** digits);
}

export function fromMinor(minor: number, currency: string): number {
  const digits = fractionDigits(currency);
  return minor / 10 ** digits;
}

export function formatMoney(minor: number, currency: string, locale = "de-CH"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits(currency),
    maximumFractionDigits: fractionDigits(currency),
  }).format(fromMinor(minor, currency));
}
