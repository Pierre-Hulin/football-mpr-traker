import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loading, PageHeader } from "../components/ui";
import { PlayerStatusRow } from "../components/StatusPill/StatusPill";
import { useToast } from "../components/Toast/ToastProvider";
import { GAME_PLAYER_STATUSES, GAME_PLAYER_STATUS_LABELS, type GamePlayerStatus } from "../domain/enums";
import { updateGamePlayerStatus } from "../domain/commands/updateGamePlayerStatus";
import { toUserMessage } from "../domain/errors";
import { useGameView } from "../hooks/useActiveGame";
import { PlayerSheet } from "./live/PlayerSheet";

/**
 * In-game roster management: change a player's game status (GamePlayer) after
 * kickoff. Every change goes through the audited status command; recorded
 * plays are never touched. Each change still asks for confirmation in the
 * player sheet, which explains its effect.
 */
export default function ManagePlayersPage() {
  const { gameId = "" } = useParams();
  const { view } = useGameView(gameId);
  const toast = useToast();
  const [sheet, setSheet] = useState<string | null>(null);

  if (view === undefined) return <Loading />;
  if (!view)
    return (
      <div className="page">
        <PageHeader title="Game not found" back="/" />
      </div>
    );
  if (view.game.status === "draft") return <Navigate to={`/games/${gameId}/setup?step=players`} replace />;
  if (view.game.status !== "active") return <Navigate to={`/games/${gameId}/summary`} replace />;

  const counts = GAME_PLAYER_STATUSES.map((s) => [s, view.rows.filter((r) => r.gamePlayer.status === s).length] as const).filter(
    ([, n]) => n > 0,
  );

  const onChangeStatus = async (playerId: string, status: GamePlayerStatus, reason?: string) => {
    try {
      await updateGamePlayerStatus({ gameId, playerId, status, reason });
      const p = view.rowsById.get(playerId)?.player;
      toast.show({ message: `#${p?.jerseyNumber} ${p?.displayName}: ${GAME_PLAYER_STATUS_LABELS[status]}` });
      return true;
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
      return false;
    }
  };

  return (
    <div className="page">
      <PageHeader title="Manage players" subtitle="This game only · changes are logged" back={`/games/${gameId}/live`} />
      <p className="muted small" data-testid="status-counts">
        {counts.map(([s, n]) => `${n} ${GAME_PLAYER_STATUS_LABELS[s].toLowerCase()}`).join(" · ")}
      </p>
      <p className="muted small">
        Tap a player to mark them injured, absent, exempt or ineligible, or to activate a late arrival. Plays already
        recorded are always kept.
      </p>
      <ul className="list">
        {view.rows.map((r) => (
          <PlayerStatusRow
            key={r.player.id}
            jersey={r.player.jerseyNumber}
            name={r.player.displayName}
            status={r.gamePlayer.status}
            detail={
              <>
                {r.count}/{r.required} plays
                {r.inLineup && <strong> · IN now</strong>}
              </>
            }
            onOpen={() => setSheet(r.player.id)}
          />
        ))}
      </ul>
      <PlayerSheet view={sheet ? view.rowsById.get(sheet) : undefined} onClose={() => setSheet(null)} onChangeStatus={onChangeStatus} />
    </div>
  );
}
