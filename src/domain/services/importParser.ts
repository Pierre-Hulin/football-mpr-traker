import { parseCsv } from "../../utils/csv";

export interface RosterRowDraft {
  /** Local row key for editing in the review screen. */
  key: string;
  lineNumber: number;
  raw: string;
  jerseyNumber: string;
  displayName: string;
}

export type RowSeverity = "valid" | "warning" | "invalid";

export interface ClassifiedRow extends RosterRowDraft {
  severity: RowSeverity;
  issues: string[];
}

export interface ParseResult {
  validRows: ClassifiedRow[];
  warningRows: ClassifiedRow[];
  invalidRows: ClassifiedRow[];
  /** All rows in original order. */
  rows: ClassifiedRow[];
}

const JERSEY = String.raw`#?\s*(\d{1,3}|0\d)`;
// "12 Jack Smith", "#12 Jack Smith", "12 - Jack Smith", "12. Jack Smith", "12: Jack"
const LEADING = new RegExp(String.raw`^${JERSEY}\s*(?:[-–—.:|)]\s*|\s+)(.+)$`);
// "Jack Smith 12", "Jack Smith #12", "Jack Smith - 12", "Jack Smith (12)"
const TRAILING = new RegExp(String.raw`^(.+?)\s*(?:[-–—:|]\s*|\s+)\(?#?\s*(\d{1,3})\)?$`);

const JERSEY_ALIASES = ["number", "#", "no", "no.", "num", "jersey", "jersey_number", "jersey number", "jersey #", "jersey#"];
const NAME_ALIASES = ["name", "player", "player_name", "player name", "full name", "full_name"];
const FIRST_ALIASES = ["first_name", "first name", "firstname", "first"];
const LAST_ALIASES = ["last_name", "last name", "lastname", "last", "surname"];

let keyCounter = 0;
const nextKey = () => `row-${++keyCounter}`;

function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[\s,;-]+|[\s,;-]+$/g, "").trim();
}

