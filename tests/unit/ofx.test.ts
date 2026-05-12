import { describe, it, expect } from "vitest";
import { parseOfx } from "@/lib/import/ofx";
import { ImportParseError } from "@/lib/import/types";

const SGML_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260512
<TRNAMT>-12.34
<FITID>ABC123
<NAME>MIGROS
<MEMO>Groceries
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260513120000
<TRNAMT>500.00
<FITID>SAL-2026-05
<NAME>EMPLOYER
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const XML_SAMPLE = `<?xml version="1.0" encoding="UTF-8" ?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260512</DTPOSTED>
            <TRNAMT>-7.50</TRNAMT>
            <FITID>XYZ001</FITID>
            <NAME>Coffee</NAME>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

describe("parseOfx (SGML)", () => {
  it("extracts STMTTRN entries with date, amount, name, fitid, memo", () => {
    const out = parseOfx(SGML_SAMPLE);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({
      occurredOn: "2026-05-12",
      amount: "-12.34",
      externalId: "ABC123",
      merchant: "MIGROS",
    });
    expect(out.rows[0]?.description).toContain("Groceries");
    expect(out.rows[1]).toMatchObject({
      occurredOn: "2026-05-13",
      amount: "500.00",
      externalId: "SAL-2026-05",
    });
  });
});

describe("parseOfx (XML)", () => {
  it("extracts a single transaction", () => {
    const out = parseOfx(XML_SAMPLE);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.externalId).toBe("XYZ001");
  });
});

describe("parseOfx errors", () => {
  it("rejects an empty file", () => {
    expect(() => parseOfx("")).toThrow(ImportParseError);
  });
  it("rejects a file with no STMTTRN", () => {
    expect(() => parseOfx("<OFX></OFX>")).toThrow(/STMTTRN/);
  });
});
