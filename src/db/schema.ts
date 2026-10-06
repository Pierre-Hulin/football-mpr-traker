/**
 * IndexedDB schema definitions (Dexie syntax). See 01_DATA_MODEL.md §7.
 *
 * Note: IndexedDB cannot index boolean values, so the compound indexes that
 * include `activeOnTeam` / `voided` are kept for spec parity but are never
 * queried; filtering on those fields happens in memory.
 */
export const DB_NAME = "mpr-tracker";

export const SCHEMA_VERSION = 1;

export const SCHEMA_V1 = {
  teams: "id, name, updatedAt",
  players: "id, teamId, [teamId+jerseyNumber], [teamId+activeOnTeam]",
  teamSettings: "teamId",

  games: "id, teamId, status, gameDate, [teamId+gameDate]",
  gamePlayers: "id, gameId, playerId, [gameId+status]",

  lineupPresets: "id, teamId, [teamId+sortOrder]",
  lineupPresetMembers: "id, presetId, playerId",

  currentLineupMembers: "id, gameId, playerId",

  plays: "id, gameId, [gameId+playNumber], [gameId+quarter], [gameId+voided]",
  playParticipants: "id, playId, gameId, playerId, [gameId+playerId]",

  gameEvents: "id, gameId, [gameId+createdAt], [gameId+type]",

  appSettings: "id",
  importRecords: "id, kind, teamId, createdAt",
} as const;
