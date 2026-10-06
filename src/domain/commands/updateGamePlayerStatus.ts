import { db } from "../../db/db";
import { gameRepository } from "../../db/repositories/gameRepository";
import { GAME_PLAYER_STATUSES, type GamePlayerStatus, isFieldEligible } from "../enums";
import { DomainError } from "../errors";
import type { GamePlayer } from "../models";
import { nowIso } from "../../utils/dates";
import { gamePlayerId, lineupMemberId } from "../../utils/ids";
import { addEvent, requireGame, writeTx } from "./shared";

/**
 * Allowed transitions once a game is live. `late` is a pregame designation and
 * cannot be re-entered mid-game; any other change is allowed and audited.
 */
export const LIVE_STATUS_TRANSITIONS: Record<GamePlayerStatus, GamePlayerStatus[]> = {
  active: ["absent", "injured", "exempt", "ineligible"],
  late: ["active", "absent", "injured", "exempt", "ineligible"],
  injured: ["active", "absent", "exempt", "ineligible"],
  absent: ["active", "injured", "exempt", "ineligible"],
  exempt: ["active", "absent", "injured", "ineligible"],
  ineligible: ["active", "absent", "injured", "exempt"],
};

export function canTransition(from: GamePlayerStatus, to: GamePlayerStatus, live: boolean): boolean {
  if (from === to) return false;
  if (!live) return GAME_PLAYER_STATUSES.includes(to);
  return LIVE_STATUS_TRANSITIONS[from].includes(to);
}

export interface UpdateGamePlayerStatusInput {
  gameId: string;
  playerId: string;
  status: GamePlayerStatus;
  reason?: string;
}

export async function updateGamePlayerStatus(input: UpdateGamePlayerStatusInput): Promise<GamePlayer> {
  return writeTx([db.games, db.gamePlayers, db.currentLineupMembers, db.gameEvents], async () => {
    const game = await requireGame(input.gameId);
    if (game.status !== "draft" && game.status !== "active") throw new DomainError("GAME_NOT_ACTIVE");
    const live = game.status === "active";

    const gp = await gameRepository.getGamePlayer(gamePlayerId(input.gameId, input.playerId));
    if (!gp) throw new DomainError("PLAYER_NOT_FOUND");
    if (gp.status === input.status && !live) return gp;
    if (!canTransition(gp.status, input.status, live)) {
      throw new DomainError("INVALID_PLAYER_STATUS_TRANSITION", undefined, {
        from: gp.status,
        to: input.status,
      });
    }

    const now = nowIso();
    const becomingActive = isFieldEligible(input.status);
    const updated: GamePlayer = {
      ...gp,
      status: input.status,
      statusReason: input.reason?.trim() || undefined,
      updatedAt: now,
    };
    if (live) {
      if (becomingActive) {
        updated.activatedAtPlayNumber = game.nextPlayNumber;
        updated.deactivatedAtPlayNumber = undefined;
      } else if (isFieldEligible(gp.status)) {
        updated.deactivatedAtPlayNumber = game.nextPlayNumber;
      }
    }
    await gameRepository.putGamePlayer(updated);

    if (!becomingActive) {
      await gameRepository.deleteLineupMember(lineupMemberId(input.gameId, input.playerId));
    }

    if (live) {
      await addEvent(game, {
        type: becomingActive ? "player_activated" : "player_status_changed",
        entityType: "player",
        entityId: input.playerId,
        before: { status: gp.status },
        after: { status: input.status },
        message: input.reason?.trim() || undefined,
      });
    }
    return updated;
  });
}
