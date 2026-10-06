import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, Loading, NumberStepper, PageHeader, Switch, TextField } from "../components/ui";
import { Modal } from "../components/Modal/Modal";
import { useToast } from "../components/Toast/ToastProvider";
import { deleteDraftGame, updateDraftGame } from "../domain/commands/createGame";
import { startGame } from "../domain/commands/startGame";
import { updateGamePlayerStatus } from "../domain/commands/updateGamePlayerStatus";
import { GAME_PLAYER_STATUSES, GAME_PLAYER_STATUS_LABELS, type GamePlayerStatus } from "../domain/enums";
import { isDomainError, toUserMessage } from "../domain/errors";
import { useGameData } from "../hooks/useActiveGame";
import { sortPlayers } from "../utils/sort";
import { todayLocal } from "../utils/dates";

export interface RulesValue {
  requiredPlays: number;
  expectedPlayersOnField: number;
  mprDeadlineQuarter: number;
  countsSpecialTeams: boolean;
  countsPat: boolean;
  countsAcceptedPenaltyPlays: boolean;
}

/** Deadline + counting toggles, shared by game setup and team defaults. */
export function RulesFields({
  value,
  onChange,
  open,
}: {
  value: RulesValue;
  onChange: (v: RulesValue) => void;
  open?: boolean;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="deadline">MPR deadline</label>
        <select
          id="deadline"
          className="select"
          value={value.mprDeadlineQuarter}
          onChange={(e) => onChange({ ...value, mprDeadlineQuarter: Number(e.target.value) })}
        >
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>
              End of Q{q}
              {q === 2 ? " (halftime)" : q === 4 ? " (end of game)" : ""}
            </option>
          ))}
        </select>
        <span className="hint">Players should reach the minimum by this point. Used for risk warnings.</span>
      </div>
      <details className="disclosure card" open={open}>
        <summary>MPR counting rules</summary>
        <div className="stack">
          <Switch
            label="Special teams plays count"
            checked={value.countsSpecialTeams}
            onChange={(v) => onChange({ ...value, countsSpecialTeams: v })}
          />
          <Switch label="PAT plays count" checked={value.countsPat} onChange={(v) => onChange({ ...value, countsPat: v })} />
          <Switch
            label="Accepted-penalty plays count"
            checked={value.countsAcceptedPenaltyPlays}
            onChange={(v) => onChange({ ...value, countsAcceptedPenaltyPlays: v })}
          />
          <p className="muted small" style={{ margin: 0 }}>
            These apply when you use the record menu (⋯ MORE) for special teams, PAT or penalty plays.
          </p>
        </div>
      </details>
    </>
  );
}

type Step = "rules" | "players" | "review";

