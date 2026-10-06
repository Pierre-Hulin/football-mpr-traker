import { db } from "../../db/db";
import { gameRepository } from "../../db/repositories/gameRepository";
import { playRepository } from "../../db/repositories/playRepository";
import type { Game, QuarterSnapshot } from "../models";
import { computeMprCounts, isQualifying } from "../selectors/getMprCounts";
import { nowIso } from "../../utils/dates";
import { addEvent, requireActiveGame, touchGame, writeTx } from "./shared";

/**
 * End the current quarter: store a reconciliation snapshot and advance to the
 * next quarter (quarters after Q4 are overtime). The lineup is preserved.
 */
export async function endQuarter(gameId: string): Promise<{ game: Game; snapshot: QuarterSnapshot }> {
  return writeTx(
    [db.games, db.gamePlayers, db.plays, db.playParticipants, db.gameEvents],
    async () => {
      const game = await requireActiveGame(gameId);
      const [plays, participants, gamePlayers] = await Promise.all([
        playRepository.listByGame(gameId),
        playRepository.listParticipantsByGame(gameId),
        gameRepository.listGamePlayers(gameId),
      ]);
      const live = plays.filter((p) => !p.voided);
      const counts = computeMprCounts(plays, participants);
      const now = nowIso();
      const snapshot: QuarterSnapshot = {
        endedQuarter: game.currentQuarter,
        nextQuarter: game.currentQuarter + 1,
        lastPlayNumber: game.nextPlayNumber - 1,
        playCountThroughQuarter: live.length,
        qualifyingPlaysInQuarter: plays.filter((p) => isQualifying(p) && p.quarter === game.currentQuarter).length,
        playerCounts: Object.fromEntries(gamePlayers.map((gp) => [gp.playerId, counts.get(gp.playerId) ?? 0])),
        playerStatuses: Object.fromEntries(gamePlayers.map((gp) => [gp.playerId, gp.status])),
        endedAt: now,
      };
      await addEvent(game, {
        type: "quarter_ended",
        entityType: "game",
        entityId: gameId,
        quarter: game.currentQuarter,
        playNumber: game.nextPlayNumber,
        metadata: snapshot as unknown as Record<string, unknown>,
        createdAt: now,
      });
      const updated = await touchGame(game, { currentQuarter: game.currentQuarter + 1 });
      return { game: updated, snapshot };
    },
  );
}
