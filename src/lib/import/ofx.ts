/**
 * Minimal OFX/QFX parser.
 *
 * We support both flavours banks ship:
 *   - SGML (pre-2.0): headers like `OFXHEADER:100`, tags often unclosed
 *   - XML (2.0+): proper XML preamble, well-formed tags
 *
 * Rather than build a full SGML parser we strip the headers, then for SGML
 * close any unclosed leaf tags before treating the body as XML-like. The
 * data we need (`<STMTTRN>` blocks) sits inside `<BANKMSGSRSV1>` /
 * `<CCSTMTTRNRS>` etc. — we extract them with a robust regex pass.
 */

import { ImportParseError, type ParseResult, type ParsedRow } from "./types";

const LEAF_TAGS = [
  "DTPOSTED",
  "DTUSER",
  "DTAVAIL",
  "TRNAMT",
  "FITID",
  "NAME",
  "MEMO",
  "TRNTYPE",
  "CHECKNUM",
  "REFNUM",
];

function stripHeaders(content: string): string {
  // SGML headers are key:value lines before the first `<`.
  const firstTag = content.indexOf("<");
  if (firstTag === -1) return content;
  const head = content.slice(0, firstTag);
  if (/OFXHEADER\s*:/i.test(head)) return content.slice(firstTag);
  return content;
}

function normalizeSgml(content: string): string {
  // For each known leaf tag, close it before the next `<` if it isn't already.
  // Repeatedly apply per tag — keeps the parser simple.
  let out = content;
  for (const tag of LEAF_TAGS) {
    const open = new RegExp(`<${tag}>([^<\\r\\n]*)`, "gi");
    out = out.replace(open, (_m, value) => `<${tag}>${value}</${tag}>`);
  }
  return out;
}

function extractAll(haystack: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack)) !== null) out.push(m[1] ?? "");
  return out;
}

function extractOne(haystack: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = haystack.match(re);
  return m ? (m[1] ?? "").trim() : null;
}

function parseDtposted(raw: string): string | null {
  // OFX date: YYYYMMDD or YYYYMMDDHHMMSS[.SSS][TZ:offset]
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function parseOfx(content: string): ParseResult {
  const stripped = stripHeaders(content).trim();
  if (!stripped) throw new ImportParseError("Empty OFX file.");

  // Detect SGML vs XML
  const isXml = stripped.startsWith("<?xml");
  const body = isXml ? stripped : normalizeSgml(stripped);

  const transactions = extractAll(body, "STMTTRN");
  if (transactions.length === 0) {
    throw new ImportParseError("No <STMTTRN> entries found in OFX file.");
  }

  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  transactions.forEach((tx, idx) => {
    const dt = extractOne(tx, "DTPOSTED") ?? extractOne(tx, "DTUSER");
    const amt = extractOne(tx, "TRNAMT");
    const name = extractOne(tx, "NAME");
    const memo = extractOne(tx, "MEMO");
    const fitid = extractOne(tx, "FITID");

    if (!dt || !amt) {
      warnings.push(`Transaction ${idx + 1}: missing DTPOSTED or TRNAMT.`);
      return;
    }
    const occurredOn = parseDtposted(dt);
    if (!occurredOn) {
      warnings.push(`Transaction ${idx + 1}: unparsable DTPOSTED "${dt}".`);
      return;
    }
    const description = [name, memo].filter(Boolean).join(" · ") || null;
    rows.push({
      occurredOn,
      amount: amt.trim(),
      description,
      merchant: name?.trim() ?? null,
      externalId: fitid?.trim() ?? null,
    });
  });
  return { rows, warnings };
}