export default function GameSetupPage() {
  const { gameId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const step = (params.get("step") as Step) || "rules";
  const setStep = (s: Step) => setParams({ step: s });
  const data = useGameData(gameId);
  const navigate = useNavigate();
  const toast = useToast();

  const [details, setDetails] = useState<{ opponent: string; gameDate: string } | null>(null);
  const [rules, setRules] = useState<RulesValue | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!data || rules) return;
    const g = data.game;
    setDetails({ opponent: g.opponent ?? g.gameLabel ?? "", gameDate: g.gameDate || todayLocal() });
    setRules({
      requiredPlays: g.requiredPlaysDefault,
      expectedPlayersOnField: g.expectedPlayersOnField,
      mprDeadlineQuarter: g.mprDeadlineQuarter ?? 4,
      countsSpecialTeams: g.countsSpecialTeams,
      countsPat: g.countsPat,
      countsAcceptedPenaltyPlays: g.countsAcceptedPenaltyPlays,
    });
  }, [data, rules]);

  const roster = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.players.map((p) => [p.id, p]));
    return sortPlayers(
      data.gamePlayers
        .map((gp) => ({ gp, player: byId.get(gp.playerId) }))
        .filter((x): x is { gp: typeof x.gp; player: NonNullable<typeof x.player> } => !!x.player)
        .map((x) => ({ ...x, jerseyNumber: x.player.jerseyNumber, displayName: x.player.displayName })),
    );
  }, [data]);

  if (data === undefined || (data && (!rules || !details))) return <Loading />;
  if (data === null || !rules || !details)
    return (
      <div className="page">
        <PageHeader title="Game not found" back="/" />
      </div>
    );
  if (data.game.status === "active") return <Navigate to={`/games/${gameId}/live`} replace />;
  if (data.game.status !== "draft") return <Navigate to={`/games/${gameId}/summary`} replace />;

  const teamName = data.team?.name ?? "Team";
  const counts = GAME_PLAYER_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: roster.filter((r) => r.gp.status === s).length }),
    {} as Record<GamePlayerStatus, number>,
  );

  const saveRules = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateDraftGame(gameId, { ...rules, opponent: details.opponent, gameDate: details.gameDate });
      setStep("players");
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (playerId: string, status: GamePlayerStatus) =>
    updateGamePlayerStatus({ gameId, playerId, status }).catch((err) =>
      toast.show({ message: toUserMessage(err), tone: "error" }),
    );

  const markAllActive = async () => {
    for (const r of roster) if (r.gp.status !== "active") await setStatus(r.player.id, "active");
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await startGame(gameId);
      navigate(`/games/${gameId}/live`, { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
      if (isDomainError(err, "GAME_ALREADY_ACTIVE")) {
        toast.show({ message: "Another game is already in progress.", tone: "error" });
      }
      setBusy(false);
    }
  };

  const title = `${teamName}${details.opponent ? ` vs ${details.opponent}` : ""}`;
  const stepNum = step === "rules" ? 1 : step === "players" ? 2 : 3;

  return (
    <div className="page">
      <PageHeader
        title={step === "rules" ? "Game details" : step === "players" ? "Player availability" : "Review game"}
        subtitle={`Step ${stepNum} of 3 · ${title}`}
        back={step === "rules" ? "/games/new" : true}
      />

      {step === "rules" && (
        <div className="stack">
          <TextField
            label="Opponent / game label"
            value={details.opponent}
            onChange={(v) => setDetails({ ...details, opponent: v })}
            placeholder="e.g. Wildcats"
            hint="Optional but recommended"
            autoComplete="off"
          />
          <TextField
            label="Date"
            type="date"
            value={details.gameDate}
            onChange={(v) => setDetails({ ...details, gameDate: v })}
          />
          <NumberStepper
            label="Minimum required plays"
            value={rules.requiredPlays}
            onChange={(n) => setRules({ ...rules, requiredPlays: n })}
            max={200}
            hint="Each active player needs at least this many qualifying plays."
          />
          <NumberStepper
            label="Players on field"
            value={rules.expectedPlayersOnField}
            onChange={(n) => setRules({ ...rules, expectedPlayersOnField: n })}
            min={1}
            max={30}
            hint="You'll be warned if a play is recorded with a different number."
          />
          <RulesFields value={rules} onChange={setRules} />
          {error && <p className="alert alert-danger">{error}</p>}
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void saveRules()} disabled={busy} data-testid="next-availability">
            NEXT: PLAYER AVAILABILITY
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setConfirmDelete(true)}>
            Discard this draft
          </button>
        </div>
      )}

      {step === "players" && (
        <div className="stack">
          <div className="row-between">
            <span className="muted" style={{ fontWeight: 700 }}>
              {counts.active} active · {roster.length - counts.active} not active
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void markAllActive()}>
              Mark all active
            </button>
          </div>
          {roster.length > 20 && (
            <input
              className="input"
              type="search"
              placeholder="Search name or number"
              aria-label="Search players"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {roster.length === 0 ? (
            <EmptyState title="No players on this team">
              <Link className="btn btn-primary" to={`/teams/${data.game.teamId}/roster`}>
                Add players
              </Link>
            </EmptyState>
          ) : (
            <ul className="list">
              {roster
                .filter(
                  (r) =>
                    !search.trim() ||
                    r.player.displayName.toLowerCase().includes(search.toLowerCase()) ||
                    r.player.jerseyNumber === search.trim(),
                )
                .map((r) => (
                  <li key={r.player.id} className="list-item" style={{ cursor: "default" }}>
                    <span className="jersey" style={{ fontSize: "1.3rem" }}>
                      #{r.player.jerseyNumber}
                    </span>
                    <span className="grow list-item-title" style={{ color: r.gp.status === "active" ? undefined : "var(--text-muted)" }}>
                      {r.player.displayName}
                    </span>
                    <select
                      className="select status-select"
                      style={{ width: "auto" }}
                      aria-label={`Status for #${r.player.jerseyNumber} ${r.player.displayName}`}
                      value={r.gp.status}
                      onChange={(e) => void setStatus(r.player.id, e.target.value as GamePlayerStatus)}
                    >
                      {GAME_PLAYER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {GAME_PLAYER_STATUS_LABELS[s].toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
            </ul>
          )}
          <p className="muted small">
            Late players can be activated during the game. Injured, exempt and ineligible players stay on the record but are
            excluded from MPR.
          </p>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setStep("review")} data-testid="review-game">
            REVIEW GAME
          </button>
        </div>
      )}

      {step === "review" && (
        <div className="stack">
          <div className="card">
            <div style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: "var(--space-2)" }}>{title}</div>
            <table className="table">
              <tbody>
                <tr>
                  <td>Rostered</td>
                  <td className="num">{roster.length}</td>
                </tr>
                <tr>
                  <td>Active</td>
                  <td className="num">
                    <strong>{counts.active}</strong>
                  </td>
                </tr>
                {GAME_PLAYER_STATUSES.filter((s) => s !== "active" && counts[s] > 0).map((s) => (
                  <tr key={s}>
                    <td>{GAME_PLAYER_STATUS_LABELS[s]}</td>
                    <td className="num">{counts[s]}</td>
                  </tr>
                ))}
                <tr>
                  <td>Minimum</td>
                  <td className="num">{data.game.requiredPlaysDefault} plays</td>
                </tr>
                <tr>
                  <td>On field</td>
                  <td className="num">{data.game.expectedPlayersOnField}</td>
                </tr>
                <tr>
                  <td>Deadline</td>
                  <td className="num">End Q{data.game.mprDeadlineQuarter ?? 4}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {counts.active === 0 && <p className="alert alert-danger">No active players. Mark at least one player active.</p>}
          {counts.active > 0 && counts.active + counts.late < data.game.expectedPlayersOnField && (
            <p className="alert alert-warn">
              Fewer available players ({counts.active + counts.late}) than players on field ({data.game.expectedPlayersOnField}).
            </p>
          )}
          {(() => {
            const seen = new Map<string, number>();
            roster.forEach((r) => seen.set(r.player.jerseyNumber, (seen.get(r.player.jerseyNumber) ?? 0) + 1));
            const dups = [...seen].filter(([, n]) => n > 1).map(([j]) => `#${j}`);
            return dups.length ? <p className="alert alert-warn">Duplicate jersey numbers: {dups.join(", ")}</p> : null;
          })()}
          {data.presets.length === 0 && (
            <p className="alert alert-info">
              No lineup presets yet. That's fine — you can tap players IN one by one. <Link to={`/teams/${data.game.teamId}/presets`}>Create presets</Link>
            </p>
          )}
          {error && <p className="alert alert-danger">{error}</p>}
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            disabled={busy || counts.active === 0}
            onClick={() => void start()}
            data-testid="start-game"
          >
            START GAME
          </button>
        </div>
      )}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Discard this draft game?">
        <p>Nothing has been recorded yet.</p>
        <div className="modal-actions split">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger btn-lg"
            onClick={() =>
              void deleteDraftGame(gameId).then(() => navigate("/", { replace: true }), (e) => toast.show({ message: toUserMessage(e), tone: "error" }))
            }
          >
            Discard
          </button>
        </div>
      </Modal>
    </div>
  );
}
