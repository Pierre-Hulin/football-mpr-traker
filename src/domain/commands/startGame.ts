import { db } from "../../db/db";
import { gameRepository } from "../../db/repositories/gameRepository";
import { settingsRepository } from "../../db/repositories/settingsRepository";
import { DomainError } from "../errors";
import type { Game } from "../models";
import { nowIso } from "../../utils/dates";
import { addEvent, touchGame, writeTx } from "./shared";

export async function startGame(gameId: string): Promise<Game> {
  return writeTx([db.games, db.gamePlayers, db.gameEvents, db.appSettings], async () => {
    const game = await gameRepository.get(gameId);
    if (!game) throw new DomainError("GAME_NOT_FOUND");
    if (game.status !== "draft") throw new DomainError("GAME_NOT_DRAFT");

    const otherActive = (await gameRepository.listByStatus("active")).filter((g) => g.id !== gameId);
    if (otherActive.length > 0) {
      throw new DomainError("GAME_ALREADY_ACTIVE", undefined, { activeGameId: otherActive[0].id });
    }

    const gamePlayers = await gameRepository.listGamePlayers(gameId);
    if (!gamePlayers.some((gp) => gp.status === "active")) throw new DomainError("NO_ELIGIBLE_PLAYERS");

    const now = nowIso();
    // Re-snapshot minimums at start and mark initial activation.
    await gameRepository.bulkPutGamePlayers(
      gamePlayers.map((gp) => ({
        ...gp,
        minimumRequiredPlays: game.requiredPlaysDefault,
        activatedAtPlayNumber: gp.status === "active" ? 1 : undefined,
        updatedAt: now,
      })),
    );

    const started = await touchGame(game, {
      status: "active",
      startedAt: now,
      currentQuarter: 1,
      nextPlayNumber: 1,
    });
    await addEvent(started, {
      type: "game_started",
      entityType: "game",
      entityId: gameId,
      metadata: {
        requiredPlays: game.requiredPlaysDefault,
        expectedPlayersOnField: game.expectedPlayersOnField,
        initialStatuses: Object.fromEntries(gamePlayers.map((gp) => [gp.playerId, gp.status])),
      },
    });
    await settingsRepository.update({ lastActiveGameId: gameId, onboardingCompleted: true, updatedAt: now });
    return started;
  });
}
