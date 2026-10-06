import { useState } from "react";
import { useParams } from "react-router-dom";
import { Loading, PageHeader } from "../components/ui";
import { RiskBadge } from "../components/RiskBadge/RiskBadge";
import { useToast } from "../components/Toast/ToastProvider";
import { GAME_PLAYER_STATUS_LABELS, type GamePlayerStatus, type MprRiskLevel } from "../domain/enums";
import { updateGamePlayerStatus } from "../domain/commands/updateGamePlayerStatus";
import { toUserMessage } from "../domain/errors";
import { useGameView } from "../hooks/useActiveGame";
import { PlayerSheet } from "./live/PlayerSheet";

const GROUPS: { level: MprRiskLevel; title: string }[] = [
  { level: "critical", title: "Critical" },
  { level: "at_risk", title: "At risk" },
  { level: "needs_plays", title: "Needs plays" },
  { level: "met", title: "Met" },
  { level: "excluded", title: "Excluded / unavailable" },
];

export default function MprSummaryPage() {
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

  const active = view.game.status === "active";
  const onChangeStatus = async (playerId: string, status: GamePlayerStatus, reason?: string) => {
    try {
      await updateGamePlayerStatus({ gameId, playerId, status, reason });
      return true;
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
      return false;
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="MPR Summary"
        subtitle={`${view.qualifyingTotal} qualifying plays${active ? " · tap a player to change status" : ""}`}
        back={active ? `/games/${gameId}/live` : `/games/${gameId}/summary`}
      />
      {GROUPS.map(({ level, title }) => {
        const rows = view.rows.filter((r) => r.risk.level === level);
        if (rows.length === 0) return null;
        return (
          <section key={level}>
            <h2 className="section-title">
              {title} ({rows.length})
            </h2>
            <ul className="list">
              {rows.map((r) => (
                <li key={r.player.id}>
                  <button
                    type="button"
                    className="list-item"
                    onClick={() => active && setSheet(r.player.id)}
                    style={{ cursor: active ? "pointer" : "default" }}
                  >
                    <span className="jersey" style={{ fontSize: "1.2rem" }}>
                      #{r.player.jerseyNumber}
                    </span>
                    <span className="grow">
                      <span className="list-item-title">{r.player.displayName}</span>
                      {level !== "met" && level !== "excluded" && (
                        <span className="list-item-sub" style={{ display: "block" }}>
                          {r.risk.reason}
                        </span>
                      )}
                    </span>
                    <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      {r.count}/{r.required}
                    </span>
                    {level === "excluded" ? (
                      <span className="badge badge-neutral">{GAME_PLAYER_STATUS_LABELS[r.gamePlayer.status].toUpperCase()}</span>
                    ) : (
                      <RiskBadge level={level} remaining={r.remaining} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <PlayerSheet view={sheet ? view.rowsById.get(sheet) : undefined} onClose={() => setSheet(null)} onChangeStatus={onChangeStatus} />
    </div>
  );
}
