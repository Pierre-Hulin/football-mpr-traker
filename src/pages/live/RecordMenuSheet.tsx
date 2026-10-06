import { useState } from "react";
import { Modal } from "../../components/Modal/Modal";
import { NON_COUNTING_REASONS, type PlayCategory } from "../../domain/enums";
import type { Game } from "../../domain/models";

export interface RecordOptions {
  countsForMpr: boolean;
  playCategory: PlayCategory;
  nonCountingReason?: string;
}

interface Props {
  open: boolean;
  game: Game;
  selectedCount: number;
  onClose: () => void;
  onRecord: (opts: RecordOptions) => void;
}

/** Secondary record actions: rule-aware special plays and explicit non-counting plays. */
export function RecordMenuSheet({ open, game, selectedCount, onClose, onRecord }: Props) {
  const [mode, setMode] = useState<"menu" | "reason">("menu");
  const [reason, setReason] = useState<string>(NON_COUNTING_REASONS[0]);
  const [otherText, setOtherText] = useState("");

  const close = () => {
    setMode("menu");
    setOtherText("");
    onClose();
  };
  const record = (opts: RecordOptions) => {
    close();
    onRecord(opts);
  };

  const ruleOption = (label: string, counts: boolean, category: PlayCategory, ruleName: string) => (
    <button
      type="button"
      className="sheet-option"
      onClick={() =>
        record({
          countsForMpr: counts,
          playCategory: category,
          nonCountingReason: counts ? undefined : `${ruleName} (game rule)`,
        })
      }
    >
      <span>
        {label}
        <span className="sub">{counts ? "Counts toward MPR" : "Does not count (game rule)"}</span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  );

  return (
    <Modal open={open} onClose={close} title={mode === "menu" ? `Record play ${game.nextPlayNumber}` : "Why doesn't this play count?"}>
      {mode === "menu" ? (
        <div className="stack">
          <p className="muted small">{selectedCount} players selected. Lineup stays the same after recording.</p>
          <button type="button" className="sheet-option" onClick={() => setMode("reason")} data-testid="non-counting">
            <span>
              Non-counting play…
              <span className="sub">Penalty, kneel, spike, league rule</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
          {ruleOption("Special teams play", game.countsSpecialTeams, "special_teams", "Special teams")}
          {ruleOption("PAT attempt", game.countsPat, "pat", "PAT")}
          {ruleOption("Accepted penalty", game.countsAcceptedPenaltyPlays, "other", "Accepted penalty")}
          <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={close}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="stack">
          <div role="radiogroup" aria-label="Reason" className="stack">
            {NON_COUNTING_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                className="sheet-option"
                onClick={() => setReason(r)}
              >
                <span>{r}</span>
                <span aria-hidden="true">{reason === r ? "●" : "○"}</span>
              </button>
            ))}
          </div>
          {reason === "Other" && (
            <input
              className="input"
              aria-label="Describe reason"
              placeholder="Describe reason (optional)"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
            />
          )}
          <div className="modal-actions split">
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setMode("menu")}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() =>
                record({
                  countsForMpr: false,
                  playCategory: reason === "PAT" ? "pat" : "other",
                  nonCountingReason: reason === "Other" && otherText.trim() ? `Other: ${otherText.trim()}` : reason,
                })
              }
            >
              Record non-counting
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
