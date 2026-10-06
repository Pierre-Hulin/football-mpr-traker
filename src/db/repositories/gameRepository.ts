import { db } from "../db";
import type { CurrentLineupMember, Game, GamePlayer } from "../../domain/models";
import type { GameStatus } from "../../domain/enums";

export const gameRepository = {
  get: (id: string) => db.games.get(id),
  list: () => db.games.toArray(),
  listByTeam: (teamId: string) => db.games.where("teamId").equals(teamId).toArray(),
  listByStatus: (status: GameStatus) => db.games.where("status").equals(status).toArray(),
  put: (game: Game) => db.games.put(game),
  update: (id: string, changes: Partial<Game>) => db.games.update(id, changes),
  delete: (id: string) => db.games.delete(id),

  // Game players
  getGamePlayer: (id: string) => db.gamePlayers.get(id),
  listGamePlayers: (gameId: string) => db.gamePlayers.where("gameId").equals(gameId).toArray(),
  bulkPutGamePlayers: (rows: GamePlayer[]) => db.gamePlayers.bulkPut(rows),
  putGamePlayer: (row: GamePlayer) => db.gamePlayers.put(row),
  deleteGamePlayers: (gameId: string) => db.gamePlayers.where("gameId").equals(gameId).delete(),

  // Current lineup
  listLineup: (gameId: string) => db.currentLineupMembers.where("gameId").equals(gameId).toArray(),
  putLineupMember: (row: CurrentLineupMember) => db.currentLineupMembers.put(row),
  bulkPutLineup: (rows: CurrentLineupMember[]) => db.currentLineupMembers.bulkPut(rows),
  deleteLineupMember: (id: string) => db.currentLineupMembers.delete(id),
  clearLineup: (gameId: string) => db.currentLineupMembers.where("gameId").equals(gameId).delete(),
};
