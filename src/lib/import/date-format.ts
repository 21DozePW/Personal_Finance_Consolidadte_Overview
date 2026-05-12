/**
 * Minimal date-format parser for CSV import. Supports the formats most
 * household-bank CSV exports use. The format string uses the tokens
 *   YYYY (4-digit year), MM (2-digit month), DD (2-digit day),
 *   YY (2-digit year — interpreted as 20YY)
 * and any literal separator between them (`-`, `.`, `/`, ` `).
 */

import { ImportParseError } from "./types";

const KNOWN_FORMATS = new Set([
  "YYYY-MM-DD",
  "DD-MM-YYYY",
  "DD.MM.YYYY",
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "MM-DD-YYYY",
  "DD.MM.YY",
  "DD/MM/YY",
]);

export function isKnownDateFormat(format: string): boolean {
  return KNOWN_FORMATS.has(format);
}

export function parseDate(input: string, format: string): string {
  const value = input.trim();
  if (!value) throw new ImportParseError("Empty date.");

  // Alternation order matters: YYYY must come before YY so the longer token
  // wins. Using a single `replace` call avoids the trap where a later YY
  // pass would consume characters inside an earlier `(?<YYYY>` group name.
  const tokenRegex: Record<"YYYY" | "MM" | "DD" | "YY", string> = {
    YYYY: "(?<YYYY>\\d{4})",
    MM: "(?<MM>\\d{2})",
    DD: "(?<DD>\\d{2})",
    YY: "(?<YY>\\d{2})",
  };
  const pattern = format
    .replace(/[-./\\ ]/g, (m) => `\\${m}`)
    .replace(/YYYY|MM|DD|YY/g, (m) => tokenRegex[m as keyof typeof tokenRegex]);
  const re = new RegExp(`^${pattern}$`);
  const match = value.match(re);
  if (!match) {
    throw new ImportParseError(`Cannot parse date "${value}" with format "${format}".`);
  }
  const groups = (match.groups ?? {}) as Partial<Record<"YYYY" | "MM" | "DD" | "YY", string>>;

  let year: number;
  if (groups.YYYY) year = Number(groups.YYYY);
  else if (groups.YY) year = 2000 + Number(groups.YY);
  else throw new ImportParseError(`No year in format "${format}".`);
  const month = Number(groups.MM ?? 0);
  const day = Number(groups.DD ?? 0);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new ImportParseError(`Out-of-range date "${value}".`);
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10);
}
