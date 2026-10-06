import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Loading, PageHeader } from "../components/ui";
import { useToast } from "../components/Toast/ToastProvider";
import { teamRepository } from "../db/repositories/teamRepository";
import { importRoster } from "../domain/commands/importRoster";
import { getTeamRoster } from "../domain/selectors/queries";
import {
  classifyRows,
  newBlankRow,
  parseRosterCsv,
  parseRosterText,
  type RosterRowDraft,
} from "../domain/services/importParser";
import { parseTeamFile } from "../domain/services/backupService";
import { toUserMessage } from "../domain/errors";
import type { ImportRecord } from "../domain/models";
import { readFileAsText } from "../utils/fileDownload";

type Method = "paste" | "csv" | "json";

const EXAMPLE = "12 Jack Smith\n18 Max Jones\n42 Ben Clark";

export default function RosterImportPage() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [method, setMethod] = useState<Method>("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<RosterRowDraft[] | null>(null);
  const [source, setSource] = useState<{ kind: ImportRecord["kind"]; fileName?: string }>({ kind: "roster_text" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const data = useLiveQuery(async () => {
    const team = await teamRepository.get(teamId);
    return team ? { team, existing: await getTeamRoster(teamId) } : null;
  }, [teamId]);

  const classified = useMemo(() => (rows ? classifyRows(rows, data?.existing ?? []) : null), [rows, data]);

  if (data === undefined) return <Loading />;
  if (data === null)
    return (
      <div className="page">
        <PageHeader title="Team not found" back="/teams" />
      </div>
    );

  const parsePaste = () => {
    const result = parseRosterText(text, data.existing);
    if (result.rows.length === 0) {
      setError("No players found. Paste one player per line, like “12 Jack Smith”.");
      return;
    }
    setError(null);
    setSource({ kind: "roster_text" });
    setRows(result.rows);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const content = await readFileAsText(file);
      if (method === "json") {
        const teamFile = parseTeamFile(content);
        setRows(
          teamFile.players
            .filter((p) => p.activeOnTeam)
            .map((p) => ({ ...newBlankRow(), jerseyNumber: p.jerseyNumber, displayName: p.displayName, raw: p.displayName })),
        );
        setSource({ kind: "roster_json", fileName: file.name });
      } else {
        const result = parseRosterCsv(content, data.existing);
        if (result.rows.length === 0) throw new Error("No players found in this file.");
        setRows(result.rows);
        setSource({ kind: "roster_csv", fileName: file.name });
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateRow = (key: string, patch: Partial<RosterRowDraft>) =>
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  const removeRow = (key: string) => setRows((rs) => rs?.filter((r) => r.key !== key) ?? null);

  const importable = classified ? classified.rows.filter((r) => r.severity !== "invalid") : [];
  const invalidCount = classified?.invalidRows.length ?? 0;

  const doImport = async () => {
    if (!classified || importable.length === 0) return;
    setBusy(true);
    try {
      await importRoster({
        teamId,
        rows: importable.map((r) => ({ jerseyNumber: r.jerseyNumber, displayName: r.displayName })),
        kind: source.kind,
        fileName: source.fileName,
        rowsDetected: classified.rows.length,
        warnings: classified.warningRows.flatMap((r) => r.issues.map((i) => `#${r.jerseyNumber} ${r.displayName}: ${i}`)),
      });
      toast.show({ message: `Imported ${importable.length} players` });
      navigate(`/teams/${teamId}/roster`, { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
      setBusy(false);
    }
  };

  if (classified) {
    return (
      <div className="page">
        <PageHeader title="Review import" subtitle={data.team.name} back={undefined} />
        <p className="muted">Check each player. Fix or remove rows marked “!” before importing.</p>
        <ul className="list" data-testid="review-list">
          {classified.rows.map((r) => (
            <li key={r.key} style={{ padding: "var(--space-2) var(--space-3)" }}>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <span
                  aria-label={r.severity === "valid" ? "OK" : r.severity === "warning" ? "Warning" : "Needs fixing"}
                  style={{
                    fontWeight: 900,
                    width: "1.5rem",
                    textAlign: "center",
                    color: r.severity === "valid" ? "var(--ok)" : r.severity === "warning" ? "var(--warn)" : "var(--danger)",
                  }}
                >
                  {r.severity === "valid" ? "✓" : "!"}
                </span>
                <input
                  className="input"
                  style={{ width: "4.5rem", flex: "none", fontWeight: 800 }}
                  inputMode="numeric"
                  aria-label="Jersey number"
                  placeholder="#"
                  value={r.jerseyNumber}
                  onChange={(e) => updateRow(r.key, { jerseyNumber: e.target.value })}
                />
                <input
                  className="input grow"
                  aria-label="Player name"
                  placeholder="Name"
                  value={r.displayName}
                  onChange={(e) => updateRow(r.key, { displayName: e.target.value })}
                />
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove row ${r.displayName}`} onClick={() => removeRow(r.key)}>
                  ✕
                </button>
              </div>
              {r.issues.length > 0 && (
                <div
                  className="small"
                  style={{ marginLeft: "2rem", color: r.severity === "invalid" ? "var(--danger)" : "var(--warn)", fontWeight: 600 }}
                >
                  {r.issues.join(" · ")}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="stack" style={{ marginTop: "var(--space-3)" }}>
          <button type="button" className="btn btn-secondary" onClick={() => setRows((rs) => [...(rs ?? []), newBlankRow()])}>
            + Add row
          </button>
          {invalidCount > 0 && (
            <p className="alert alert-warn">
              {invalidCount} {invalidCount === 1 ? "row needs" : "rows need"} fixing and will be skipped.
            </p>
          )}
          {error && <p className="alert alert-danger">{error}</p>}
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            disabled={busy || importable.length === 0}
            onClick={() => void doImport()}
            data-testid="confirm-import"
          >
            IMPORT {importable.length} {importable.length === 1 ? "PLAYER" : "PLAYERS"}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setRows(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Import Roster" subtitle={data.team.name} back={`/teams/${teamId}/roster`} />
      <div className="segmented" role="tablist" aria-label="Import method" style={{ marginBottom: "var(--space-4)" }}>
        {(
          [
            ["paste", "Paste list"],
            ["csv", "CSV file"],
            ["json", "Team file"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            onClick={() => {
              setMethod(m);
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {method === "paste" ? (
        <div className="stack">
          <div className="field">
            <label htmlFor="roster-text">One player per line: number and name</label>
            <textarea
              id="roster-text"
              className="textarea"
              placeholder={EXAMPLE}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              spellCheck={false}
            />
            <span className="hint">Also accepts “12, Jack Smith”, “12 - Jack Smith” or “Jack Smith 12”.</span>
          </div>
          {error && <p className="alert alert-danger">{error}</p>}
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={parsePaste}
            disabled={!text.trim()}
            data-testid="parse-roster"
          >
            PARSE ROSTER
          </button>
        </div>
      ) : (
        <div className="stack">
          <p className="muted">
            {method === "csv"
              ? "Choose a CSV with columns like “Number” and “Name” (or First/Last name). The file is read on this device — nothing is uploaded."
              : "Choose a team file (.json) exported from this app on another device. Its players will be added to this team."}
          </p>
          {error && <p className="alert alert-danger">{error}</p>}
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => fileRef.current?.click()}>
            Choose file
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={method === "csv" ? ".csv,text/csv,text/plain" : ".json,application/json"}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );
}
