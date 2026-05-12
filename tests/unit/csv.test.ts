import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvFile, splitCsvLine, applyColumnMap } from "@/lib/import/csv";
import { ImportParseError } from "@/lib/import/types";

describe("splitCsvLine", () => {
  it("splits simple comma-separated", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });
  it("handles quoted fields with commas", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });
  it("handles doubled quotes inside quoted fields", () => {
    expect(splitCsvLine('a,"hello ""world""",c')).toEqual(["a", 'hello "world"', "c"]);
  });
  it("preserves empty trailing field", () => {
    expect(splitCsvLine("a,b,")).toEqual(["a", "b", ""]);
  });
});

describe("parseCsv", () => {
  it("strips a BOM and parses headers + rows", () => {
    const csv = "﻿Date,Amount,Description\n2026-05-12,12.34,Coffee\n";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["Date", "Amount", "Description"]);
    expect(rows).toEqual([{ Date: "2026-05-12", Amount: "12.34", Description: "Coffee" }]);
  });
  it("handles CRLF line endings", () => {
    const csv = "Date,Amount\r\n2026-05-12,1.00\r\n2026-05-13,2.00\r\n";
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });
});

describe("applyColumnMap", () => {
  const base = {
    rows: [
      { Date: "12.05.2026", Amount: "1'234.56", Desc: "Migros" },
      { Date: "13.05.2026", Amount: "-50.00", Desc: "Coffee shop" },
    ],
    headers: ["Date", "Amount", "Desc"],
  };

  it("normalizes Swiss-formatted amounts and dots-as-decimal", () => {
    const out = applyColumnMap(base.rows, base.headers, {
      columnMap: {
        date: { source: "Date" },
        amount: { source: "Amount" },
        description: { source: "Desc" },
      },
      dateFormat: "DD.MM.YYYY",
      decimalSeparator: ".",
    });
    expect(out.rows[0]).toMatchObject({
      occurredOn: "2026-05-12",
      amount: "1234.56",
      description: "Migros",
    });
    expect(out.rows[1]?.amount).toBe("-50.00");
  });

  it("supports comma as decimal separator with dot as thousands", () => {
    const out = applyColumnMap(
      [{ Date: "12.05.2026", Amount: "1.234,56", Desc: "x" }],
      ["Date", "Amount", "Desc"],
      {
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Desc" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ",",
      },
    );
    expect(out.rows[0]?.amount).toBe("1234.56");
  });

  it("supports separate debit/credit columns (debit becomes negative)", () => {
    const out = applyColumnMap(
      [
        { Date: "12.05.2026", Debit: "10.00", Credit: "", Desc: "out" },
        { Date: "13.05.2026", Debit: "", Credit: "5.00", Desc: "in" },
      ],
      ["Date", "Debit", "Credit", "Desc"],
      {
        columnMap: {
          date: { source: "Date" },
          debit: { source: "Debit" },
          credit: { source: "Credit" },
          description: { source: "Desc" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
    );
    expect(out.rows[0]?.amount).toBe("-10.00");
    expect(out.rows[1]?.amount).toBe("5.00");
  });

  it("rejects when neither amount nor debit/credit is mapped", () => {
    expect(() =>
      applyColumnMap(base.rows, base.headers, {
        columnMap: { date: { source: "Date" } },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      }),
    ).toThrow(ImportParseError);
  });

  it("rejects when a mapped column is missing from the header", () => {
    expect(() =>
      applyColumnMap(base.rows, base.headers, {
        columnMap: {
          date: { source: "Date" },
          amount: { source: "NoSuch" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      }),
    ).toThrow(/NoSuch/);
  });

  it("collects warnings for bad rows instead of throwing", () => {
    const out = applyColumnMap(
      [
        { Date: "12.05.2026", Amount: "1.00", Desc: "ok" },
        { Date: "32.13.2026", Amount: "1.00", Desc: "bad date" },
        { Date: "13.05.2026", Amount: "", Desc: "no amount" },
      ],
      ["Date", "Amount", "Desc"],
      {
        columnMap: {
          date: { source: "Date" },
          amount: { source: "Amount" },
          description: { source: "Desc" },
        },
        dateFormat: "DD.MM.YYYY",
        decimalSeparator: ".",
      },
    );
    expect(out.rows).toHaveLength(1);
    expect(out.warnings).toHaveLength(2);
  });
});

describe("parseCsvFile end-to-end", () => {
  it("parses a small sample", () => {
    const csv = ["Date,Amount,Description", "12.05.2026,12.34,Migros"].join("\n");
    const out = parseCsvFile(csv, {
      columnMap: {
        date: { source: "Date" },
        amount: { source: "Amount" },
        description: { source: "Description" },
      },
      dateFormat: "DD.MM.YYYY",
      decimalSeparator: ".",
    });
    expect(out.rows[0]).toMatchObject({
      occurredOn: "2026-05-12",
      amount: "12.34",
      description: "Migros",
    });
  });
});
