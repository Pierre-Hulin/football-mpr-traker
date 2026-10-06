import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { Modal } from "../components/Modal/Modal";
import { useToast } from "../components/Toast/ToastProvider";
import { teamRepository } from "../db/repositories/teamRepository";
import { gameRepository } from "../db/repositories/gameRepository";
import { archiveTeam, deleteTeam, updateTeam } from "../domain/commands/createTeam";
import { getTeamPresets, getTeamRoster } from "../domain/selectors/queries";
import { buildRosterCsv, buildTeamFile } from "../domain/services/exportService";
import { toUserMessage } from "../domain/errors";
import { formatGameDate } from "../utils/dates";
import { shareOrDownload } from "../utils/fileDownload";
import { GameStatusBadge, gameLink } from "./PastGamesPage";

export default function TeamDetailPage() {
  const { teamId = "" } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");

  const data = useLiveQuery(async () => {
    const team = await teamRepository.get(teamId);
    if (!team) return null;
    const [roster, presets, games] = await Promise.all([
      getTeamRoster(teamId),
      getTeamPresets(teamId),
      gameRepository.listByTeam(teamId),
    ]);
    games.sort((a, b) => b.gameDate.localeCompare(a.gameDate) || b.createdAt.localeCompare(a.createdAt));
    return { team, roster, presets, games };
  }, [teamId]);

  if (data === undefined) return <Loading />;
  if (data === null)
    return (
      <div className="page">
        <PageHeader title="Team not found" back="/teams" />
      </div>
    );

  const { team, roster, presets, games } = data;

  const exportTeam = async (kind: "json" | "csv") => {
    try {
      const file = kind === "json" ? await buildTeamFile(team.id) : buildRosterCsv(team, roster);
      await shareOrDownload(file);
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
    }
  };

  const saveEdit = async () => {
    try {
      await updateTeam(team.id, { name, seasonLabel: season });
      setEditOpen(false);
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
    }
  };

  const onArchiveOrDelete = async () => {
    try {
      if (team.archivedAt) {
        await archiveTeam(team.id, false);
        toast.show({ message: "Team restored" });
      } else if (games.length === 0) {
        if (!window.confirm(`Delete ${team.name} and its roster? This cannot be undone.`)) return;
        await deleteTeam(team.id);
        toast.show({ message: "Team deleted" });
        navigate("/teams", { replace: true });
      } else {
        await archiveTeam(team.id, true);
        toast.show({ message: "Team archived" });
      }
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={team.name}
        subtitle={[team.seasonLabel, `${roster.length} players`, team.archivedAt ? "Archived" : null].filter(Boolean).join(" · ")}
        back="/teams"
        actions={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setName(team.name);
              setSeason(team.seasonLabel ?? "");
              setEditOpen(true);
            }}
          >
            Edit
          </button>
        }
      />
      <div className="stack">
        {roster.length > 0 ? (
          <Link className="btn btn-primary btn-lg btn-block" to={`/games/new?team=${team.id}`}>
            START GAME
          </Link>
        ) : (
          <div className="alert alert-info">Add or import the roster before starting a game.</div>
        )}
        <ul className="list">
          <li>
            <Link className="list-item" to={`/teams/${team.id}/roster`}>
              <span className="grow">
                <span className="list-item-title">Roster</span>
                <span className="list-item-sub" style={{ display: "block" }}>
                  {roster.length} players
                </span>
              </span>
              <span className="chev">›</span>
            </Link>
          </li>
          <li>
            <Link className="list-item" to={`/teams/${team.id}/presets`}>
              <span className="grow">
                <span className="list-item-title">Lineup Presets</span>
                <span className="list-item-sub" style={{ display: "block" }}>
                  {presets.length ? presets.map((p) => p.preset.name).join(", ") : "None yet"}
                </span>
              </span>
              <span className="chev">›</span>
            </Link>
          </li>
          <li>
            <Link className="list-item" to={`/teams/${team.id}/settings`}>
              <span className="grow">
                <span className="list-item-title">Team Defaults</span>
                <span className="list-item-sub" style={{ display: "block" }}>
                  Minimum plays, players on field, counting rules
                </span>
              </span>
              <span className="chev">›</span>
            </Link>
          </li>
        </ul>

        <div className="row">
          <button type="button" className="btn btn-secondary grow" onClick={() => void exportTeam("json")}>
            Export team (JSON)
          </button>
          <button type="button" className="btn btn-secondary grow" onClick={() => void exportTeam("csv")}>
            Roster CSV
          </button>
        </div>

        <h2 className="section-title">Recent games</h2>
        {games.length === 0 ? (
          <EmptyState title="No games recorded yet." />
        ) : (
          <ul className="list">
            {games.slice(0, 10).map((g) => (
              <li key={g.id}>
                <Link className="list-item" to={gameLink(g)}>
                  <span className="grow">
                    <span className="list-item-title" style={{ display: "block" }}>
                      {g.opponent ? `vs ${g.opponent}` : g.gameLabel || "Game"}
                    </span>
                    <span className="list-item-sub">{formatGameDate(g.gameDate)}</span>
                  </span>
                  <GameStatusBadge status={g.status} />
                  <span className="chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className="btn btn-danger-outline btn-block" style={{ marginTop: "var(--space-5)" }} onClick={() => void onArchiveOrDelete()}>
          {team.archivedAt ? "Restore team" : games.length === 0 ? "Delete team" : "Archive team"}
        </button>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit team">
        <div className="stack">
          <div className="field">
            <label htmlFor="team-name">Team name</label>
            <input id="team-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="team-season">Season</label>
            <input id="team-season" className="input" value={season} onChange={(e) => setSeason(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions split">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setEditOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => void saveEdit()}>
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
}
