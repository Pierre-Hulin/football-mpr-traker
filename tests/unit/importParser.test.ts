import { describe, expect, it } from "vitest";
import { parseRosterCsv, parseRosterLine, parseRosterText } from "../../src/domain/services/importParser";

describe("parseRosterLine", () => {
  it.each([
    ["12 Jack Smith", "12", "Jack Smith"],
    ["12,Jack Smith", "12", "Jack Smith"],
    ["12 - Jack Smith", "12", "Jack Smith"],
    ["#12 Jack Smith", "12", "Jack Smith"],
    ["12. Jack Smith", "12", "Jack Smith"],
    ["12\tJack Smith", "12", "Jack Smith"],
    ["Jack Smith 12", "12", "Jack Smith"],
    ["Jack Smith #12", "12", "Jack Smith"],
    ["Jack Smith, 12", "12", "Jack Smith"],
    ["00 Zero Hero", "00", "Zero Hero"],
    ["  7   Max   O'Neil  ", "7", "Max O'Neil"],
  ])("parses %j", (line, jersey, name) => {
    expect(parseRosterLine(line)).toEqual({ jerseyNumber: jersey, displayName: name });
  });

  it("flags a missing jersey", () => {
    expect(parseRosterLine("Ben Clark")).toEqual({ jerseyNumber: "", displayName: "Ben Clark" });
  });
});

describe("parseRosterText", () => {
  it("ignores blank lines and returns grouped rows", () => {
    const r = parseRosterText("12 Jack Smith\n\n18 Max Jones\n   \n42 Ben Clark\n");
    expect(r.validRows).toHaveLength(3);
    expect(r.warningRows).toHaveLength(0);
    expect(r.invalidRows).toHaveLength(0);
  });

  it("skips a header line", () => {
    const r = parseRosterText("Number, Name\n12, Jack Smith");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].displayName).toBe("Jack Smith");
  });

  it("flags duplicate jersey numbers as warnings", () => {
    const r = parseRosterText("12 Jack Smith\n12 Max Jones");
    expect(r.warningRows).toHaveLength(2);
    expect(r.warningRows[0].issues.join()).toMatch(/Duplicate jersey/);
  });

  it("flags jerseys already on the roster", () => {
    const r = parseRosterText("12 Jack Smith", [{ jerseyNumber: "12", displayName: "Existing Kid" }]);
    expect(r.warningRows[0].issues.join()).toMatch(/Existing Kid/);
  });

  it("marks missing fields invalid", () => {
    const r = parseRosterText("Ben Clark\n44");
    expect(r.invalidRows).toHaveLength(2);
    expect(r.invalidRows[0].issues).toContain("Missing jersey number");
    expect(r.invalidRows[1].issues).toContain("Missing name");
  });
});

describe("parseRosterCsv", () => {
  it("uses header aliases", () => {
    const csv = "Jersey Number,Player Name\n12,Jack Smith\n18,\"Jones, Max\"\n";
    const r = parseRosterCsv(csv);
    expect(r.rows.map((x) => [x.jerseyNumber, x.displayName])).toEqual([
      ["12", "Jack Smith"],
      ["18", "Jones, Max"],
    ]);
  });

  it("supports # and first/last name columns", () => {
    const r = parseRosterCsv("#,first_name,last_name\n7,Ben,Clark\n");
    expect(r.rows[0]).toMatchObject({ jerseyNumber: "7", displayName: "Ben Clark" });
  });

  it("falls back to free-text parsing without a header", () => {
    const r = parseRosterCsv("12,Jack Smith\n18,Max Jones\n");
    expect(r.validRows).toHaveLength(2);
  });

  it("skips blank rows and reports missing values", () => {
    const r = parseRosterCsv("number,name\n12,Jack\n,,\n,Nobody\n");
    expect(r.rows).toHaveLength(2);
    expect(r.invalidRows).toHaveLength(1);
  });
});
