/**
 * Shared import types.
 *
 * `ParsedRow` is the lowest-common-denominator after we apply a CSV column
 * map or extract an OFX `STMTTRN` block: a date, a signed amount string in
 * the file's native currency, and optional description / external id /
 * balance fields. Conversion to minor units, FX rate capture, encryption,
 * etc. happen later in `src/server/imports.ts`.
 */

export type ParsedRow = {
  /** ISO YYYY-MM-DD. */
  occurredOn: string;
  /** Signed major-units number as a string ("123.45" or "-12,00"). */
  amount: string;
  description: string | null;
  merchant: string | null;
  externalId: string | null;
};

export type ColumnMap = {
  date: { source: string }; // CSV column name
  description?: { source: string };
  /** Single signed-amount column. Mutually exclusive with debit/credit. */
  amount?: { source: string };
  /** Two-column split: `debit` becomes negative, `credit` becomes positive. */
  debit?: { source: string };
  credit?: { source: string };
  externalId?: { source: string };
  balance?: { source: string };
  merchant?: { source: string };
};

export type ParseOptions = {
  columnMap: ColumnMap;
  dateFormat: string; // see date-format.ts
  decimalSeparator: "." | ",";
};

export type ParseResult = {
  rows: ParsedRow[];
  warnings: string[];
};

export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportParseError";
  }
}
