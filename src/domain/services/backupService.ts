import { z } from "zod";
import { db, domainTables } from "../../db/db";
import { DomainError } from "../errors";
import type {
  CurrentLineupMember,
  Game,
  GameEvent,
  GamePlayer,
  LineupPreset,
  LineupPresetMember,
  Play,
  PlayParticipant,
  Player,
  Team,
  TeamSettings,
} from "../models";
import {
  currentLineupMemberSchema,
  gameEventSchema,
  gamePlayerSchema,
  gameSchema,
  lineupPresetMemberSchema,
  lineupPresetSchema,
  playerSchema,
  playParticipantSchema,
  playSchema,
  teamSchema,
  teamSettingsSchema,
} from "../validation";
import { nowIso } from "../../utils/dates";
import { newId, presetMemberId } from "../../utils/ids";
import type { ExportFile } from "../../utils/fileDownload";
import type { TeamFileV1 } from "./exportService";

export const BACKUP_FORMAT = "mpr-tracker-backup";
export const BACKUP_VERSION = 1;

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export interface BackupFileV1 {
  format: "mpr-tracker-backup";
  version: 1;
  exportedAt: string;
  appVersion: string;
  teams: Team[];
  players: Player[];
  teamSettings: TeamSettings[];
  games: Game[];
  gamePlayers: GamePlayer[];
  lineupPresets: LineupPreset[];
  lineupPresetMembers: LineupPresetMember[];
  currentLineupMembers: CurrentLineupMember[];
  plays: Play[];
  playParticipants: PlayParticipant[];
  gameEvents: GameEvent[];
}

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  appVersion: z.string(),
  teams: z.array(teamSchema),
  players: z.array(playerSchema),
  teamSettings: z.array(teamSettingsSchema),
  games: z.array(gameSchema),
  gamePlayers: z.array(gamePlayerSchema),
  lineupPresets: z.array(lineupPresetSchema),
  lineupPresetMembers: z.array(lineupPresetMemberSchema),
  currentLineupMembers: z.array(currentLineupMemberSchema),
  plays: z.array(playSchema),
  playParticipants: z.array(playParticipantSchema),
  gameEvents: z.array(gameEventSchema),
});

const TABLE_KEYS = [
  "teams",
  "players",
  "teamSettings",
  "games",
  "gamePlayers",
  "lineupPresets",
  "lineupPresetMembers",
  "currentLineupMembers",
  "plays",
  "playParticipants",
  "gameEvents",
] as const;
type TableKey = (typeof TABLE_KEYS)[number];

export async function buildBackup(gameId?: string): Promise<BackupFileV1> {
  return db.transaction("r", domainTables(), async () => {
    const all = {
      teams: await db.teams.toArray(),
      players: await db.players.toArray(),
      teamSettings: await db.teamSettings.toArray(),
      games: await db.games.toArray(),
      gamePlayers: await db.gamePlayers.toArray(),
      lineupPresets: await db.lineupPresets.toArray(),
      lineupPresetMembers: await db.lineupPresetMembers.toArray(),
      currentLineupMembers: await db.currentLineupMembers.toArray(),
      plays: await db.plays.toArray(),
      playParticipants: await db.playParticipants.toArray(),
      gameEvents: await db.gameEvents.toArray(),
    };
    const scoped = gameId ? scopeToGame(all, gameId) : all;
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: nowIso(),
      appVersion: APP_VERSION,
      ...scoped,
    };
  });
}

/** Restrict a backup to a single game plus its team data. */
function scopeToGame(all: Omit<BackupFileV1, "format" | "version" | "exportedAt" | "appVersion">, gameId: string) {
  const game = all.games.find((g) => g.id === gameId);
  const teamId = game?.teamId;
  const presetIds = new Set(all.lineupPresets.filter((p) => p.teamId === teamId).map((p) => p.id));
  return {
    teams: all.teams.filter((t) => t.id === teamId),
    players: all.players.filter((p) => p.teamId === teamId),
    teamSettings: all.teamSettings.filter((s) => s.teamId === teamId),
    games: all.games.filter((g) => g.id === gameId),
    gamePlayers: all.gamePlayers.filter((r) => r.gameId === gameId),
    lineupPresets: all.lineupPresets.filter((p) => presetIds.has(p.id)),
    lineupPresetMembers: all.lineupPresetMembers.filter((m) => presetIds.has(m.presetId)),
    currentLineupMembers: all.currentLineupMembers.filter((r) => r.gameId === gameId),
    plays: all.plays.filter((r) => r.gameId === gameId),
    playParticipants: all.playParticipants.filter((r) => r.gameId === gameId),
    gameEvents: all.gameEvents.filter((r) => r.gameId === gameId),
  };
}

