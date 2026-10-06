import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { Modal } from "../components/Modal/Modal";
import { useToast } from "../components/Toast/ToastProvider";
import { teamRepository } from "../db/repositories/teamRepository";
import { activatePlayer, createPlayer, deactivatePlayer, updatePlayer } from "../domain/commands/createPlayer";
import { getTeamRoster } from "../domain/selectors/queries";
import { isDomainError, toUserMessage } from "../domain/errors";
import type { Player } from "../domain/models";

interface FormState {
  player?: Player;
  jersey: string;
  name: string;
  notes: string;
}

export default function RosterPage() {
  const { teamId = "" } = useParams();
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);

  const data = useLiveQuery(async () => {
    const team = await teamRepository.get(teamId);
    if (!team) return null;
    return { team, players: await getTeamRoster(teamId, true) };
  }, [teamId]);

  if (data === undefined) return <Loading />;
  if (data === null)
    return (
      <div className="page">
        <PageHeader title="Team not found" back="/teams" />
      </div>
    );

  const active = data.players.filter((p) => p.activeOnTeam);
  const removed = data.players.filter((p) => !p.activeOnTeam);

  const openNew = () => {
    setError(null);
    setDuplicate(null);
    setForm({ jersey: "", name: "", notes: "" });
  };
  const openEdit = (player: Player) => {
    setError(null);
    setDuplicate(null);
    setForm({ player, jersey: player.jerseyNumber, name: player.displayName, notes: player.notes ?? "" });
  };

  const save = async (allowDuplicateJersey = false, addAnother = false) => {
    if (!form) return;
    const input = { jerseyNumber: form.jersey, displayName: form.name, notes: form.notes, allowDuplicateJersey };
    try {
      if (form.player) await updatePlayer(form.player.id, input);
      else await createPlayer(teamId, input);
      setDuplicate(null);
      if (addAnother) {
        toast.show({ message: `Added #${form.jersey.trim()} ${form.name.trim()}` });
        setForm({ jersey: "", name: "", notes: "" });
        document.getElementById("player-jersey")?.focus();
      } else {
        setForm(null);
      }
    } catch (err) {
      if (isDomainError(err, "DUPLICATE_JERSEY")) setDuplicate(err.message);
      else setError(toUserMessage(err));
    }
  };

  return (
    <div className="page">
      <PageHeader title="Roster" subtitle={`${data.team.name} · ${active.length} players`} back={`/teams/${teamId}`} />
      <div className="stack">
        <div className="row">
          <button type="button" className="btn btn-primary btn-lg grow" onClick={openNew} data-testid="add-player">
            + Add Player
          </button>
          <Link className="btn btn-secondary btn-lg grow" to={`/teams/${teamId}/import`} data-testid="import-roster">
            Import Roster
          </Link>
        </div>

        {active.length === 0 ? (
          <EmptyState title="No players yet">Add or import the roster before starting a game.</EmptyState>
        ) : (
          <ul className="list">
            {active.map((p) => (
              <li key={p.id}>
                <button type="button" className="list-item" onClick={() => openEdit(p)}>
                  <span className="jersey" style={{ fontSize: "1.3rem" }}>
                    #{p.jerseyNumber}
                  </span>
                  <span className="grow">
                    <span className="list-item-title">{p.displayName}</span>
                    {p.notes && (
                      <span className="list-item-sub" style={{ display: "block" }}>
                        {p.notes}
                      </span>
                    )}
                  </span>
                  <span className="muted small">Edit</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {active.length > 0 && (
          <Link className="btn btn-secondary btn-block" to={`/games/new?team=${teamId}`}>
            Start Game
          </Link>
        )}

        {removed.length > 0 && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setShowRemoved((v) => !v)}>
              {showRemoved ? "Hide" : "Show"} removed players ({removed.length})
            </button>
            {showRemoved && (
              <ul className="list">
                {removed.map((p) => (
                  <li key={p.id} className="list-item" style={{ cursor: "default" }}>
                    <span className="jersey">#{p.jerseyNumber}</span>
                    <span className="grow muted">{p.displayName}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void activatePlayer(p.id).catch((e) => toast.show({ message: toUserMessage(e), tone: "error" }))}
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.player ? "Edit player" : "Add player"}>
        {form && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false, !form.player);
            }}
            noValidate
          >
            <div className="field">
              <label htmlFor="player-jersey">Jersey number</label>
              <input
                id="player-jersey"
                className="input"
                inputMode="numeric"
                autoComplete="off"
                value={form.jersey}
                onChange={(e) => {
                  setForm({ ...form, jersey: e.target.value });
                  setDuplicate(null);
                }}
                data-autofocus
              />
            </div>
            <div className="field">
              <label htmlFor="player-name">Player name</label>
              <input
                id="player-name"
                className="input"
                autoComplete="off"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="player-notes">Notes (optional)</label>
              <input
                id="player-notes"
                className="input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {error && <p className="alert alert-danger">{error}</p>}
            {duplicate ? (
              <div className="alert alert-warn stack">
                <span>{duplicate}</span>
                <div className="row">
                  <button type="button" className="btn btn-secondary grow" onClick={() => setDuplicate(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary grow" onClick={() => void save(true, !form.player)}>
                    Save anyway
                  </button>
                </div>
              </div>
            ) : (
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary btn-lg">
                  {form.player ? "Save" : "Save & add another"}
                </button>
                {!form.player && (
                  <button type="button" className="btn btn-secondary btn-lg" onClick={() => void save(false, false)}>
                    Save & close
                  </button>
                )}
                {form.player && (
                  <button
                    type="button"
                    className="btn btn-danger-outline"
                    onClick={() => {
                      void deactivatePlayer(form.player!.id).then(() => {
                        toast.show({ message: `${form.player!.displayName} removed from roster` });
                        setForm(null);
                      });
                    }}
                  >
                    Remove from roster
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
                  Cancel
                </button>
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
