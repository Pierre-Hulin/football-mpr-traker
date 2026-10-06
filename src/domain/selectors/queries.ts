import { db } from "../../db/db";
import { eventRepository } from "../../db/repositories/eventRepository";
import { gameRepository } from "../../db/repositories/gameRepository";
import { playerRepository } from "../../db/repositories/playerRepository";
import { playRepository } from "../../db/repositories/playRepository";
import { presetRepository } from "../../db/repositories/presetRepository";
import { settingsRepository } from "../../db/repositories/settingsRepository";
import { teamRepository } from "../../db/repositories/teamRepository";
import type { Game, LineupPreset, LineupPresetMember, Player, Team } from "../models";
import { sortPlayers } from "../../utils/sort";
import type { GameData } from "./getGameState";

/** Load every record needed to render or export one game. */
export async function loadGameData(gameId: string): Promise<GameData | null> {
  return db.transaction(
    "r",
    [
      db.games,
      db.teams,
      db.players,
      db.gamePlayers,
      db.currentLineupMembers,
      db.plays,
      db.playParticipants,
      db.gameEvents,
      db.lineupPresets,
      db.lineupPresetMembers,
    ],
    async () => {
      const game = await gameRepository.get(gameId);
      if (!game) return null;
      const [team, gamePlayers, lineup, plays, participants, events, presets] = await Promise.all([
        teamRepository.get(game.teamId),
        gameRepository.listGamePlayers(gameId),
        gameRepository.listLineup(gameId),
        playRepository.listByGame(gameId),
        playRepository.listParticipantsByGame(gameId),
        eventRepository.listByGame(gameId),
        presetRepository.listByTeam(game.teamId),
      ]);
      const players = (await playerRepository.bulkGet(gamePlayers.map((gp) => gp.playerId))).filter(
        (p): p is Player => !!p,
      );
      const presetMembers = (
        await Promise.all(presets.map((p) => presetRepository.listMembers(p.id)))
      ).flat();
      return { game, team, players, gamePlayers, lineup, plays, participants, events, presets, presetMembers };
    },
  );
}

export interface TeamListItem {
  team: Team;
  rosterCount: number;
  lastGameDate?: string;
}

export async function listTeamsWithStats(): Promise<TeamListItem[]> {
  const [teams, players, games] = await Promise.all([
    teamRepository.list(),
    db.players.toArray(),
    gameRepository.list(),
  ]);
  return teams
    .map((team) => {
      const teamGames = games.filter((g) => g.teamId === team.id).map((g) => g.gameDate).sort();
      return {
        team,
        rosterCount: players.filter((p) => p.teamId === team.id && p.activeOnTeam).length,
        lastGameDate: teamGames[teamGames.length - 1],
      };
    })
    .sort((a, b) => a.team.name.localeCompare(b.team.name));
}

export async function getTeamRoster(teamId: string, includeInactive = false): Promise<Player[]> {
  const players = await playerRepository.listByTeam(teamId);
  return sortPlayers(includeInactive ? players : players.filter((p) => p.activeOnTeam));
}

export interface PresetWithMembers {
  preset: LineupPreset;
  members: LineupPresetMember[];
}

export async function getTeamPresets(teamId: string): Promise<PresetWithMembers[]> {
  const presets = await presetRepository.listByTeam(teamId);
  const members = await Promise.all(presets.map((p) => presetRepository.listMembers(p.id)));
  return presets.map((preset, i) => ({ preset, members: members[i] }));
}

export interface GameListItem {
  game: Game;
  team?: Team;
  playCount: number;
}

export async function listGames(): Promise<GameListItem[]> {
  const [games, teams, plays] = await Promise.all([gameRepository.list(), teamRepository.list(), db.plays.toArray()]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  return games
    .map((game) => ({
      game,
      team: teamById.get(game.teamId),
      playCount: plays.filter((p) => p.gameId === game.id && !p.voided).length,
    }))
    .sort((a, b) => b.game.gameDate.localeCompare(a.game.gameDate) || b.game.createdAt.localeCompare(a.game.createdAt));
}

/** The active game referenced by `lastActiveGameId`, or any active game as a fallback. */
export async function getActiveGame(): Promise<Game | undefined> {
  const settings = await settingsRepository.get();
  if (settings?.lastActiveGameId) {
    const game = await gameRepository.get(settings.lastActiveGameId);
    if (game?.status === "active") return game;
  }
  const active = await gameRepository.listByStatus("active");
  return active[0];
}

export function gameTitle(game: Game, team?: Team): string {
  const label = game.gameLabel || (game.opponent ? `vs ${game.opponent}` : "Game");
  return team ? `${team.name} ${label}` : label;
}
