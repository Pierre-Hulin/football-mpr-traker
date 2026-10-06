import { db } from "../../db/db";
import { gameRepository } from "../../db/repositories/gameRepository";
import { playerRepository } from "../../db/repositories/playerRepository";
import { playRepository } from "../../db/repositories/playRepository";
import { teamRepository } from "../../db/repositories/teamRepository";
import { DomainError } from "../errors";
import type { Game, GamePlayer } from "../models";
import { gameRulesSchema, validate } from "../validation";
import { nowIso, todayLocal } from "../../utils/dates";
import { gamePlayerId, newId } from "../../utils/ids";
import { getTeamSettingsOrDefault } from "./createTeam";
import { writeTx } from "./shared";

export interface GameRulesInput {
  requiredPlays: number;
  expectedPlayersOnField: number;
  mprDeadlineQuarter?: number;
  countsSpecialTeams: boolean;
  countsPat: boolean;
  countsAcceptedPenaltyPlays: boolean;
}

export interface GameDetailsInput extends GameRulesInput {
  opponent?: string;
  gameLabel?: string;
  gameDate?: string;
}

export interface CreateGameInput extends Partial<GameDetailsInput> {
  teamId: string;
}

function cleanText(value?: string): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/**
 * Create a draft game, snapshotting the team defaults and creating one
 * GamePlayer per active roster member.
 */
export async function createGame(input: CreateGameInput): Promise<Game> {
  return writeTx([db.teams, db.teamSettings, db.players, db.games, db.gamePlayers], async () => {
    const team = await teamRepository.get(input.teamId);
    if (!team) throw new DomainError("TEAM_NOT_FOUND");
    const defaults = await getTeamSettingsOrDefault(team.id);
    const rules = validate(gameRulesSchema, {
      requiredPlays: input.requiredPlays ?? defaults.defaultRequiredPlays,
      expectedPlayersOnField: input.expectedPlayersOnField ?? defaults.defaultExpectedPlayersOnField,
      mprDeadlineQuarter: input.mprDeadlineQuarter ?? defaults.defaultMprDeadlineQuarter,
      countsSpecialTeams: input.countsSpecialTeams ?? defaults.defaultCountsSpecialTeams,
      countsPat: input.countsPat ?? defaults.defaultCountsPat,
      countsAcceptedPenaltyPlays: input.countsAcceptedPenaltyPlays ?? defaults.defaultCountsAcceptedPenaltyPlays,
    });
    const now = nowIso();
    const game: Game = {
      id: newId(),
      teamId: team.id,
      opponent: cleanText(input.opponent),
      gameLabel: cleanText(input.gameLabel),
      gameDate: input.gameDate || todayLocal(),
      status: "draft",
      requiredPlaysDefault: rules.requiredPlays,
      expectedPlayersOnField: rules.expectedPlayersOnField,
      mprDeadlineQuarter: rules.mprDeadlineQuarter,
      countsSpecialTeams: rules.countsSpecialTeams,
      countsPat: rules.countsPat,
      countsAcceptedPenaltyPlays: rules.countsAcceptedPenaltyPlays,
      currentQuarter: 1,
      nextPlayNumber: 1,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    const roster = (await playerRepository.listByTeam(team.id)).filter((p) => p.activeOnTeam);
    const gamePlayers: GamePlayer[] = roster.map((p) => ({
      id: gamePlayerId(game.id, p.id),
      gameId: game.id,
      playerId: p.id,
      status: "active",
      minimumRequiredPlays: rules.requiredPlays,
      createdAt: now,
      updatedAt: now,
    }));
    await gameRepository.put(game);
    await gameRepository.bulkPutGamePlayers(gamePlayers);
    return game;
  });
}

/** Edit details/rules of a draft game (re-snapshots player minimums). */
export async function updateDraftGame(gameId: string, input: GameDetailsInput): Promise<Game> {
  const rules = validate(gameRulesSchema, input);
  return writeTx([db.games, db.gamePlayers], async () => {
    const game = await gameRepository.get(gameId);
    if (!game) throw new DomainError("GAME_NOT_FOUND");
    if (game.status !== "draft") throw new DomainError("GAME_NOT_DRAFT");
    const now = nowIso();
    const updated: Game = {
      ...game,
      opponent: cleanText(input.opponent),
      gameLabel: cleanText(input.gameLabel),
      gameDate: input.gameDate || game.gameDate,
      requiredPlaysDefault: rules.requiredPlays,
      expectedPlayersOnField: rules.expectedPlayersOnField,
      mprDeadlineQuarter: rules.mprDeadlineQuarter,
      countsSpecialTeams: rules.countsSpecialTeams,
      countsPat: rules.countsPat,
      countsAcceptedPenaltyPlays: rules.countsAcceptedPenaltyPlays,
      updatedAt: now,
      revision: game.revision + 1,
    };
    await gameRepository.put(updated);
    const gps = await gameRepository.listGamePlayers(gameId);
    await gameRepository.bulkPutGamePlayers(
      gps.map((gp) => ({ ...gp, minimumRequiredPlays: rules.requiredPlays, updatedAt: now })),
    );
    return updated;
  });
}

/** Draft games with no plays may be hard-deleted (01_DATA_MODEL.md §19). */
export async function deleteDraftGame(gameId: string): Promise<void> {
  await writeTx(
    [db.games, db.gamePlayers, db.plays, db.currentLineupMembers, db.gameEvents],
    async () => {
      const game = await gameRepository.get(gameId);
      if (!game) return;
      if (game.status !== "draft") throw new DomainError("GAME_NOT_DRAFT");
      const plays = await playRepository.listByGame(gameId);
      if (plays.length > 0) throw new DomainError("GAME_NOT_DRAFT");
      await gameRepository.deleteGamePlayers(gameId);
      await gameRepository.clearLineup(gameId);
      await db.gameEvents.where("gameId").equals(gameId).delete();
      await gameRepository.delete(gameId);
    },
  );
}
