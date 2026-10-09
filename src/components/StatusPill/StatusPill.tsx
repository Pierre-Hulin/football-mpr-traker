import type { ReactNode } from "react";
import { GAME_PLAYER_STATUSES, GAME_PLAYER_STATUS_LABELS, type GamePlayerStatus } from "../../domain/enums";
import { Modal } from "../Modal/Modal";
import { StatusScrubber } from "../StatusScrubber/StatusScrubber";

export const STATUS_DESCRIPTIONS: Record<GamePlayerStatus, string> = {
  active: "Plays and counts toward MPR",
  absent: "Not at the game",
  late: "Arriving later — activate when they get here",
  injured: "Can't play — excluded from MPR",
  exempt: "Excluded from the MPR requirement",
  ineligible: "Can't play — excluded from MPR",
};

/** Compact status label. Active is deliberately quiet; exceptions stand out. */
export function StatusPill({ status }: { status: GamePlayerStatus }) {
  return (
    <span className={`status-pill status-${status}`} data-status={status}>
      {GAME_PLAYER_STATUS_LABELS[status].toUpperCase()}
    </span>
  );
}

/**
 * One roster row with a status control.
 * - With `onChange` (pregame): the name area taps open the picker, and the
 *   status is a horizontal StatusScrubber (drag to change, tap for the picker).
 * - Without it (in-game): the whole row is one button that opens `onOpen`,
 *   where changes are confirmed and audited.
 */
export function PlayerStatusRow({
  jersey,
  name,
  status,
  detail,
  onOpen,
  onChange,
}: {
  jersey: string;
  name: string;
  status: GamePlayerStatus;
  detail?: ReactNode;
  onOpen: () => void;
  onChange?: (status: GamePlayerStatus) => void;
}) {
  const nameBlock = (
    <>
      <span className="jersey" style={{ fontSize: "1.25rem" }}>
        #{jersey}
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="list-item-title status-row-name">{name}</span>
        {detail && <span className="list-item-sub">{detail}</span>}
      </span>
    </>
  );

  if (onChange) {
    return (
      <li className={`status-row-split ${status === "active" ? "" : "is-exception"}`} data-testid="status-row" data-jersey={jersey}>
        <button
          type="button"
          className="list-item status-row-main"
          onClick={onOpen}
          aria-label={`#${jersey} ${name}, ${GAME_PLAYER_STATUS_LABELS[status]}. Open status list`}
        >
          {nameBlock}
        </button>
        <StatusScrubber status={status} playerLabel={`#${jersey} ${name}`} onChange={onChange} onOpenPicker={onOpen} />
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        className={`list-item status-row ${status === "active" ? "" : "is-exception"}`}
        onClick={onOpen}
        aria-label={`#${jersey} ${name}, ${GAME_PLAYER_STATUS_LABELS[status]}. Change status`}
        data-testid="status-row"
        data-jersey={jersey}
      >
        {nameBlock}
        <StatusPill status={status} />
        <span className="chev" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

/** Pregame status picker: a bottom sheet with all six statuses; one tap applies. */
export function StatusPickerSheet({
  title,
  current,
  onSelect,
  onClose,
}: {
  title: string | null;
  current: GamePlayerStatus;
  onSelect: (status: GamePlayerStatus) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={title !== null} onClose={onClose} title={title ?? ""}>
      <div role="radiogroup" aria-label="Game status" className="stack" style={{ gap: "var(--space-2)" }}>
        {GAME_PLAYER_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={current === s}
            className="sheet-option"
            onClick={() => onSelect(s)}
            data-autofocus={current === s ? true : undefined}
          >
            <span>
              {GAME_PLAYER_STATUS_LABELS[s]}
              <span className="sub">{STATUS_DESCRIPTIONS[s]}</span>
            </span>
            <span aria-hidden="true" style={{ fontSize: "1.2rem" }}>
              {current === s ? "●" : "○"}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-lg btn-block" style={{ marginTop: "var(--space-2)" }} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
