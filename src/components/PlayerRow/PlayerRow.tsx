import { memo } from "react";
import { GAME_PLAYER_STATUS_LABELS } from "../../domain/enums";
import type { PlayerView } from "../../domain/selectors/getGameState";
import { RiskBadge } from "../RiskBadge/RiskBadge";

interface PlayerRowProps {
  view: PlayerView;
  inLineup: boolean;
  flash?: boolean;
  disabled?: boolean;
  onToggle: (playerId: string) => void;
  onOpen: (playerId: string) => void;
  onActivate: (playerId: string) => void;
}

function StatusLine({ view }: { view: PlayerView }) {
  const status = view.gamePlayer.status;
  const count = (
    <span className="prow-count">
      {view.count} / {view.required}
    </span>
  );
  if (status === "active") {
    return (
      <>
        {count}
        {view.risk.level === "met" ? (
          <RiskBadge level="met" remaining={0} />
        ) : (
          <>
            <span>NEEDS {view.remaining}</span>
            {(view.risk.level === "at_risk" || view.risk.level === "critical") && (
              <RiskBadge level={view.risk.level} remaining={view.remaining} />
            )}
          </>
        )}
      </>
    );
  }
  const label = GAME_PLAYER_STATUS_LABELS[status].toUpperCase();
  return (
    <>
      {status !== "absent" && status !== "late" && count}
      <span className="badge badge-neutral">{label}</span>
    </>
  );
}

function PlayerRowImpl({ view, inLineup, flash, disabled, onToggle, onOpen, onActivate }: PlayerRowProps) {
  const { player, gamePlayer } = view;
  const status = gamePlayer.status;
  const unavailable = !view.fieldEligible;
  const riskCls = status === "active" && (view.risk.level === "critical" || view.risk.level === "at_risk") ? view.risk.level : "";
  const name = `#${player.jerseyNumber} ${player.displayName}`;

  return (
    <li
      id={`player-${player.id}`}
      className={`prow ${inLineup ? "in" : ""} ${riskCls} ${unavailable ? "unavailable" : ""} ${flash ? "flash" : ""}`}
      data-testid="player-row"
      data-jersey={player.jerseyNumber}
    >
      <button
        type="button"
        className="prow-main"
        onClick={() => onOpen(player.id)}
        aria-label={`${name}, ${view.count} of ${view.required} plays. Open player actions`}
      >
        <span className="prow-jersey" aria-hidden="true">
          {player.jerseyNumber}
        </span>
        <span className="prow-info">
          <span className="prow-name" style={{ display: "block" }}>
            {player.displayName}
          </span>
          <span className="prow-stats">
            <StatusLine view={view} />
          </span>
        </span>
      </button>
      {status === "late" ? (
        <button
          type="button"
          className="prow-activate"
          onClick={() => onActivate(player.id)}
          aria-label={`Activate late player ${name}`}
          disabled={disabled}
        >
          ACTIVATE
        </button>
      ) : unavailable ? (
        <button type="button" className="prow-toggle" disabled aria-label={`${name} is ${GAME_PLAYER_STATUS_LABELS[status]}`}>
          {GAME_PLAYER_STATUS_LABELS[status].toUpperCase()}
        </button>
      ) : (
        <button
          type="button"
          className="prow-toggle"
          aria-pressed={inLineup}
          aria-label={inLineup ? `Mark ${name} out of the current lineup` : `Mark ${name} in the current lineup`}
          onClick={() => onToggle(player.id)}
          disabled={disabled}
          data-testid="toggle"
        >
          {inLineup ? "IN" : "OUT"}
        </button>
      )}
    </li>
  );
}

export const PlayerRow = memo(PlayerRowImpl);
