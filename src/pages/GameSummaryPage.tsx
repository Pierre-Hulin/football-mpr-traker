import { Link, Navigate, useParams } from "react-router-dom";
import { Loading, PageHeader } from "../components/ui";
import { UpdateBanner } from "../components/UpdateBanner";
import { useToast } from "../components/Toast/ToastProvider";
import { getGameSummary } from "../domain/selectors/getGameSummary";
import { gameTitle } from "../domain/selectors/queries";
import { buildPlaysCsv, buildSummaryCsv, logGameExport } from "../domain/services/exportService";
import { buildBackupFile } from "../domain/services/backupService";
import { toUserMessage } from "../domain/errors";
import { useGameView } from "../hooks/useActiveGame";
import { formatGameDate } from "../utils/dates";
import { canShareFiles, downloadFile, shareOrDownload, safeFilename, type ExportFile } from "../utils/fileDownload";

export default function GameSummaryPage() {
  const { gameId = "" } = useParams();
  const { data, view } = useGameView(gameId);
  const toast = useToast();

  if (view === undefined) return <Loading />;
  if (!view || !data)
    return (
      <div className="page">
        <PageHeader title="Game not found" back="/" />
      </div>
    );
  if (view.game.status === "draft") return <Navigate to={`/games/${gameId}/setup`} replace />;

  const summary = getGameSummary(view);
  const { game } = view;
  const share = canShareFiles();

  const exportFile = async (make: () => ExportFile | Promise<ExportFile>, format: string, viaShare: boolean) => {
    try {
      const file = await make();
      if (viaShare) await shareOrDownload(file);
      else downloadFile(file);
      await logGameExport(gameId, format);
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
    }
  };

  const exportButtons = (label: string, make: () => ExportFile | Promise<ExportFile>, format: string, testId?: string) => (
    <div className="row" style={{ flexWrap: "nowrap" }}>
      <button type="button" className="btn btn-secondary grow" onClick={() => void exportFile(make, format, false)} data-testid={testId}>
        ↓ {label}
      </button>
      {share && (
        <button type="button" className="btn btn-secondary" onClick={() => void exportFile(make, format, true)} aria-label={`Share ${label}`}>
          Share
        </button>
      )}
    </div>
  );

  return (
    <div className="page">
      <UpdateBanner />
      <PageHeader
        title={gameTitle(game, data.team)}
        subtitle={`${game.status === "active" ? "Game in progress" : game.status === "abandoned" ? "Abandoned" : "Final MPR Summary"} · ${formatGameDate(game.gameDate)} · ${summary.totalPlays} recorded plays`}
        back="/"
      />
      {game.status === "active" && (
        <Link className="btn btn-primary btn-lg btn-block" to={`/games/${gameId}/live`} style={{ marginBottom: "var(--space-4)" }}>
          BACK TO GAME
        </Link>
      )}

      <div className="stat-grid" data-testid="summary-stats">
        <div className="stat">
          <div className="stat-value">{summary.activeCount}</div>
          <div className="stat-label">Active players</div>
        </div>
        <div className="stat" style={{ borderColor: "var(--ok)" }}>
          <div className="stat-value" style={{ color: "var(--ok)" }}>
            {summary.metCount}
          </div>
          <div className="stat-label">✓ Met MPR</div>
        </div>
        <div className="stat" style={summary.shortCount ? { borderColor: "var(--danger)", borderWidth: 2 } : undefined}>
          <div className="stat-value" style={summary.shortCount ? { color: "var(--danger)" } : undefined}>
            {summary.shortCount}
          </div>
          <div className="stat-label">⚠ Short</div>
        </div>
        <div className="stat">
          <div className="stat-value">{summary.excludedCount}</div>
          <div className="stat-label">Injured / exempt / out</div>
        </div>
      </div>

      <h2 className="section-title">Players · minimum {game.requiredPlaysDefault}</h2>
      <div className="table-wrap">
        <table className="table" data-testid="summary-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">Plays</th>
              <th className="num">Req</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.view.player.id} style={r.finalStatus === "short" ? { background: "var(--danger-bg)" } : undefined}>
                <td>
                  <strong>{r.view.player.jerseyNumber}</strong>
                </td>
                <td>{r.view.player.displayName}</td>
                <td className="num">
                  <strong>{r.view.count}</strong>
                </td>
                <td className="num">{r.view.required}</td>
                <td style={{ fontWeight: 700, whiteSpace: "nowrap", color: r.finalStatus === "met" ? "var(--ok)" : r.finalStatus === "short" ? "var(--danger)" : "var(--text-muted)" }}>
                  {r.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        {summary.qualifyingPlays} counting · {summary.nonCountingPlays} non-counting · {summary.voidedPlays} voided
      </p>

      <h2 className="section-title">Export</h2>
      <div className="stack">
        {exportButtons("Summary CSV", () => buildSummaryCsv(data, view), "summary_csv", "export-summary")}
        {exportButtons("Full play ledger CSV", () => buildPlaysCsv(data, view), "plays_csv")}
        {exportButtons(
          "Game backup (JSON)",
          () => buildBackupFile(gameId, safeFilename(`mpr-game-${game.opponent ?? game.gameDate}`)),
          "json",
        )}
        <Link className="btn btn-secondary btn-block" to={`/games/${gameId}/report`}>
          Printable report
        </Link>
      </div>

      <h2 className="section-title">Review</h2>
      <ul className="list">
        <li>
          <Link className="list-item" to={`/games/${gameId}/quarters`}>
            <span className="grow list-item-title">Quarter breakdown</span>
            <span className="chev">›</span>
          </Link>
        </li>
        <li>
          <Link className="list-item" to={`/games/${gameId}/history`}>
            <span className="grow list-item-title">Play history</span>
            <span className="chev">›</span>
          </Link>
        </li>
      </ul>
      <Link className="btn btn-primary btn-lg btn-block" to="/" style={{ marginTop: "var(--space-5)" }}>
        Back to Home
      </Link>
    </div>
  );
}
