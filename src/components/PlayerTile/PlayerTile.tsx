import { memo } from "react";
import { GAME_PLAYER_STATUS_LABELS, type GamePlayerStatus } from "../../domain/enums";
import type { PlayerView } from "../../domain/selectors/getGameState";

const SHORT_STATUS: Record<GamePlayerStatus, string> = {
  active: "",
  absent: "ABS",
  late: "LATE",
  injured: "INJ",
  exempt: "EXMPT",
  ineligible: "INEL",
};

interface PlayerTileProps {
  view: PlayerView;
  inLineup: boolean;
  flash?: boolean;
  onToggle: (playerId: string) => void;
  onOpen: (playerId: string) => void;
}

/**
 * Bingo-card tile for the dense live grid. The jersey number dominates; IN is
 * a solid fill plus a ✓, risk is a coloured border plus a corner glyph, and
 * the bottom line carries plays/required or the unavailable status.
 * Available players toggle IN/OUT on tap; late or unavailable players open
 * their player actions instead (activate / reactivate).
 */
function PlayerTileImpl({ view, inLineup, flash, onToggle, onOpen }: PlayerTileProps) {
  const { player, gamePlayer } = view;
  const status = gamePlayer.status;
  const available = view.fieldEligible;
  const risk = status === "active" ? view.risk.level : "excluded";
  const met = status === "active" && view.risk.level === "met";
  const riskWord = risk === "critical" ? ", critical" : risk === "at_risk" ? ", at risk" : met ? ", minimum met" : "";

  const label = available
    ? `#${player.jerseyNumber} ${player.displayName}, ${inLineup ? "IN" : "OUT"}, ${view.count} of ${view.required} minimum plays${riskWord}`
    : `#${player.jerseyNumber} ${player.displayName}, ${GAME_PLAYER_STATUS_LABELS[status]}, ${view.count} of ${view.required} plays. Open player actions`;

  const classes = [
    "ptile",
    available ? (inLineup ? "in" : "out") : status === "late" ? "late" : "unavailable",
    risk === "critical" || risk === "at_risk" ? `risk-${risk}` : "",
    flash ? "flash" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li id={`player-${player.id}`} className="ptile-cell" data-testid="player-tile" data-jersey={player.jerseyNumber}>
      <button
        type="button"
        className={classes}
        aria-pressed={available ? inLineup : undefined}
        aria-label={label}
        onClick={() => (available ? onToggle(player.id) : onOpen(player.id))}
      >
        {available && inLineup && (
          <span className="pt-in" aria-hidden="true">
            ✓
          </span>
        )}
        {(risk === "critical" || risk === "at_risk") && (
          <span className={`pt-flag ${risk}`} aria-hidden="true">
            {risk === "critical" ? "!" : "⚠"}
          </span>
        )}
        <span className="pt-num" aria-hidden="true">
          {player.jerseyNumber}
        </span>
        <span className="pt-meta" aria-hidden="true">
          {status === "active" ? (
            <>
              {met ? "✓" : ""}
              {view.count}/{view.required}
            </>
          ) : (
            SHORT_STATUS[status]
          )}
        </span>
      </button>
    </li>
  );
}

export const PlayerTile = memo(PlayerTileImpl);
