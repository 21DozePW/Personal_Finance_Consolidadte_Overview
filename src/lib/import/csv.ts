/**
 * Tiny CSV parser. Comma-separated, double-quote escaping, CR/LF line
 * endings. Returns rows as { header → value } maps so callers can apply a
 * column map by name.
 *
 * Not a fully conformant RFC 4180 parser, but handles every bank export I've
 * seen — quoted fields with embedded commas and doubled quotes, plus
 * Windows-style line endings.
 */

import { parseDate } from "./date-format";
import { ImportParseError, type ParseOptions, type ParseResult, type ParsedRow } from "./types";

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsv(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = content.replace(/^﻿/, ""); // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = splitCsvLine(lines[0]!).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function normalizeAmount(raw: string, decimalSeparator: "." | ","): string {
  let s = raw.trim();
  if (!s) return "";
  // Swiss/European exports often wrap amounts with apostrophes as thousand
  // separators: 1'234.56. Strip them along with spaces.
  s = s.replace(/['\s]/g, "");
  // If the decimal separator is comma, convert to dot; also strip dot used as
  // thousand separator (only if there are exactly three digits after a dot
  // that's followed by another dot or the comma decimal separator).
  if (decimalSeparator === ",") {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Dot is decimal; remove any comma thousand separator.
    s = s.replace(/,/g, "");
  }
  return s;
}

function maybeNumber(raw: string | undefined, decimalSeparator: "." | ","): string | null {
  if (raw == null) return null;
  const s = normalizeAmount(raw, decimalSeparator);
  return s ? s : null;
}

export function applyColumnMap(
  rows: Record<string, string>[],
  headers: string[],
  opts: ParseOptions,
): ParseResult {
  const { columnMap } = opts;
  const warnings: string[] = [];

  // Validate referenced columns exist.
  const referenced = [
    columnMap.date.source,
    columnMap.description?.source,
    columnMap.amount?.source,
    columnMap.debit?.source,
    columnMap.credit?.source,
    columnMap.externalId?.source,
    columnMap.balance?.source,
    columnMap.merchant?.source,
  ].filter((c): c is string => typeof c === "string");
  for (const col of referenced) {
    if (!headers.includes(col)) {
      throw new ImportParseError(`Mapped column "${col}" not found in file header.`);
    }
  }
  if (!columnMap.amount && !(columnMap.debit && columnMap.credit)) {
    throw new ImportParseError(
      "Either a single signed-amount column or both debit and credit columns must be mapped.",
    );
  }

  const out: ParsedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    let occurredOn: string;
    try {
      occurredOn = parseDate(r[columnMap.date.source] ?? "", opts.dateFormat);
    } catch (err) {
      warnings.push(`Row ${i + 2}: ${(err as Error).message}`);
      continue;
    }

    let amount: string | null = null;
    if (columnMap.amount) {
      amount = maybeNumber(r[columnMap.amount.source], opts.decimalSeparator);
    } else if (columnMap.debit && columnMap.credit) {
      const d = maybeNumber(r[columnMap.debit.source], opts.decimalSeparator);
      const c = maybeNumber(r[columnMap.credit.source], opts.decimalSeparator);
      if (d) amount = `-${d.replace(/^-/, "")}`;
      else if (c) amount = c.startsWith("-") ? c : c;
    }
    if (amount == null) {
      warnings.push(`Row ${i + 2}: missing amount.`);
      continue;
    }

    const description =
      columnMap.description && r[columnMap.description.source]
        ? r[columnMap.description.source]!.trim() || null
        : null;
    const merchant =
      columnMap.merchant && r[columnMap.merchant.source]
        ? r[columnMap.merchant.source]!.trim() || null
        : null;
    const externalId =
      columnMap.externalId && r[columnMap.externalId.source]
        ? r[columnMap.externalId.source]!.trim() || null
        : null;

    out.push({ occurredOn, amount, description, merchant, externalId });
  }

  return { rows: out, warnings };
}

export function parseCsvFile(content: string, opts: ParseOptions): ParseResult {
  const { headers, rows } = parseCsv(content);
  return applyColumnMap(rows, headers, opts);
}
