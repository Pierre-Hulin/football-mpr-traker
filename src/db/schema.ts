/**
 * IndexedDB schema definitions (Dexie syntax). See 01_DATA_MODEL.md §7.
 *
 * Note: IndexedDB cannot use boolean values as index keys, so the boolean
 * fields `Player.activeOnTeam` and `Play.voided` are intentionally not
 * indexed; queries filter on them in memory.
 */
export const DB_NAME = "mpr-tracker";

export const SCHEMA_VERSION = 1;

export const SCHEMA_V1 = {
  teams: "id, name, updatedAt",
  players: "id, teamId, [teamId+jerseyNumber]",
  teamSettings: "teamId",

  games: "id, teamId, status, gameDate, [teamId+gameDate]",
  gamePlayers: "id, gameId, playerId, [gameId+status]",

  lineupPresets: "id, teamId, [teamId+sortOrder]",
  lineupPresetMembers: "id, presetId, playerId",

  currentLineupMembers: "id, gameId, playerId",

  plays: "id, gameId, [gameId+playNumber], [gameId+quarter]",
  playParticipants: "id, playId, gameId, playerId, [gameId+playerId]",

  gameEvents: "id, gameId, [gameId+createdAt], [gameId+type]",

  appSettings: "id",
  importRecords: "id, kind, teamId, createdAt",
} as const;
