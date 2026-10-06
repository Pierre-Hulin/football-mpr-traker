import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { useToast } from "../components/Toast/ToastProvider";
import { gameRepository } from "../db/repositories/gameRepository";
import { createGame } from "../domain/commands/createGame";
import { gameTitle, listTeamsWithStats } from "../domain/selectors/queries";
import { quarterLabel } from "../domain/enums";
import { toUserMessage } from "../domain/errors";
import { useActiveGame } from "../hooks/useActiveGame";

export default function NewGamePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const active = useActiveGame();
  const teams = useLiveQuery(() => listTeamsWithStats(), []);
  const [selected, setSelected] = useState<string | null>(params.get("team"));
  const [busy, setBusy] = useState(false);

  const usable = useMemo(() => teams?.filter((t) => !t.team.archivedAt) ?? [], [teams]);

  useEffect(() => {
    if (!selected && usable.length === 1) setSelected(usable[0].team.id);
  }, [selected, usable]);

  if (active === undefined || teams === undefined) return <Loading />;

  if (active) {
    return (
      <div className="page">
        <PageHeader title="New Game" back="/" />
        <div className="card stack">
          <h2>A game is already in progress.</h2>
          <p className="muted">
            {gameTitle(active.game, active.team)} · {quarterLabel(active.game.currentQuarter)} · Next play{" "}
            {active.game.nextPlayNumber}
          </p>
          <Link className="btn btn-primary btn-lg btn-block" to={`/games/${active.game.id}/live`}>
            RESUME CURRENT GAME
          </Link>
          <p className="muted small">To start a new game, open the current game's menu (⋯) and choose End game or Abandon game.</p>
        </div>
      </div>
    );
  }

  const start = async () => {
    if (!selected) return;
    const item = usable.find((t) => t.team.id === selected);
    if (item && item.rosterCount === 0) {
      navigate(`/teams/${selected}/roster`);
      return;
    }
    setBusy(true);
    try {
      // Reuse an unfinished draft for this team rather than piling up drafts.
      const drafts = (await gameRepository.listByTeam(selected)).filter((g) => g.status === "draft");
      drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const game = drafts[0] ?? (await createGame({ teamId: selected }));
      navigate(`/games/${game.id}/setup?step=rules`);
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="New Game" subtitle="Select team" back="/" />
      {usable.length === 0 ? (
        <EmptyState title="No teams yet">
          <p>Create a team to begin tracking minimum plays.</p>
          <Link className="btn btn-primary btn-lg" to="/teams/new">
            + Create Team
          </Link>
        </EmptyState>
      ) : (
        <div className="stack">
          <ul className="list" role="radiogroup" aria-label="Team">
            {usable.map((t) => {
              const on = selected === t.team.id;
              return (
                <li key={t.team.id}>
                  <button
                    type="button"
                    className="list-item"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSelected(t.team.id)}
                    style={on ? { background: "var(--row-in-bg)", boxShadow: "inset 6px 0 0 var(--row-in-bar)" } : undefined}
                  >
                    <span className="grow">
                      <span className="list-item-title" style={{ display: "block" }}>
                        {t.team.name}
                      </span>
                      <span className="list-item-sub">
                        {[t.team.seasonLabel, `${t.rosterCount} players`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ fontSize: "1.3rem" }}>
                      {on ? "●" : "○"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            disabled={!selected || busy}
            onClick={() => void start()}
            data-testid="continue-team"
          >
            NEXT: GAME DETAILS
          </button>
          <Link className="btn btn-ghost btn-block" to="/teams/new">
            + Create Team
          </Link>
        </div>
      )}
    </div>
  );
}
