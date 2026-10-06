import { db } from "../db";
import type { Player } from "../../domain/models";

export const playerRepository = {
  get: (id: string) => db.players.get(id),
  bulkGet: (ids: string[]) => db.players.bulkGet(ids),
  listByTeam: (teamId: string) => db.players.where("teamId").equals(teamId).toArray(),
  findByJersey: (teamId: string, jerseyNumber: string) =>
    db.players.where("[teamId+jerseyNumber]").equals([teamId, jerseyNumber]).toArray(),
  put: (player: Player) => db.players.put(player),
  bulkAdd: (players: Player[]) => db.players.bulkAdd(players),
  update: (id: string, changes: Partial<Player>) => db.players.update(id, changes),
};
