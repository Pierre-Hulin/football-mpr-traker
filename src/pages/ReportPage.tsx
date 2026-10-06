import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Loading } from "../components/ui";
import { GAME_PLAYER_STATUS_LABELS, quarterLabel } from "../domain/enums";
import { getGameSummary } from "../domain/selectors/getGameSummary";
import { logGameExport } from "../domain/services/exportService";
import { useGameView } from "../hooks/useActiveGame";
import { formatGameDate } from "../utils/dates";

/** Printable MPR record (02_SCREEN_FLOW.md §42). */
export default function ReportPage() {
  const { gameId = "" } = useParams();
  const { data, view } = useGameView(gameId);

  useEffect(() => {
    const prev = document.title;
    if (data) document.title = `MPR Report - ${data.team?.name ?? ""} vs ${data.game.opponent ?? ""} ${data.game.gameDate}`;
    return () => {
      document.title = prev;
    };
  }, [data]);

  if (view === undefined) return <Loading />;
  if (!view || !data) return <div className="page">Game not found</div>;

  const summary = getGameSummary(view);
  const { game } = view;
  const exceptions = data.events.filter((e) => e.type === "player_status_changed" || e.type === "player_activated");
  const name = (id?: string) => {
    const p = id ? view.rowsById.get(id)?.player : undefined;
    return p ? `#${p.jerseyNumber} ${p.displayName}` : "";
  };

  return (
    <div className="report">
      <div className="no-print row" style={{ marginBottom: "var(--space-4)" }}>
        <Link className="btn btn-secondary" to={`/games/${gameId}/summary`}>
          ‹ Back
        </Link>
        <button
          type="button"
          className="btn btn-primary grow"
          onClick={() => {
            void logGameExport(gameId, "print");
            window.print();
          }}
        >
          Print / Save as PDF
        </button>
      </div>

      <h1>Minimum Play Record</h1>
      <div className="report-meta">
        <div>
          <strong>Team:</strong> {data.team?.name}
          {data.team?.seasonLabel ? ` (${data.team.seasonLabel})` : ""}
        </div>
        <div>
          <strong>Opponent:</strong> {game.opponent ?? game.gameLabel ?? "—"}
        </div>
        <div>
          <strong>Date:</strong> {formatGameDate(game.gameDate)}
        </div>
        <div>
          <strong>Minimum required:</strong> {game.requiredPlaysDefault} plays
        </div>
        <div>
          <strong>Players on field:</strong> {game.expectedPlayersOnField}
        </div>
        <div>
          <strong>Status:</strong> {game.status === "completed" ? "Final" : game.status}
        </div>
        <div>
          <strong>Plays recorded:</strong> {summary.totalPlays} ({summary.qualifyingPlays} counting)
        </div>
        <div>
          <strong>Met / short:</strong> {summary.metCount} / {summary.shortCount}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            {summary.quarters.map((q) => (
              <th key={q} className="num">
                {quarterLabel(q)}
              </th>
            ))}
            <th className="num">Total</th>
            <th className="num">Req</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.view.player.id} className={r.finalStatus === "short" ? "short-row" : undefined}>
              <td>{r.view.player.jerseyNumber}</td>
              <td>{r.view.player.displayName}</td>
              {summary.quarters.map((q) => (
                <td key={q} className="num">
                  {r.view.quarterCounts[q] ?? 0}
                </td>
              ))}
              <td className="num">
                <strong>{r.view.count}</strong>
              </td>
              <td className="num">{r.view.required}</td>
              <td>{r.label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {exceptions.length > 0 && (
        <>
          <h2 style={{ fontSize: "1.1rem", marginTop: "var(--space-4)" }}>Status changes</h2>
          <ul>
            {exceptions.map((e) => {
              const after = (e.after as { status?: keyof typeof GAME_PLAYER_STATUS_LABELS } | undefined)?.status;
              return (
                <li key={e.id}>
                  {quarterLabel(e.quarter ?? 1)}, before play {e.playNumber}: {name(e.entityId)} →{" "}
                  {after ? GAME_PLAYER_STATUS_LABELS[after] : "changed"}
                  {e.message ? ` (${e.message})` : ""}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {view.quarterSnapshots.length > 0 && (
        <p style={{ marginTop: "var(--space-3)" }}>
          {view.quarterSnapshots.map((s) => `${quarterLabel(s.endedQuarter)} ended after play ${s.lastPlayNumber}`).join(" · ")}
        </p>
      )}

      <div className="signature-lines">
        <div>MPR counter signature</div>
        <div>Coach signature</div>
      </div>
    </div>
  );
}
