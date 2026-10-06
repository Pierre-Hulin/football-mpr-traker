import { db } from "../db";
import type { Play, PlayParticipant } from "../../domain/models";

export const playRepository = {
  get: (id: string) => db.plays.get(id),
  listByGame: (gameId: string) => db.plays.where("gameId").equals(gameId).toArray(),
  listByPlayNumber: (gameId: string, playNumber: number) =>
    db.plays.where("[gameId+playNumber]").equals([gameId, playNumber]).toArray(),
  add: (play: Play) => db.plays.add(play),
  put: (play: Play) => db.plays.put(play),
  update: (id: string, changes: Partial<Play>) => db.plays.update(id, changes),

  listParticipantsByGame: (gameId: string) =>
    db.playParticipants.where("gameId").equals(gameId).toArray(),
  listParticipantsByPlay: (playId: string) =>
    db.playParticipants.where("playId").equals(playId).toArray(),
  bulkAddParticipants: (rows: PlayParticipant[]) => db.playParticipants.bulkAdd(rows),
  deleteParticipantsByPlay: (playId: string) =>
    db.playParticipants.where("playId").equals(playId).delete(),
};
