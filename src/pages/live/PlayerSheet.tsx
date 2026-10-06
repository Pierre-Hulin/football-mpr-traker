import { useState } from "react";
import { Modal } from "../../components/Modal/Modal";
import { GAME_PLAYER_STATUS_LABELS, type GamePlayerStatus } from "../../domain/enums";
import type { PlayerView } from "../../domain/selectors/getGameState";
import { LIVE_STATUS_TRANSITIONS } from "../../domain/commands/updateGamePlayerStatus";

interface Props {
  view: PlayerView | undefined;
  onClose: () => void;
  onChangeStatus: (playerId: string, status: GamePlayerStatus, reason?: string) => Promise<boolean>;
}

const ACTION_LABELS: Record<GamePlayerStatus, string> = {
  active: "Activate player",
  injured: "Mark injured",
  absent: "Mark absent",
  exempt: "Mark exempt",
  ineligible: "Mark ineligible",
  late: "Mark late",
};

function effectText(view: PlayerView, to: GamePlayerStatus): string[] {
  const name = view.player.displayName;
  const plays = `${view.count} recorded ${view.count === 1 ? "play" : "plays"}`;
  switch (to) {
    case "injured":
      return [`${name}'s ${plays} will remain.`, "They will be removed from MPR warnings and the current lineup."];
    case "absent":
      return [`${name}'s ${plays} will remain.`, "They will be removed from the current lineup and MPR tracking."];
    case "exempt":
      return [`${name} stays on the game record but is excluded from MPR requirements.`, "They will be removed from the current lineup."];
    case "ineligible":
      return [`${name} stays on the game record but cannot be placed on the field.`, "They will be excluded from MPR requirements."];
    case "active":
      return view.gamePlayer.status === "late"
        ? [`${name} becomes available from the next play. Earlier plays are not changed.`]
        : [
            `${name} returns to MPR tracking and can be placed on the field.`,
            "This change is recorded in the game's audit history.",
          ];
    default:
      return [];
  }
}

/** Player quick actions (02_SCREEN_FLOW.md §26). */
export function PlayerSheet({ view, onClose, onChangeStatus }: Props) {
  const [pending, setPending] = useState<GamePlayerStatus | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPending(null);
    setNote("");
    onClose();
  };

  if (!view) return null;
  const status = view.gamePlayer.status;
  const options = LIVE_STATUS_TRANSITIONS[status];
  const title = `#${view.player.jerseyNumber} ${view.player.displayName}`;

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    const ok = await onChangeStatus(view.player.id, pending, note);
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal open onClose={close} title={pending ? `${ACTION_LABELS[pending]}?` : title}>
      {!pending ? (
        <>
          <p style={{ fontSize: "1.1rem" }}>
            <strong>
              {view.count} / {view.required}
            </strong>{" "}
            qualifying plays
            {status === "active" && view.remaining > 0 && <> · Needs {view.remaining}</>}
            {status === "active" && view.remaining === 0 && <> · ✓ MPR met</>}
          </p>
          <p className="muted">
            Status: <strong>{GAME_PLAYER_STATUS_LABELS[status]}</strong>
            {view.gamePlayer.statusReason && <> — {view.gamePlayer.statusReason}</>}
          </p>
          {status === "active" && view.risk.level !== "met" && <p className="muted small">{view.risk.reason}</p>}
          <div className="stack">
            {options.includes("active") && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => setPending("active")}>
                {status === "late" ? "Activate player" : "Reactivate player"}
              </button>
            )}
            {options
              .filter((s) => s !== "active")
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn btn-lg btn-block ${s === "injured" ? "btn-danger-outline" : "btn-secondary"}`}
                  onClick={() => setPending(s)}
                >
                  {ACTION_LABELS[s]}
                </button>
              ))}
            <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={close}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontWeight: 700 }}>{title}</p>
          {effectText(view, pending).map((t) => (
            <p key={t}>{t}</p>
          ))}
          <div className="field">
            <label htmlFor="status-note">Note (optional)</label>
            <input
              id="status-note"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={pending === "injured" ? "e.g. ankle, Q2" : ""}
            />
          </div>
          <div className="modal-actions split">
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-lg ${pending === "injured" ? "btn-danger" : "btn-primary"}`}
              onClick={confirm}
              disabled={busy}
              data-autofocus
            >
              {ACTION_LABELS[pending]}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
