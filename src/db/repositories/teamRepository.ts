import { db } from "../db";
import type { Team, TeamSettings } from "../../domain/models";

export const teamRepository = {
  get: (id: string) => db.teams.get(id),
  list: () => db.teams.toArray(),
  put: (team: Team) => db.teams.put(team),
  update: (id: string, changes: Partial<Team>) => db.teams.update(id, changes),
  delete: (id: string) => db.teams.delete(id),

  getSettings: (teamId: string) => db.teamSettings.get(teamId),
  putSettings: (settings: TeamSettings) => db.teamSettings.put(settings),
  deleteSettings: (teamId: string) => db.teamSettings.delete(teamId),
};
