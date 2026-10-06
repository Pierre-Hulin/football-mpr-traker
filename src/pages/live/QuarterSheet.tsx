import { Link } from "react-router-dom";
import { Modal } from "../../components/Modal/Modal";
import { quarterLabel } from "../../domain/enums";
import type { GameView } from "../../domain/selectors/getGameState";

interface Props {
  open: boolean;
  view: GameView;
  onClose: () => void;
  onEndQuarter: () => void;
  busy: boolean;
}

/**
 * Tap quarter → this sheet doubles as the confirmation, so ending a quarter
 * takes exactly two deliberate taps.
 */
export function QuarterSheet({ open, view, onClose, onEndQuarter, busy }: Props) {
  const q = view.game.currentQuarter;
  const lastPlay = view.game.nextPlayNumber - 1;
  const active = view.rows.filter((r) => r.gamePlayer.status === "active");
  const below = active.filter((r) => r.count < r.required).length;
  const label = quarterLabel(q);

  return (
    <Modal open={open} onClose={onClose} title={q <= 4 ? `Quarter ${q}` : label}>
      <p style={{ fontSize: "1.1rem", fontWeight: 700 }}>
        End {label} after {lastPlay > 0 ? `Play ${lastPlay}` : "no plays"}?
      </p>
      <p className="muted">
        {active.length} players active · {below} still below minimum
      </p>
      {q >= 4 && <p className="muted small">After ending {label} you can end the game or continue into overtime.</p>}
      <div className="stack">
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          onClick={onEndQuarter}
          disabled={busy}
          data-testid="end-quarter"
        >
          END {label}
        </button>
        <Link className="btn btn-secondary btn-lg btn-block" to={`/games/${view.game.id}/quarters`}>
          View quarter breakdown
        </Link>
        <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
