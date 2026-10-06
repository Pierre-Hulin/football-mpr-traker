import { Modal } from "../../components/Modal/Modal";
import type { GameView } from "../../domain/selectors/getGameState";
import { getGameSummary } from "../../domain/selectors/getGameSummary";

interface Props {
  open: boolean;
  view: GameView;
  afterQuarter?: string;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}

export function EndGameModal({ open, view, afterQuarter, onClose, onConfirm, busy }: Props) {
  const summary = getGameSummary(view);
  return (
    <Modal open={open} onClose={onClose} title={afterQuarter ? `${afterQuarter} ended. End this game?` : "End this game?"}>
      <p>
        <strong>{summary.totalPlays}</strong> plays recorded
        <br />
        <strong>
          {summary.metCount} of {summary.activeCount}
        </strong>{" "}
        active players met MPR
      </p>
      {summary.shortRows.length === 0 ? (
        <p className="alert alert-ok">All active players met MPR.</p>
      ) : (
        <div className="alert alert-warn">
          {summary.shortRows.map((r) => (
            <div key={r.view.player.id}>
              #{r.view.player.jerseyNumber} {r.view.player.displayName} is short by {r.short}{" "}
              {r.short === 1 ? "play" : "plays"}.
            </div>
          ))}
        </div>
      )}
      <div className="modal-actions split">
        <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>
          {afterQuarter ? "Keep playing" : "Cancel"}
        </button>
        <button type="button" className="btn btn-danger btn-lg" onClick={onConfirm} disabled={busy} data-testid="confirm-end-game">
          END GAME
        </button>
      </div>
    </Modal>
  );
}
