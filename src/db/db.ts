import Dexie, { type Table } from "dexie";
import type {
  AppSettings,
  CurrentLineupMember,
  Game,
  GameEvent,
  GamePlayer,
  ImportRecord,
  LineupPreset,
  LineupPresetMember,
  Play,
  PlayParticipant,
  Player,
  Team,
  TeamSettings,
} from "../domain/models";
import { DB_NAME, SCHEMA_V1 } from "./schema";

export class MprDatabase extends Dexie {
  teams!: Table<Team, string>;
  players!: Table<Player, string>;
  teamSettings!: Table<TeamSettings, string>;
  games!: Table<Game, string>;
  gamePlayers!: Table<GamePlayer, string>;
  lineupPresets!: Table<LineupPreset, string>;
  lineupPresetMembers!: Table<LineupPresetMember, string>;
  currentLineupMembers!: Table<CurrentLineupMember, string>;
  plays!: Table<Play, string>;
  playParticipants!: Table<PlayParticipant, string>;
  gameEvents!: Table<GameEvent, string>;
  appSettings!: Table<AppSettings, string>;
  importRecords!: Table<ImportRecord, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    // Future versions: add db.version(n).stores(...).upgrade(...) in migrations.ts.
  }
}

export const db = new MprDatabase();

/** All domain tables (excludes app settings and import diagnostics). */
export function domainTables() {
  return [
    db.teams,
    db.players,
    db.teamSettings,
    db.games,
    db.gamePlayers,
    db.lineupPresets,
    db.lineupPresetMembers,
    db.currentLineupMembers,
    db.plays,
    db.playParticipants,
    db.gameEvents,
  ];
}