export async function buildBackupFile(gameId?: string, stem = "mpr-backup"): Promise<ExportFile> {
  const backup = await buildBackup(gameId);
  const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  return {
    filename: `${stem}-${stamp}.json`,
    content: JSON.stringify(backup, null, 2),
    mimeType: "application/json",
  };
}

// ---------- Import ----------

export interface BackupPreview {
  backup: BackupFileV1;
  counts: Record<TableKey, number>;
  conflictingIds: number;
  integrityIssues: string[];
}

function checkIntegrity(b: BackupFileV1): string[] {
  const issues: string[] = [];
  const teamIds = new Set(b.teams.map((t) => t.id));
  const playerIds = new Set(b.players.map((p) => p.id));
  const gameIds = new Set(b.games.map((g) => g.id));
  const playIds = new Set(b.plays.map((p) => p.id));
  const presetIds = new Set(b.lineupPresets.map((p) => p.id));
  const gpKeys = new Set(b.gamePlayers.map((gp) => `${gp.gameId}:${gp.playerId}`));

  const check = (ok: boolean, msg: string) => {
    if (!ok) issues.push(msg);
  };
  for (const p of b.players) check(teamIds.has(p.teamId), `Player ${p.displayName} references a missing team`);
  for (const g of b.games) check(teamIds.has(g.teamId), `Game ${g.id} references a missing team`);
  for (const gp of b.gamePlayers) {
    check(gameIds.has(gp.gameId) && playerIds.has(gp.playerId), `Game player ${gp.id} references missing data`);
  }
  for (const p of b.lineupPresets) check(teamIds.has(p.teamId), `Preset ${p.name} references a missing team`);
  for (const m of b.lineupPresetMembers) {
    check(presetIds.has(m.presetId) && playerIds.has(m.playerId), `Preset member ${m.id} references missing data`);
  }
  for (const m of b.currentLineupMembers) {
    check(gpKeys.has(`${m.gameId}:${m.playerId}`), `Lineup entry ${m.id} references missing data`);
  }
  for (const p of b.plays) check(gameIds.has(p.gameId), `Play ${p.playNumber} references a missing game`);
  for (const pp of b.playParticipants) {
    check(playIds.has(pp.playId) && gpKeys.has(`${pp.gameId}:${pp.playerId}`), `Participant ${pp.id} references missing data`);
  }
  for (const key of TABLE_KEYS) {
    const rows = b[key] as { id?: string; teamId?: string }[];
    const ids = rows.map((r) => r.id ?? r.teamId);
    if (new Set(ids).size !== ids.length) issues.push(`Duplicate IDs in ${key}`);
  }
  return issues;
}

/** Validate a backup file's text and summarize it. Throws IMPORT_INVALID / BACKUP_VERSION_UNSUPPORTED. */
export async function previewBackup(text: string): Promise<BackupPreview> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DomainError("IMPORT_INVALID", "This file is not valid JSON.");
  }
  const obj = json as { format?: unknown; version?: unknown };
  if (!obj || typeof obj !== "object" || obj.format !== BACKUP_FORMAT) {
    if (obj && typeof obj === "object" && obj.format === "mpr-tracker-team") {
      throw new DomainError("IMPORT_INVALID", "This is a team file. Import it from a team's Import Roster screen.");
    }
    throw new DomainError("IMPORT_INVALID", "This is not a Minimum Play Tracker backup file.");
  }
  if (obj.version !== BACKUP_VERSION) {
    throw new DomainError(
      "BACKUP_VERSION_UNSUPPORTED",
      `Backup version ${String(obj.version)} is not supported by this app (supports version ${BACKUP_VERSION}).`,
    );
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainError("IMPORT_INVALID", `Backup file is invalid at ${issue?.path.join(".")}: ${issue?.message}`);
  }
  const backup = parsed.data as BackupFileV1;
  const integrityIssues = checkIntegrity(backup);

  let conflictingIds = 0;
  for (const key of TABLE_KEYS) {
    const table = db[key] as unknown as { bulkGet: (keys: string[]) => Promise<unknown[]> };
    const rows = backup[key] as { id?: string; teamId?: string }[];
    const keys = rows.map((r) => (r.id ?? r.teamId) as string);
    const existing = await table.bulkGet(keys);
    conflictingIds += existing.filter(Boolean).length;
  }
  const counts = Object.fromEntries(TABLE_KEYS.map((k) => [k, backup[k].length])) as Record<TableKey, number>;
  return { backup, counts, conflictingIds, integrityIssues };
}

