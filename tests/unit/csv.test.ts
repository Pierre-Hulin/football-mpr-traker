import { describe, expect, it } from "vitest";
import { escapeCsvCell, parseCsv, toCsv } from "../../src/utils/csv";
import { compareJersey, sortPlayers } from "../../src/utils/sort";

describe("csv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(escapeCsvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell(12)).toBe("12");
  });

  it("neutralizes formula injection but keeps negative numbers", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("-3")).toBe("-3");
  });

  it("round-trips through parseCsv", () => {
    const rows = [
      ["Jersey", "Name"],
      ["12", 'Jack "JJ" Smith'],
      ["18", "Jones, Max"],
      ["7", "Zoë Ünïcode"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("handles CRLF, BOM and trailing newline", () => {
    expect(parseCsv("﻿a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("sort", () => {
  it("orders numeric jerseys numerically, then non-numeric", () => {
    const sorted = ["10", "2", "A1", "0", "00", "1"].sort(compareJersey);
    expect(sorted).toEqual(["0", "00", "1", "2", "10", "A1"]);
  });
  it("breaks ties by name", () => {
    const sorted = sortPlayers([
      { jerseyNumber: "5", displayName: "Zed" },
      { jerseyNumber: "5", displayName: "Amy" },
    ]);
    expect(sorted.map((p) => p.displayName)).toEqual(["Amy", "Zed"]);
  });
});
