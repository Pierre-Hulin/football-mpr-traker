import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { listGames } from "../domain/selectors/queries";
import type { Game } from "../domain/models";
import type { GameStatus } from "../domain/enums";
import { formatGameDate } from "../utils/dates";

export function gameLink(game: Game): string {
  if (game.status === "draft") return `/games/${game.id}/setup`;
  if (game.status === "active") return `/games/${game.id}/live`;
  return `/games/${game.id}/summary`;
}

export function GameStatusBadge({ status }: { status: GameStatus }) {
  const label = { draft: "Draft", active: "In progress", completed: "Completed", abandoned: "Abandoned" }[status];
  const cls = status === "draft" ? "badge-draft" : status === "active" ? "badge-active" : "badge-neutral";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function PastGamesPage() {
  const games = useLiveQuery(() => listGames(), []);
  if (!games) return <Loading />;

  const byTeam = new Map<string, typeof games>();
  for (const g of games) {
    const key = g.team?.name ?? "Unknown team";
    byTeam.set(key, [...(byTeam.get(key) ?? []), g]);
  }

  return (
    <div className="page">
      <PageHeader title="Past Games" back="/" />
      {games.length === 0 ? (
        <EmptyState title="No games recorded yet." />
      ) : (
        [...byTeam].map(([team, list]) => (
          <section key={team}>
            <h2 className="section-title">{team}</h2>
            <ul className="list">
              {list.map(({ game, playCount }) => (
                <li key={game.id}>
                  <Link className="list-item" to={gameLink(game)}>
                    <span className="grow">
                      <span className="list-item-sub" style={{ display: "block" }}>
                        {formatGameDate(game.gameDate)}
                      </span>
                      <span className="list-item-title" style={{ display: "block" }}>
                        {game.opponent ? `vs ${game.opponent}` : game.gameLabel || "Game"}
                      </span>
                      <span className="list-item-sub">{playCount} plays</span>
                    </span>
                    <GameStatusBadge status={game.status} />
                    <span className="chev">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