/** Replace all local data with a validated backup, in one transaction. */
export async function replaceAllData(backup: BackupFileV1): Promise<void> {
  const issues = checkIntegrity(backup);
  if (issues.length > 0) throw new DomainError("IMPORT_INVALID", issues[0]);
  try {
    await db.transaction("rw", [...domainTables(), db.appSettings, db.importRecords], async () => {
      for (const table of domainTables()) await table.clear();
      await db.teams.bulkAdd(backup.teams);
      await db.players.bulkAdd(backup.players);
      await db.teamSettings.bulkAdd(backup.teamSettings);
      await db.games.bulkAdd(backup.games);
      await db.gamePlayers.bulkAdd(backup.gamePlayers);
      await db.lineupPresets.bulkAdd(backup.lineupPresets);
      await db.lineupPresetMembers.bulkAdd(backup.lineupPresetMembers);
      await db.currentLineupMembers.bulkAdd(backup.currentLineupMembers);
      await db.plays.bulkAdd(backup.plays);
      await db.playParticipants.bulkAdd(backup.playParticipants);
      await db.gameEvents.bulkAdd(backup.gameEvents);
      const active = backup.games.find((g) => g.status === "active");
      await db.appSettings.update("app", { lastActiveGameId: active?.id, updatedAt: nowIso() });
      await db.importRecords.add({
        id: newId(),
        kind: "backup_json",
        rowsDetected: backup.plays.length,
        rowsImported: backup.plays.length,
        createdAt: nowIso(),
      });
    });
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError("DB_WRITE_FAILED", "Import failed. Your existing data was not changed.", {
      cause: String(err),
    });
  }
}

/** Delete every team, roster, and game on this device. */
export async function clearAllData(): Promise<void> {
  await db.transaction("rw", [...domainTables(), db.appSettings, db.importRecords], async () => {
    for (const table of domainTables()) await table.clear();
    await db.importRecords.clear();
    await db.appSettings.update("app", { lastActiveGameId: undefined, updatedAt: nowIso() });
  });
}

// ---------- Team file import (device transfer) ----------

const teamFileSchema = z.object({
  format: z.literal("mpr-tracker-team"),
  version: z.literal(1),
  exportedAt: z.string(),
  team: teamSchema,
  teamSettings: teamSettingsSchema.optional(),
  players: z.array(playerSchema),
  lineupPresets: z.array(lineupPresetSchema),
  lineupPresetMembers: z.array(lineupPresetMemberSchema),
});

export function parseTeamFile(text: string): TeamFileV1 {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DomainError("IMPORT_INVALID", "This file is not valid JSON.");
  }
  const parsed = teamFileSchema.safeParse(json);
  if (!parsed.success) {
    const fmt = (json as { format?: unknown })?.format;
    if (fmt === BACKUP_FORMAT) {
      throw new DomainError("IMPORT_INVALID", "This is a full backup. Import it from Settings → Import Backup.");
    }
    throw new DomainError("IMPORT_INVALID", "This is not a Minimum Play Tracker team file.");
  }
  return parsed.data as TeamFileV1;
}

/** Import a team file as a brand-new team (fresh IDs, so it never collides). */
export async function importTeamFile(file: TeamFileV1): Promise<Team> {
  const now = nowIso();
  const existingNames = new Set((await db.teams.toArray()).map((t) => t.name.toLowerCase()));
  const name = existingNames.has(file.team.name.toLowerCase()) ? `${file.team.name} (imported)` : file.team.name;
  const team: Team = { id: newId(), name, seasonLabel: file.team.seasonLabel, createdAt: now, updatedAt: now };
  const playerMap = new Map<string, string>();
  const players: Player[] = file.players.map((p) => {
    const id = newId();
    playerMap.set(p.id, id);
    return { ...p, id, teamId: team.id, activeOnTeam: true, createdAt: now, updatedAt: now };
  });
  const presetMap = new Map<string, string>();
  const presets: LineupPreset[] = file.lineupPresets.map((p) => {
    const id = newId();
    presetMap.set(p.id, id);
    return { ...p, id, teamId: team.id, createdAt: now, updatedAt: now };
  });
  const members: LineupPresetMember[] = file.lineupPresetMembers.flatMap((m) => {
    const presetId = presetMap.get(m.presetId);
    const playerId = playerMap.get(m.playerId);
    return presetId && playerId ? [{ id: presetMemberId(presetId, playerId), presetId, playerId }] : [];
  });
  try {
    await db.transaction(
      "rw",
      [db.teams, db.teamSettings, db.players, db.lineupPresets, db.lineupPresetMembers, db.importRecords],
      async () => {
        await db.teams.add(team);
        if (file.teamSettings) {
          await db.teamSettings.add({ ...file.teamSettings, teamId: team.id, createdAt: now, updatedAt: now });
        }
        await db.players.bulkAdd(players);
        await db.lineupPresets.bulkAdd(presets);
        await db.lineupPresetMembers.bulkAdd(members);
        await db.importRecords.add({
          id: newId(),
          kind: "roster_json",
          teamId: team.id,
          rowsDetected: file.players.length,
          rowsImported: players.length,
          createdAt: now,
        });
      },
    );
  } catch (err) {
    throw new DomainError("DB_WRITE_FAILED", "Team import failed. Nothing was imported.", { cause: String(err) });
  }
  return team;
}
