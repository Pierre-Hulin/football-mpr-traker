import { db } from "../../db/db";
import { gameRepository } from "../../db/repositories/gameRepository";
import { playRepository } from "../../db/repositories/playRepository";
import { settingsRepository } from "../../db/repositories/settingsRepository";
import type { Game } from "../models";
import { computeMprCounts } from "../selectors/getMprCounts";
import { nowIso } from "../../utils/dates";
import { addEvent, requireActiveGame, touchGame, writeTx } from "./shared";

export interface UnmetPlayer {
  playerId: string;
  count: number;
  required: number;
  short: number;
}

async function clearActivePointer(gameId: string) {
  const settings = await settingsRepository.get();
  if (settings?.lastActiveGameId === gameId) {
    await settingsRepository.update({ lastActiveGameId: undefined, updatedAt: nowIso() });
  }
}

export async function completeGame(gameId: string): Promise<{ game: Game; unmet: UnmetPlayer[] }> {
  return writeTx(
    [db.games, db.gamePlayers, db.plays, db.playParticipants, db.gameEvents, db.appSettings],
    async () => {
      const game = await requireActiveGame(gameId);
      const [plays, participants, gamePlayers] = await Promise.all([
        playRepository.listByGame(gameId),
        playRepository.listParticipantsByGame(gameId),
        gameRepository.listGamePlayers(gameId),
      ]);
      const counts = computeMprCounts(plays, participants);
      const unmet: UnmetPlayer[] = gamePlayers
        .filter((gp) => gp.status === "active")
        .map((gp) => {
          const count = counts.get(gp.playerId) ?? 0;
          return { playerId: gp.playerId, count, required: gp.minimumRequiredPlays, short: gp.minimumRequiredPlays - count };
        })
        .filter((u) => u.short > 0);

      const now = nowIso();
      const updated = await touchGame(game, { status: "completed", completedAt: now, clearedLineup: undefined });
      await addEvent(game, {
        type: "game_completed",
        entityType: "game",
        entityId: gameId,
        metadata: {
          totalPlays: plays.filter((p) => !p.voided).length,
          unmet,
          finalCounts: Object.fromEntries(gamePlayers.map((gp) => [gp.playerId, counts.get(gp.playerId) ?? 0])),
        },
        createdAt: now,
      });
      await clearActivePointer(gameId);
      return { game: updated, unmet };
    },
  );
}

export async function abandonGame(gameId: string, reason?: string): Promise<Game> {
  return writeTx([db.games, db.gameEvents, db.appSettings], async () => {
    const game = await requireActiveGame(gameId);
    const updated = await touchGame(game, { status: "abandoned", completedAt: nowIso(), clearedLineup: undefined });
    await addEvent(game, {
      type: "game_abandoned",
      entityType: "game",
      entityId: gameId,
      message: reason?.trim() || undefined,
    });
    await clearActivePointer(gameId);
    return updated;
  });
}
