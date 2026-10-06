import { useParams } from "react-router-dom";
import { Loading, PageHeader } from "../components/ui";
import { quarterLabel } from "../domain/enums";
import { getGameSummary } from "../domain/selectors/getGameSummary";
import type { GameView } from "../domain/selectors/getGameState";
import { useGameView } from "../hooks/useActiveGame";

export function QuarterTable({ view }: { view: GameView }) {
  const quarters = getGameSummary(view).quarters;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Player</th>
            {quarters.map((q) => (
              <th key={q} className="num">
                {quarterLabel(q)}
              </th>
            ))}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.player.id}>
              <td style={{ whiteSpace: "nowrap" }}>
                <strong>#{r.player.jerseyNumber}</strong> {r.player.displayName.split(" ")[0]}
              </td>
              {quarters.map((q) => (
                <td key={q} className="num">
                  {r.quarterCounts[q] ?? ""}
                </td>
              ))}
              <td className="num">
                <strong>{r.count}</strong>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <em>Qualifying plays</em>
            </td>
            {quarters.map((q) => (
              <td key={q} className="num">
                <em>{view.playsByQuarter[q] ?? 0}</em>
              </td>
            ))}
            <td className="num">
              <em>{view.qualifyingTotal}</em>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function QuarterBreakdownPage() {
  const { gameId = "" } = useParams();
  const { view } = useGameView(gameId);
  if (view === undefined) return <Loading />;
  if (!view)
    return (
      <div className="page">
        <PageHeader title="Game not found" back="/" />
      </div>
    );
  return (
    <div className="page">
      <PageHeader
        title="Quarter Breakdown"
        subtitle="Qualifying participation per quarter"
        back={view.game.status === "active" ? `/games/${gameId}/live` : `/games/${gameId}/summary`}
      />
      {view.quarterSnapshots.length > 0 && (
        <ul className="list" style={{ marginBottom: "var(--space-4)" }}>
          {view.quarterSnapshots.map((s) => (
            <li key={s.endedQuarter} className="list-item" style={{ minHeight: 44, cursor: "default" }}>
              {quarterLabel(s.endedQuarter)} ended after Play {s.lastPlayNumber}
            </li>
          ))}
        </ul>
      )}
      <QuarterTable view={view} />
    </div>
  );
}
