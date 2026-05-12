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

export function formatMoney(minor: number | bigint, currency: string, locale = "de-CH"): string {
  const value = typeof minor === "bigint" ? Number(minor) : minor;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits(currency),
    maximumFractionDigits: fractionDigits(currency),
  }).format(fromMinor(value, currency));
}

/**
 * Parses a user-typed decimal string ("1234.56", "-1234,56") into a bigint of
 * minor units for the given currency. Accepts `.` or `,` as the decimal
 * separator and allows a leading "-" for outflows.
 *
 * Throws `ParseAmountError` on malformed input or more fractional digits than
 * the currency supports.
 */
export class ParseAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseAmountError";
  }
}

export function parseAmountToMinor(raw: string, currency: string): bigint {
  const trimmed = raw.trim();
  if (!trimmed) throw new ParseAmountError("Amount is required.");
  const normalized = trimmed.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new ParseAmountError("Enter a number like 1234.56 or -42.");
  }
  const [whole, frac = ""] = normalized.split(".") as [string, string?];
  const digits = fractionDigits(currency);
  if (frac.length > digits) {
    throw new ParseAmountError(
      digits === 0
        ? `${currency} amounts must be whole numbers.`
        : `${currency} amounts allow at most ${digits} decimal places.`,
    );
  }
  const padded = (frac ?? "").padEnd(digits, "0");
  const negative = whole.startsWith("-");
  const wholeAbs = negative ? whole.slice(1) : whole;
  const combined = `${wholeAbs}${padded}`.replace(/^0+(?=\d)/, "");
  const minor = BigInt(combined || "0");
  return negative ? -minor : minor;
}