function normalizeJersey(s: string): string {
  return s.replace(/^#/, "").trim();
}

/** Parse a single free-text roster line into jersey + name. */
export function parseRosterLine(line: string): { jerseyNumber: string; displayName: string } {
  const text = line.trim();

  // Delimited (comma / tab / semicolon) lines.
  const delimiter = text.includes("\t") ? "\t" : text.includes(",") ? "," : text.includes(";") ? ";" : null;
  if (delimiter) {
    const cells = text.split(delimiter).map((c) => c.trim()).filter((c) => c.length > 0);
    const jerseyIdx = cells.findIndex((c) => /^#?\d{1,3}$/.test(c));
    if (jerseyIdx >= 0) {
      const name = cells.filter((_, i) => i !== jerseyIdx).join(" ");
      return { jerseyNumber: normalizeJersey(cells[jerseyIdx]), displayName: normalizeName(name) };
    }
    // e.g. "Smith, Jack" with no number: fall through to plain parsing.
  }

  const lead = LEADING.exec(text);
  if (lead) return { jerseyNumber: normalizeJersey(lead[1]), displayName: normalizeName(lead[2]) };

  const trail = TRAILING.exec(text);
  if (trail && /[a-z]/i.test(trail[1])) {
    return { jerseyNumber: normalizeJersey(trail[2]), displayName: normalizeName(trail[1]) };
  }

  if (/^#?\d{1,3}$/.test(text)) return { jerseyNumber: normalizeJersey(text), displayName: "" };
  return { jerseyNumber: "", displayName: normalizeName(text.replace(/,/g, " ")) };
}

function looksLikeHeader(line: string): boolean {
  const cells = line
    .toLowerCase()
    .split(/[\t,;]|\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (cells.length === 0) return false;
  const known = [...JERSEY_ALIASES, ...NAME_ALIASES, ...FIRST_ALIASES, ...LAST_ALIASES];
  return cells.every((c) => known.includes(c)) || /^(#|number|jersey)\s+(name|player)$/i.test(line.trim());
}

/** Validate drafted rows, flagging missing fields and duplicates (within the import and vs. existing roster). */
export function classifyRows(
  rows: RosterRowDraft[],
  existing: { jerseyNumber: string; displayName: string }[] = [],
): ParseResult {
  const jerseyCounts = new Map<string, number>();
  const nameCounts = new Map<string, number>();
  for (const r of rows) {
    const j = r.jerseyNumber.trim();
    const n = r.displayName.trim().toLowerCase();
    if (j) jerseyCounts.set(j, (jerseyCounts.get(j) ?? 0) + 1);
    if (n) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }
  const existingJerseys = new Map(existing.map((p) => [p.jerseyNumber.trim(), p.displayName]));
  const existingNames = new Set(existing.map((p) => p.displayName.trim().toLowerCase()));

  const classified = rows.map((r): ClassifiedRow => {
    const jersey = r.jerseyNumber.trim();
    const name = r.displayName.trim();
    const issues: string[] = [];
    let severity: RowSeverity = "valid";
    if (!name) {
      issues.push("Missing name");
      severity = "invalid";
    }
    if (!jersey) {
      issues.push("Missing jersey number");
      severity = "invalid";
    } else if (jersey.length > 6) {
      issues.push("Jersey number too long");
      severity = "invalid";
    }
    if (severity !== "invalid") {
      if ((jerseyCounts.get(jersey) ?? 0) > 1) issues.push(`Duplicate jersey #${jersey} in import`);
      const existingName = existingJerseys.get(jersey);
      if (existingName) issues.push(`#${jersey} is already assigned to ${existingName}`);
      const lower = name.toLowerCase();
      if ((nameCounts.get(lower) ?? 0) > 1 || existingNames.has(lower)) issues.push("Possible duplicate player");
      if (!/^\d+$/.test(jersey)) issues.push("Jersey is not a number");
      if (issues.length > 0) severity = "warning";
    }
    return { ...r, jerseyNumber: jersey, displayName: name, severity, issues };
  });

  return {
    rows: classified,
    validRows: classified.filter((r) => r.severity === "valid"),
    warningRows: classified.filter((r) => r.severity === "warning"),
    invalidRows: classified.filter((r) => r.severity === "invalid"),
  };
}

/** Parse pasted roster text. Blank lines and an optional header line are ignored. */
export function parseRosterText(
  text: string,
  existing: { jerseyNumber: string; displayName: string }[] = [],
): ParseResult {
  const drafts: RosterRowDraft[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (drafts.length === 0 && looksLikeHeader(trimmed)) return;
    const parsed = parseRosterLine(trimmed);
    drafts.push({ key: nextKey(), lineNumber: index + 1, raw: trimmed, ...parsed });
  });
  return classifyRows(drafts, existing);
}

function findColumn(header: string[], aliases: string[]): number {
  return header.findIndex((h) => aliases.includes(h.trim().toLowerCase()));
}

/** Parse a roster CSV file. Uses header aliases when present, else free-text parsing per row. */
export function parseRosterCsv(
  text: string,
  existing: { jerseyNumber: string; displayName: string }[] = [],
): ParseResult {
  const table = parseCsv(text).filter((row) => row.some((c) => c.trim().length > 0));
  if (table.length === 0) return classifyRows([], existing);

  const header = table[0];
  const jerseyCol = findColumn(header, JERSEY_ALIASES);
  const nameCol = findColumn(header, NAME_ALIASES);
  const firstCol = findColumn(header, FIRST_ALIASES);
  const lastCol = findColumn(header, LAST_ALIASES);
  const hasHeader = jerseyCol >= 0 || nameCol >= 0 || firstCol >= 0 || lastCol >= 0;

  if (!hasHeader) {
    return parseRosterText(table.map((r) => r.join(",")).join("\n"), existing);
  }

  const drafts: RosterRowDraft[] = table.slice(1).map((row, i) => {
    const cell = (idx: number) => (idx >= 0 ? (row[idx] ?? "").trim() : "");
    let name = cell(nameCol);
    if (!name && (firstCol >= 0 || lastCol >= 0)) name = [cell(firstCol), cell(lastCol)].filter(Boolean).join(" ");
    return {
      key: nextKey(),
      lineNumber: i + 2,
      raw: row.join(","),
      jerseyNumber: normalizeJersey(cell(jerseyCol)),
      displayName: normalizeName(name),
    };
  });
  return classifyRows(drafts, existing);
}

export function newBlankRow(): RosterRowDraft {
  return { key: nextKey(), lineNumber: 0, raw: "", jerseyNumber: "", displayName: "" };
}
